---
slug: capabilities/mcp-server
kind: capability
title: MCP Server (9 tools)
domain: ai-agent-partner
elements:
  - mcp/src/index.js
  - mcp/src/parser.mjs
  - mcp/src/vault.mjs
relates:
  - capabilities/frontmatter-to-ontology
  - domains/ai-agent-partner
---

# MCP Server (9 tools)

`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버 (v0.3.0). 9 도구 노출:

| 도구 | 동작 |
|---|---|
| `list_concepts` | vault 의 모든 노드 (kind 필터) |
| `get_concept` | 단일 slug 의 frontmatter + body excerpt + 이웃 |
| `find_evidence` | title 부분매칭으로 vault 문서 검색 |
| `find_backlinks` | 특정 slug 를 가리키는 다른 노드들 (frontmatter array 키 + body wikilink/mdlink) |
| `find_path` | **v0.3** — 두 slug 사이 그래프 최단 경로 (BFS, 무방향, default maxHops 5) |
| `list_kinds` | **v0.3** — kind 분포 census (`{ total, byKind: { capability: N, ... } }`) |
| `add_concept` | 새 노드 (.md) 작성 — 기존 slug 면 throw |
| `add_relation` | depends_on / relates / contains / describes edge 추가 |
| `patch_concept` | 기존 노드 frontmatter (key 단위 patch) + body 갱신 |

환경변수 `OMOT_VAULT` 로 vault 위치 지정. 등록 가이드: `mcp/README.md`. 1줄 verify: `npm run verify` (mcp/).
