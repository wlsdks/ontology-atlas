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

설치 앱이 사람이 선택한 소스 루트를 sidecar에 묶은 뒤에는 새 MCP 프로세스도 앱과
같은 bounded fingerprint를 로컬에서 재현한다. 저장 영수증과 정확히 일치할 때만
source currentness를 `current`로 읽고, 변경은 `source_changed`로 실패 닫는다. 비공개
절대 경로와 원시 source inventory는 MCP 응답에 포함하지 않는다.

repository proposal이 competency를 `answered`로 서명할 때는 필요한 witness 배열이
비어 있지 않은지만 보지 않는다. `abilities`는 제안된 모든 domain을 typed
domain→capability witness가 덮는지, `evidence`는 모든 capability slug와 canonical
path가 함께 인용됐는지 검사한다. 일부만 덮으면 누락 target slug를 구조화된 오류로
돌려주며 write plan을 만들지 않는다. 정직한 `partial`/`visible-gap` proposal은 계속
검토·저장할 수 있다.

fresh `agent_brief`가 current source와 incomplete competency를 함께 읽으면 첫
`nextActions`를 `review_competency_repair`로 올린다. 연결된 `meaningRepair:v1`은
현재 project Markdown의 선언, typed containment가 만든 구조 검토 후보, current
source receipt가 직접 지지한 canonical-path 후보, 아직 미해결인 대상을 분리한다.
containment와 path 존재는 사람의 의미 승인이나 행동 증명이 아니므로 후보를 자동으로
`answered`로 바꾸거나 쓰지 않는다. source/provenance/scope/validation/mtime이 흔들리면
기존 source·health 행동을 보존한 채 repair를 차단한다. 첫 review read는 project,
domain, capability의 정확한 합집합을 공개 full-body 상한인 최대 20개 단위의 literal
`get_concepts` 호출로 제공한다. 따라서 현재 dogfood 27개 검토 대상도 FDE가 batching을
추측하지 않고 20+7로 실행하며, verifier는 누락·중복·순서·5 KiB 상한을 함께 검사한다.

Python cold start에서는 `README.rst`, 실행하지 않는 정적 `setup.py` package
contract, 최상위 `__init__.py` package를 bounded 근거로 읽는다. `infer_imports`는
그 package의 정적 import를 file/module edge로 축약한다. 이 결과는 구현 증거이며,
domain·capability·의미 `depends_on`으로 자동 승격하지 않는다. 각 module edge에는
최대 5개의 정확한 file-edge 영수증과 나머지 근거 존재 여부가 붙는다. vault에 없는
edge도 실행 가능한 `proposedAction` 대신 `rationale_review_required`로 반환한다.
`reviewMode:"next"`는 전체 import graph 대신 검토 후보 한 건, 정확한 근거,
양쪽 개념·relation preflight 호출, 중단 조건, stateless cursor만 5 KiB 이하로
반환한다. 에이전트는 양쪽 개념과 방향을 읽고 의미적 이유를 설명한 뒤
사람에게 물어야 하며, 승인된 한 건만 비어 있지 않은 `why`와 함께 기록한다.
이때 `relation_check`의 schema match도 의미 승인이 아니다. 새 `depends_on`은
실행 가능한 `proposedAction` 없이 `approvalGate.writeAllowed:false`를 반환하며,
관측 가능한 능력·의미적 이유·정확한 방향에 대한 사람의 명시적 승인 뒤에만 쓴다.
Analyzer는 실제 import에 참여한 Python 구현 경계를 최대 12개 element/path 후보로
연결한다. 직접 module/package 경계를 기본으로 하되, 긴 import 응답에 위험 소유권이
묻히지 않도록 security/policy/risk exact endpoint가 최대 2개 자리를 예약할 수 있다.
사용하지 않는 파일과 충돌하는 flat slug는 제외한다. 이 경로를
근거로 제안한 `depends_on`은 관측된 import 방향과 일치해야 proposal validation을
통과한다. 모델은 자동 후보 밖의 정확한 import file endpoint도 서로 다른 탐색 역할에
한해 최대 4개까지 선택할 수 있다. 서버는 이 파일들을 자동으로 노드화하지 않고,
proposal의 정확 경로·상한·file-edge 방향만 fail closed로 검증한다.

`impact`와 `blast_radius`는 선언된 `depends_on`만 따라간다. containment·domain·
element 관계는 `reachability`/`subgraph`의 구조 근거이며 영향이나 위험으로 승격하지
않는다. 선언된 의존에 `relation_notes`가 없으면 `review_required`, 있으면
`declared_with_rationale`로 반환한다. 둘 다 관계 단위 current-source receipt가 없는
현재는 source-backed가 아니므로 completeness와 risk를 `unknown`으로 유지한다.
따라서 의존 선언 0건도 저위험이나 영향 없음으로 해석하지 않는다.

## 포함 / 제외

- 포함: MCP 도구 등록과 입출력 계약, 볼트 parser/writer, deterministic compiler와
  graph query, 동시성·dry-run·검증 안전장치, 설치 앱의 번들 서버.
- 제외: AST/소스 검색 엔진, 임베딩 저장소, 모델 선택·에이전트 루프, 백엔드·계정,
  사람 승인 없이 생성 제안을 자동 저장하는 기능.

## 구현 근거

- `mcp/src/index.js` — 도구 registry, schema, handler, 첫 연결 지침
- `mcp/src/analyze.mjs` · `mcp/src/infer-imports.mjs` — bounded repository 의미
  ingress와 실행 없는 TS/JS/Python import 근거
- `mcp/src/vault.mjs` · `mcp/src/schema.mjs` — 파일 읽기/쓰기와 UID/slug 규격
- `mcp/src/ontology-compiler.mjs` · `mcp/src/ontology-engine.mjs` — compile/query
- `mcp/src/competency-coverage.mjs` · `mcp/src/meaning-evaluation.mjs` — quantified
  competency coverage와 source-backed proposal write gate
- `mcp/src/project-source-inspection.mjs` · `mcp/src/project-source-receipt.mjs` —
  설치 앱과 같은 bounded source currentness 재검증과 public receipt 경계
- `mcp/src/meaning-repair.mjs` · `mcp/src/project-meaning-inventory.mjs` — 현재 선언,
  구조/source 후보, 미해결 대상을 분리하는 action-first 사람 승인 패킷
- `mcp/scripts/verify.mjs` · `scripts/dogfood-mcp-walk.mjs` — 설치·실사용 검증
- `mcp/README.md` — 현재 공개 도구 계약의 상세 단일 진실원

## 확신도

high (0.95) — registry, parser/compiler contract, source/packed binary dogfood가 같은
볼트를 대상으로 검증된다.
