---
slug: capabilities/ontology-hub-mode-aware
kind: capability
title: Ontology Hub — Mode-Aware (Q1=(a))
domain: mode-aware-adapters
dependencies: [capabilities/frontmatter-to-ontology, capabilities/mode-aware-adapter]
elements: [elements/ontology-sub-nav, elements/ontology-tree-projection-summary, ontology-workbench-summary, src/features/vault-ontology/model/use-ontology-insight.ts, src/shared/lib/ontology-tree/reachability.test.ts, src/shared/lib/ontology-tree/reachability.ts, src/views/ontology-view/ui/OntologyViewPage.tsx]
relates: [capabilities/frontmatter-to-ontology, capabilities/mode-aware-adapter, domains/views]
---

# Ontology Hub — Mode-Aware

vault 활성 시 `/` 가 자동으로 그 데이터로 전환. mission v2 ideal "Notion
처럼 폴더만 골라도 사용" 의 ontology hub 표현.

`useOntologyInsight()` 분기:
- **local** → `useVaultOntology` 결과를 `KnowledgeProjectInsight` shape 으로 변환
- **static** → 빌드타임 dogfood 매니페스트 derivation (module-load 1 회 메모이즈)

OntologyStubNode → KnowledgeGraphNode 변환:
- sentinel `lastApprovedAt = Date(0)`, `lastApprovedBy = "vault-frontmatter"`,
  `source = "manual"` (UI 가 sentinel 감지하면 timestamp / timeline 패널 hide).

OntologyViewPage / SigmaTopology / GlobalSearch 등 모든 surface 가 같은
hook 한 번으로 vault frontmatter 의 stub 노드 + 엣지를 즉시 surface.

`/ontology` 상단은 tree 의 역할을 workbench 안의 browse mode 로 좁히되,
Browse / Write / Query 요약 카드를 항상 펼쳐 두지 않는다. 상단의 `작업 개요`
버튼이 같은 요약을 centered overlay 로 열고, 새 관계 작성은 Builder,
graph DB-style 검증은 Insights 로 이어지게 한다. 각 카드 하단에는
`tree projection`, `frontmatter write`, `dogfood:graph-db` proof chip 을 붙여
필요할 때 각 mode 가 어떤 실행 계약으로 닫히는지 보이게 한다. 그래서
`/ontology` 는 문서 목록이나 트리 위젯이 아니라 browse / write / query 가
같은 markdown graph 위에서 만나는 workbench entry 로 읽히되, 기본 화면은
트리와 변경점 중심으로 조용하게 시작한다.

상단 액션 row 도 같은 흐름을 즉시 노출한다. Browse 안의 search / global search
다음에 `Insights` query CTA 를 두고, primary `Builder` CTA 로 write canvas 를
열어 tree inspection 이 문서 탐색에서 끝나지 않고 query 검증 또는 frontmatter
write 로 이어지게 한다.

Browse 카드는 항상 보이지 않고 `작업 개요` disclosure 안에서 현재 route 로
표시된다. 기본 화면의 role strip 은 카드 3~4개가 아니라 한 줄 상태 바로,
트리를 "개념 지도" 로 명명하고 개념/관계 수, evidence document 숨김 규칙,
tree projection memo 수를 압축해 보여준다. 그래서
트리가 전체 graph DB 를 대체하는 화면이 아니라 탐색 출발점임을 알리되,
첫 뷰포트는 query 증명 카드가 아니라 browse index 로 시작한다. graph proof 는
그 아래의 compact execution strip 으로 유지되어 MCP/CLI query pack count,
sample `MATCH` intent, operation chip, pack copy action 만 빠르게 보여준다.
local frontmatter compile proof 는 실제 tree 아래로 내려가므로, 사용자는 source
inventory 를 먼저 읽지 않고 concept hierarchy 에 바로 진입한다.
Tree projection 경고는 raw warning 목록만 보여주지 않고 multiple-parent /
cycle / self-parent / duplicate / other 로 요약해, hierarchy projection 에서
빠진 관계가 vault 오류인지 graph DB 탐색으로 넘길 합법적 관계인지 바로 구분하게 한다.
compact role strip 의 hierarchy notes affordance 는 32px hit target 을 유지해
mobile 에서도 projection memo 를 작은 badge 가 아니라 열 수 있는 control 로 취급한다.

노드 상세 패널 상단은 선택 대상을 단순 제목 카드가 아니라 `Ontology object` 로
프레이밍한다. kind 별 review lens, outgoing/incoming relation count, canonical
slug, Claude/Codex MCP proof 순서를 같은 header 안에 묶어 보여 주므로 사용자는
행을 선택하자마자 이 개념이 hierarchy row 인지, graph DB query target 인지,
agent handoff 대상인지 한 번에 판단한다. 모바일 bottom sheet 는 이 object header 와
direct relation preview 가 첫 viewport 에 함께 들어오도록 높이와 shrink contract 를
고정해, 기능이 많아져도 핵심 handoff 가 내부 스크롤 아래로 밀리지 않게 한다.

노드 상세 패널은 선택 노드 기준 reachability 를 즉시 요약한다. 사용자는
outgoing / incoming / both 방향과 1-3 hop depth 를 패널 안에서 바꾸며 layer 별
reachable node 수, terminal node 수, relation 분포, BFS layer 별 도달 노드
preview 를 비교하고 바로 다음 노드로 이동할 수 있다. canonical frontmatter 노드라면
MCP `query_ontology(node_profile)` / CLI `oh-my-ontology node` 로 현재 노드 맥락을
복사하거나, 현재 방향/depth 를 반영한 MCP `query_ontology(reachability)` 호출과
CLI `oh-my-ontology reachability` 명령을 바로 복사할 수 있다. `Copy agent bundle`
은 profile + reachability 의 MCP 호출과 CLI fallback 을 한 번에 묶어, 웹에서 잡은 탐색
방향을 Claude Code / Codex 세션으로 옮기기 쉽다. 웹 UI 에서도 graph DB식 탐색
방향을 빠르게 잡을 수 있다. 계산은 edge 배열을 한 번 adjacency index 로 바꾼 뒤
BFS 하므로 큰 local vault 에서도 패널 열기 비용을
노드별 전체 edge scan 으로 늘리지 않는다.
