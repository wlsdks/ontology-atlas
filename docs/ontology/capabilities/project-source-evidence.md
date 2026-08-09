---
uid: b4af8e2b-05f1-4931-9544-f8a6aae4aef7
slug: capabilities/project-source-evidence
kind: capability
title: Project Source Evidence Receipt
display_ko: 프로젝트 코드 근거 영수증
display_en: Project Source Evidence Receipt
domain: domains/project-portfolio
path: src/shared/lib/project-source-receipt.ts
created_by: "agent:codex"
---

## 정의

project 노드 하나에 Git 저장소 또는 로컬 폴더 하나를 연결하고, 온톨로지가
선언한 capability/element 구현 경로를 실제 소스 목록과 대조해 버전이 붙은
범주형 영수증으로 남기는 능력. 지도 데이터시트·전체 상세·CLI·MCP
`agent_brief`가 같은 상태·현재성·첫 빈틈·다음 행동을 읽는다.

연결 자체는 설치 앱·MCP·CLI 세 표면 모두에서 가능하다. `connect_project_source`
(CLI `connect-source`)는 `rootPath`를 생략하면 볼트를 감싸는 git 저장소를, 없으면
가장 가까운 조상 매니페스트 폴더를 후보로 지명하고, 노드들이 선언한 `path:`가 그
후보 안에서 몇 개나 실제로 존재하는지로 신뢰도를 매긴다. 지명과 채점을 나눈 이유는
`path:`가 저장소 상대 경로라 절대 루트를 지목할 수 없기 때문이다. `confirm: true`
전에는 아무것도 쓰지 않고, `disconnect_project_source`(CLI `disconnect-source`)가
되돌린다.

`Git 저장소` 표시는 선택한 소스의 종류이며 GitHub 계정이나 원격 저장소 연결을
뜻하지 않는다. 절대 경로는 vault-local `.ontology-atlas/project-sources.json`
sidecar에만 보관하고, 복사 인계와 MCP에는 source-relative witness만 전달한다.
새 MCP 프로세스는 사람이 연결한 그 비공개 루트에서 설치 앱과 같은 bounded probe만
다시 실행한다. kind·identity·revision·fingerprint가 모두 같을 때만 `current`, 하나라도
다르면 `source_changed`다. 권한·파일시스템·Git 실패로 재확인이 불가능할 때만 기존
영수증을 보존한 채 `unavailable`로 남긴다.

내부 `meaningAssessment:v1` 파생 계약은 구조 readiness, 고정 evaluator와 graph
hash에 묶인 다섯 competency question receipt의 typed witness, source ID·revision·
fingerprint·측정 시각과 현재성을 함께 검증한다. 원시 witness는 결과에 복사하지 않고
categorical 판정과 inventory provenance만 남긴다.
구조가 ready여도 의미 witness가 비거나 source를 현재 재확인할 수 없으면
`verified_current`로 승격하지 않는다.
source receipt 자체가 stale이면 `source_changed → remeasure_source`지만, source는
`verified_current/current`이고 저장된 competency receipt만 이전 source fingerprint에
묶였으면 `competency_source_changed → reevaluate_competency`다. 이 경우 source
차원은 current로 보존하고 전체 의미 상태만 `review_required`로 실패 닫는다.

`abilities`와 `evidence`처럼 질문에 `each`가 들어간 자격은 witness 종류가 한 번
등장했다는 이유만으로 통과하지 않는다. 현재 project→domain→capability containment에서
대상 집합을 파생해, `abilities`는 모든 domain의 typed capability relation을,
`evidence`는 모든 capability의 concept/path 근거를 덮어야 `answered`다. 빠진 slug는
미해소 대상으로 남고 `partial`/`visible-gap`은 계속 유효한 중간 상태다.

proposal writer와 finalizer는 source witness의 의미도 공유한다. project Markdown의
정확한 `## Competency answers` 절에서 renderer가 만든 backtick `Evidence`/`Paths`만
canonical `path:`와 함께 source claim으로 파생하고, 앱과 MCP가 같은 집합을 만든다.
임의 본문 파일명은 claim이 아니며 안전하지 않거나 형식이 깨진 경로는 빈 집합으로
실패 닫는다. 따라서 승인한 write plan의 근거는 source receipt→finalize→새
`agent_brief`까지 유지되지만, 실제 source inventory에 없는 경로는 끝까지 미지원이다.

## 근거

- `src/shared/lib/project-source-receipt.ts`: 영수증·현재성·빈틈·인계 계약
- `src/views/home/model/use-project-source-model.ts`: 선택·측정·원자적 저장·재측정
- `src-tauri/src/lib.rs`: Git tracked/unignored inventory와 bounded fingerprint
- `mcp/src/project-source-inspection.mjs`: 앱 fingerprint를 재현하는 비공개 로컬 probe
- `mcp/src/project-source-receipt.mjs`: private path를 제거한 `agent_brief` read model + sidecar 쓰기/제거
- `mcp/src/project-source-mint.mjs`: 앱·CLI·MCP가 공유하는 순수 영수증 발행
- `mcp/src/project-source-discovery.mjs`: 볼트 위치에서 소스 루트를 지명하는 bounded walk
- `mcp/src/project-source-inference.mjs`: 후보 순위·신뢰도·이유의 순수 정본
- `mcp/src/project-source-remedy.mjs`: 진단 action id → 실행 가능한 도구/명령/되돌리기
- `mcp/src/project-meaning-evidence.mjs` · `src/shared/lib/project-meaning-evidence.ts`:
  persisted competency source witness의 MCP·앱 동형 파생
- `mcp/src/project-meaning-inventory.mjs`: source receipt와 finalizer가 공유하는
  scoped evidence admission
- `mcp/src/meaning-assessment.mjs`: 수치 없이 false-green을 닫는 순수 의미 판정 정본
- `mcp/src/competency-coverage.mjs`: proposal과 새 프로세스 receipt가 공유하는
  quantified target/covered/uncovered 판정

## 경계

- 저장소 전체 정답률이나 숫자형 confidence를 주장하지 않는다.
- 한 project에 활성 소스는 최대 하나이며 중복 binding은 명시적 교체로만 복구한다.
- 추정은 제안까지다. 자동으로 확정하지 않는다. 틀린 루트가 `verified_current`를
  주장하는 영수증을 찍으면 `finalize_project_meaning`이 그것을 믿기 때문이다.
- 프로젝트 스코프가 불완전해 project graph hash를 못 찍으면 연결을 fail-closed 한다.
- 폴더 선택 취소·측정 실패·저장 실패는 기존 binding과 receipt를 보존한다.
- 현재 source와 오래된 competency provenance를 같은 source 결함으로 합치지 않는다.
- 재평가는 기존 typed witness를 자동 승인하거나 write/finalize하지 않으며 사람 승인을 유지한다.
