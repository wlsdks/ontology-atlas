#!/usr/bin/env bash
# PreToolUse hook — Blocks **manual editing** of generated files.
#
# **This is a rule based on observed incidents.** `.claude/rules/git.md`:
#   *"Do not manually edit generated JSON conflicts. … Manually removing conflict
#   markers has left them inside the JSON, breaking type checks in past cases."*
# The rule existed and incidents occurred — because prose is not enforced.
# (2026-07-31 Hanes audit prescription)
#
# The targets are the **outputs** of `pnpm docs-vault:build`:
#   - src/entities/docs-vault/data/**
#   - public/docs-vault/**
#
# What needs fixing is not the output but the **input** (`docs/**/*.md`) or the builder
# (`scripts/build-docs-vault.mjs`). Thanks to the determinism contract, regenerated
# results are identical bytes on any machine (`docs/DEVELOPMENT-CHECKS.md`).
#
# ⚠️ **Bash does not block this.** `pnpm docs-vault:build` itself and the conflict resolution convention
# (`git checkout --ours … && pnpm docs-vault:build`) are both Bash and both valid
# paths. This hook blocks only **the act of fixing line-by-line via editor tools**.

set -euo pipefail

INPUT="$(cat)"

VERDICT=$(printf '%s' "$INPUT" | python3 -c '
import json, sys

GENERATED_PREFIXES = (
    "src/entities/docs-vault/data/",
    "public/docs-vault/",
)

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool = str(data.get("tool_name") or "")
if tool not in {"Edit", "Write", "NotebookEdit", "MultiEdit"}:
    sys.exit(0)

tool_input = data.get("tool_input") or {}
path = tool_input.get("file_path") or tool_input.get("path") or ""
if not path:
    sys.exit(0)

# Normalizes paths so that absolute paths can be determined as repository-relative prefixes.
normalized = path.replace("\\", "/")
for prefix in GENERATED_PREFIXES:
    idx = normalized.find(prefix)
    if idx != -1 and (idx == 0 or normalized[idx - 1] == "/"):
        sys.stdout.write(prefix)
        break
' 2>/dev/null || true)

if [[ -n "$VERDICT" ]]; then
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Generated-output guard: \`${VERDICT}\` is produced by \`pnpm docs-vault:build\`, so it is never hand-edited.\n\nEdit the **input** instead — \`docs/**/*.md\` for content, \`scripts/build-docs-vault.mjs\` for how it is generated — then regenerate with \`pnpm docs-vault:build\`.\n\nOn a merge conflict either side is acceptable (determinism contract):\n  git checkout --ours src/entities/docs-vault/data public/docs-vault && pnpm docs-vault:build\n\nBasis: .claude/rules/git.md, section \"Do not\" — never hand-resolve conflicts in generated JSON; a hand-repaired conflict marker once survived inside the JSON and broke type checking."
  }
}
JSON
  exit 0
fi

exit 0
