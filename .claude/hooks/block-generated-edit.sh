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
    "permissionDecisionReason": "🚫 생성물 가드: \`${VERDICT}\` 는 \`pnpm docs-vault:build\` 의 산출물이라 손으로 고치지 않습니다.\n\n고칠 곳은 **입력**입니다 — 내용이면 \`docs/**/*.md\`, 생성 방식이면 \`scripts/build-docs-vault.mjs\`. 고친 뒤 \`pnpm docs-vault:build\` 로 재생성하세요.\n\n충돌이면 어느 쪽을 취해도 됩니다(결정성 계약):\n  git checkout --ours src/entities/docs-vault/data public/docs-vault && pnpm docs-vault:build\n\n근거: .claude/rules/git.md \"생성물 JSON 충돌을 손으로 편집하지 말 것\" — 충돌 마커를 손으로 지우다 JSON 안에 남겨 타입 검사가 깨진 전례가 있습니다."
  }
}
JSON
  exit 0
fi

exit 0
