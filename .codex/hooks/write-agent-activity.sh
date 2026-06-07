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
AGENT="${OATLAS_AGENT_NAME:-codex}"
STATE="planning"
FOCUS="Agent session connected to Ontology Atlas"
PLAN="Read the ontology before code changes"
MCP_EVIDENCE="SessionStart ontology summary hook"
CODEGRAPH_EVIDENCE=""
VERIFY_EVIDENCE=""
ONTOLOGY_SLUG=""
FOCUS_FILES=()

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
    tool_input = data.get("tool_input") or {}
    sys.stdout.write(str(tool_input.get("command") or tool_input.get("cmd") or ""))
except Exception:
    sys.exit(0)
' 2>/dev/null || true)

  if { [ "$TOOL_NAME" = "Bash" ] || [ "$TOOL_NAME" = "exec_command" ] || [ "$TOOL_NAME" = "functions.exec_command" ]; } && [ -n "$COMMAND" ]; then
    ONE_LINE=$(printf '%s' "$COMMAND" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c 1-180)
    ONTOLOGY_FOCUS=$(printf '%s' "$COMMAND" | python3 -c '
import re, sys
command = sys.stdin.read()
match = re.search(r"(docs/ontology/[A-Za-z0-9._@+/-]+\.md)\b", command)
if match:
    path = match.group(1)
    slug = path.removeprefix("docs/ontology/").removesuffix(".md")
    sys.stdout.write(f"{slug}\n{path}")
' 2>/dev/null || true)
    if [ -n "$ONTOLOGY_FOCUS" ]; then
      ONTOLOGY_SLUG=$(printf '%s' "$ONTOLOGY_FOCUS" | sed -n '1p')
      FOCUS_FILES+=("$(printf '%s' "$ONTOLOGY_FOCUS" | sed -n '2p')")
    fi
    SOURCE_FILES=$(printf '%s' "$COMMAND" | python3 -c '
import re, sys
command = sys.stdin.read()
pattern = re.compile(r"(?<![A-Za-z0-9_./-])((?:app|src|cli|mcp|scripts|tests|src-tauri)/[A-Za-z0-9._/@+-]+?\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|rs|toml|css))\b")
seen = []
for match in pattern.finditer(command):
    path = match.group(1)
    if path.startswith("docs/ontology/") or path in seen:
        continue
    seen.append(path)
    if len(seen) >= 3:
        break
sys.stdout.write("\n".join(seen))
' 2>/dev/null || true)
    if [ -n "$SOURCE_FILES" ]; then
      while IFS= read -r source_file; do
        [ -n "$source_file" ] || continue
        duplicate=0
        for existing_file in "${FOCUS_FILES[@]}"; do
          if [ "$existing_file" = "$source_file" ]; then
            duplicate=1
            break
          fi
        done
        [ "$duplicate" -eq 1 ] || FOCUS_FILES+=("$source_file")
      done <<< "$SOURCE_FILES"
    fi
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

if [ -n "$ONTOLOGY_SLUG" ]; then
  ARGS+=(--ontology-slug "$ONTOLOGY_SLUG")
fi

for focus_file in "${FOCUS_FILES[@]}"; do
  [ -n "$focus_file" ] && ARGS+=(--file "$focus_file")
done

if [ -n "$CODEGRAPH_EVIDENCE" ]; then
  ARGS+=(--codegraph "$CODEGRAPH_EVIDENCE")
fi

if [ -n "$VERIFY_EVIDENCE" ]; then
  ARGS+=(--verify "$VERIFY_EVIDENCE")
fi

"${CLI_CMD[@]}" "${ARGS[@]}" --json >/dev/null 2>&1 || true

exit 0
