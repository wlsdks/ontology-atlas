---
uid: 6b2e10a4-b30f-405a-a02f-90ccc4d471a0
slug: capabilities/project-quick-edit
kind: capability
title: Project Quick Edit Dialog
domain: domains/project-portfolio
elements: []
path: src/features/project-quick-edit
created_by: "agent:unknown"
---

## 정의
전체 편집기로 이동하지 않고 프로젝트 상세의 우측 다이얼로그에서 이름·설명·소유자·
태그를 수정·적용하거나 되돌리는 능력.

## 포함 / 제외
- 포함: editable 상세 화면의 네 필드, 이름 필수 검증, 적용/되돌리기, 성공·실패 상태.
- 제외: read-only/static 모드, category·status·timeline·관계 편집, persistence 통합 보증.

## 근거
- `src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx`: dialog, 네 필드,
  patch payload와 상태 처리
- `src/views/project-detail/ui/ProjectDetailPage.tsx`: `canEdit` 렌더 gate
- `src/views/project-detail/ui/ProjectDetailPage.test.tsx`: 편집 가능 여부와 panel 노출 검증

## 확신도
medium: 구현과 caller gate는 검증됐지만 실제 vault 기록을 포함한 전용 통합 테스트는 미확인.
