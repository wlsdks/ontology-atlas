#!/usr/bin/env node
/**
 * Decision-record gate, two mechanical rows: a user-facing route added or removed, or the MCP tool
 * or CLI command set changing. Each needs a decision fragment.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { parseLedger } from "./decisions-find.mjs";
import { isCommentOnlyChange } from "../lib/ci/comment-only-change.mjs";
import { FIELDS, TEMPLATE, checkLedgerTemplate } from "../lib/records/decision-record-template.mjs";
import { readLedgerSource } from "../lib/records/record-ledgers.mjs";

const LEDGER = "docs/DECISIONS.md";

/**
 * Every record must be the six-field template. Checked before and regardless of the trigger logic:
 * a record the next pass cannot read field by field fails the ledger's first contract.
 */
function templateFailures() {
  let source;
  try { source = readLedgerSource(LEDGER, { root: process.cwd() }); }
  catch (error) { console.error(error.message); return true; }
  const broken = checkLedgerTemplate(parseLedger(source.content));
  if (broken.length === 0) return false;
  console.error(`[decisions] ${broken.length} record(s) do not fit the template:`);
  for (const { record, problems } of broken) {
    console.error(`[decisions]   ${LEDGER}:${record.line}  ${record.date}  ${record.title}`);
    for (const problem of problems) console.error(`[decisions]     - ${problem}`);
  }
  console.error(`
[decisions] A record is exactly ${FIELDS.join(", ")}, in that order:
${TEMPLATE.split("\n").map((line) => `[decisions]   ${line}`).join("\n")}
[decisions]
[decisions] Route, evidence state, review footprint, and delta belong to docs/PO-PILOT.md, which types them per run.
[decisions] Anything that fits a commit message is a commit message, not a record.`);
  return true;
}

/** Route files whose *existence* changes the surface inventory. */
const ROUTE_PATTERN = /^app\/\[locale\]\/.*\/page\.tsx$/;

/**
 * Single sources of truth for the two public contracts. The MCP tool table is
 * `server/registry.mjs` plus `server/tool-definitions/`; the entry point stays
 * listed because it still decides the dispatch and the read-only guard.
 */
const CONTRACT_FILES = [
  "cli/src/lib/cli-commands.mjs",
  "mcp/src/index.js",
  "mcp/src/server/registry.mjs",
];
const CONTRACT_PREFIXES = ["mcp/src/server/tool-definitions/"];

function isContractFile(path) {
  return CONTRACT_FILES.includes(path) || CONTRACT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function printHelp() {
  console.log(`Usage: pnpm decisions:check [-- --base=<ref> | --template]

Fails when a change adds or removes a user-facing route or edits the MCP/CLI
public contract without adding a decision fragment in the same change.

The record is where the next pass reads what was already decided and what the
losing argument bet on. A decision that exists only in a PR description is a
decision the next pass will silently re-make.
`);
}

function parseArgs(argv) {
  let base = process.env.DECISION_BASE_REF ?? "";
  let template = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--template") {
      template = true;
      continue;
    }
    if (arg.startsWith("--base=")) {
      base = arg.slice("--base=".length).trim();
      continue;
    }
    console.error(`[decisions] unknown argument: ${arg}`);
    process.exit(1);
  }
  return { base, template };
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

const options = parseArgs(process.argv.slice(2));
if (options.template) { console.log(TEMPLATE); process.exit(0); }
const base = resolveBase(options.base);
if (templateFailures()) process.exit(1);
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
    // A rename is a deletion plus a creation: left as one R entry, a `git mv` of a route file would
    // pass the A/D surface filter with no record required.
    if ((code === "R" || code === "C") && paths.length === 2) {
      const expanded = [{ status: "A", path: paths[1] }];
      if (code === "R") expanded.push({ status: "D", path: paths[0] });
      return expanded;
    }
    return [{ status: code, path: paths[paths.length - 1] }];
  });

const surfaceChanges = entries
  .filter((entry) => (entry.status === "A" || entry.status === "D") && ROUTE_PATTERN.test(entry.path))
  .map((entry) => `${entry.status === "A" ? "new surface" : "surface removed"}: ${entry.path}`);

/**
 * The entry point is watched only where it decides the contract. The tool table under `server/` is
 * watched whole; in the entry point only changed lines naming request handlers or
 * read-only/consent filters change what a client can call.
 */
const ENTRY_POINT = "mcp/src/index.js";
const ENTRY_POINT_CONTRACT = /setRequestHandler|TOOLS_FOR_LIST|TOOL_BY_NAME|READ_TOOL_NAMES|READ_ONLY_MODE|WRITE_CONSENT_MODE/;

function entryPointMovesContract(status) {
  if (status !== "M") return true;
  const diff = git(["diff", "-U0", `${base}...HEAD`, "--", ENTRY_POINT]);
  return diff
    .split("\n")
    .some((line) => /^[+-](?![+-])/.test(line) && ENTRY_POINT_CONTRACT.test(line));
}

function contractCodeChanged({ path, status }) {
  if (status !== "M") return true;
  return !isCommentOnlyChange(path, git(["show", `${base}:${path}`]), readFileSync(path, "utf8"));
}

const contractChanges = entries
  .filter((entry) => isContractFile(entry.path))
  .filter(contractCodeChanged)
  .filter((entry) => entry.path !== ENTRY_POINT || entryPointMovesContract(entry.status))
  .map((entry) => `public contract changed: ${entry.path}`);

const triggers = [...surfaceChanges, ...contractChanges];

if (triggers.length === 0) {
  console.log("[decisions] no significant-decision trigger in this change ✓");
  process.exit(0);
}

const decisionFragmentChanged = entries.some((entry) => entry.status === "A" && /^docs\/records\/decisions\/[^/]+\.md$/.test(entry.path));
if (decisionFragmentChanged) {
  console.log(`[decisions] trigger present and a decision fragment was added ✓`);
  for (const trigger of triggers) console.log(`[decisions]   ${trigger}`);
  process.exit(0);
}

console.error('[decisions] this change tripped a significant-decision trigger but adds no decision fragment:');
for (const trigger of triggers) console.error(`[decisions]   - ${trigger}`);
console.error(`
[decisions] Do one of these:
[decisions]   1. run /product-check (or pnpm po:route) with one Atlas outcome and every change/boundary fact
[decisions]   2. if the route is review, give one reviewer the evidence and the lenses the route lists
[decisions]   3. create a decision fragment with the before-state, decision delta, dissent, and falsifier
[decisions]   4. if the trigger is a false positive (a route file move, say), say so in one line in the record
[decisions]
[decisions] The record is an existence check, not a quality review — the next pass must find
[decisions] the decision and the dissent that lost, so the same argument is not held twice.`);
process.exit(1);
