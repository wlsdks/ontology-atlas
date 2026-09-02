#!/usr/bin/env bash
# PostToolUse + SubagentStart hook — record which skills and agent seats a
# session actually used. The Codex mirror of `.claude/hooks/record-usage.sh`;
# that header carries the reason (2026-09-02: 18 skills and 15 seats with no
# count of use, so no argument for keeping or cutting any of them).
#
# Adapted rather than copied, because Codex has no Skill tool:
#   - SubagentStart carries `agent_type`, which is the seat or agent invoked
#     (declared in the codex-cli 0.151.0 hook enum and payload fields).
#   - A skill is used by reading its file, which on Codex is a shell command
#     (`cat .agents/skills/<name>/SKILL.md`, `sed -n ... .claude/agents/x.md`),
#     so `tool_input.command` is scanned for skill and seat paths.
#
# The shell checks for the markers before any node process starts, so an
# ordinary command costs one pattern match. Local and gitignored ledger.

set -u

INPUT="$(cat)"
case "$INPUT" in
  *agent_type*|*skills/*|*agents/*) ;;
  *) exit 0 ;;
esac
# Codex sets no project-directory variable; commands run in the session cwd.
REPO_ROOT="${ATLAS_HOOK_ROOT:-$(pwd)}"

REPO_ROOT="$REPO_ROOT" node --input-type=module -e '
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const uses = [];
const event = String(payload?.hook_event_name ?? "");
if (event === "SubagentStart" && typeof payload?.agent_type === "string") uses.push({ kind: "agent", name: payload.agent_type, via: "SubagentStart" });
const command = typeof payload?.tool_input?.command === "string" ? payload.tool_input.command : "";
// NOTE: this block sits inside a single-quoted bash argument, so no apostrophe
// may appear here, in regexes included; the name class stops at whitespace,
// slash, and double quote, which covers how a path is written in a command.
for (const m of command.matchAll(/(?:^|[\s"\/])\.(?:claude|agents)\/skills\/([^/\s"]+)\//g)) uses.push({ kind: "skill", name: m[1], via: "shell" });
for (const m of command.matchAll(/(?:^|[\s"\/])\.(?:claude|agents)\/agents\/([^/\s"]+)\.md/g)) uses.push({ kind: "agent", name: m[1], via: "shell" });
if (uses.length === 0) process.exit(0);

const sessionId = typeof payload?.session_id === "string" ? payload.session_id.replace(/[^\w-]/g, "") : null;
try {
  const dir = join(process.env.REPO_ROOT, ".tmp", "harness");
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "usage.jsonl"),
    uses.map((use) => JSON.stringify({ at: new Date().toISOString(), session: sessionId, ...use })).join("\n") + "\n",
  );
} catch { /* a missed line costs one count, never the session */ }
' <<<"$INPUT" 2>/dev/null || true

exit 0
