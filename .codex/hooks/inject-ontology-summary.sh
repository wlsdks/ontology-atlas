#!/usr/bin/env bash
# SessionStart hook — Codex/agent runtime 이 새 세션을 열 때 한 번 실행되어 현재
# 디렉토리의 ontology vault 요약을 agent context 에 inject 한다.
#
# 사용자 의도 (R14 rounds): "작업 중간중간 ontology 읽어서 도움받고 끝나면
# 알아서 mcp 로 기록". 매 prompt 마다 사용자가 "ontology 활용해" 라고 알려
# 주지 않아도 agent 가 작업 첫 순간부터 vault 를 인지하게 하기 위함.
#
# Output 규약 (agent hooks):
#   - exit 0 + stdout 비어있음 → silent (vault 없는 repo 에서 noise 차단)
#   - exit 0 + stdout 내용     → agent system context 에 추가 (이게 우리 path)
#   - exit ≥ 1                 → 무시되는 게 맞음 (블록 안 됨)
#
# vault 위치 결정 우선순위:
#   1. OMOT_VAULT 환경 변수 (사용자가 명시)
#   2. <cwd>/docs/ontology  (이 repo 같은 dogfood 패턴)
#   3. <cwd>/vault          (cli init default)
#   4. <cwd> 자체에 frontmatter `kind:` 가진 .md 가 있으면 cwd
#   ↳ 어느 후보도 못 잡으면 silent.

set -e

CLI_BIN=""
if command -v oh-my-ontology >/dev/null 2>&1; then
  CLI_BIN="oh-my-ontology"
elif [ -f "$(pwd)/cli/src/index.mjs" ]; then
  CLI_BIN="node $(pwd)/cli/src/index.mjs"
fi

if [ -z "$CLI_BIN" ]; then
  exit 0
fi

# vault 결정
VAULT=""
if [ -n "$OMOT_VAULT" ] && [ -d "$OMOT_VAULT" ]; then
  VAULT="$OMOT_VAULT"
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

# census + 도메인 분포 + 상위 hub. cli overview --json 으로 한 번에. 실패 시 silent.
# (이전엔 list 의 알파벳 첫 8개 — 노이즈였다. overview 는 가장 연결 많은 hub 를
#  줘서 agent 가 첫 순간부터 "이 코드베이스의 load-bearing 개념" 을 인지한다.)
JSON=$($CLI_BIN overview "$VAULT" --json 2>/dev/null) || exit 0

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
kinds = ' · '.join(f'{k} {v}' for k, v in sorted(by_kind.items(), key=lambda x: -x[1]))
by_domain = d.get('byDomain') or {}
domains = ' · '.join(f'{k} {v}' for k, v in sorted(by_domain.items(), key=lambda x: -x[1])[:6])
hubs = d.get('hubs') or []
def short(t, n=48):
    t = t or ''
    return (t[:n-1] + '…') if len(t) > n else t
hub_lines = '\n'.join(
    f"  [{(h.get('kind') or '?'):11s}] {(h.get('slug') or '?'):42s} · deg {h.get('degree') or 0}  {short(h.get('title'))}"
    for h in hubs[:6]
)
print(f'Vault has {total} ontology nodes ({kinds}).')
if domains:
    print(f'Domains: {domains}')
if hub_lines:
    print()
    print('Most connected (hubs — load-bearing concepts, start here):')
    print(hub_lines)
# health drift — vault 가 곧 진실원이라 dangling 참조/컴파일 이슈가 쌓이면
# 그래프 질의가 조용히 틀어진다. 깨끗하면 한 줄도 안 내보내고(노이즈 0),
# 문제가 있을 때만 agent 가 작업 첫 순간부터 인지하도록 알린다.
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
    print()
    print('⚠ Needs attention: ' + ', '.join(drift) + ' — run `oh-my-ontology health` (or validate_vault) and fix before relying on the graph.')
print()
print('Full graph: list_concepts / list_kinds / query_ontology(operation:\"overview\").')
PY
)" 2>/dev/null)

# 비어있으면 silent (vault 가 .md 없거나 kind 없는 readme 만 있는 경우 등)
if [ -z "$SUMMARY" ]; then
  exit 0
fi

cat <<EOF
[ontology vault @ ${VAULT}]
$SUMMARY

When the task touches code that introduces or renames a capability /
element / domain, mirror it in the vault before reporting done. The MCP
server's tool list is the primary path; \`/ontology-sync\` is the
explicit-trigger alternative. For the full discipline, see AGENTS.md
"Working with the ontology while you code".
EOF

exit 0
