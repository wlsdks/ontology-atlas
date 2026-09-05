#!/usr/bin/env bash
# SessionStart hook — injects the ontology vault summary of the current
# directory into the agent context.
#
# **Why this is not also wired to PreCompact.** codex-cli 0.151.0 does declare
# PreCompact and PostCompact, and for one day (2026-09-01) this script was
# wired there on the strength of that enum alone. The output contract was not
# checked: the Codex hooks reference gives both events only `continue`,
# `stopReason`, `systemMessage` (a UI warning) and `suppressOutput`. No stdout
# and no `additionalContext` reaches the model from either, so the wiring
# could never restore a census and was removed (2026-09-02). Whether Codex
# re-fires SessionStart after compaction is not documented; if a later version
# documents a context-carrying compaction event, wire it then, with the proof.
#
# User intent (R14 rounds): "Read ontology during work to get help, then
# automatically record via MCP upon completion." This ensures the agent
# recognizes the vault from the very first moment of work, without requiring
# the user to say "use ontology" in every prompt.
#
# Sources, read 2026-09-02: https://developers.openai.com/codex/hooks
# (SessionStart plain stdout is added as developer context; SessionStart with
# `source: compact` runs after compaction; PreCompact/PostCompact carry no
# context; project hooks run only after `/hooks` trust).
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

CLI_ARGS=()
if command -v ontology-atlas >/dev/null 2>&1; then
  CLI_ARGS=(ontology-atlas)
elif [ -f "$(pwd)/cli/src/index.mjs" ]; then
  CLI_ARGS=(node "$(pwd)/cli/src/index.mjs")
fi

if [ "${#CLI_ARGS[@]}" -eq 0 ]; then
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

# Keep the runnable argv and the displayed shell command aligned. Quoting is
# required for vaults/checkouts whose paths contain spaces or shell syntax.
printf -v HEALTH_COMMAND '%q ' "${CLI_ARGS[@]}" health "$VAULT"
HEALTH_COMMAND="${HEALTH_COMMAND% }"

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

if ! JSON=$("${CLI_ARGS[@]}" overview "$VAULT" --json 2>"$CLI_STDERR"); then
  ESC=$(printf '\033')
  REASON=$(
    sed "s/${ESC}\[[0-9;]*m//g" "$CLI_STDERR" \
      | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
      | grep -v '^$' \
      | head -2
  )
  [ -z "$REASON" ] && exit 0

  # Missing packages can occur even when mcp/node_modules already exists.
  # Install the locked dependencies before asking health to read the vault.
  FIX="$HEALTH_COMMAND"
  case "$REASON" in
    *ERR_MODULE_NOT_FOUND*|*"Cannot find module"*|*package_json_reader*|*"Source-checkout MCP dependencies are missing"*)
      if [ -f "$(pwd)/mcp/package.json" ]; then
        FIX="pnpm --dir mcp install --frozen-lockfile && $HEALTH_COMMAND"
      fi
      ;;
  esac

  # The first output line is deliberately not bracketed. Codex reads a hook's
  # stdout as JSON when it looks like JSON, and a line starting with `[` looks
  # like an array: the earlier `[ontology vault @ …]` header made codex-cli
  # 0.151.0 mark this hook "SessionStart Failed" on every session (measured
  # 2026-09-02 by tracing the hook to a clean exit 0 and then removing the
  # bracket, after which the same run reported Completed). Claude Code never
  # minded, but one census format for both runtimes is cheaper than two.
  cat <<EOF
ontology vault @ ${VAULT}
Vault will not compile — no ontology context this session.
$REASON
Fix it before trusting any ontology answer: \`$FIX\`.
EOF
  exit 0
fi

# Quick summary via Python (kind distribution + domain distribution + top hubs). Uses python3 standard library.
SUMMARY=$(printf '%s' "$JSON" | ATLAS_HEALTH_COMMAND="$HEALTH_COMMAND" python3 -c "$(cat <<'PY'
import json, os, sys
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
    print('Needs attention: ' + ', '.join(drift) + ' — run `' + os.environ['ATLAS_HEALTH_COMMAND'] + '` before relying on the graph.')
PY
)" 2>/dev/null)

# Silent if empty (e.g., vault has no .md files or only a readme without kind)
if [ -z "$SUMMARY" ]; then
  exit 0
fi

cat <<EOF
ontology vault @ ${VAULT}
$SUMMARY

Token budget: prefer focused ontology reads and the narrowest available source
tool (built-in search, grep, language server, Serena, CodeGraph); avoid broad
list_concepts/list files unless needed. Sync ontology only for semantic
codebase changes; skip typo/style/test-fixture-only edits.
EOF

exit 0
