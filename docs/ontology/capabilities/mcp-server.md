---
slug: capabilities/mcp-server
kind: capability
title: MCP Server (23 tools)
domain: ai-agent-partner
elements: [mcp/scripts/json-rpc-lines.mjs, mcp/scripts/verify.mjs, mcp/src/analyze.mjs, mcp/src/index.js, mcp/src/infer-imports.mjs, mcp/src/integration.test.mjs, mcp/src/json-rpc-lines.test.mjs, mcp/src/ontology-compiler.mjs, mcp/src/ontology-engine.mjs, mcp/src/parser.mjs, mcp/src/suggestions.mjs, mcp/src/suggestions.test.mjs, mcp/src/vault.mjs, mcp/src/verify-script.test.mjs, scripts/dogfood-mcp-walk.mjs, scripts/dogfood-mcp-walk.test.mjs]
relates: [capabilities/frontmatter-to-ontology, domains/ai-agent-partner]
---

# MCP Server (23 tools)

`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버. 23 도구 노출 (read 15 + write 8):

| 도구 | 동작 |
|---|---|
| `list_concepts` | vault 의 모든 노드 (kind 필터, limit default 100 / max 500) |
| `get_concept` | 단일 slug 의 frontmatter + body excerpt + graph neighbors + `outgoingEdges[]` |
| `get_concepts` | **R+** 배치 reader — 여러 slug 한 호출에 (max 50, 입력 순서 보존, missing/invalid slug row 는 partial result 로 격리) |
| `find_evidence` | title 부분매칭으로 vault 문서 검색 |
| `find_backlinks` | 특정 slug 를 가리키는 다른 노드들 (frontmatter array 키 + body wikilink/mdlink) |
| `find_neighbors` | 특정 slug 주변 one-hop graph subgraph 조회 (incoming/outgoing/both, relation filter, neighbor summary) |
| `find_path` | 두 slug 사이 그래프 최단 경로 (BFS, 무방향, `domains` / `domain` containment 포함, default maxHops 5, max 20) |
| `list_kinds` | kind 분포 census (`{ total, byKind: { capability: N, ... } }`) |
| `find_orphans` | 어디서도 graph frontmatter link 안 받는 고립 노드 (`domains` / `domain` containment 포함, kind 필터, project/vault-readme 루트 문서 기본 제외) |
| `query_concepts` | DSL 기반 ad-hoc 쿼리 (frontmatter 키 = / contains / exists 조합, limit default 100 / max 500) |
| `compile_ontology` | vault 전체를 deterministic graph artifact 로 compile (nodes / canonical edges / aliases / issues / graph-array canonicalization actions / stable `graphHash` / `maxMtime` / optional query indexes, pagination limit max 500) |
| `query_ontology` | compiled artifact 위 graph engine 질의 (`neighbors` / `path` / `all_paths` / `query_plan` / `centrality` / `communities` / `similar_nodes` / `explain_relation` / `reachability` / `pattern_walk` / `impact` / `blast_radius` / `subgraph` / `overview` / `schema` / `facets` / `match_nodes` / `match_edges` / `node_profile` / `domain_profile` / `domain_matrix` / `project_scope` / `project_map` / `relation_check` / `components` / `lineage` / `containment_tree` / `cycles` / `topological_order` / `recommend_relations` / `growth_plan` / `maintenance_plan` / `workspace_brief` / `health`) — graph DB 같은 답변을 full artifact 없이 반환. `maintenance_plan` action 은 stable `id` + `afterActionId` cursor + executable graph-array canonicalization + `byKind` action breakdown + `executable` 포함, `nextExecutableAction` / `nextReviewAction` 와 `executableOnly` / `phases` / `severities` / `kinds` 필터 지원. `health` / `workspace_brief` 는 raw components 를 유지하되 vault README 단독 component 는 actionable nextAction 에서 제외한다. |
| `validate_vault` | **R+** vault 전체 health 한 호출 (per-doc + byCode aggregate) — first-contact before writes 와 batch write 전후 점검에 사용, `list_concepts → K×get_concept` K-roundtrip 대체 |
| `analyze_repo_structure` | **R16** code repo (default cwd) 분석 → ontology 노드 후보 제안. **side effect 0** — vault 변경 안 함. AI agent 가 빈 vault bootstrap 시 사용 (사용자 한 줄 *"이 codebase 분석해줘"*). FSD vs generic detect. 후보 slug 는 `domains/*`, `capabilities/*`, `elements/src/...` 로 starter layout 과 일치. |
| `infer_imports` | **R17** TS/JS import graph 추출 → file/module-level edge + external (npm) imports 분리. **side effect 0**. moduleEdges 도 analyze 와 같은 folder-prefixed slug 를 사용해 add_relation endpoint mismatch 를 피함. |
| `add_concept` | 새 노드 (.md) 작성 — slug/kind/title/domain 은 blank 또는 앞뒤 공백이면 쓰기 전 reject, graph 배열은 trim + dedup + sort, body 는 생략 시에만 기본 본문 생성하고 명시한 빈 문자열은 보존, 기존 slug 면 throw, changed write 는 compact `postWriteMaintenance` 반환 |
| `add_concepts` | **R+** 배치 writer — 여러 노드 한 호출에 (max 50, 입력 순서 보존, partial result, 입력 내 중복 slug 사전 감지). row-level blank/padded/unknown-field 입력은 해당 row 만 실패한다. `/ontology-bootstrap` 흐름이 5~15 노드를 한 번에 land. changed batch 는 최종 graph 기준 compact `postWriteMaintenance` 반환. |
| `add_relation` | depends_on / relates / contains / describes edge 추가. from/to/type 은 blank 또는 앞뒤 공백이면 쓰기 전 reject, changed write 는 compact `postWriteMaintenance` 반환 |
| `add_relations` | **R+** 배치 edge writer — 여러 edge 한 호출에 (max 50, 응답 row 순서 보존, 저장 배열은 dedup + sort, idempotent, partial result). row-level unknown-field 입력도 해당 row 만 실패한다. analyze_repo_structure suggestedRelations · infer_imports moduleEdges 수신 직후 적합. changed batch 는 최종 graph 기준 compact `postWriteMaintenance` 반환. |

R+ follow-up: `add_relation` / `add_relations` 와 `rename_concept` / `merge_concepts`
backlink redirect 는 relation 배열을 canonical set 으로 저장한다. 같은 edge 집합은
항상 같은 frontmatter 순서로 직렬화되어 agent 반복 실행 시 diff noise 를 줄이고,
file-backed graph 를 graph database 처럼 더 예측 가능하게 다룰 수 있다.
relation filter / pattern / maintenance filter / analysis scan list 같은
string-array 입력은 non-string item 을 조용히 버리지 않고 MCP 경계에서
명시적으로 reject 한다. 빈 값, 앞뒤 공백, null byte 가 포함된 배열 item 도
같은 경계에서 reject 한다. slug/repo path/filter/title/relation type/query
target 같은 scalar string 입력도 빈 값, 앞뒤 공백, null byte 를 MCP 경계에서
reject 한다. `tools/list` 도 scalar string 과 string-array item 에 같은
`minLength` / pattern hint 를 노출한다.
`types` / dependency type 필터와 `maintenance_plan` filter 도 core graph engine 에서
같은 string-array contract 로 검증해 잘못된 relation / maintenance filter 를
조용히 drop 하지 않는다. match/search 계열 optional scalar filter 도 core 에서
같은 blank/padded/null-byte contract 로 검증한다.
`match_nodes.sort` 도 schema enum 과 runtime/core validation 이 같이 움직여
잘못된 정렬 키를 degree 기본값으로 조용히 흡수하지 않는다.
`recommend_relations.kind` 도 `capability` / `element` 로 좁혀 잘못된 kind 가
빈 추천 결과로 숨지 않게 한다.
read/query flag 와 destructive write safety switch 의 boolean 입력도 명시적으로
검증해 문자열 `"true"` 같은 값을 조용히 false처럼 처리하지 않는다. core graph
engine 직접 호출도 boolean query flag 를 같은 방식으로 fail-closed 처리한다.
`query_ontology` 의 rows/group limit 은 500 초과, traversal depth/maxHops 는
20 초과 입력을 graph engine 의 silent clamp 전에 MCP 경계에서 reject 한다.
Batch 도구의 `slugs` / `concepts` / `relations` 배열도 `tools/list`
`inputSchema` 에 `maxItems: 50` 을 노출해 런타임 cap 과 client-side
validation 힌트가 드리프트하지 않게 한다.
`query_plan` 의 `targetOperation` 도 전체 read-only graph operation enum 을 노출해
agent 가 실패 호출로 subset 을 학습하지 않고, `project_map` / `pattern_walk` /
`relation_check` 같은 실제 operation 도 실행 전 계획할 수 있게 한다. 이 enum 은
graph engine 의 runtime allow-list 에서 직접 가져와 schema 와 실행 계약이 따로
드리프트하지 않게 한다. `npm run verify` 는 `overview` 에 더해 `project_map`
query_plan 도 실행하고, 실제 `neighbors` / node→project `path` / `project_scope` graph smoke
까지 호출해 설치된 MCP package 가 widened target enum 과 core traversal 계약을
runtime 에서 받아들이는지 dogfood한다. `project_scope` 는 `kind: project` 노드가
있을 때 hard gate 이고, project-less vault 는 containment-specific check 만 skip 한다.
완전히 빈 vault 는 node-targeted graph smoke 를 skip 하되 boot / inventory /
validation / diagnosis / compile / overview / query planning 은 계속 hard gate 로 검증한다.
| `patch_concept` | 기존 노드 frontmatter (key 단위 patch) + body 갱신 — graph 배열 patch 는 clean string array 만 허용하고 dedup + sort, 핵심 scalar(`kind`/`domain`/frontmatter `slug`/`body`) 도 strict 검증, changed write 는 compact `postWriteMaintenance` 반환 |
| `delete_concept` | **⚠ DESTRUCTIVE** — 노드 영구 삭제. 안전 가드 2단: ① `confirm:true` 미지정 시 dry-run, ② backlinks 있으면 throw — `force:true` 만 강행. 응답에 frontmatter+body 캡처. confirmed delete 는 compact `postWriteMaintenance` 반환. |
| `rename_concept` | **⚠ MULTI-FILE (R11)** — slug 변경 + 모든 backlink 의 array/body 자동 redirect. dry-run default. tail-only 참조도 새 tail 로 일관 갱신. `find_backlinks` + N 회 `patch_concept` 의 atomic 대체. confirmed rename 은 compact `postWriteMaintenance` 반환. |
| `merge_concepts` | **⚠ DESTRUCTIVE MULTI-FILE (R11)** — `fromSlug` 의 backlink 를 `intoSlug` 로 redirect 후 fromSlug.md 삭제. `intoSlug` 의 frontmatter/body 는 자동 합치지 않음 (필요 시 후속 `patch_concept`). dry-run default. confirmed merge 는 compact `postWriteMaintenance` 반환. |

환경변수 `OMOT_VAULT` 로 vault 위치 지정. 등록 가이드: `mcp/README.md`. 1줄 verify:
`npm run verify` (mcp/) — parser smoke, server boot, 23-tool inventory
(`15 read + 8 write` split 포함), strict argument schema 와 graph-query enum schema,
strict schema/runtime unknown-argument and invalid-enum rejection,
`list_concepts`,
`get_concepts`, `list_kinds`, `validate_vault`, `workspace_brief`, `health`, `compile_ontology({ summary: true })`,
`query_ontology(overview)`, `query_plan(targetOperation:"overview")`,
`query_plan(targetOperation:"project_map")`, 그리고 실제 `neighbors` /
node→project `path` / `project_scope` 를 한 번에 호출해 agent first-contact graph diagnosis,
compiler summary, graph-query smoke 경로까지 확인한다. `project_scope` 는 project
노드가 있을 때만 containment hard gate 로 실행하고, 빈 vault 는 node-targeted graph
smoke 를 skip 해 첫 설치 확인이 seed 작성 전에 막히지 않게 한다. vault warning / validate problem / `fail` health check /
fail severity `workspace_brief.nextActions` 는 exit 1 로 처리하되, starter vault 의
권고 수준 `needs_attention` 은 출력만 하고 설치 검증은 통과시킨다.
`workspace_brief.nextActions`, `workspace_brief.health.checks`, `health.checks`
같은 first-contact diagnosis payload 의 핵심 배열이 빠지거나 malformed 이면
clean vault 로 오인하지 않고 verify 를 실패시킨다. 각 nextAction row 는
비어있지 않은 `id` 또는 `kind` 와 `severity`, 각 health check row 는 비어있지 않은 `id` / `status` 를 가져야 해서
malformed row 가 `unknown` advisory/coverage 로 숨지 않는다.
성공 출력도 `workspace_brief` 라인에 validated health check count 를, `health`
라인에 check `id:status` coverage 를 드러내 agent 가 nextActions 와 실제 검증 축을
한 화면에서 확인하게 한다.
`get_concepts` 는 `list_concepts` 에서 얻은 실제 slug 최대 2개와 missing slug 를 섞어
설치 검증에서도 batch reader 의 성공 row 와 partial row 계약을 확인한다.
verify 는 `validate_vault.scanned` / `summary.problemFiles` 로 file-level health 를 별도 확인하고,
node-count consistency 는 `list_kinds.total`, `list_concepts.total`,
`compile_ontology.nodeCount`, `overview.graph.nodes` 끼리 비교한다.
`list_kinds.byKind` / `compile_ontology.byKind` / `overview.byKind` 가 같은 census 를
말하는지도 확인해 compiler path, overview path, vault listing path 가 서로 다른
snapshot 을 보고 있는 회귀를 잡는다.
`list_concepts` 응답은 `total`, `vaultRoot`, `nodes[]` 와 각 node 의
`slug`/`kind`/`title`/`mtime` 기본 shape 를 검증하고, dogfood walk 는
`list_kinds.byKind` 합계가 `total` 과 맞는지도 확인해 첫 접속 census 가 깨진
상태를 조기에 잡는다.
dogfood walk 는 `find_evidence.matches`, `find_path.hops/hopCount`,
`find_backlinks.matches`, `find_orphans.orphans` 의 기본 row shape 도 검증해
agent 가 받는 탐색 결과가 실제로 사용할 수 있는 구조인지 확인한다.
또한 `get_concepts` 를 실제 project / mcp-server slug 와 missing slug 를 섞어
호출해 batch reader 의 성공 row 와 partial row 가 동시에 유지되는지 확인한다.
또한 `workspace_brief.summary` / `nextActions` /
`workspace_brief.health.checks` 와 `health.summary` / `checks` 의 numeric
contract 를 검증해 first-contact 진단 결과가 status 문자열만 맞고 실제 분석
필드가 비어 있는 회귀를 막는다.
dogfood walk 는 `compile_ontology({ summary: true })` 도 직접 호출해
`graphHash`, `maxMtime`, node/edge/alias/issue count, `byKind` / `byDomain`
aggregate 가 유효한지 확인한다. `byKind` 합계가 `nodeCount` 와 다르거나
edge breakdown 이 `edgeCount` 를 설명하지 못하면 gate 실패로 본다.
또한 `query_ontology(pattern_walk)` 를 실제 repo ontology 의 project → domains →
capabilities 경로로, `query_ontology(all_paths)` 와
`query_plan(targetOperation:"all_paths")` 를 mcp-server → vault-local-first
경로로 호출해 agent 가 단계형 graph traversal, 다중 path enumeration, 실행 전
plan contract 를 받을 수 있는지 확인한다. `project_map` query_plan 과 실제
`project_map` 실행, 그리고 `neighbors` / `path` / `project_scope` /
`domain_profile` / `domain_matrix` / `components` /
`reachability` / `impact` / `blast_radius` / `subgraph` / `schema` / `facets` /
`match_nodes` / `match_edges` / `node_profile` / `centrality` / `communities` /
`similar_nodes` / `explain_relation` / `lineage` / `containment_tree` / `cycles` / `topological_order` /
`relation_check` / `recommend_relations` / `growth_plan` / `maintenance_plan` 와
strict unknown-argument and invalid-enum rejection smoke 도 추가로 dogfood 해, installed
verify 에서 넓힌 aggregate target smoke 가 이 repo 의 반복 MCP walk 에서 실제
project/domain map 과 특정 domain drill-down 출력까지 이어지는지 본다.
이후 `validate_vault.scanned` / `summary.problemFiles` 로 file-level health 를 확인한 뒤,
node-count consistency 는 `list_kinds.total`, `list_concepts.total`,
`compile_ontology.nodeCount`, `overview.graph.nodes` 끼리 비교하고
`list_kinds.byKind` / `compile_ontology.byKind` / `overview.byKind` 가 같은 census 를
말하는지도 확인한다.
`validate_vault` 응답은 `scanned`, `summary.problemFiles`,
`summary.errorFiles`, `summary.warningFiles` count 와 `summary.byCode`
aggregate shape 까지 검증해, malformed validation payload 가 clean vault 로
오인되지 않게 한다.
validation 실패 메시지는 `summary.byCode` 의 상위 issue code 요약도 포함해
agent 가 실패 직후 어떤 frontmatter 문제부터 볼지 바로 판단할 수 있게 한다.
`problemFiles` 가 1 이상이면 `byCode` 도 비어 있으면 안 된다는 일관성까지
검증한다.
non-blocking `workspace_brief.nextActions` 는 짧은 advisory 목록으로 출력해
MCP wiring 확인 직후 정리할 항목을 바로 보여준다.
dogfood walk 도 `workspace_brief.nextActions` row 의 identifier/severity 와
`health.checks` row 의 id/status/count 를 fail-closed 로 검증해, 실제 MCP 응답이
advisory/coverage 출력에서 `unknown` 으로 숨지 않게 한다.
기본 server wait 는 8초이며 큰 vault / 느린 파일시스템에서는
양의 정수 millisecond 값인 `OMOT_VERIFY_TIMEOUT_MS` 로 늘릴 수 있다.
`1000ms` 같은 부분 숫자 값은 조용히 truncate 하지 않고 실패한다.
first-contact 응답들이 모두 도착하면 timeout 까지 기다리지 않고 즉시 종료하며,
진짜 timeout 은 누락된 응답 그룹을 함께 출력한다.
`initialize` 전 서버 시작 실패는 timeout 과 구분해 stderr 의 vault 설정 진단을 보존한다.
first-contact JSON-RPC error 응답도 timeout 까지 기다리지 않고 실패한 step 이름과
error message 를 바로 출력한다.
`mcp/src/integration.test.mjs` 와 `mcp/src/verify-script.test.mjs` 는 실제
`tools/list` registry, `verify.mjs` 의 `EXPECTED_TOOLS`, `mcp/package.json`
tool count metadata, 그리고 `initialize.instructions` 의 agent-facing inventory 가
서로 drift 나지 않도록 같은 23-tool 목록을 교차 검증한다.
installed verify 도 `tools/list` schema 의 `additionalProperties:false` 와
required `query_ontology.operation`, `operation` / `targetOperation` enum 이
runtime allow-list 와 일치하는지 검사해, MCP client schema 와 실제 graph engine
dispatch 가 갈라지지 않도록 한다. `get_concepts` / `add_concepts` /
`add_relations` 의 batch 배열도 runtime 과 같은 50-row cap 을 schema 에 노출하는지
설치 verify 에서 확인한다. 설치 verify 는 잘못된 `list_concepts.lmit` 호출도
실제로 보내고 unknown argument 거절 응답을 기대한다. write safety 도 같은 경로에서 `expected_mtime`
conflict guard 와 destructive tool 의 `confirm` dry-run switch schema 를 검사한다.
`initialize.instructions` 는 agent 가 write 도구부터 시도하지 않도록
`validate_vault`, `workspace_brief`, `overview`, `query_plan(targetOperation:"overview")`,
`query_plan(targetOperation:"project_map")`
기반 read-only first-contact diagnosis 와 graph-query smoke 를 기본 진입 순서로 안내한다.
또한 모든 tool input schema 가 strict 하며 `Unknown argument "lmit" for list_concepts.
Did you mean "limit"?` 또는 `operation must be one of: ... Received: "overveiw".
Did you mean "overview"?` 같은 오류가 기본값 fallback 이 아니라 즉시 고쳐야 하는
인자명/값 오류임을 agent-facing instructions 와 verify/dogfood smoke 에서 직접 안내한다.
같은 nearest-value hint 는 MCP boundary 뿐 아니라 `ontology-engine` 직접 호출 경로에도
적용되어 CLI thin wrapper / 내부 graph smoke 가 동일한 진단 품질을 유지한다.
spawn-heavy integration 은 `pnpm integration:mcp` 로 실행하고
`OMOT_TEST_NAME_PATTERN` 으로 수정 파트만 골라 실행할 수 있어, 작은 변경마다
전체 MCP 통합 파일을 돌리는 비용을 줄인다.
package manifest / enum suggestion 류의 더 작은 변경은 root 의
`pnpm test:mcp:package` / `pnpm test:mcp:suggestions` 로 파일 단위 검증을 먼저
돌려 반복 dogfood 비용을 낮춘다.
또한 write tool schema 가 `expected_mtime` conflict guard 와 destructive
tool 의 `confirm` dry-run safety switch 를 계속 노출하는지 `tools/list`
응답에서 직접 검증해, agent-facing MCP schema 가 실제 동시 편집 보호
계약을 잃지 않게 막는다. `expected_mtime` 은 non-negative finite number 로
검증해 malformed 값이 conflict guard 를 조용히 비활성화하지 못하게 한다.
MCP write handler 는 schema 우회 또는 agent 실수로 들어오는 blank/padded string
입력을 디스크 쓰기 전에 거부한다. `add_concept` / `add_relation` / `patch_concept`
및 destructive write (`rename_concept` / `merge_concepts` / `delete_concept`), batch
row partial-failure 경로까지 `mcp/src/integration.test.mjs` 의 spawn 기반 통합
테스트가 검증한다. wrapper 바깥의 vault core 함수도 `writeDoc` / `patchFrontmatter` /
`updateDoc` 에서 invalid `frontmatter` object 와 non-string `body` 를 디스크 쓰기
전에 reject 해 generic TypeError 나 YAML coercion 으로 숨지 않게 한다.
`add_concepts` / `add_relations` 의 batch row 도 object shape 와 허용 field set 을
먼저 검증해, 잘못된 row 는 index 가 포함된 row-level error 로 격리하고 나머지 유효
row 는 계속 land 한다.
`tools/call.arguments` 자체도 생략은 빈 object 로 처리하되, null / 배열 /
문자열처럼 object 가 아닌 값은 SDK 또는 server 경계에서 명확한 MCP error 로
거부한다. 알 수 없는 top-level argument key 도 reject 하고 `tools/list` schema 는
각 도구에 `additionalProperties:false` 를 노출해 `lmit` 같은 오타가 기본값 실행으로
숨지 않게 한다.
Read/query handler 도 numeric pagination / traversal 옵션을 조용히 기본값으로
흡수하지 않는다. `list_concepts.limit`, `find_neighbors.limit`, `find_path.maxHops`,
`query_concepts.limit`, `compile_ontology` pagination, `query_ontology` 의 limit /
depth / iterations / direction 값이 범위를 벗어나면 MCP error 로 노출된다.
core graph engine 직접 호출도 `iterations` 를 같은 1..100 integer contract 로
검증해 문자열/소수/과대값을 기본값이나 clamp 로 조용히 흡수하지 않는다.
`depth` / `maxHops` 도 core 에서 같은 non-negative integer, max 20 contract 로
검증해 traversal 범위를 silent clamp 하지 않는다. 독립 `find_path` helper 도
wrapper 와 core `findPath` 양쪽에서 같은 max 20 계약을 적용한다.
`limit` / `itemLimit` / `nodeLimit` / health sub-limit 계열도 core 에서
positive integer, max 500 contract 로 검증해 page 크기를 silent clamp 하지 않는다.
`direction` 도 core 에서 `incoming` / `outgoing` / `both` / `undirected`
enum contract 로 검증해 잘못된 방향을 기본 traversal 로 흡수하지 않는다.
`query_ontology.operation` 과 `query_plan.targetOperation` 도 graph engine 의
runtime allow-list 를 공유하는 enum 으로 tools/list schema 와 MCP boundary 검증을
정렬해, 누락되거나 알 수 없는 operation 이 generic dispatch failure 로 흘러가지
않게 한다.
`analyze_repo_structure` / `infer_imports` 도 wrapper 밖 core 함수에서
rootPath / ignore / sourceFolders / maxDepth / maxFiles contract 를 검증해
잘못된 cold-start 분석 입력을 문자열화하거나 기본값으로 흡수하지 않는다.
`compile_ontology` 도 core compiler 에서 summary / includeIndexes boolean 과
pagination null 값을 검증해 invalid option 을 false 또는 미지정으로 흡수하지 않는다.
`patch_concept` 의 body contract 도 core `updateDoc` 까지 동일하게 적용해
null body 를 빈 본문으로 silent clear 하지 않는다.
`tools/list` inputSchema 도 같은 integer / minimum / maximum 제약을 노출해
agent 가 호출 전 잘못된 인자를 스스로 고칠 수 있게 한다.
`match_nodes` 의 degree 필터 (`minDegree`, `maxDegree`, `minInDegree`,
`minOutDegree`) 도 non-negative integer 로 고정해 소수 값을 조용히 truncate 하지
않는다.
`query_concepts` 는 `total` 을 전체 match 수로, `matches` 를 limit 이 적용된
반환 row 로 구분한다. `limited` 는 숨은 row 가 있을 때만 true 라서, match 수가
limit 과 정확히 같은 정상 page 를 잘린 결과로 오인하지 않는다.
`query_ontology(neighbors)` 도 같은 contract 를 따른다. `total` 은 limit 전
edge 수이고 `limited` 는 반환되지 않은 edge 가 있을 때만 true 다.
`query_ontology(impact)` / `query_ontology(blast_radius)` 도 반환 node limit 과
숨은 영향 node 를 구분해, 영향 범위가 limit 과 정확히 같은 정상 결과를 잘린
결과로 오인하지 않는다.
`query_ontology(reachability)` / `query_ontology(subgraph)` 역시 시작 노드와
sentinel 탐색을 분리해, agent 가 실제로 더 볼 노드가 있을 때만 limited 상태를
받는다.
`query_ontology(pattern_walk)` 는 단계별 path 확장에서도 limit 과 정확히 같은
branch 수를 truncation 으로 오인하지 않아, 후속 pattern step 이 누락되지 않는다.
limited 상태에서는 `paths.total` 이 반환 row 수보다 커서 숨은 path 가 있음을
agent 가 payload 자체에서 판별할 수 있다. `pattern` 항목도 core engine 에서
non-empty / trim-clean / null-byte-free string 으로 검증해 잘못된 relation step 을
조용히 drop 하지 않는다.
`query_ontology(all_paths)` 도 bounded traversal 을 끝까지 세고 반환 row 만
limit 으로 잘라, `totalPaths` 가 실제 unique path 수를 말하고 `limited` 는 숨은
path 가 있을 때만 true 다.
`query_plan(targetOperation:"all_paths")` 의 기본 limit 도 실제 `all_paths`
기본값과 같은 25 라서, agent 가 plan 에서 본 반환 상한과 실제 호출 상한이
갈라지지 않는다.
`compile_ontology` pagination 은 MCP handler 와 core compiler 양쪽에서 cursor
safety 를 위해 limit 과 offset 계약을 분리한다. `nodesLimit` / `edgesLimit` 은
1 이상 양수이면서 500 이하만 허용하고, `nodesOffset` / `edgesOffset` 만 0 이상을 허용한다.
따라서 page size 0 이나 소수 값을 조용히 보정해 `hasMore: true` 인데
`nextOffset` 이 전진하지 않는 agent loop 를 만들지 않는다.

`pnpm dogfood:walk` 는 이 repo 의 `docs/ontology` 를 대상으로 실제 MCP stdio 호출을
연속 실행한다. 기본 census / backlink / path 질의에 더해 `validate_vault`,
`workspace_brief`, `health`, `compile_ontology`, `overview`, `pattern_walk`,
`all_paths`, `all_paths query_plan`, `neighbors`, `path`, `project_map query_plan`, `project_scope`, `project_map`,
`domain_profile`, `domain_matrix`, `components`, `reachability`, `impact`,
`blast_radius`, `subgraph`, `schema`, `facets`, `match_nodes`, `match_edges`,
`node_profile`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `relation_check`, `recommend_relations`,
`growth_plan`, `maintenance_plan`, strict unknown-argument and invalid-enum rejection smoke 를
함께 출력해, AI agent 가 첫 접촉에서 받는 graph diagnosis 와 traversal 품질을
계속 확인한다.
dogfood 의 `list_concepts.vaultWarnings` / `validate_vault` 판정은
`mcp/scripts/verify.mjs` 의 helper 를 재사용해 installed verify 와 dogfood gate 가
서로 다른 first-contact payload 계약으로 갈라지지 않게 한다.
`list_concepts.vaultWarnings` 도 `errorCount` / `warningCount` count shape 를
검증해, malformed warning payload 가 clean list response 로 오인되지 않게 한다.
요청한 JSON-RPC 응답이 모두 도착하거나 error 응답이 오면 timeout 까지 기다리지 않고
즉시 종료해 반복 dogfood 비용을 낮춘다. timeout 으로 끝나면 누락된 응답 label 을
gate failure 에 함께 출력한다. 느린 환경에서는 양의 정수 millisecond 값인
`OMOT_DOGFOOD_TIMEOUT_MS` 로 dogfood wait 를 늘릴 수 있다.
핵심 응답 누락, vault warning, `validate_vault` problemFiles, 예상 graph path 부재,
`workspace_brief` / `health` 비정상 상태, top-level status 와 별개로 내부 health
check 의 `fail` 상태, warn·fail `workspace_brief.nextActions` 는 exit 1 로 처리한다.
`pnpm dogfood:test` 는 이 gate 판정을 fixture 로 검증해
dogfood walk 의 실패 조건이 조용히 약해지지 않게 막는다.
