#!/usr/bin/env bash
# PostToolUse hook — after an edit inside the agent-file surface, run the
# repository's own drift checks and hand the result straight back to the agent.
#
# Why this exists. `.claude/skills` and `.agents/skills` must stay byte
# identical, and so must the two agent-brief trees. Nothing enforces that at the
# moment of the edit. History shows the predictable result: commits that touch
# one tree and not its twin, including one whose own subject line is "mirror
# sync" — a commit whose entire purpose was repairing drift that had already
# landed. The hook table in `scripts/claude-hooks.test.mjs` records the same
# lesson from the other side: it sat red from 2026-07-31 to 2026-08-17 because
# nobody ran the check, and a check nobody runs equals no check.
#
# `agents:check` costs 50 ms, so there is no reason for the answer to wait for a
# commit, a push, or CI. This moves it to the keystroke.
#
# PostToolUse cannot block, and should not: the edit already happened and the
# other half of a mirrored pair is a normal next step, not a violation. So this
# reports rather than refuses, through `hookSpecificOutput.additionalContext`,
# which is the channel Claude reads. Ordinary stdout would not reach the model.
#
# It stays silent when the surface is clean. A hook that speaks on every edit
# spends context to say nothing, and gets ignored exactly when it matters.
#
# Not mirrored into `.codex/hooks.json`. Codex's PostToolUse support for edit
# tools is not something this repository can verify from here, and wiring an
# unverifiable copy would add precisely the dead gate this hook exists to catch.
# Mirror it once someone measures Codex firing it.

set -e

INPUT="$(cat)"

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLI="$REPO_ROOT/cli/src/index.mjs"
[ -f "$CLI" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

VERDICT="$(
  REPO_ROOT="$REPO_ROOT" CLI="$CLI" node --input-type=module -e '
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

// Every path an edit tool can name, across the tools this repository allows.
const input = payload?.tool_input ?? {};
const paths = [input.file_path, input.path, input.notebook_path]
  .concat(Array.isArray(input.edits) ? input.edits.map((e) => e?.file_path) : [])
  .filter((p) => typeof p === "string" && p.length > 0);
if (paths.length === 0) process.exit(0);

const root = process.env.REPO_ROOT;
const WATCHED = [
  ".claude/skills/", ".claude/agents/", ".claude/hooks/", ".claude/settings.json",
  ".agents/skills/", ".agents/agents/",
  ".codex/", ".mcp.json", "AGENTS.md", "CLAUDE.md", ".claude/rules/",
];
const touched = paths.some((p) => {
  const rel = p.startsWith(root) ? p.slice(root.length).replace(/^\//, "") : p;
  return WATCHED.some((w) => (w.endsWith("/") ? rel.startsWith(w) : rel === w || rel.endsWith("/" + w)));
});
if (!touched) process.exit(0);

let report;
try {
  const out = execFileSync(
    process.execPath,
    [process.env.CLI, "agent-files", "--english-only", "--json", "--root", root],
    { encoding: "utf8", timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
  );
  report = JSON.parse(out);
} catch (err) {
  // The command exits 1 when it finds drift, which is the interesting case.
  const stdout = err?.stdout;
  if (typeof stdout !== "string" || stdout.trim() === "") process.exit(0);
  try {
    report = JSON.parse(stdout);
  } catch {
    process.exit(0);
  }
}

const findings = Array.isArray(report?.drift) ? report.drift : [];
if (findings.length === 0) process.exit(0);

const lines = findings.slice(0, 12).map((f) => `  - [${f.check}] ${f.path}: ${f.message}`);
if (findings.length > lines.length) {
  lines.push(`  - ...and ${findings.length - lines.length} more`);
}
process.stdout.write(
  [
    `The agent-file surface has ${findings.length} drift finding(s) after this edit:`,
    ...lines,
    "",
    "Run `pnpm agents:check` for the full report. A mirrored tree is byte-identical",
    "by contract, so an edit to one side is only half the change.",
  ].join("\n"),
);
' <<<"$INPUT" 2>/dev/null || true
)"

[ -n "$VERDICT" ] || exit 0

node --input-type=module -e '
import { readFileSync } from "node:fs";
const context = readFileSync(0, "utf8");
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context },
}));
' <<<"$VERDICT"

exit 0
