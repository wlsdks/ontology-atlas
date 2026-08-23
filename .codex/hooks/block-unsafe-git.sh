#!/usr/bin/env bash
# PreToolUse hook — Blocks irreversible git commands.
#
# **Why a hook instead of prose.** `AGENTS.md` points to git discipline which already prohibited these three.
# However, rule files are *context*, not enforcement — Claude Code official documentation
# (same principle applies to Codex hooks): *"Claude treats them as context, not enforced configuration. To block an
# action regardless of what Claude decides, use a PreToolUse hook instead."*
# The commonality among these three commands is that they are **irreversible**, so "generally don't do it" is
# insufficient. (2026-07-31 Hanes audit prescription)
#
# What is blocked:
# - `--no-verify` / `-n` (commit·push) — Hook bypass. If it can be bypassed, it's not a gate.
# - `git push --force` / `-f` / `--force-with-lease`
# - Direct push to `main`/`master`
# - `git reset --hard`
#
# What is passed: Everything else. Exits 0 with no output.
#
# **If the user explicitly instructed**, the user runs it themselves in the terminal
# (via `! <command>` for this session) or temporarily disables this hook
# (`mv block-unsafe-git.sh block-unsafe-git.sh.off`).

set -euo pipefail

INPUT="$(cat)"

TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    sys.stdout.write(str(data.get("tool_name") or ""))
except Exception:
    sys.exit(0)
' 2>/dev/null || true)
if [[ "$TOOL_NAME" != "Bash" && "$TOOL_NAME" != "exec_command" && "$TOOL_NAME" != "functions.exec_command" ]]; then
  exit 0
fi

COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input") or {}
    sys.stdout.write(tool_input.get("command") or tool_input.get("cmd") or "")
except Exception:
    sys.exit(0)
' 2>/dev/null || echo "")

[[ -z "$COMMAND" ]] && exit 0

# Removes heredoc body — to avoid misinterpreting **quotes** like `--no-verify` inside commit messages as commands.
# The npm publish guard handles this for the same reason (R11 #28).
COMMAND_FOR_MATCH=$(COMMAND="$COMMAND" python3 - <<'PY'
import os
import re

command = os.environ.get("COMMAND", "")
out = []
skip_until = None
for line in command.splitlines():
    if skip_until is not None:
        if line.strip() == skip_until:
            skip_until = None
        continue
    out.append(line)
    match = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)
    if match:
        skip_until = match.group(1)
print("\n".join(out))
PY
)

START='(^|(&&|\|\||;|\|)[[:space:]]+)'
REASON=""

# ① Hook bypass — --no-verify and its shorthand -n for commit/push.
#    `-n` has different meanings in other commands, so we only look in git commit/push context.
if echo "$COMMAND_FOR_MATCH" | grep -Eq -- '--no-verify'; then
  REASON="\`--no-verify\` bypasses git hooks. A gate you can bypass is not a gate — if a hook blocks you, fix what it blocks."
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+(commit|push)([[:space:]]+[^;|&]*)?[[:space:]]-n([[:space:]]|$)"; then
  REASON="\`git commit -n\` / \`git push -n\` is shorthand for \`--no-verify\`."

# ② force push — includes lease. Lease is safer, but both
#    have the same property of deleting others' commits.
#    This repo allows both only after explicit user instruction.
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+push([[:space:]]+[^;|&]*)?[[:space:]](--force|--force-with-lease|-f)([[:space:]]|=|$)"; then
  REASON="A force push deletes other people's commits. Run it only when the user explicitly asked, and never on main."

# ③ Direct push to main/master — This repo always uses PRs.
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+push([[:space:]]+[^;|&]*)?[[:space:]](main|master)([[:space:]]|:|$)"; then
  REASON="This pushes straight to main/master. This repository always goes through a pull request — create a branch and open a PR."

# ④ reset --hard — Uncommitted work in the working tree is lost.
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+reset([[:space:]]+[^;|&]*)?[[:space:]]--hard([[:space:]]|$)"; then
  REASON="\`git reset --hard\` irreversibly discards uncommitted work. Run it only when the user explicitly asked."
fi

if [[ -n "$REASON" ]]; then
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "git safety guard: ${REASON}\n\nBasis: AGENTS.md, section \"Verification, documentation, and Git\".\n\nIf the user explicitly asked for this, have them run it themselves in the terminal, or disable .codex/hooks/block-unsafe-git.sh for that one run."
  }
}
JSON
  exit 0
fi

exit 0
