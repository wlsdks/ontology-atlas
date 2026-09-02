#!/usr/bin/env bash
# PostToolUse hook — record which skills and agent seats a session actually used.
#
# Why this exists (2026-09-02 harness assessment). The repository carries 18
# skills, 15 agent seats, and the councils that convene them, and nothing counts
# which of them a session ever invokes. Without that number, "this seat earns
# its place" and "this skill is dead weight" are both opinions. The same day the
# decision ledger and the changelog were cut to what a reader needs, on
# measurement; the process layer needs its own measurement before the same cut
# can be argued. This hook writes one line per use; `pnpm harness:report`
# lists every inventoried skill and seat that went unused in the window.
#
# What counts as a use (Claude Code):
#   - the Skill tool           → tool_input.skill
#   - the Task/Agent tool      → tool_input.subagent_type
#   - a Read of `<tree>/skills/<name>/...` or `<tree>/agents/<name>.md`, which
#     is how a session reads a skill without the tool (both agent trees)
#
# Cheap by construction: the shell looks for the three markers before any node
# process starts, so an ordinary Read costs one grep. The ledger is local and
# gitignored under .tmp/harness/, like every other harness measurement.
#
# Mirrored at `.codex/hooks/record-usage.sh`: Codex has no Skill tool, so the
# mirror reads SubagentStart (agent_type) and shell commands that open a skill
# or seat file.

set -u

INPUT="$(cat)"
case "$INPUT" in
  *'"Skill"'*|*'"Task"'*|*'"Agent"'*|*skills/*|*agents/*) ;;
  *) exit 0 ;;
esac
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

REPO_ROOT="$REPO_ROOT" node --input-type=module -e '
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const tool = String(payload?.tool_name ?? "");
const input = payload?.tool_input ?? {};
const uses = [];
if (tool === "Skill" && typeof input.skill === "string") uses.push({ kind: "skill", name: input.skill.replace(/^\//, "") });
if ((tool === "Task" || tool === "Agent") && typeof input.subagent_type === "string") uses.push({ kind: "agent", name: input.subagent_type });
const path = typeof input.file_path === "string" ? input.file_path : "";
const skillRead = /(?:^|\/)\.(?:claude|agents)\/skills\/([^/]+)\//.exec(path);
if (skillRead) uses.push({ kind: "skill", name: skillRead[1] });
const agentRead = /(?:^|\/)\.(?:claude|agents)\/agents\/([^/]+)\.md$/.exec(path);
if (agentRead) uses.push({ kind: "agent", name: agentRead[1] });
if (uses.length === 0) process.exit(0);

const sessionId = typeof payload?.session_id === "string" ? payload.session_id.replace(/[^\w-]/g, "") : null;
try {
  const dir = join(process.env.REPO_ROOT, ".tmp", "harness");
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "usage.jsonl"),
    uses.map((use) => JSON.stringify({ at: new Date().toISOString(), session: sessionId, ...use, via: tool })).join("\n") + "\n",
  );
} catch { /* a missed line costs one count, never the session */ }
' <<<"$INPUT" 2>/dev/null || true

exit 0
