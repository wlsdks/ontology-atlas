---
uid: b8a4b1ad-616b-4230-b206-9efa6292d217
slug: capabilities/project-edit
kind: capability
title: Project Form Editing
domain: domains/project-portfolio
elements: [elements/project-editor]
path: src/features/project-edit
created_by: "agent:unknown"
---

## 정의
project의 주요 필드를 검증해 생성·수정·복제·삭제하고, 새 프로젝트나 분류 변경 때
category 경계와 겹침을 고려해 위치를 자동 배치하는 폼 편집 능력.

## 포함 / 제외
- 포함: 폼 검증·직렬화, 일정과 taxonomy 보존, 생성/수정/복제/삭제, 자동 배치.
- 제외: 수동 position·containment 편집, screenshot upload, MCP/agent 쓰기 경로.

## 근거
- `src/features/project-edit/ui/ProjectForm.tsx`: 검증·직렬화·submit 흐름
- `src/features/project-edit/model/schema.ts`와 `schema.test.ts`: 필드·일정 직렬화와
  누락 taxonomy 보존
- `src/features/project-edit/model/placement.ts`와 `placement.test.ts`: category 경계,
  겹침, 수리 배치
- `src/views/project-editor/ui/ProjectEditorPage.tsx`: 생성·수정·복제·삭제 연결

## 확신도
medium: 폼·schema·배치 단위 근거는 있으나 실제 hook→vault 통합 E2E는 미검증.
