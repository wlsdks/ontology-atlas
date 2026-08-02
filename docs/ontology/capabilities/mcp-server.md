---
uid: 895c062c-28f0-4564-a6a5-0ef2a6b56e51
slug: capabilities/mcp-server
kind: capability
title: MCP Server
domain: domains/agent-integration
elements: []
path: mcp/src
created_by: "agent:unknown"
dependencies: [capabilities/vault-ontology]
display_ko: AI 연결 서버
display_en: AI Connection Server
---

# MCP Server

로컬 마크다운 볼트를 AI 코딩 에이전트가 읽고 안전하게 갱신하도록 제공하는
stdio JSON-RPC 인터페이스다. 사람과 에이전트가 같은 파일을 진실원으로 사용하며,
서버는 별도 데이터베이스나 모델 실행 루프를 소유하지 않는다.

## 사용자 결과

- 에이전트는 프로젝트의 의미 노드를 정확히 찾고, 관계·근거·영향 범위를 함께 읽는다.
- 연결 직후 실제 vault/repository 좌표와 도구 인벤토리를 확인해 잘못된 폴더나 오래된
  클라이언트 상태를 발견한다.
- 쓰기 전에는 현재 문서를 읽고, 동시 편집·중복·끊어진 관계·파괴적 변경을 구조화된
  오류와 dry-run으로 차단한다.

## 정체성 경계

- `uid`는 rename 뒤에도 유지되는 영구 기계 정체성이고, `slug`는 사람이 읽고
  편집하는 현재 주소다. 모든 노드 응답은 둘을 함께 반환한다.
- exact read와 외부 interop 정체성은 UID를 사용할 수 있다. 마크다운 관계, URL,
  그래프 연산 입력은 slug를 유지한다.
- rename/reclassify는 UID를 보존한다. merge는 대상 UID를 보존하고 흡수한 UID를
  `merged_uids`에 기록한다. 일반 patch는 `uid`와 `merged_uids`를 바꿀 수 없다.

## 핵심 흐름

1. `connection_info` → `list_kinds` / `list_concepts` → `validate_vault`로 연결과
   볼트 상태를 먼저 확인한다.
2. `get_concept` / `get_concepts`와 graph query 도구로 의미·근거·경로·영향을
   필요한 범위만 읽는다.
3. 새 의미 후보는 코드 증거와 중복 여부를 검토하고 사용자가 승인한 것만 쓴다.
4. 기존 노드 쓰기는 직전 `mtime`을 전달한다. rename/merge/delete 같은 파괴적
   작업은 preview 후 명시 확인한다.
5. 변경 뒤 `validate_vault`, compile, health/maintenance 흐름으로 그래프를 재검증한다.

## 포함 / 제외

- 포함: MCP 도구 등록과 입출력 계약, 볼트 parser/writer, deterministic compiler와
  graph query, 동시성·dry-run·검증 안전장치, 설치 앱의 번들 서버.
- 제외: AST/소스 검색 엔진, 임베딩 저장소, 모델 선택·에이전트 루프, 백엔드·계정,
  사람 승인 없이 생성 제안을 자동 저장하는 기능.

## 구현 근거

- `mcp/src/index.js` — 도구 registry, schema, handler, 첫 연결 지침
- `mcp/src/vault.mjs` · `mcp/src/schema.mjs` — 파일 읽기/쓰기와 UID/slug 규격
- `mcp/src/ontology-compiler.mjs` · `mcp/src/ontology-engine.mjs` — compile/query
- `mcp/scripts/verify.mjs` · `scripts/dogfood-mcp-walk.mjs` — 설치·실사용 검증
- `mcp/README.md` — 현재 공개 도구 계약의 상세 단일 진실원

## 확신도

high (0.95) — registry, parser/compiler contract, source/packed binary dogfood가 같은
볼트를 대상으로 검증된다.
