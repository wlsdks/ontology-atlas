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

`abilities`와 `evidence`처럼 질문에 `each`가 들어간 자격은 witness 종류가 한 번
등장했다는 이유만으로 통과하지 않는다. 현재 project→domain→capability containment에서
대상 집합을 파생해, `abilities`는 모든 domain의 typed capability relation을,
`evidence`는 모든 capability의 concept/path 근거를 덮어야 `answered`다. 빠진 slug는
미해소 대상으로 남고 `partial`/`visible-gap`은 계속 유효한 중간 상태다.

## 근거

- `src/shared/lib/project-source-receipt.ts` — 영수증·현재성·빈틈·인계 계약
- `src/views/home/model/use-project-source-model.ts` — 선택·측정·원자적 저장·재측정
- `src-tauri/src/lib.rs` — Git tracked/unignored inventory와 bounded fingerprint
- `mcp/src/project-source-inspection.mjs` — 앱 fingerprint를 재현하는 비공개 로컬 probe
- `mcp/src/project-source-receipt.mjs` — private path를 제거한 `agent_brief` read model
- `mcp/src/meaning-assessment.mjs` — 수치 없이 false-green을 닫는 순수 의미 판정 정본
- `mcp/src/competency-coverage.mjs` — proposal과 새 프로세스 receipt가 공유하는
  quantified target/covered/uncovered 판정

## 경계

- 저장소 전체 정답률이나 숫자형 confidence를 주장하지 않는다.
- 한 project에 활성 소스는 최대 하나이며 중복 binding은 명시적 교체로만 복구한다.
- 폴더 선택 취소·측정 실패·저장 실패는 기존 binding과 receipt를 보존한다.
- 저장된 typed competency를 다시 읽는 계약 전에는 의미 판정을 UI·CLI·MCP 공개
  필드로 노출하지 않는다.
