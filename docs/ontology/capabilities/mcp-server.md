---
slug: capabilities/mcp-server
kind: capability
title: MCP Server (23 tools)
domain: ai-agent-partner
elements: [mcp/src/analyze.mjs, mcp/src/index.js, mcp/src/infer-imports.mjs, mcp/src/ontology-compiler.mjs, mcp/src/ontology-engine.mjs, mcp/src/parser.mjs, mcp/src/vault.mjs]
relates: [capabilities/frontmatter-to-ontology, domains/ai-agent-partner]
---

# MCP Server (23 tools)

`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버. 23 도구 노출 (read 15 + write 8):

| 도구 | 동작 |
|---|---|
| `list_concepts` | vault 의 모든 노드 (kind 필터) |
| `get_concept` | 단일 slug 의 frontmatter + body excerpt + graph neighbors + `outgoingEdges[]` |
| `get_concepts` | **R+** 배치 reader — 여러 slug 한 호출에 (max 50, 입력 순서 보존, missing 은 partial result) |
| `find_evidence` | title 부분매칭으로 vault 문서 검색 |
| `find_backlinks` | 특정 slug 를 가리키는 다른 노드들 (frontmatter array 키 + body wikilink/mdlink) |
| `find_neighbors` | 특정 slug 주변 one-hop graph subgraph 조회 (incoming/outgoing/both, relation filter, neighbor summary) |
| `find_path` | 두 slug 사이 그래프 최단 경로 (BFS, 무방향, `domains` / `domain` containment 포함, default maxHops 5) |
| `list_kinds` | kind 분포 census (`{ total, byKind: { capability: N, ... } }`) |
| `find_orphans` | 어디서도 graph frontmatter link 안 받는 고립 노드 (`domains` / `domain` containment 포함, kind 필터, vault-readme 자동 제외) |
| `query_concepts` | DSL 기반 ad-hoc 쿼리 (frontmatter 키 = / contains / exists 조합) |
| `compile_ontology` | vault 전체를 deterministic graph artifact 로 compile (nodes / canonical edges / aliases / issues / stable `graphHash` / `maxMtime` / optional query indexes) |
| `query_ontology` | compiled artifact 위 graph engine 질의 (`neighbors` / `path` / `all_paths` / `query_plan` / `centrality` / `communities` / `similar_nodes` / `explain_relation` / `reachability` / `pattern_walk` / `impact` / `blast_radius` / `subgraph` / `overview` / `schema` / `facets` / `match_nodes` / `match_edges` / `node_profile` / `domain_profile` / `domain_matrix` / `project_scope` / `project_map` / `relation_check` / `components` / `lineage` / `containment_tree` / `cycles` / `topological_order` / `recommend_relations` / `growth_plan` / `maintenance_plan` / `workspace_brief` / `health`) — graph DB 같은 답변을 full artifact 없이 반환. `maintenance_plan` action 은 stable `id` + `executable` 포함, `executableOnly` / `phases` / `severities` 필터 지원. |
| `validate_vault` | **R+** vault 전체 health 한 호출 (per-doc + byCode aggregate) — `list_concepts → K×get_concept` K-roundtrip 대체 |
| `analyze_repo_structure` | **R16** code repo (default cwd) 분석 → ontology 노드 후보 제안. **side effect 0** — vault 변경 안 함. AI agent 가 빈 vault bootstrap 시 사용 (사용자 한 줄 *"이 codebase 분석해줘"*). FSD vs generic detect. 후보 slug 는 `domains/*`, `capabilities/*`, `elements/src/...` 로 starter layout 과 일치. |
| `infer_imports` | **R17** TS/JS import graph 추출 → file/module-level edge + external (npm) imports 분리. **side effect 0**. moduleEdges 도 analyze 와 같은 folder-prefixed slug 를 사용해 add_relation endpoint mismatch 를 피함. |
| `add_concept` | 새 노드 (.md) 작성 — graph 배열은 trim + dedup + sort, 기존 slug 면 throw, changed write 는 compact `postWriteMaintenance` 반환 |
| `add_concepts` | **R+** 배치 writer — 여러 노드 한 호출에 (max 50, 입력 순서 보존, partial result, 입력 내 중복 slug 사전 감지). `/ontology-bootstrap` 흐름이 5~15 노드를 한 번에 land. changed batch 는 최종 graph 기준 compact `postWriteMaintenance` 반환. |
| `add_relation` | depends_on / relates / contains / describes edge 추가, changed write 는 compact `postWriteMaintenance` 반환 |
| `add_relations` | **R+** 배치 edge writer — 여러 edge 한 호출에 (max 50, 응답 row 순서 보존, 저장 배열은 dedup + sort, idempotent, partial result). analyze_repo_structure suggestedRelations · infer_imports moduleEdges 수신 직후 적합. changed batch 는 최종 graph 기준 compact `postWriteMaintenance` 반환. |

R+ follow-up: `add_relation` / `add_relations` 와 `rename_concept` / `merge_concepts`
backlink redirect 는 relation 배열을 canonical set 으로 저장한다. 같은 edge 집합은
항상 같은 frontmatter 순서로 직렬화되어 agent 반복 실행 시 diff noise 를 줄이고,
file-backed graph 를 graph database 처럼 더 예측 가능하게 다룰 수 있다.
| `patch_concept` | 기존 노드 frontmatter (key 단위 patch) + body 갱신 — graph 배열 patch 도 trim + dedup + sort, changed write 는 compact `postWriteMaintenance` 반환 |
| `delete_concept` | **⚠ DESTRUCTIVE** — 노드 영구 삭제. 안전 가드 2단: ① `confirm:true` 미지정 시 dry-run, ② backlinks 있으면 throw — `force:true` 만 강행. 응답에 frontmatter+body 캡처. confirmed delete 는 compact `postWriteMaintenance` 반환. |
| `rename_concept` | **⚠ MULTI-FILE (R11)** — slug 변경 + 모든 backlink 의 array/body 자동 redirect. dry-run default. tail-only 참조도 새 tail 로 일관 갱신. `find_backlinks` + N 회 `patch_concept` 의 atomic 대체. confirmed rename 은 compact `postWriteMaintenance` 반환. |
| `merge_concepts` | **⚠ DESTRUCTIVE MULTI-FILE (R11)** — `fromSlug` 의 backlink 를 `intoSlug` 로 redirect 후 fromSlug.md 삭제. `intoSlug` 의 frontmatter/body 는 자동 합치지 않음 (필요 시 후속 `patch_concept`). dry-run default. confirmed merge 는 compact `postWriteMaintenance` 반환. |

환경변수 `OMOT_VAULT` 로 vault 위치 지정. 등록 가이드: `mcp/README.md`. 1줄 verify: `npm run verify` (mcp/).
