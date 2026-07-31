#!/usr/bin/env bash
# PreToolUse hook — 생성물 파일의 **손 편집**을 차단한다.
#
# **실측 사고가 있는 규칙이다.** `AGENTS.md` 가 가리키는 git 규율:
#   *"생성물 JSON 충돌을 손으로 편집하지 말 것. … 충돌 마커를 손으로 지우다
#   JSON 안에 남겨 타입 검사가 깨진 전례가 있다."*
# 규칙은 있었고 사고는 났다 — 산문은 강제가 아니기 때문이다.
# (2026-07-31 하네스 감사 처방)
#
# 차단 대상은 `pnpm docs-vault:build` 의 **산출물**이다:
#   - src/entities/docs-vault/data/**
#   - public/docs-vault/**
#
# 고쳐야 할 것은 산출물이 아니라 **입력**(`docs/**/*.md`)이거나 빌더
# (`scripts/build-docs-vault.mjs`)다. 결정성 계약 덕에 재생성 결과는 어느
# 머신에서나 같은 바이트다(`docs/DEVELOPMENT-CHECKS.md`).
#
# ⚠️ **Bash 는 막지 않는다.** `pnpm docs-vault:build` 도, 충돌 해소 관례
# (`git checkout --ours … && pnpm docs-vault:build`)도 Bash 이고 둘 다 정당한
# 경로다. 이 훅이 막는 것은 **에디터 도구로 한 줄씩 고치는 행위** 하나다.

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

# 절대 경로로 와도 저장소 상대 접두로 판정할 수 있게 정규화한다.
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
    "permissionDecisionReason": "🚫 생성물 가드: \`${VERDICT}\` 는 \`pnpm docs-vault:build\` 의 산출물이라 손으로 고치지 않습니다.\n\n고칠 곳은 **입력**입니다 — 내용이면 \`docs/**/*.md\`, 생성 방식이면 \`scripts/build-docs-vault.mjs\`. 고친 뒤 \`pnpm docs-vault:build\` 로 재생성하세요.\n\n충돌이면 어느 쪽을 취해도 됩니다(결정성 계약):\n  git checkout --ours src/entities/docs-vault/data public/docs-vault && pnpm docs-vault:build\n\n근거: AGENTS.md \"생성물 JSON 충돌을 손으로 편집하지 말 것\" — 충돌 마커를 손으로 지우다 JSON 안에 남겨 타입 검사가 깨진 전례가 있습니다."
  }
}
JSON
  exit 0
fi

exit 0
