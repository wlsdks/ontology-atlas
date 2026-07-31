#!/usr/bin/env bash
# PreToolUse hook — 되돌릴 수 없는 git 명령을 차단한다.
#
# **왜 산문이 아니라 훅인가.** `AGENTS.md` 가 가리키는 git 규율 는 이 셋을 이미 금지하고
# 있었다. 그런데 규칙 파일은 *컨텍스트*이지 강제가 아니다 — Claude Code 공식 문서
# (같은 원칙이 Codex hooks 에도 적용된다): *"Claude treats them as context, not enforced configuration. To block an
# action regardless of what Claude decides, use a PreToolUse hook instead."*
# 세 명령의 공통점은 **되돌릴 수 없다**는 것이고, 그래서 "대체로 안 한다" 로는
# 부족하다. (2026-07-31 하네스 감사 처방)
#
# 차단하는 것:
# - `--no-verify` / `-n` (commit·push) — 훅 우회. 우회할 수 있으면 게이트가 아니다
# - `git push --force` / `-f` / `--force-with-lease`
# - `main`/`master` 로의 직접 push
# - `git reset --hard`
#
# 통과시키는 것: 그 외 전부. 출력 없이 exit 0.
#
# **사용자가 명시적으로 지시했다면** 사용자 본인이 터미널에서 실행하거나
# (`! <command>` 로 이 세션에서 실행), 이 훅을 임시로 끈다
# (`mv block-unsafe-git.sh block-unsafe-git.sh.off`).

set -euo pipefail

INPUT="$(cat)"

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

COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input") or {}
    sys.stdout.write(tool_input.get("command") or tool_input.get("cmd") or "")
except Exception:
    sys.exit(0)
' 2>/dev/null || echo "")

[[ -z "$COMMAND" ]] && exit 0

# heredoc 본문 제거 — 커밋 메시지 안의 `--no-verify` 같은 **인용**을 명령으로
# 오인하지 않는다. npm publish 가드가 같은 이유로 같은 처리를 한다(R11 #28).
COMMAND_FOR_MATCH=$(COMMAND="$COMMAND" python3 - <<'PY'
import os
import re

command = os.environ.get("COMMAND", "")
out = []
skip_until = None
for line in command.splitlines():
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

START='(^|(&&|\|\||;|\|)[[:space:]]+)'
REASON=""

# ① 훅 우회 — commit/push 의 --no-verify 와 그 단축 -n.
#    `-n` 은 다른 명령에서 다른 뜻이라 git commit/push 문맥에서만 본다.
if echo "$COMMAND_FOR_MATCH" | grep -Eq -- '--no-verify'; then
  REASON="\`--no-verify\` 는 git 훅을 우회합니다. 우회할 수 있는 게이트는 게이트가 아닙니다 — 훅이 막는 것이 있으면 그것을 고치세요."
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+(commit|push)([[:space:]]+[^;|&]*)?[[:space:]]-n([[:space:]]|$)"; then
  REASON="\`git commit -n\` / \`git push -n\` 은 \`--no-verify\` 의 단축형입니다."

# ② force push — lease 포함. lease 가 더 안전하긴 하지만 남의 커밋을 지우는
#    성질은 같고, 이 저장소는 둘 다 사용자 명시 지시 뒤에만 허용한다.
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+push([[:space:]]+[^;|&]*)?[[:space:]](--force|--force-with-lease|-f)([[:space:]]|=|$)"; then
  REASON="force push 는 남의 커밋을 지웁니다. 사용자가 명시적으로 지시한 경우에만 실행할 수 있고, main 에는 어떤 경우에도 금지입니다."

# ③ main/master 직접 push — 이 저장소는 항상 PR 이다.
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+push([[:space:]]+[^;|&]*)?[[:space:]](main|master)([[:space:]]|:|$)"; then
  REASON="main/master 로 직접 push 하려 합니다. 이 저장소는 항상 PR 을 거칩니다 — 브랜치를 만들고 PR 을 여세요."

# ④ reset --hard — 커밋 안 한 작업본이 사라진다.
elif echo "$COMMAND_FOR_MATCH" | grep -Eq "${START}git[[:space:]]+reset([[:space:]]+[^;|&]*)?[[:space:]]--hard([[:space:]]|$)"; then
  REASON="\`git reset --hard\` 는 커밋하지 않은 작업본을 되돌릴 수 없게 지웁니다. 사용자가 명시적으로 지시한 경우에만 실행하세요."
fi

if [[ -n "$REASON" ]]; then
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "🚫 git 안전 가드: ${REASON}\n\n근거: AGENTS.md \"함부로 하지 말 것\".\n\n사용자가 명시적으로 지시했다면 사용자 본인이 터미널에서 실행하거나(\`! <command>\`), .codex/hooks/block-unsafe-git.sh 를 잠시 끄고 실행하세요."
  }
}
JSON
  exit 0
fi

exit 0
