#!/usr/bin/env node
/**
 * Decision-record gate.
 *
 * `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` routes significant decisions by
 * reversibility and Atlas risk, but a trigger list written only in prose is
 * enforced by whoever happens to remember it. The founding incident
 * (2026-07-27) was exactly that: a product pass self-exempted a change that
 * crossed Atlas's meaning and agent-handoff boundary, then shipped.
 *
 * Most of that trigger list is semantic ("positioning", "the words a stranger
 * reads first") and no script can see intent. Three rows are mechanical, and
 * this gate holds those three:
 *
 *   1. a user-facing route is added or removed  → "new or removed surface"
 *   2. the MCP tool set or CLI command set changes → "public contract change"
 *   3. the design system's vocabulary or ramps move → "spec change"
 *
 * When any fires, the same change must append to `docs/DECISIONS.md`. The
 * gate does not judge the record's quality — it makes the decision *exist*,
 * with its dissent and falsifier, where the next pass will read it.
 *
 * Same idea as this repo's lint rules: a spec with no rule is not upheld.
 *
 * ## Row 3 was added on 2026-08-03 — it had been a rule that lived only in a document
 *
 * Rule 3 of "rules for growing the system" in
 * `docs/DESIGN-SYSTEM.md` — *changing a spec means convening the design-systems
 * seat* — existed along with its trigger list (`.claude/rules/design.md`), but
 * **nothing enforced it.** Measured: of five commits that widened a value-layer ramp,
 * one had a ledger record. The shape this repository keeps failing in.
 *
 * The judgement uses an **inventory**, not file names —
 * `scripts/lib/design-spec-census.mjs` explains why it is narrowed that way. In
 * short: the trigger files are among the most frequently touched in this repository
 * (79 of the last 300 commits touched one), so "in the diff means ledger" produces 63
 * false positives. Looking only at vocabulary and ramp values leaves 16 of those 79.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import {
  censusFor,
  describeChange,
  diffCensus,
  parseTriggerFiles,
  SPEC_RULE_DOC,
} from "./lib/design-spec-census.mjs";

const LEDGER = "docs/DECISIONS.md";

/** Route files whose *existence* changes the surface inventory. */
const ROUTE_PATTERN = /^app\/\[locale\]\/.*\/page\.tsx$/;

/** Single sources of truth for the two public contracts. */
const CONTRACT_FILES = ["cli/src/lib/cli-commands.mjs", "mcp/src/index.js"];

function printHelp() {
  console.log(`Usage: pnpm decisions:check [-- --base=<ref>]

Fails when a change adds or removes a user-facing route, edits the MCP/CLI
public contract, or moves the design system's vocabulary/ramps, without
appending to ${LEDGER} in the same change.

The design-spec trigger files are read from ${SPEC_RULE_DOC} — that document
is the single source of the list, and this script never copies it.

The record is where the next pass reads what was already decided and what the
losing argument bet on. A decision that exists only in a PR description is a
decision the next pass will silently re-make.
`);
}

function parseArgs(argv) {
  let base = process.env.DECISION_BASE_REF ?? "";
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--base=")) {
      base = arg.slice("--base=".length).trim();
      continue;
    }
    console.error(`[decisions] unknown argument: ${arg}`);
    process.exit(1);
  }
  return base;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * Resolve what to diff against. In CI the base ref is supplied; locally we fall
 * back to the merge-base with the default branch so the gate reflects the whole
 * branch rather than the last commit.
 */
function resolveBase(explicit) {
  const candidates = [explicit, "origin/main", "main"].filter(Boolean);
  for (const ref of candidates) {
    try {
      return git(["merge-base", "HEAD", ref]);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const base = resolveBase(parseArgs(process.argv.slice(2)));
if (!base) {
  console.log("[decisions] no comparable base ref — skipping (nothing to diff against)");
  process.exit(0);
}

// Name-status so an added/removed route is distinguishable from an edited one:
// changing a page is not a new surface, creating or deleting one is.
const entries = git(["diff", "--name-status", `${base}...HEAD`])
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    const [status, ...paths] = line.split("\t");
    const code = status[0];
    // A rename (R100 with detection on by default) is a deletion of the old
    // path plus a creation of the new one. Left as a single R entry, a pure
    // `git mv` of a route file — a change that retires one public URL and
    // creates another — passed the A/D surface filter with no DECISIONS.md
    // record required (bug sweep 2026-09-01, reproduced in a scratch repo).
    if ((code === "R" || code === "C") && paths.length === 2) {
      const expanded = [{ status: "A", path: paths[1] }];
      if (code === "R") expanded.push({ status: "D", path: paths[0] });
      return expanded;
    }
    return [{ status: code, path: paths[paths.length - 1] }];
  });

const changedPaths = new Set(entries.map((entry) => entry.path));

const surfaceChanges = entries
  .filter((entry) => (entry.status === "A" || entry.status === "D") && ROUTE_PATTERN.test(entry.path))
  .map((entry) => `${entry.status === "A" ? "new surface" : "surface removed"}: ${entry.path}`);

const contractChanges = entries
  .filter((entry) => CONTRACT_FILES.includes(entry.path))
  .map((entry) => `public contract changed: ${entry.path}`);

/**
 * Design spec — looks at **whether the spec moved, not whether a file was touched.**
 *
 * The trigger file list is read from `.claude/rules/design.md`. The HEAD version of
 * that document is used because if this change **adds** a file to the list, that file
 * is watched from this change onward.
 */
function designSpecChanges() {
  let triggerFiles;
  try {
    triggerFiles = parseTriggerFiles(readFileSync(SPEC_RULE_DOC, "utf8"));
  } catch (error) {
    // An unreadable list must not pass silently — a silent gate is the very reason this
    // rule exists.
    console.error(`[decisions] ${error.message}`);
    process.exit(1);
  }

  const showAt = (ref, path) => {
    try {
      return execFileSync("git", ["show", `${ref}:${path}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null; // A file that did not exist at that point = an empty inventory
    }
  };

  const found = [];
  for (const path of triggerFiles) {
    if (!changedPaths.has(path)) continue;
    const before = censusFor(path, showAt(base, path));
    const after = censusFor(path, showAt("HEAD", path));
    for (const change of diffCensus(before, after)) found.push(describeChange(path, change));
  }
  return found;
}

const specChanges = designSpecChanges();

const triggers = [...surfaceChanges, ...contractChanges, ...specChanges];

if (triggers.length === 0) {
  console.log("[decisions] no significant-decision trigger in this change ✓");
  process.exit(0);
}

if (changedPaths.has(LEDGER)) {
  console.log(`[decisions] trigger present and ${LEDGER} was updated ✓`);
  for (const trigger of triggers) console.log(`[decisions]   ${trigger}`);
  process.exit(0);
}

console.error(`[decisions] this change tripped a significant-decision trigger but ${LEDGER} holds no record of it:`);
for (const trigger of triggers) console.error(`[decisions]   - ${trigger}`);
console.error(`
[decisions] Do one of these:
[decisions]   1. run /po-pass (or pnpm po:route) with one Atlas outcome and every change/boundary fact
[decisions]   2. if the route is review, run /po-council with Evidence plus the selected specialist
[decisions]   3. append the before-state, decision delta, dissent, and falsifier to ${LEDGER}
[decisions]   4. if the trigger is a false positive (a route file move, say), say so in one line in the record
[decisions]
[decisions] For a «specification …» trigger the seat to convene is design-system on /design-council
[decisions] (.claude/rules/design.md “Changing the specification requires design-system”).
[decisions]
[decisions] The record is an existence check, not a quality review — the next pass must find
[decisions] the decision and the dissent that lost, so the same argument is not held twice.`);
process.exit(1);
