#!/usr/bin/env bash
# PreToolUse hook — Blocks npm/pnpm/yarn publish commands in Bash.
#
# Called by Codex/agent runtime as a PreToolUse hook. Receives tool_input JSON via stdin,
# and outputs a deny JSON if the command contains the publish keyword (exit 0).
#
# For passing through, exits 0 with no output — agent runtime proceeds as is.
#
# Blocking rules:
# - `npm publish`, `pnpm publish`, `yarn publish` (actual publishing)
# - Blocks even if `npm publish`-like commands are mixed in chains (`&&`, `||`, `;`, `|`)
# - `npm pack` (simple dry-run passes — when keyword `--dry-run` is included)
# - `npm version <patch|minor|major>` combined with auto-publish (`postversion` script)
# - Read-only commands like `npm whoami`, `npm view`, `npm pack --dry-run` pass
#
# To execute publish with explicit user approval, temporarily disable this file (`mv block-npm-publish.sh block-npm-publish.sh.off`) or run it directly in the terminal.

set -euo pipefail

INPUT="$(cat)"

# Passes if tool_name is not a shell execution surface. Codex desktop
# uses functions.exec_command + tool_input.cmd format.
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

# Extracts tool_input.command/cmd (handles escaped quotes inside JSON)
COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input") or {}
    cmd = tool_input.get("command") or tool_input.get("cmd") or ""
    sys.stdout.write(cmd)
except Exception:
    sys.exit(0)
' 2>/dev/null || echo "")

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Regex matching: publish-like patterns
# - (npm|pnpm|yarn) publish — Matches only the *command start*. Line start or
#   immediately after shell chain delimiter (&&, ||, ;, |). Words inside heredoc body / commit
#   message body are not matched as *command start* (R11 #28
#   false positive fix).
# - npm pack (non-dry-run) — Same precision.
BLOCKED=0
REASON=""

# Command start patterns:
#   ^                       — line start (excluding heredoc body)
#   (&&|\|\||;|\|)\s+       — immediately after shell chain delimiter (&&, ||, ;, |)
# Removes line-start text from multi-line heredoc bodies before checking to avoid
# misidentifying them as command starts.
PUBLISH_RE='(^|(&&|\|\||;|\|)[[:space:]]+)(npm|pnpm|yarn)[[:space:]]+publish([[:space:]]|$)'
PACK_RE='(^|(&&|\|\||;|\|)[[:space:]]+)npm[[:space:]]+pack([[:space:]]|$)'
COMMAND_FOR_MATCH=$(COMMAND="$COMMAND" python3 - <<'PY'
import os
import re

command = os.environ.get("COMMAND", "")
lines = command.splitlines()
out = []
skip_until = None

for line in lines:
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

if echo "$COMMAND_FOR_MATCH" | grep -E "$PUBLISH_RE" >/dev/null; then
  BLOCKED=1
  REASON="An npm/pnpm/yarn publish command was detected. It publishes permanently to the external npm registry, so explicit user approval is required."
fi

if [[ $BLOCKED -eq 0 ]] && echo "$COMMAND_FOR_MATCH" | grep -E "$PACK_RE" >/dev/null; then
  if ! echo "$COMMAND_FOR_MATCH" | grep -E -- '--dry-run' >/dev/null; then
    BLOCKED=1
    REASON="'npm pack' is about to run without --dry-run. Producing or uploading a real tarball requires user approval; add --dry-run for a read-only audit."
  fi
fi

if [[ $BLOCKED -eq 1 ]]; then
  # PreToolUse deny format: Passes reason via JSON
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "npm publish guard: ${REASON}\n\nRun it only when the user explicitly asked to publish.\nBasis: AGENTS.md, section \"Verification, documentation, and Git\" — never run a publish command unless the user explicitly asks.\n\nHave the user run it themselves in the terminal, or disable .codex/hooks/block-npm-publish.sh first."
  }
}
JSON
  exit 0
fi

exit 0
