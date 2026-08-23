#!/usr/bin/env bash
# SessionStart hook — Runs once when Codex/agent runtime opens a new session,
# injecting the ontology vault summary of the current directory into the agent context.
#
# User intent (R14 rounds): "Read ontology during work to get help, then
# automatically record via MCP upon completion." This ensures the agent
# recognizes the vault from the very first moment of work, without requiring
# the user to say "use ontology" in every prompt.
#
# Output convention (agent hooks):
#   - exit 0 + empty stdout → silent (blocks noise in repos without a vault)
#   - exit 0 + non-empty stdout → added to agent system context (our path)
#   - exit ≥ 1 → should be ignored (not blocked)
#
# Vault location priority:
#   1. OATLAS_VAULT environment variable (explicit user setting)
#   2. <cwd>/docs/ontology (dogfood pattern for this repo)
#   3. <cwd>/vault (cli init default)
#   4. If <cwd> itself contains .md files with frontmatter `kind:`, use cwd
#   ↳ Silent if no candidate is found.

set -e

CLI_BIN=""
if command -v ontology-atlas >/dev/null 2>&1; then
  CLI_BIN="ontology-atlas"
elif [ -f "$(pwd)/cli/src/index.mjs" ]; then
  CLI_BIN="node $(pwd)/cli/src/index.mjs"
fi

if [ -z "$CLI_BIN" ]; then
  exit 0
fi

# Determine vault location
VAULT=""
if [ -n "$OATLAS_VAULT" ] && [ -d "$OATLAS_VAULT" ]; then
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

# Compact census only. Keep SessionStart output short because it is injected
# into agent context on every new session.
#
# ⚠️ **Must not remain silent when the vault is broken** (observed 2026-08-17). Previously, this line was
# `... 2>/dev/null) || exit 0` — failing to invoke the tool and **failing to read the vault**
# were both collapsed into silence. However, the latter is the moment the session
# needs to know this most: if you manually add one node (the normal human path),
# the graph fails to compile entirely due to missing `uid:`, and that session **starts
# without receiving any ontology context**. It doesn't even know why it's silent.
#
# So we separate them: **if stderr exists, it means vault reading failed**, so report it in one line.
# If there is no stderr (the tool itself didn't run), remain silent as before — preserving the original
# convention of not adding noise to repos without a vault.
CLI_STDERR="$(mktemp)"
trap 'rm -f "$CLI_STDERR"' EXIT

if ! JSON=$($CLI_BIN overview "$VAULT" --json 2>"$CLI_STDERR"); then
  ESC=$(printf '\033')
  REASON=$(
    sed "s/${ESC}\[[0-9;]*m//g" "$CLI_STDERR" \
      | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
      | grep -v '^$' \
      | head -2
  )
  [ -z "$REASON" ] && exit 0

  # A fresh clone or a new worktree has no `mcp/node_modules`, so the MCP child
  # dies on ERR_MODULE_NOT_FOUND before it ever reads the vault. That is not a
  # broken vault and `health` will not repair it — `health` runs through the same
  # missing module. Naming the wrong command is worse than naming none: it costs
  # a round trip and teaches that this line is noise (2026-08-24 observation).
  FIX="ontology-atlas health $VAULT"
  case "$REASON" in
    *ERR_MODULE_NOT_FOUND*|*"Cannot find module"*|*package_json_reader*)
      if [ -f "$(pwd)/mcp/package.json" ] && [ ! -d "$(pwd)/mcp/node_modules" ]; then
        FIX="pnpm --dir mcp install   # this checkout has no mcp/node_modules yet"
      fi
      ;;
  esac

  cat <<EOF
[ontology vault @ ${VAULT}]
Vault will not compile — no ontology context this session.
$REASON
Fix it before trusting any ontology answer: \`$FIX\`.
EOF
  exit 0
fi

# Quick summary via Python (kind distribution + domain distribution + top hubs). Uses python3 standard library.
SUMMARY=$(printf '%s' "$JSON" | python3 -c "$(cat <<'PY'
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
by_kind = d.get('byKind') or {}
graph = d.get('graph') or {}
total = graph.get('nodes') or sum(by_kind.values())
if not total:
    sys.exit(0)
kinds = ', '.join(f'{k}:{v}' for k, v in sorted(by_kind.items(), key=lambda x: -x[1]))
print(f'Ontology vault: {total} nodes ({kinds}). Load details only when the task changes product/code meaning.')
unresolved = graph.get('unresolvedEdges') or 0
issues = graph.get('issues') or 0
ambiguous = graph.get('ambiguousAliases') or 0
drift = []
if unresolved:
    drift.append(f"{unresolved} unresolved edge{'s' if unresolved != 1 else ''}")
if issues:
    drift.append(f"{issues} compile issue{'s' if issues != 1 else ''}")
if ambiguous:
    drift.append(f"{ambiguous} ambiguous alias{'es' if ambiguous != 1 else ''}")
if drift:
    print('Needs attention: ' + ', '.join(drift) + ' — run `ontology-atlas health` before relying on the graph.')
PY
)" 2>/dev/null)

# Silent if empty (e.g., vault has no .md files or only a readme without kind)
if [ -z "$SUMMARY" ]; then
  exit 0
fi

cat <<EOF
[ontology vault @ ${VAULT}]
$SUMMARY

Token budget: prefer focused ontology reads and the narrowest available source
tool (built-in search, grep, language server, Serena, CodeGraph); avoid broad
list_concepts/list files unless needed. Sync ontology only for semantic
codebase changes; skip typo/style/test-fixture-only edits.
EOF

exit 0
