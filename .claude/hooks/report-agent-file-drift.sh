#!/usr/bin/env bash
# PostToolUse hook — after an edit inside the agent-file surface, run the
# repository's own drift checks and hand the result straight back to the agent.
#
# Codex and Claude own independent instructions and resources. Copy differences
# are expected; report only integrity findings such as missing references,
# undeclared grants, language violations, or size limits. PostToolUse reports
# through additionalContext and never blocks an edit.

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

const findings = (Array.isArray(report?.drift) ? report.drift : []).filter((f) =>
  !(["skill-copy", "agent-copy"].includes(f.check)
    && [f.check + "-diverged", f.check + "-file-missing"].includes(f.code)),
);
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
    "Run `pnpm agents:check` for integrity details. Codex and Claude files are independent;",
    "do not synchronize them merely because their content or resources differ.",
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
