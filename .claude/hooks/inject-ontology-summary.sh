#!/usr/bin/env bash
# SessionStart hook — injects a summary of the ontology vault in the current
# directory into the agent context.
#
# **Compaction is covered by this same wiring, and not by PreCompact.** A
# SessionStart entry with no matcher fires for every source, including
# `compact`, and its stdout is one of the few that Claude Code adds to context
# (documented exceptions: UserPromptSubmit, UserPromptExpansion, SessionStart,
# PostModelSwitch). A PreCompact hook was wired here for one day (2026-09-01)
# on the assumption that its stdout followed the same convention; it does not.
# Its output reached the terminal transcript only, while the census the model
# actually saw after compaction came from this SessionStart entry (observed
# 2026-09-02). The duplicate was removed so the wiring says what it does.
#
# User intent (R14 rounds): "Read ontology during work and automatically record via MCP upon completion". This ensures
# the agent recognizes the vault from the very first moment of work without the user needing to say "use ontology" for every prompt.
#
# Sources, read 2026-09-02: https://code.claude.com/docs/en/hooks (exit-0
# stdout reaches context only for UserPromptSubmit, UserPromptExpansion,
# SessionStart, PostModelSwitch; SessionStart matchers include `compact`).
#
# Output convention (Claude Code hooks):
#   - exit 0 + empty stdout → silent (blocks noise in repos without vault)
#   - exit 0 + stdout content → added to agent system context (this is our path)
#   - exit ≥ 1                 → correctly ignored (not blocked)
#
# Vault location priority:
#   1. OATLAS_VAULT environment variable (explicit user setting)
#   2. <cwd>/docs/ontology  (dogfood pattern like this repo)
#   3. <cwd>/vault          (cli init default)
#   4. If cwd itself has .md files with frontmatter `kind:`, use cwd
#   ↳ If no candidate is found, remain silent.

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

# Determine vault
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
# ⚠️ **Must not remain silent when the vault is broken** (2026-08-17 observation). Previously, this line was
# `... 2>/dev/null) || exit 0` — failing to invoke the tool and **failing to read the vault** were both collapsed into silence. But the latter is the moment the session needs to know most: if a human manually adds one node (a normal path),
# it lacks a `uid:`, causing the entire graph compilation to fail, and that session **starts without receiving any ontology context**. They don't even know why it's silent.
#
# So we separate them: **if stderr exists, it means failure while reading the vault**, so speak in one line. If there is no stderr (the tool itself failed to run), remain silent as before — preserving the original convention of not adding noise to repos without a vault.
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

# Quick summary via Python (kind distribution + domain distribution + top hubs). Standard python3.
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

# Silent if empty (e.g., vault has no .md files or only readme without kind)
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
