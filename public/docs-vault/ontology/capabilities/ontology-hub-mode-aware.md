---
slug: capabilities/ontology-hub-mode-aware
kind: capability
title: Ontology Hub — Mode-Aware (Q1=(a))
domain: mode-aware-adapters
dependencies:
  - capabilities/frontmatter-to-ontology
  - capabilities/mode-aware-adapter
elements: [src/features/vault-ontology/model/use-ontology-insight.ts, src/shared/lib/ontology-tree/reachability.test.ts, src/shared/lib/ontology-tree/reachability.ts, src/views/ontology-view/ui/OntologyViewPage.tsx]
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
