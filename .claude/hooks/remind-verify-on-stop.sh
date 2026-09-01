#!/usr/bin/env bash
# Stop hook — one reminder, once, when source edits were never verified.
#
# The rule "start verification with pnpm checks:changed; do not claim completion
# from selected checks" lives in AGENTS.md as prose, and this repository's own
# discipline says prose is not enforcement. This hook turns it into a mechanism
# at the cheapest honest strength: if this session edited source files
# (fast-sensor.sh keeps the ledger) after the last verification command ran
# (stamp-verification.sh keeps the stamp), the first Stop is turned back once
# with the exact command to run. Documentation-only and read-only sessions
# never see it, because only source edits reach the ledger.
#
# **Once means once.** When the agent continues because of this block,
# `stop_hook_active` is true on the next Stop and the hook stands aside —
# whatever the agent decided after one reminder is its decision, witnessed. A
# hard gate here would fight legitimate stops (a question answered mid-task, an
# analysis session that touched one file); the falsifier recorded with this
# lane: two observed false turns-back in a week mean the detection heuristic
# gets fixed, never escalated to a hard block.
#
# Not mirrored into `.codex/hooks.json`: Codex has no Stop event; its analogue
# is the stop-time review gate the codex plugin already owns.

set -u

INPUT="$(cat)"
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

REPO_ROOT="$REPO_ROOT" node --input-type=module -e '
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

// A stop that follows a previous stop-hook block passes — one reminder, once.
if (payload?.stop_hook_active === true) process.exit(0);

const sessionId = typeof payload?.session_id === "string" ? payload.session_id.replace(/[^\w-]/g, "") : "";
if (!sessionId) process.exit(0);

const dir = join(process.env.REPO_ROOT, ".tmp", "harness");
const ledgerPath = join(dir, `session-${sessionId}.edits`);
if (!existsSync(ledgerPath)) process.exit(0);

let lastEdit = 0;
const files = new Set();
try {
  for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
    const [ts, file] = line.split("\t");
    const t = Number(ts);
    if (!file || !Number.isFinite(t)) continue;
    if (t > lastEdit) lastEdit = t;
    files.add(file);
  }
} catch {
  process.exit(0);
}
if (files.size === 0) process.exit(0);

let lastVerified = 0;
const stampPath = join(dir, `session-${sessionId}.verified`);
if (existsSync(stampPath)) {
  try {
    lastVerified = Number(readFileSync(stampPath, "utf8"));
  } catch { /* treat as unverified */ }
}
if (Number.isFinite(lastVerified) && lastVerified >= lastEdit) process.exit(0);

const list = [...files].slice(0, 10);
const more = files.size - list.length;
process.stdout.write(JSON.stringify({
  decision: "block",
  reason: [
    `This session edited ${files.size} source file(s) after the last verification run:`,
    ...list.map((f) => `  - ${f}`),
    ...(more > 0 ? [`  - ...and ${more} more`] : []),
    "",
    "Run the focused checks before finishing (or state explicitly why verification does not apply here):",
    `  pnpm checks:changed -- --run ${list.join(" ")}`,
    "",
    "This reminder fires once; your next stop passes either way.",
  ].join("\n"),
}));
' <<<"$INPUT" 2>/dev/null || true

exit 0
