---
slug: capabilities/agent-graph-readiness
kind: capability
title: Agent Graph Readiness
domain: views
dependencies:
  - capabilities/ontology-hub-mode-aware
elements:
  - src/shared/lib/ontology-tree/agent-query-recipes.ts
  - src/shared/lib/ontology-tree/agent-readiness.ts
  - src/views/ontology-insights/ui/OntologyInsightsPage.tsx
relates:
  - capabilities/mcp-server
  - capabilities/ontology-hub-mode-aware
  - domains/ai-agent-partner
  - domains/views
---

# Agent Graph Readiness

`/ontology/insights` 에서 현재 vault 가 AI agent 가 탐색하기 좋은 그래프인지
즉시 판단하는 readiness surface. MCP 서버를 브라우저에서 직접 호출하지 않고,
이미 derive 된 frontmatter graph 로 개념 수, 관계 수, 미연결 노드, unresolved
stub, hub 수, 평균 degree 를 계산한다.

readiness 는 점수만 보여주지 않고 상태별 다음 작업도 함께 계산한다. unknown/stub
노드가 있으면 `get_concept` / `find_evidence` 후 `patch_concept` 또는
`merge_concepts` 로 정리하라고 안내하고, 미연결 노드나 희소한 relation 이 있으면
`contains` / `domain` / `capabilities` / `elements` 및 `depends_on` / `relates`
/ `describes` edge 를 추가하라고 안내한다. 이미 ready 인 vault 에서는 추천 hub
slug 에 대해 `workspace_brief` / `node_profile` / `blast_radius` 를 먼저 돌리고,
코드 변경 후 `docs/ontology` sync 를 유지하라고 안내한다.

각 next action 은 별도의 repair prompt 로 복사할 수 있다. prompt 는 현재 readiness
status / score / graph facts 를 요약하고, `workspace_brief`, `health`,
`get_concept`, `find_evidence`, `find_backlinks`, `node_profile` 같은 read-first
MCP 호출을 우선시한 뒤 확인된 변경만 `add_concept` / `add_relation` /
`patch_concept` / `merge_concepts` 로 쓰라고 지시한다. 특히 prompt 안에는
`query_ontology`, `find_orphans`, `infer_imports`, `validate_vault` 의 실제 JSON
payload 를 함께 넣어 Claude Code / Codex 가 MCP schema 를 다시 추측하지 않아도
되게 한다.

목표는 Claude Code / Codex 같은 agent 가 같은 vault 를 MCP 로 읽기 전에 사람도
구조 품질을 같은 언어로 볼 수 있게 하는 것. `workspace_brief` / `health` 가 CLI
와 MCP 의 첫 접점이라면, 이 패널은 웹 UI 의 첫 구조 품질 신호다.

후속 UI 로 agent query recipes 를 함께 노출한다. `query_ontology.workspace_brief`,
`query_ontology.query_plan`, `query_ontology.health`,
`query_ontology.node_profile`, `query_ontology.path`,
`query_ontology.relation_check`, `query_ontology.blast_radius`,
`query_ontology.domain_matrix` 를 우선 진입점으로
고정해 MCP 의 넓은 tool surface 를 처음 쓰는 Claude Code / Codex 세션도 바로
graph-level 질문으로 들어가게 한다.

recipes 는 `<slug>` placeholder 에서 멈추지 않도록 현재 graph 의 high-degree
domain / capability / element 를 추천 시작 slug 로 함께 계산한다. handoff prompt
와 `query_plan` / `blast_radius` JSON payload 는 첫 추천 slug 를 반영하고, UI 는
각 추천 slug 를 별도로 복사할 수 있게 한다. `node_profile` 은 첫 추천 허브의
incoming/outgoing edge 와 containment / lineage 를 깊게 보고, `path` 는 첫 두
추천 허브 사이의 연결 증거를 바로 확인한다. `relation_check` 는 같은 두 허브와
`depends_on` 후보 type 으로 `add_relation` 전 schema preflight 를 복사 가능하게
해, agent 가 쓰기 전 edge 중복 / 반대 방향 `inverseEdges` / schema pattern /
`recommendation` / `proposedAction` 을 먼저 보게 한다. 목표는 agent 가 graph DB 처럼 raw query 를 떠올리는 대신, 이 codebase 의
실제 ontology 허브에서 impact / path / relation preflight / node-profile 질의를
시작하게 만드는 것.

R+ follow-up 에서 ready recipe 는 graph traversal 을 더 직접 노출한다.
`all_paths` 는 첫 두 추천 허브 사이의 bounded simple paths 를 열거하고,
`query_plan(all_paths)` 와 실제 `all_paths` payload 는 `searchBudget: 1000` 을
명시해 agent 가 복사 실행해도 path enumeration 비용 상한을 유지한다.
`pattern_walk` 는 `<project-slug>` 에서 `domains` → `capabilities` 같은 명시적
relation sequence 를 걷는다. 이 payload 들을 copyable recipe 로 올려, agent 가
최단 경로 하나만 보고 결론내리지 않고 schema / hierarchy / multiple-path 증거와
partial traversal 여부를 같이 확인하게 한다.

`all_paths` 결과 계약도 UI 와 handoff prompt 에 직접 노출한다. agent 는
`limit`, `searchBudget`, `expandedStates`, `exhaustive`,
`truncatedByBudget`, `totalPathsExact` 뿐 아니라 `evidence.status`,
`evidence.reason`, `evidence.pathsComplete` 를 함께 보고해야 한다.
`evidence.status=partial` 이거나 `evidence.pathsComplete=false` 면 UI 는
`suggestedQuery` / `saferQuery` 를 따르라고 안내하고, 단일 path 를 write 근거로
쓰지 않게 한다. 같은 계약은 traversal guard chip 과 Playwright UI 회귀 테스트에도
반영되어 Claude Code / Codex 가 복사한 recipe 와 화면의 안전 신호가 같은 언어를
쓴다.

각 recipe card 는 MCP JSON payload 뿐 아니라 developer CLI 명령도 함께 보여준다.
`node_profile` 은 `oh-my-ontology node`, `path` 는 `oh-my-ontology path`,
`relation_check` 는 `oh-my-ontology relation-check`, `all_paths` 는
`oh-my-ontology all-paths ... --plan` 으로 변환되어 복사 가능하다. 그래서
브라우저에서 graph 질문을 고른 사람이 같은 질의를 터미널 / Codex shell 에서 즉시
재실행할 수 있고, 특히 `all_paths` 는 UI 에서도 plan-first performance guard 가
기본 명령으로 드러난다. MCP-only handoff 와 CLI dogfood 가 같은 추천 slug 와
같은 traversal bounds 를 공유하는 것이 목표다.

handoff prompt 도 같은 CLI fallback 을 포함한다. MCP connector 가 붙어 있으면
JSON payload 순서대로 `query_ontology` 를 실행하고, connector 가 없거나 shell
중심 Codex / Claude Code 세션이면 prompt 안의 `oh-my-ontology agent-brief`,
`workspace-brief`, `node`, `path`, `relation-check`,
`all-paths ... --plan` 명령을 같은 추천 slug / bounds 로 실행할 수 있다. 이로써
웹 UI 에서 복사한 handoff 하나가 MCP-first 와 CLI-fallback 세션 모두에서 같은
graph evidence contract 를 유지한다.

recipes panel 상단에는 `Run order` 레일을 둔다. `agent_brief` →
`workspace_brief` → `query_plan` → `health` → `node_profile` 같은 첫 실행 순서를
별도 카드로 고정하고 각 step 의 JSON 을 바로 복사하게 해, Claude Code/Codex 가
MCP-only 세션으로 붙었을 때 전체 recipe grid 를 훑기 전에 안전한 first-contact
순서를 먼저 실행할 수 있다. ready 상태가 아니면 `health` 는 primary 로 올라오므로
같은 레일이 repair-first 흐름도 자연스럽게 보여준다.
각 run-order step 은 지원되는 경우 같은 카드 안에서 CLI fallback 명령도 보여주고
`Copy CLI` 를 제공한다. 그래서 첫 접점 레일 하나만 보고도 MCP JSON 과 터미널
명령 중 현재 agent 세션에 맞는 실행 방식을 선택할 수 있다.
`query_plan(blast_radius)` step 은 `oh-my-ontology blast-radius ... --plan` 으로
변환되므로, MCP connector 가 없는 agent 도 refactor impact traversal 전에 같은
cost preflight 를 실행한다. `blast-radius --plan` 역시 warning / expensive plan 을
`--force` 전까지 막아 UI 의 plan-first 성능 가드와 CLI 동작이 맞물린다.
R+ follow-up 에서는 이 first-contact rail 전체를 하나의 `Copy run order` 로도
복사한다. 복사된 prompt 는 `agent_brief` / `workspace_brief` / `query_plan` /
`health` / `node_profile` 순서의 MCP payload 와 CLI fallback 명령을 함께 담고,
`all_paths` completeness contract 도 포함해 새 Claude Code/Codex 세션이 개별
step 을 하나씩 고르지 않아도 같은 graph evidence protocol 로 시작하게 한다.

추가로 traversal strategy 전체도 `Copy traversal packet` 으로 한 번에 복사한다.
이 packet 은 `query_plan(all_paths)` → bounded `all_paths` →
`pattern_walk` / `project_map` 순서의 MCP payload 를 묶고, 가능한 CLI fallback
명령도 함께 넣는다. 그래서 사용자가 graph DB 식 질문을 웹에서 고른 뒤 agent 에게
넘길 때 개별 strategy 버튼을 세 번 누르지 않아도 plan-first / bounded evidence /
containment cross-check 순서를 그대로 유지할 수 있다.

Run order 앞에는 별도 `Traversal strategy` 레일도 둔다. 이는 MCP
`agent_brief.traversalStrategy` 와 같은 `plan_before_enumeration` →
`bounded_path_evidence` → `containment_cross_check` 순서를 화면에 그대로 노출한다.
각 step 은 복사 가능한 MCP payload 와 `evidence[]` / `stopWhen[]` 를 같이 보여주므로,
agent 가 path 를 근거로 쓰기 전에 `query_plan(all_paths)` 로 비용을 보고,
bounded `all_paths` 의 `evidence.pathsComplete` 를 확인한 뒤, ownership 이나
domain boundary 가 걸리면 `pattern_walk` / `project_map` 으로 containment 를
교차 확인하게 만든다.

추가로 investigation playbook 을 제공한다. `Refactor impact` 는
`workspace_brief` → `query_plan(blast_radius)` → `node_profile` →
`blast_radius` → `path` → `relation_check` 순서로 변경 전 영향권과 relation
preflight 를 확인하고, `Onboarding map` 은 `workspace_brief` / `domain_matrix` /
`node_profile` 로 첫 mental map 을 만든다. `Coupling audit` 은 `health` /
`domain_matrix` / `query_plan(centrality)` / `centrality` / `match_edges` 를 묶어
경계 변경 전에 ranking 비용과 결합, dependency edge 를 확인한다. `Graph traversal` 은 `schema` →
`query_plan(all_paths)` → `all_paths` → `pattern_walk` → `project_map` 을 묶어,
그래프 DB 식 탐색 근거가 필요한 답변에서 schema pattern, bounded paths,
containment walk, project/domain map 을 한 번에 확인한다. 각 playbook 은
`evidence[]` 와 `stopWhen[]` 체크리스트도 함께 가져, agent 가 어떤 slug/edge
근거를 보고해야 하는지와 어떤 상황에서 쓰기를 멈추고 설명해야 하는지를 같은
handoff 에서 받는다. 이 playbook 은 단일 graph query 보다 상위의 작업 의도를
복사 가능한 MCP 호출 순서로 고정한다.

쓰기 작업에는 별도의 `Write safety gates` 레일을 둔다. `Before add_relation` 은
`relation_check` 와 `path` 를 먼저 실행해 중복 edge, 반대 방향 edge, 이미 설명된
관계인지 확인한다. 반대 방향 edge 는 MCP/CLI `relation_check.inverseEdges` 로
직접 노출되고, `recommendation.decision` 은 `review_inverse` 나
`review_new_schema` 처럼 쓰기 전 검토가 필요한 상태를 명시한다. UI 는 이 decision
값을 별도 compact legend 로 보여준다. `skip_existing` 은 중복 추가 금지,
`review_inverse` 는 방향 재검토, `safe_to_add` 는 path 근거 확인 후 추가,
`review_new_schema` 는 새 relation schema 설명 후 진행으로 고정해 사람이
Claude Code/Codex 의 write 판단을 같은 언어로 검토할 수 있다.

`Before rename or merge` 는 `find_backlinks` 와 `node_profile` 로 참조 중인 slug
의 영향권을 확인한다. `After code changes` 는 `health` 와 `validate_vault` 로
vault 를 다시 gate 한다. 이 레일은 graph DB 의 raw mutation 과 달리, agent 가
write 하기 전 read/preflight 를 작업 습관으로 복사하게 만드는 UI 안전장치다.

같은 write safety gate 는 MCP `query_ontology(agent_brief)` 의
`writeGuardrails` 와 `relationDecisionGuide` 로도 노출된다. `agent_brief` 는
UI 와 같은 `graph_traversal` playbook, `plan_before_enumeration` →
`bounded_path_evidence` → `containment_cross_check` 순서의 `traversalStrategy`,
그리고 복사 가능한 `handoffPrompt` 도 반환한다.
CLI `oh-my-ontology agent-brief --prompt` 는 이 prompt 만 출력해 JSON 파싱 없이
Claude Code/Codex 세션에 바로 붙여 넣을 수 있다. CLI `oh-my-ontology agent-brief` 와
`mcp/scripts/verify.mjs` 는 `preflight_relation` / `preflight_rename` /
`post_change_sync` guardrail shape, playbook `evidence[]` / `stopWhen[]`,
`handoffPrompt`, `graph_traversal` 의 `schema` / `all_paths` / `pattern_walk` /
`project_map` coverage, `traversalStrategy` 의 plan-first bounded traversal coverage,
그리고 `skip_existing` / `review_inverse` / `safe_to_add` /
`review_new_schema` decision coverage 를 fail-closed 로 검사하므로,
웹 UI 에서 본 쓰기 안전 절차와 Claude Code/Codex handoff payload 가 같은 계약을
공유한다.
