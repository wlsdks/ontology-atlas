#!/usr/bin/env bash
# SessionStart / PreToolUse hook — keep Atlas' live agent activity heartbeat
# current without blocking the agent when the CLI or vault is unavailable.

if [ "${OATLAS_DISABLE_AGENT_ACTIVITY_HOOK:-}" = "1" ]; then
  exit 0
fi

CLI_CMD=()
if command -v ontology-atlas >/dev/null 2>&1; then
  CLI_CMD=(ontology-atlas)
elif [ -f "$(pwd)/cli/src/index.mjs" ]; then
  CLI_CMD=(node "$(pwd)/cli/src/index.mjs")
fi

if [ "${#CLI_CMD[@]}" -eq 0 ]; then
  exit 0
fi

VAULT=""
if [ -n "${OATLAS_VAULT:-}" ] && [ -d "$OATLAS_VAULT" ]; then
  VAULT="$OATLAS_VAULT"
elif [ -d "$(pwd)/docs/ontology" ]; then
  VAULT="$(pwd)/docs/ontology"
elif [ -d "$(pwd)/vault" ]; then
  VAULT="$(pwd)/vault"
elif ls "$(pwd)"/*.md >/dev/null 2>&1 && grep -lq "^kind:" "$(pwd)"/*.md 2>/dev/null; then
  VAULT="$(pwd)"
fi

if [ -z "$VAULT" ]; then
  exit 0
fi

INPUT="$(cat 2>/dev/null || true)"
AGENT="${OATLAS_AGENT_NAME:-claude-code}"
STATE="planning"
FOCUS="Agent session connected to Ontology Atlas"
PLAN="Read the ontology before code changes"
MCP_EVIDENCE="SessionStart ontology summary hook"
CODEGRAPH_EVIDENCE=""
VERIFY_EVIDENCE=""

if [ -n "$INPUT" ]; then
  TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    sys.stdout.write(str(data.get("tool_name") or ""))
except Exception:
    sys.exit(0)
' 2>/dev/null || true)

  COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    sys.stdout.write(str((data.get("tool_input") or {}).get("command") or ""))
except Exception:
    sys.exit(0)
' 2>/dev/null || true)

  if [ "$TOOL_NAME" = "Bash" ] && [ -n "$COMMAND" ]; then
    ONE_LINE=$(printf '%s' "$COMMAND" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c 1-180)
    FOCUS="Running shell command: $ONE_LINE"
    PLAN="Let Atlas show the current command while the agent works"
    case "$COMMAND" in
      *vitest*|*playwright*|*test*|*tsc\ --noEmit*|*lint*|*build*|*verify*|*validate*|*check*)
        STATE="verifying"
        VERIFY_EVIDENCE="$ONE_LINE"
        ;;
      *git\ commit*|*git\ push*)
        STATE="complete"
        VERIFY_EVIDENCE="$ONE_LINE"
        ;;
      *)
        STATE="editing"
        ;;
    esac
  fi
fi

ARGS=(
  agent-activity "$VAULT"
  --agent "$AGENT"
  --state "$STATE"
  --focus "$FOCUS"
  --plan "$PLAN"
  --mcp "$MCP_EVIDENCE"
)

if [ -n "$CODEGRAPH_EVIDENCE" ]; then
  ARGS+=(--codegraph "$CODEGRAPH_EVIDENCE")
fi

if [ -n "$VERIFY_EVIDENCE" ]; then
  ARGS+=(--verify "$VERIFY_EVIDENCE")
fi

"${CLI_CMD[@]}" "${ARGS[@]}" --json >/dev/null 2>&1 || true

exit 0
