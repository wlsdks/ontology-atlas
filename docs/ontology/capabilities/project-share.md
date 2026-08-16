---
uid: 034ea9b5-5381-46c3-ae91-b1dc6ad8b184
slug: capabilities/project-share
kind: capability
title: Project Link Copy
domain: domains/project-portfolio
elements: []
path: src/features/project-share
created_by: "agent:unknown"
---

## 정의
프로젝트 상세 상단바나 드로어에서 현재 locale·basePath를 반영한 상세 URL을 만들어
클립보드에 복사하고 성공·실패 피드백을 주는 능력.

## 포함 / 제외
- 포함: 프로젝트 상세 URL 생성, clipboard 복사, 상태/토스트/aria-live 피드백,
  상세 상단바와 프로젝트 드로어 진입점.
- 제외: 권한·초대·만료·서버 저장·협업 공유, 목적지 접근성의 E2E 보증.

## 근거
- `src/features/project-share/ui/CopyProjectLinkButton.tsx`: URL 생성·복사·피드백
- `src/features/project-share/ui/CopyProjectLinkButton.test.tsx`: locale URL,
  slug 직렬화와 copy 호출 검증
- `src/views/project-detail/ui/ProjectDetailPage.tsx`와
  `src/widgets/project-drawer/ui/ProjectDrawer.tsx`: 두 사용자 진입점

## 확신도
medium: 핵심 URL·복사 단위 흐름은 검증됐지만 실제 clipboard/목적지 E2E는 미검증.
