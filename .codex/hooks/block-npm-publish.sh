#!/usr/bin/env bash
# PreToolUse hook — Bash 명령에서 npm/pnpm/yarn publish 류를 차단한다.
#
# Codex/agent runtime 이 PreToolUse hook 으로 호출. stdin 으로 tool_input JSON 을 받고,
# 명령에 publish 키워드가 들어 있으면 deny 하는 JSON 을 출력 (exit 0).
#
# 통과시키는 경우는 출력 없이 exit 0 — agent runtime 이 그대로 진행.
#
# 차단 규칙:
# - `npm publish`, `pnpm publish`, `yarn publish` (실제 발행)
# - `npm publish` 류가 chain (`&&`, `||`, `;`, `|`) 안에 섞여 있어도 차단
# - `npm pack` (단순 dry-run 은 통과 — 키워드 `--dry-run` 포함 시)
# - `npm version <patch|minor|major>` 가 자동 publish 와 결합된 경우 (`postversion` script)
# - `npm whoami`, `npm view`, `npm pack --dry-run` 같은 read-only 는 통과
#
# 사용자가 명시 승인을 줘서 publish 를 실행하려면, 이 파일을 임시로 비활성화 (`mv block-npm-publish.sh block-npm-publish.sh.off`) 하거나, 사용자가 직접 터미널에서 실행한다.

set -euo pipefail

INPUT="$(cat)"

# tool_name 이 Bash 가 아니면 패스
TOOL_NAME=$(printf '%s' "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

# tool_input.command 추출 (JSON 안에 escape 된 따옴표 처리)
COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    cmd = data.get("tool_input", {}).get("command", "")
    sys.stdout.write(cmd)
except Exception:
    sys.exit(0)
' 2>/dev/null || echo "")

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# 정규식 매칭: publish 류 패턴
# - (npm|pnpm|yarn) publish — *명령 시작점* 만 매치. line 시작 또는
#   shell chain delimiter (&&, ||, ;, |) 직후. heredoc body / commit
#   message 본문 안의 단어는 *명령 시작* 이 아니라 매치 안 됨 (R11 #28
#   false positive fix).
# - npm pack (dry-run 아닌 경우) — 같은 정밀화.
BLOCKED=0
REASON=""

# 명령 시작점 patterns:
#   ^                       — line 시작 (heredoc body 제외)
#   (&&|\|\||;|\|)\s+       — shell chain delimiter 직후 (&&, ||, ;, |)
# multi-line heredoc body 의 line-start 텍스트는 검사 전에 제거해 명령
# 시작으로 오인하지 않는다.
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
  REASON="npm/pnpm/yarn publish 명령이 감지됐습니다. 외부 npm 레지스트리에 영구 발행되는 작업이라 사용자의 명시적 승인이 필수입니다."
fi

if [[ $BLOCKED -eq 0 ]] && echo "$COMMAND_FOR_MATCH" | grep -E "$PACK_RE" >/dev/null; then
  if ! echo "$COMMAND_FOR_MATCH" | grep -E -- '--dry-run' >/dev/null; then
    BLOCKED=1
    REASON="'npm pack' 이 --dry-run 없이 실행되려고 합니다. 실제 tarball 생성/발행은 사용자 승인이 필수입니다 (감사용이면 --dry-run 추가)."
  fi
fi

if [[ $BLOCKED -eq 1 ]]; then
  # PreToolUse deny 형식: JSON 으로 reason 전달
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "🚫 npm publish 가드: ${REASON}\n\n사용자가 명시적으로 'publish 해줘' 라고 지시한 경우에만 실행 가능합니다.\nAGENTS.md 의 'npm publish guard' 섹션 참조.\n\n사용자 본인이 터미널에서 직접 실행하거나, .codex/hooks/block-npm-publish.sh 를 비활성화 후 실행하세요."
  }
}
JSON
  exit 0
fi

exit 0
