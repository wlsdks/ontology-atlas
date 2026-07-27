#!/usr/bin/env node
/**
 * Decision-record gate.
 *
 * `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` lists when a council is required,
 * and `.claude/skills/po-council/SKILL.md` repeats it — but a trigger list
 * written in prose is enforced by whoever happens to remember it. The founding
 * incident (2026-07-27) was exactly that: a pass wrote "없음" into two rubric
 * rows the doc calls fatal, self-certified, and shipped.
 *
 * Most of that trigger list is semantic ("positioning", "the words a stranger
 * reads first") and no script can see intent. Two rows are mechanical, and this
 * gate holds those two:
 *
 *   1. a user-facing route is added or removed  → "new or removed surface"
 *   2. the MCP tool set or CLI command set changes → "public contract change"
 *
 * When either fires, the same change must append to `docs/DECISIONS.md`. The
 * gate does not judge the record's quality — it makes the decision *exist*,
 * with its dissent and falsifier, where the next pass will read it.
 *
 * Same idea as this repo's lint rules: 룰 없는 규격은 지켜지지 않는다.
 */

import { execFileSync } from "node:child_process";

const LEDGER = "docs/DECISIONS.md";

/** Route files whose *existence* changes the surface inventory. */
const ROUTE_PATTERN = /^app\/\[locale\]\/.*\/page\.tsx$/;

/** Single sources of truth for the two public contracts. */
const CONTRACT_FILES = ["cli/src/lib/cli-commands.mjs", "mcp/src/index.js"];

function printHelp() {
  console.log(`Usage: pnpm decisions:check [-- --base=<ref>]

Fails when a change adds or removes a user-facing route, or edits the MCP/CLI
public contract, without appending to ${LEDGER} in the same change.

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
  .map((line) => {
    const [status, ...paths] = line.split("\t");
    return { status: status[0], path: paths[paths.length - 1] };
  });

const changedPaths = new Set(entries.map((entry) => entry.path));

const surfaceChanges = entries
  .filter((entry) => (entry.status === "A" || entry.status === "D") && ROUTE_PATTERN.test(entry.path))
  .map((entry) => `${entry.status === "A" ? "새 표면" : "표면 제거"}: ${entry.path}`);

const contractChanges = entries
  .filter((entry) => CONTRACT_FILES.includes(entry.path))
  .map((entry) => `공개 계약 변경: ${entry.path}`);

const triggers = [...surfaceChanges, ...contractChanges];

if (triggers.length === 0) {
  console.log("[decisions] no council trigger in this change ✓");
  process.exit(0);
}

if (changedPaths.has(LEDGER)) {
  console.log(`[decisions] trigger present and ${LEDGER} was updated ✓`);
  for (const trigger of triggers) console.log(`[decisions]   ${trigger}`);
  process.exit(0);
}

console.error(`[decisions] 이 변경은 카운슬 소집 트리거를 밟았는데 ${LEDGER} 기록이 없다:`);
for (const trigger of triggers) console.error(`[decisions]   - ${trigger}`);
console.error(`
[decisions] 다음 중 하나를 하라:
[decisions]   1. /po-council 을 소집하고 그 평결을 ${LEDGER} 최상단에 덧붙인다
[decisions]   2. 이미 결정된 사안이면, 선행 기록을 인용하고 이번 변경을 그 기록에 덧붙인다
[decisions]   3. 트리거가 오탐이면 (예: 라우트 파일 이동), 그 사실을 기록에 한 줄로 남긴다
[decisions]
[decisions] 기록은 품질 심사가 아니라 존재 확인이다 — 다음 패스가 읽을 자리에
[decisions] 결정과 그때 진 반대 의견이 남아 있어야 같은 논쟁을 다시 하지 않는다.`);
process.exit(1);
