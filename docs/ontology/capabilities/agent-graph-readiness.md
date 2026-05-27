---
slug: capabilities/agent-graph-readiness
kind: capability
title: Agent Graph Readiness
domain: views
dependencies: [capabilities/ontology-hub-mode-aware]
elements: [elements/insights-query-cockpit, elements/ontology-graph-proof-rail, src/shared/lib/ontology-tree/agent-query-recipes.ts, src/shared/lib/ontology-tree/agent-readiness.ts, src/shared/lib/ontology-tree/insights.ts, src/views/ontology-insights/ui/OntologyInsightsPage.tsx]
relates: [capabilities/mcp-server, capabilities/ontology-hub-mode-aware, domains/ai-agent-partner, domains/views]
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

ready 상태의 `syncAfterChanges` action 은 별도 `Copy sync gate` 로도 복사된다.
이 packet 은 어떤 변경에서 실행해야 하는지 먼저 고정한다. domain / capability /
element / relation 이 새로 생기거나 이름이 바뀌거나 더 명확해졌을 때, UI / CLI /
MCP / 문서 변경이 codebase 의 의미나 agent navigation 을 바꿀 때, 또는 vault write
뒤 다음 agent 가 같은 graph health evidence 를 받아야 할 때 실행한다. 이어서
`health` / `cycles` / `growth_plan` / `maintenance_plan` / `validate_vault` MCP payload 와 같은 순서의 CLI fallback
(`health`, `cycles --max-hops 8`, `growth --limit 20`, `maintenance --limit 20`,
`validate`) 을 함께 담는다. typo / comment / style-only 변경은 skip 하라고 명시해,
Claude Code / Codex 가 non-trivial code change 뒤에만 같은 ontology sync gate 를
실행하게 한다.

R+ follow-up 에서는 같은 readiness panel 에 terminal fallback 도 함께 노출한다.
MCP connector 가 아직 등록되지 않았거나 Codex / Claude Code 세션이 shell 중심으로
열렸을 때도 `oh-my-ontology agent-brief`, `agent-brief --graph-db-pack`,
`agent-brief --verify-fallbacks --json`, `workspace-brief`, `health`, `cycles`,
`growth`, `maintenance` 로 같은 first-contact 상태를 확인한다. JSON setup gate 는
`ok` 와 `performanceOk` 를 나눠 반환하므로 agent automation 이 broken setup 과
passing-but-slow local graph fallback 을 구분한 뒤 상태별로
`match-nodes --kind unknown`, `orphans --exclude-kinds project,vault-readme`,
`infer-imports --vault`, `relation-check`, `node`, `blast-radius`, `validate` 같은
CLI 명령을 바로 복사할 수 있다. repair prompt 안에도 같은 CLI fallback 순서를
넣고, MCP payload baseline 도 `health` / `cycles` / `growth_plan` /
`maintenance_plan` 까지 포함해 MCP-first 세션과 connector-less 세션이 동일한 graph
readiness 판단에서 시작하게 한다.

목표는 Claude Code / Codex 같은 agent 가 같은 vault 를 MCP 로 읽기 전에 사람도
구조 품질을 같은 언어로 볼 수 있게 하는 것. `workspace_brief` / `health` 가 CLI
와 MCP 의 첫 접점이라면, 이 패널은 웹 UI 의 첫 구조 품질 신호다.

2026-05-28 dogfood verification 에서는 같은 vault 에 대해 `workspace-brief` 와
`health` 가 모두 `healthy` 를 반환했고, 54 nodes / 372 edges / 0 unresolved edges /
0 issues / 1 connected component 로 집계됐다. connector-less setup gate 도
`agent-brief --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`
에서 25/25 fallback commands pass, `ok=true`, `performanceOk=true`, `slow=0` 로
통과했다. `scripts/perf-graph.mjs --json --check --n=1000` 은 1000 generated nodes / 3867 generated edges 에서
budget failure 0, `graph_db_pack` 약 37ms, `agent_brief` 약 21ms, compile full 약
18ms 로 통과했다. 이 수치는 "모든 graph DB workload 보다 빠르다"는 의미가 아니라,
local codebase memory graph 를 agent 가 읽고 증거화하는 hot path 가 DB 서버 없이도
충분히 빠른지 확인하는 회귀 근거다.

같은 약속을 실제 dogfood gate 로도 닫는다. `pnpm dogfood:graph-db` 는
`docs/ontology` 에 대해 setup self-check, facets, `health --json`, planned `match-nodes`,
planned `match-edges`, `domain-matrix`, bounded `all-paths`, `relation-check`, `explain` 을 실제 CLI
명령으로 실행하고, `ok` / `performanceOk`, health `status=healthy`, issue 0,
unresolved edge 0, health check pass/count rows, scan row `totalMatches`,
scan follow-up packet, path `limit` / `searchBudget` /
`expandedStates` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` /
`evidence.status` / `reason` / `pathsComplete`, `relation_check` recommendation /
matching edge / schema pattern, relation explain shortest path 같은
result contract 가 하나라도 빠지면 실패한다. 그래서 `/ontology/insights` 의
Query cockpit 이 보여주는 graph DB-style 가치가 문서 문구가 아니라 local markdown
vault 위에서 매번 재현 가능한 런타임 검증으로 유지된다.

후속 UI 로 agent query recipes 를 함께 노출한다. `query_ontology.workspace_brief`,
`query_ontology.query_plan`, `query_ontology.health`,
`query_ontology.components`, `query_ontology.cycles`,
`query_ontology.topological_order`, `query_ontology.growth_plan`,
`query_ontology.maintenance_plan`,
`query_ontology.node_profile`, `query_ontology.path`,
`query_ontology.similar_nodes`, `query_ontology.relation_check`, `query_ontology.blast_radius`,
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
`similar_nodes` 는 같은 추천 허브의 title / slug / kind 로 duplicate 후보와
shared-neighbor signal 을 확인해, 새 concept 를 만들거나 rename 하기 전에
`add_concept` 대신 `patch_concept` 또는 `relates` edge 가 더 안전한지 판단하게 한다.
`components` 는 연결되지 않은 graph island 를 확인해 onboarding map 이나 traversal
결론을 믿기 전에 graph spine 이 끊겼는지 보게 한다. CLI fallback 은 전용
`oh-my-ontology components [vault] --limit 20` 명령을 사용해 `health --json`
파싱 없이 같은 scan 을 재현한다.
`topological_order` 는 `depends_on` 관계를 prerequisite-first layer 로 정렬해,
agent 가 refactor 순서나 onboarding 설명을 cycle-free dependency order 로 잡을 수
있게 한다. CLI fallback 은 전용 `oh-my-ontology topological-order [vault] --limit 100`
명령을 사용해 connector-less 세션도 즉시 재현한다.

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

각 recipe card 는 MCP 호출 payload 뿐 아니라 developer CLI 명령도 함께 보여준다.
`node_profile` 은 `oh-my-ontology node`, `path` 는 `oh-my-ontology path`,
`explain_relation` 은 `oh-my-ontology explain`, `similar_nodes` 는
`oh-my-ontology similar`, `relation_check` 는 `oh-my-ontology relation-check`, `all_paths` 는
`oh-my-ontology all-paths ... --plan` 으로 변환되어 복사 가능하다. 그래서
브라우저에서 graph 질문을 고른 사람이 같은 질의를 터미널 / Codex shell 에서 즉시
재실행할 수 있고, 특히 `all_paths` 는 UI 에서도 plan-first performance guard 가
기본 명령으로 드러난다. MCP-only handoff 와 CLI dogfood 가 같은 추천 slug 와
같은 traversal bounds 를 공유하는 것이 목표다.

handoff prompt 도 같은 CLI fallback 을 포함한다. MCP connector 가 붙어 있으면
JSON payload 순서대로 `query_ontology` 를 실행하고, connector 가 없거나 shell
중심 Codex / Claude Code 세션이면 prompt 안의 `oh-my-ontology agent-brief`,
`workspace-brief`, `node`, `path`, `relation-check`,
`explain`, `all-paths ... --plan` 명령을 같은 추천 slug / bounds 로 실행할 수 있다. 이로써
웹 UI 에서 복사한 handoff 하나가 MCP-first 와 CLI-fallback 세션 모두에서 같은
graph evidence contract 를 유지한다.

recipes panel 상단에는 `Run order` 레일을 둔다. `agent_brief` →
`workspace_brief` → `query_plan` → `health` → `node_profile` 같은 첫 실행 순서를
별도 카드로 고정하고 각 step 의 JSON 을 바로 복사하게 해, Claude Code/Codex 가
MCP-only 세션으로 붙었을 때 전체 recipe grid 를 훑기 전에 안전한 first-contact
순서를 먼저 실행할 수 있다. ready 상태가 아니면 `health` 는 primary 로 올라오므로
같은 레일이 repair-first 흐름도 자연스럽게 보여준다.
각 run-order step 은 지원되는 경우 같은 카드 안에서 CLI fallback 명령도 보여주고
`Copy CLI` 를 제공한다. 그래서 첫 접점 레일 하나만 보고도 MCP 호출과 터미널
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
명령도 함께 넣는다. packet 본문에는 각 strategy 의 priority, evidence to report,
stop-and-narrow 조건도 같이 들어가므로 복사된 텍스트만 받은 agent 도 path 결과를
무조건 증명처럼 쓰지 않고 plan / evidence / containment gate 를 먼저 통과한다.
그래서 사용자가 graph DB 식 질문을 웹에서 고른 뒤 agent 에게
넘길 때 개별 strategy 버튼을 세 번 누르지 않아도 plan-first / bounded evidence /
containment cross-check 순서를 그대로 유지할 수 있다.
화면은 packet 을 복사하기 전에 포함된 MCP 호출 수와 CLI fallback 수를 바로 보여줘,
비개발자도 이 버튼이 agent 에게 넘기는 실행 범위를 먼저 확인할 수 있다.

Agent query recipes 상단에는 별도 `Graph DB query pack` 도 둔다. 이 pack 은
비개발자가 "노드 스캔", "엣지 스캔", "도메인 결합", "경로 근거" 같은 graph DB
질문을 Cypher 에 가까운 `MATCH ...` 의도문으로 먼저 이해하고, 같은 카드에서
`query_plan(match_nodes)` / `match_nodes`, `query_plan(match_edges)` / `match_edges`,
`domain_matrix` / `centrality`, `query_plan(all_paths)` / bounded `all_paths` /
`explain_relation` MCP 호출을 복사할 수 있게 한다. 전체 pack 복사 텍스트에는
CLI fallback 도 함께 들어가므로 MCP connector 가 없는 Codex / Claude Code 세션도
`match-nodes --plan`, `match-edges --plan`, `domain-matrix`, `all-paths --plan`
순서로 같은 local markdown graph 를 terminal 에서 스캔한다. 각 query 는 scan row 를
근거로 쓰기 전에 `totalMatches`, `limited`, `followUp`, `evidence.pathsComplete` 를
보고하라는 계약을 포함하므로 graph DB 스타일의 탐색을 하되 raw row 를 증명으로
오인하지 않게 한다. 같은 pack 은 `Agent handoff prompt` 복사 본문에도 포함되어,
사용자가 pack 버튼을 따로 누르지 않아도 fresh Claude Code / Codex 세션이 첫 handoff 에서
graph DB-style scan 계약과 fallback 명령을 함께 받는다.
Graph DB query pack 카드 자체도 `CLI-only`, `MCP-connected`, `Graph DB pack`,
`Setup gate` 모드 가이드를 함께 보여준다. 따라서 사용자는 복사 버튼을 누르기 전에
터미널만으로 가능한 범위, MCP 연결 시 추가되는 구조화된 read/write 도구, DB 서버 없이
실행하는 bounded scan pack, 그리고 `ok` / `performanceOk` 를 따로 보는 설정 gate 의
차이를 같은 화면에서 확인할 수 있다. `Copy CLI pack` 텍스트에도 같은 mode guide 를
넣어, 복사된 runbook 만 다른 Claude Code/Codex 세션에 전달되어도 모드 선택 기준이
사라지지 않는다.

Insights 상단에는 같은 pack 을 요약한 `Query cockpit` 을 둔다. 첫 viewport 에서
readiness score, pack scan 수, MCP call 수, CLI fallback 수, 대표 `MATCH ...`
intent, 시작 operation badge, intent 별 MCP payload / CLI fallback count,
scan/path result contract, self-check gate 를 먼저 보여주고 `Copy CLI pack` /
`Copy graph DB pack` 을 바로 노출한다. 깊은 recipe 패널까지 내려가지 않아도 이 local
markdown graph 가 별도 DB 서버 없이 작은 graph database 처럼 scan 가능하다는 제품
가치를 바로 확인하게 한다. Cockpit 안의 result contract 는
`match_nodes` / `match_edges` 결과를 근거로 쓰기 전 `totalMatches`, `limited`,
row count, `followUp` 을 보고하고, `all_paths` 는 `limit`, `searchBudget`,
`expandedStates`, `exhaustive`, `totalPathsExact`, `evidence.pathsComplete` 를
확인하라고 고정해 raw row 나 partial path 를 proof 로 오인하지 않게 한다.
R+ follow-up 에서는 cockpit 안에도 `self-check gate` → graph facets → node scan →
edge scan → domain coupling → path evidence 순서의 run-order rail 을 추가했다.
그래서 사용자는 pack 카드나 긴 handoff prompt 로 내려가기 전에 이 화면이 단순 통계
요약이 아니라 실행 가능한 graph query queue 라는 점을 먼저 본다. self-check row 는
`agent-brief --verify-fallbacks --json` 이 automation 에게 노출하는 `ok`,
`performanceOk`, `failed`, `commands[].timedOut` 같은 proof field 도 함께 보여준다.
2026-05-27 dogfood runtime 에서는 같은 vault 에 대해 이 JSON gate 가 fallback
25/25 pass, `ok=true`, `performanceOk=true`, `slow=0`, `wallMs=1628` 로 통과했고,
같은 세션에서 `match-nodes --kind capability --min-degree 2 --sort degree --limit 8`
와 `domain-matrix --limit 6 --types depends_on,relates,describes` 도 51 nodes /
363 edges / 0 unresolved edges graph hash 기준으로 실행됐다.

`scripts/perf-graph.mjs` 는 같은 10-call pack 을 `graph_db_pack` hot path 로 재생해
UI / handoff 에서 복사되는 실제 Graph DB-style sequence 가 scale budget 밖으로 밀리지
않는지도 확인한다.

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
`blast_radius` → `path` → `explain_relation` → `relation_check` 순서로 변경 전 영향권과 relation
preflight 를 확인하고, `Onboarding map` 은 `workspace_brief` / `domain_matrix` /
`query_plan(match_nodes)` / `match_nodes` / `node_profile` 로 첫 mental map 을
만든다. 먼저 node scan 비용과 범위를 확인한 뒤 high-degree capability 시작점을
뽑으므로, 비개발자나 MCP connector 없는 agent 도 Graph DB 식 hub 탐색을
`match-nodes --plan --kind capability --min-degree 2 --sort degree --limit 10`
CLI fallback 으로 재현할 수 있다. `Coupling audit` 은 `health` /
`domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(match_edges)` /
`match_edges` 를 묶어
경계 변경 전에 ranking 비용과 결합, dependency edge 를 확인한다. 이 playbook 을
복사하면 `hubs --plan`, `hubs`, `match-edges --plan --types depends_on --limit 20`,
`match-edges --types depends_on --limit 20`
CLI fallback 도 함께 들어가 MCP connector 가 없는 Codex / Claude Code 세션도
같은 coupling audit 증거를 터미널에서 재현할 수 있다. `Graph traversal` 은 `schema` →
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
의 영향권을 확인한다. `After code changes` 는 `health`, `cycles`, `growth_plan`,
`maintenance_plan`, `validate_vault` 로 vault 를 다시 gate 한다. 이 guardrail 의
copy prompt 는 같은 순서의 CLI fallback (`health`, `cycles --max-hops 8`,
`growth --limit 20`, `maintenance --limit 20`, `validate`) 도 포함해, MCP-connected
세션과 connector-less 터미널 세션이 같은 post-change sync 절차를 공유한다. 이
레일은 graph DB 의 raw mutation 과 달리, agent 가 write 하기 전 read/preflight 를
작업 습관으로 복사하게 만드는 UI 안전장치다.

같은 write safety gate 는 MCP `query_ontology(agent_brief)` 의
`writeGuardrails` 와 `relationDecisionGuide` 로도 노출된다. `agent_brief` 는
UI 와 같은 `graphDbQueryPack`, `graph_traversal` playbook,
`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`
순서의 `traversalStrategy`, 그리고 복사 가능한 `handoffPrompt` 도 반환한다.
그래서 웹 UI 를 거치지 않는 MCP-only Claude Code/Codex 세션도 node scan,
edge scan, domain coupling, path evidence pack 을 구조화된 JSON 으로 받는다.
웹 UI 의 copyable CLI fallback 도 MCP `agent_brief` 와 같은 `all-paths --plan --force`
형태를 사용해, `query_plan` 이 review/narrow 를 반환하는 큰 traversal 에서도 사용자가
명시적으로 선택한 pack 실행이 중간에 멈추지 않는다.
Graph DB query pack 상단에는 `Copy CLI pack` 도 별도로 제공해 MCP connector 가 없는
Codex / Claude Code 세션이나 터미널 사용자도 JSON 을 읽지 않고 같은 node scan,
edge scan, domain coupling, path evidence 명령 묶음을 바로 실행할 수 있다. 이 UI
copy pack 도 `agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`
self-check 를 맨 앞에 포함해, 웹에서 복사한 runbook 과 CLI `--graph-db-pack` runbook 이
같은 자동화 gate 로 시작한다. UI 카드 안에도 같은 self-check 명령을 별도 preflight
row 로 보여주므로, 화면의 CLI fallback 개수와 실제 복사되는 runbook 이 어긋나지 않는다.
CLI-only 사용자는 같은 경로를 `oh-my-ontology agent-brief [vault] --graph-db-pack`
으로 바로 뽑을 수 있어, 웹 UI 를 열지 못하는 terminal-first 세션도 graph DB-style
scan queue 만 복사/실행하면 된다. 이 CLI 전용 출력은 `[vault]` placeholder 대신
선택된 vault 의 절대 경로를 넣고 pack label 을 shell comment 로 렌더링한다. pack
상단에는 `agent-brief --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4` self-check
명령도 함께 넣어 Claude Code/Codex automation 이 `ok`, `failed`, `timeoutMs`,
`performanceOk`, `slowThresholdMs`, `concurrency`, `wallMs`, `slow`, `commands[].timedOut`, `commands[].slow`,
`slowest.elapsedMs` 를 먼저 파싱한 뒤 같은 shell session 에서 scan queue 를 실행할 수
있다. JSON 없이 보는 human 출력도 command row 전에 `ok=true performanceOk=true wall=... slow=0/N failed=0`
setup gate summary 를 먼저 렌더링하므로, 비개발자는 긴 timing log 를 읽기 전에
연결/성능/실패 상태를 한 줄로 판단할 수 있다. pack 상단은 scan row 를 proof 로 오해하지 않도록 `totalMatches` / `limited` /
row count 보고, node row 는 `node_profile` 또는 `blast_radius`, edge row 는
`explain` / `path` / `relation_check`, path row 는 `evidence.pathsComplete` 보고라는
proof checklist 도 함께 출력한다. 사용자가 경로를 다시 치환하거나 번호 prefix 를
지우지 않아도 그대로 shell 에 붙여 실행할 수 있다.
MCP `agent_brief` 와 CLI `agent-brief --json` 은 같은 mode chooser 를
`docs.modeComparison` 으로, 같은 proof checklist 를 `docs.graphScanProofChecklist` 로
구조화해 반환하므로, 에이전트는 handoff prompt 나 Markdown 본문을 파싱하지 않아도
CLI-only / MCP-connected / Graph DB pack / setup gate 선택 기준과 scan scope /
node proof / edge proof / path completeness gate 를 읽을 수 있다.
일반 터미널 출력의 `agent-brief` 도 같은 mode guide 를 `ENTRYPOINTS` 전에 보여주고,
`agent-brief --graph-db-pack` 은 shell 주석으로 같은 모드별 차이를 pack 상단에 넣는다.
따라서 MCP 미연결 상태에서 복사한 CLI pack 만 보더라도 사용자는 "터미널만으로 가능한
것", "MCP 연결 시 추가되는 것", "Graph DB pack 으로 대신하는 것", "설정 검증 gate"
를 먼저 이해한 뒤 scan command 를 실행할 수 있다.
또한 웹 UI 의 `Copy handoff` 프롬프트는 `preflight_relation`, `preflight_rename`,
`post_change_sync` guardrail packet 과 `skip_existing` / `review_inverse` /
`safe_to_add` / `review_new_schema` 판단 규칙을 함께 포함해, 별도 카드 복사 없이도
새 Claude Code/Codex 세션이 읽기 → 검증 → 쓰기 순서를 그대로 시작할 수 있게 한다.
CLI `oh-my-ontology agent-brief --prompt` 는 이 prompt 만 출력해 JSON 파싱 없이
Claude Code/Codex 세션에 바로 붙여 넣을 수 있다. CLI `oh-my-ontology agent-brief` 와
`mcp/scripts/verify.mjs` 는 `preflight_relation` / `preflight_rename` /
`post_change_sync` guardrail shape, playbook `evidence[]` / `stopWhen[]`,
`handoffPrompt`, `graphDbQueryPack` 의 node scan / edge scan / domain coupling /
path evidence 와 각 `query_plan` gate, `graph_traversal` 의 `schema` / `all_paths` /
`pattern_walk` / `project_map` coverage, `traversalStrategy` 의 plan-first bounded traversal coverage,
그리고 `skip_existing` / `review_inverse` / `safe_to_add` /
`review_new_schema` decision coverage 를 fail-closed 로 검사하므로,
웹 UI 에서 본 쓰기 안전 절차와 Claude Code/Codex handoff payload 가 같은 계약을
공유한다.

R+ follow-up 에서 사람용 `Domain coupling matrix` 패널도 같은 인사이트 화면에
추가했다. 이 패널은 MCP 호출 없이 브라우저가 이미 derive 한 local-first graph 에서
containment tree 를 따라 노드를 가장 가까운 domain 에 배정하고, domain 간
semantic cross-domain edge, domain 내부 semantic edge, 미배정 노드, relation
bucket, 예시 edge 를 보여준다. `contains` / `belongs_to` 는 domain 배정에는 쓰되
coupling count 에서는 제외해, 계층 구조가 아니라 실제 경계 압력
(`depends_on` / `related_to` / `describes`) 만 사람이 읽게 한다. 패널 안의
`Copy CLI matrix` / `Copy MCP check` 은 같은 semantic filter 를
`oh-my-ontology domain-matrix --types depends_on,relates,describes` 와
실행 가능한 `query_ontology(domain_matrix)` 호출로 복사하게 해, 웹에서 본 분석을 Claude Code
/ Codex / 터미널에서 그대로 재실행할 수 있다. 그래서 비개발자도
`query_ontology(domain_matrix)` 나 CLI `oh-my-ontology domain-matrix` 를 모르더라도
`/ontology/insights` 에서 어느 도메인 경계가 실제로 연결되어 있는지 바로 읽고
agent 에게 같은 조건으로 넘길 수 있다.
