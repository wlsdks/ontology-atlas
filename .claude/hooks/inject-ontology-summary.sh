#!/usr/bin/env bash
# SessionStart hook — Claude Code 가 새 세션을 열 때 한 번 실행되어 현재
# 디렉토리의 ontology vault 요약을 agent context 에 inject 한다.
#
# 사용자 의도 (R14 rounds): "작업 중간중간 ontology 읽어서 도움받고 끝나면
# 알아서 mcp 로 기록". 매 prompt 마다 사용자가 "ontology 활용해" 라고 알려
# 주지 않아도 agent 가 작업 첫 순간부터 vault 를 인지하게 하기 위함.
#
# Output 규약 (Claude Code hooks):
#   - exit 0 + stdout 비어있음 → silent (vault 없는 repo 에서 noise 차단)
#   - exit 0 + stdout 내용     → agent system context 에 추가 (이게 우리 path)
#   - exit ≥ 1                 → 무시되는 게 맞음 (블록 안 됨)
#
# vault 위치 결정 우선순위:
#   1. OATLAS_VAULT 환경 변수 (사용자가 명시)
#   2. <cwd>/docs/ontology  (이 repo 같은 dogfood 패턴)
#   3. <cwd>/vault          (cli init default)
#   4. <cwd> 자체에 frontmatter `kind:` 가진 .md 가 있으면 cwd
#   ↳ 어느 후보도 못 잡으면 silent.

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

# vault 결정
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
# ⚠️ **볼트가 깨졌을 때 침묵하면 안 된다** (2026-08-17 실측). 예전에는 이 줄이
# `... 2>/dev/null) || exit 0` 이었다 — 도구를 못 부른 것과 **볼트를 찾았는데
# 읽지 못한 것**이 똑같이 침묵으로 뭉개졌다. 그런데 후자는 세션이 이 사실을
# 가장 알아야 하는 순간이다: 손으로 노드를 하나 더하면(사람이 하는 정상 경로다)
# `uid:` 가 없어서 그래프가 통째로 컴파일 실패하고, 그 세션은 **온톨로지 맥락을
# 하나도 못 받은 채** 시작한다. 왜 조용한지도 모른다.
#
# 그래서 둘을 가른다: **stderr 가 있으면 볼트를 읽다 실패한 것**이므로 한 줄로
# 말한다. stderr 조차 없으면(도구 자체가 못 돈 것) 종전대로 침묵한다 — 볼트가
# 없는 저장소에 잡음을 넣지 않는다는 원래 규약은 그대로다.
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
  cat <<EOF
[ontology vault @ ${VAULT}]
Vault will not compile — no ontology context this session.
$REASON
Fix it before trusting any ontology answer: \`ontology-atlas health $VAULT\`.
EOF
  exit 0
fi

# python 으로 빠른 요약 (kind 분포 + domain 분포 + 상위 hub). python3 표준.
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

# 비어있으면 silent (vault 가 .md 없거나 kind 없는 readme 만 있는 경우 등)
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
