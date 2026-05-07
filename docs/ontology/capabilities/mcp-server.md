---
slug: capabilities/mcp-server
kind: capability
title: MCP Server (18 tools)
domain: ai-agent-partner
elements: [mcp/src/index.js, mcp/src/parser.mjs, mcp/src/vault.mjs, mcp/src/analyze.mjs, mcp/src/infer-imports.mjs]
relates: [capabilities/frontmatter-to-ontology, domains/ai-agent-partner]
---

# MCP Server (18 tools)

`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버. 18 도구 노출 (read 11 + write 7):

| 도구 | 동작 |
|---|---|
| `list_concepts` | vault 의 모든 노드 (kind 필터) |
| `get_concept` | 단일 slug 의 frontmatter + body excerpt + 이웃 |
| `get_concepts` | **R+** 배치 reader — 여러 slug 한 호출에 (max 50, 입력 순서 보존, missing 은 partial result) |
| `find_evidence` | title 부분매칭으로 vault 문서 검색 |
| `find_backlinks` | 특정 slug 를 가리키는 다른 노드들 (frontmatter array 키 + body wikilink/mdlink) |
| `find_path` | 두 slug 사이 그래프 최단 경로 (BFS, 무방향, default maxHops 5) |
| `list_kinds` | kind 분포 census (`{ total, byKind: { capability: N, ... } }`) |
| `find_orphans` | 어디서도 link 안 받는 고립 노드 (kind 필터, vault-readme 자동 제외) |
| `query_concepts` | DSL 기반 ad-hoc 쿼리 (frontmatter 키 = / contains / exists 조합) |
| `analyze_repo_structure` | **R16** code repo (default cwd) 분석 → ontology 노드 후보 제안. **side effect 0** — vault 변경 안 함. AI agent 가 빈 vault bootstrap 시 사용 (사용자 한 줄 *"이 codebase 분석해줘"*). FSD vs generic detect. |
| `infer_imports` | **R17** TS/JS import graph 추출 → file/module-level edge + external (npm) imports 분리. **side effect 0**. analyze_repo_structure 후 *real* dependency edge 를 add_relation 으로 land 하기 위한 입력. |
| `add_concept` | 새 노드 (.md) 작성 — 기존 slug 면 throw |
| `add_concepts` | **R+** 배치 writer — 여러 노드 한 호출에 (max 50, 입력 순서 보존, partial result, 입력 내 중복 slug 사전 감지). `/ontology-bootstrap` 흐름이 5~15 노드를 한 번에 land. |
| `add_relation` | depends_on / relates / contains / describes edge 추가 |
| `patch_concept` | 기존 노드 frontmatter (key 단위 patch) + body 갱신 |
| `delete_concept` | **⚠ DESTRUCTIVE** — 노드 영구 삭제. 안전 가드 2단: ① `confirm:true` 미지정 시 dry-run, ② backlinks 있으면 throw — `force:true` 만 강행. 응답에 frontmatter+body 캡처. |
| `rename_concept` | **⚠ MULTI-FILE (R11)** — slug 변경 + 모든 backlink 의 array/body 자동 redirect. dry-run default. tail-only 참조도 새 tail 로 일관 갱신. `find_backlinks` + N 회 `patch_concept` 의 atomic 대체. |
| `merge_concepts` | **⚠ DESTRUCTIVE MULTI-FILE (R11)** — `fromSlug` 의 backlink 를 `intoSlug` 로 redirect 후 fromSlug.md 삭제. `intoSlug` 의 frontmatter/body 는 자동 합치지 않음 (필요 시 후속 `patch_concept`). dry-run default. |

환경변수 `OMOT_VAULT` 로 vault 위치 지정. 등록 가이드: `mcp/README.md`. 1줄 verify: `npm run verify` (mcp/).
