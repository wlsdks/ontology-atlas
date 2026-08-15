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

## 활성 도구 인벤토리 계약

- 도구의 현재 집합은 `mcp/src/index.js`의 registry에 annotation과 read-only filter를
  적용한 `TOOLS_FOR_LIST`다. `tools/list`와 initialize의 `Tool inventory` 절은 같은
  배열에서 파생되며, 다른 문서가 숫자나 전체 이름 목록을 다시 소유하지 않는다.
- read-only 서버는 write 도구를 광고하지도, 초기 안내에 노출하지도 않는다. 전체
  모드와 read-only 모드 모두 header count와 read/write 이름 집합이 실제
  `tools/list`와 정확히 같아야 한다.
- `mcp-verify`는 live `tools/list`와 initialize 안내의 count·분류·이름 집합을
  독립적으로 비교한다. 문서와 설정 화면은 `tools/list`와 `mcp-verify`를 안내하며
  변하기 쉬운 고정 count를 사용자에게 약속하지 않는다.

## 정체성 경계

- `uid`는 rename 뒤에도 유지되는 영구 기계 정체성이고, `slug`는 사람이 읽고
  편집하는 현재 주소다. 모든 노드 응답은 둘을 함께 반환한다.
- exact read와 외부 interop 정체성은 UID를 사용할 수 있다. 마크다운 관계, URL,
  그래프 연산 입력은 slug를 유지한다.
- rename/reclassify는 UID를 보존한다. merge는 대상 UID를 보존하고 흡수한 UID를
  `merged_uids`에 기록한다. 일반 patch는 `uid`와 `merged_uids`를 바꿀 수 없다.

## 온톨로지 구축 lifecycle

`analyze_repo_structure`의 complete proposal은 바로 쓰기 권한이 아니다. 첫 호출은
정확한 `reviewPlan`과 plan/source digest, 여덟 단계 상태, 남은 gap id만 반환하고
`canWrite:false`를 유지한다. maker와 분리된 evaluator가 사람 owner의 CQ, current
claim/citation, 일곱 품질축, 전체 source-hidden task, cold-start 또는 이전 CQ regression을
실행한 뒤 사용자가 그 exact plan과 gap을 승인해야 한다. 같은 proposal과 digest-bound
`constructionQualification:v1` packet을 다시 제출했을 때만 처음 본 rows와 동일한
`writePlan`이 풀린다. source/plan drift, maker-only, `not_measured`, red mandatory axis,
regression 실패, 승인되지 않은 gap은 fail-closed다. 같은 응답의 `admission`은
shadow-only로 `self_qualified`, `partial_visible_gap`, `human_review_required`,
`hard_block`을 분류한다. `self_qualified`는 독립 근거가 모두 통과한 자동 반영 후보
신호일 뿐이며, 실제 write는 기존 사람 승인·digest-bound `writePlan` gate를 우회하지
않는다. 측정된 기능 공백은 부분 상태로 보이고, 정책·소유권·도메인 경계·충돌은 사람
검토, stale·unsupported·비독립 평가·source-hidden/회귀 실패는 hard block으로 남는다.
각 qualification claim은 현재 `reviewPlan`의 exact `concept:`·`relation:`·`competency:`·
`impact:` 행을 가리키는 `proposalRefs`를 가져야 하며, lifecycle의
`proposalCoverage`가 누락·외부 proposal·source-hidden 미검증 행을 fail-closed로
분류한다. 이는 evaluator handoff의 대상 일치를 보장하는 receipt이지 claim의
사업적 진실을 자동 승인하는 점수나 의미 판정은 아니다.

승인은 선언된 provenance이며 신원 인증이나 truth certificate가 아니다. project Markdown은
기존 competency answer/witness/visible gap을, finalizer receipt는 그 body와 current
graph/source 결합을 영속한다. 상세 CQ revision·axis·exact gap acceptance·pre-write
regression은 MCP 응답/agent transcript의 실행 증거이고 재시작 뒤 자동 복원됐다고 말하지
않는다. 새 tool·kind·sidecar·writer token은 만들지 않는다.

## 소스 연결

`connect_project_source` / `disconnect_project_source`는 project 노드를 그것이
설명하는 로컬 코드 폴더에 묶고 푼다. 이전에는 `agent_brief`가 `connect_source`를
다음 행동으로 내놓으면서 그것을 실행할 도구가 없었다. 설치된 macOS 앱의 폴더
선택기가 유일한 경로였다. 두 도구 모두 `confirm: true` 전에는 아무것도 쓰지 않고,
절대 루트는 gitignore된 `.ontology-atlas/project-sources.json`에만 남는다.

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

Cold-start 의미 근거는 루트 `ARCHITECTURE.md`와 `docs/`·`site/`·`website/` 아래에서
분류된 current Markdown도 기존 `semanticEvidence` packet으로 운반한다. 세 root 전체에서
Markdown 200개·directory entry 1,000개까지만 탐색하고, 일반 의미 문서는 읽기 전
256 KiB에서 멈춘다. 실제 경로가 같은 directory는 한 번만 방문하며 archive류와
끊어졌거나 repository 밖인 symlink는 제외한다. 최종 packet의 6문서·문서당 1,200자 경계는 유지한다.
Proposal이 들어온 같은 호출은 기존 read-only import receipt도 다시 계산해 TS/JS/Python
exact endpoint와 방향을 검증한다. 이 문서와 경로는 evidence/provenance일 뿐 business
meaning이나 `depends_on`을 자동 승인하지 않으며, maker-independent qualification과 사람의
exact-plan 승인이 없으면 `writePlan`을 열지 않는다.
관계 rationale이 양끝 concept의 정확한 repository `path:`를 직접 이름 붙이면 같은 관계의
evidence에도 그 경로가 있어야 한다. 다른 문서만 인용한 경우
`relation-path-citation-mismatch`로 실패 닫으며, 경로를 언급하지 않은 일반 의미 문장은
파일명을 추측해 차단하지 않는다.

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
구현 경로를 이미 알면 `focusPath` 또는 `reviewMode:"focus"`를 먼저 쓴다. 이 모드는
loadable vault 없이도 그 파일의 정확한 incoming/outgoing static import 수와 최대 100개
영수증, stateless cursor를 반환한다. 빈 결과도 영향 없음으로 말하지 않고 symbol·test·dynamic
behavior와 ontology meaning이 아직 별도 확인 대상임을 고정한다.
`reviewMode`를 생략하면 예상 MCP 전체 응답(text와 structured content)이 128 KiB 이하일
때만 기존 전체 graph를 반환한다. 그보다 큰 reconciled scan은 전체 배열 대신 검토 후보
한 건, 정확한 근거, 양쪽 개념·relation preflight 호출, 중단 조건, stateless cursor와
자동 선택 이유·예상 byte를 담은 `delivery` receipt만 반환한다. `reviewMode:"next"`는
같은 compact packet을 명시적으로 요청한다. `reviewMode:"full"`은 전체 shape를
보존하지만 128 KiB를 넘으면 `allowLargeResponse:true`라는 두 번째 확인이 있어야 한다.
reconciliation할 loadable vault가 없는 oversized 생략 호출은
안전한 packet을 가장하지 않고 두 복구 선택을 구조화된 오류로 반환한다. `index_project`의
내부 분석은 explicit full로 고정해 이 전달 기본값이 기존 plan 의미를 바꾸지 않는다.
각 근거는 제품/테스트 코드와 값/타입 전용 사용을 분리하고, module
edge는 bounded sample이 아니라 전체 import에서 두 차원의 count와 교집합인
`productValueCount`를 계산한다. JS/TS의 명시적 type import와 Python의 명시적
`TYPE_CHECKING` guard 안 import는 type-only다. `value`는 그 밖의 정적 import라는
뜻이지 runtime 실행을 주장하지 않는다. 제품 코드의 값 사용이 0건이면 테스트·타입 근거를
숨기지 않되 그 import만으로 제품 `depends_on` 승인을 묻지 않고 별도 제품 의미
근거를 요구한다. 그 밖에도 에이전트는 양쪽 개념과 방향을 읽고 의미적 이유를 설명한
뒤 사람에게 물어야 하며, 승인된 한 건만 비어 있지 않은 `why`와 함께 기록한다.

C/Autotools 저장소에서도 빈 import graph를 “의존 없음”으로 말하지 않는다. bounded
manifest/source discovery가 실제 `.c`/`.h`를 확인하면 `infer_imports.coverage`는 `c`를
미지원 언어로 표시하고 `allDetectedLanguagesSupported:false`를 반환한다. 실행하지 않는
정적 `AC_INIT` 리터럴은 프로젝트 이름의 근거로 쓰고, bounded README prose에서는
릴리스 상태보다 목적을 직접 말하는 문장을 우선한다. 이 근거만으로 domain이나
capability를 만들지 않으며 C include/build dependency graph를 분석하거나 의미 관계로
자동 승격하지도 않는다.

같은 Autotools 분석은 정적 `AC_CONFIG_FILES`가 지목한 root 또는 한 단계 하위
`Makefile.am`의 literal 선언을 실행 없이 읽는다. 설치 대상 header와 존재하는 `.h.in`
template, non-`EXTRA` core source, raw/API specialized source, `EXTRA_*_SOURCES`의 선택형
platform backend를 구분해 source 36개 안에서 역할별 대표를 먼저 보존한다. 내부
`noinst_HEADERS`, 변수·shell·wildcard·절대/상위 경로는 역할 근거가 되지 않는다. 이
build-role은 구현 handoff의 관측 근거이며 canonical capability나 C impact를 자동
승인하지 않는다.

Rust 저장소도 같은 원칙으로 빈 import graph를 “의존 없음”으로 말하지 않는다.
`infer_imports.coverage`는 Cargo 감지 시 `use`/`mod`/macro dependency scan이 아직
지원되지 않음을 명시하고, 0 edge의 뜻을 지원 언어에서 관측된 정적 import가 없다는
범위로 제한한다. 대신 `analyze_repo_structure.configurationEvidence`와
`index_project.configurationEvidence`는 root package 또는 저장소 안 literal direct
workspace member의 `[features]` 선언과 conventional Cargo target source의 literal
`cfg`/`cfg_attr` feature predicate를
path/line/form/polarity/source role로 보존한다. 이 receipt는 predicate를 평가하거나
build script/macro를 실행하지 않고 runtime impact, import dependency, semantic
`depends_on`을 주장하거나 쓰지 않는다. workspace/package/feature/mapping/source-file
limit과 거절된 member/predicate도 숨기지 않는다.
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

- `mcp/src/index.js` · `mcp/src/tool-inventory.mjs`: 활성 도구 registry에서
  `tools/list`와 모드별 initialize 인벤토리를 함께 만드는 경계
- `mcp/src/analyze.mjs` · `mcp/src/rust-feature-evidence.mjs` ·
  `mcp/src/infer-imports.mjs`: bounded repository 의미 ingress, Rust 구성 provenance,
  실행 없는 TS/JS/Python import 근거, Autotools C/Rust 미지원 범위와 exact-path 관계 근거
- `mcp/src/vault.mjs` · `mcp/src/schema.mjs`: 파일 읽기/쓰기와 UID/slug 규격
- `mcp/src/ontology-compiler.mjs` · `mcp/src/ontology-engine.mjs`: compile/query
- `mcp/src/competency-coverage.mjs` · `mcp/src/meaning-evaluation.mjs`: quantified
  competency coverage와 source-backed proposal write gate
- `mcp/src/construction-qualification.mjs` · `mcp/src/construction-lifecycle.mjs`:
  maker-independent categorical qualification, exact plan/source/approval binding, 단계별
  write eligibility
- `mcp/src/project-source-inspection.mjs` · `mcp/src/project-source-receipt.mjs`:
  설치 앱과 같은 bounded source currentness 재검증과 public receipt 경계
- `mcp/src/meaning-repair.mjs` · `mcp/src/project-meaning-inventory.mjs`: 현재 선언,
  구조/source 후보, 미해결 대상을 분리하는 action-first 사람 승인 패킷
- `mcp/scripts/verify.mjs` · `mcp/src/integration.test.mjs` ·
  `scripts/dogfood-mcp-walk.mjs`: initialize/tools-list exact parity와 설치·실사용 검증
- `mcp/README.md`: 현재 공개 도구 계약의 상세 단일 진실원

## 확신도

high (0.95): registry, parser/compiler contract, source/packed binary dogfood가 같은
볼트를 대상으로 검증된다.
