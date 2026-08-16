---
uid: 0563e7ee-3818-4bbd-97fa-4035ad43a03d
slug: capabilities/project-data-source
kind: capability
title: Project Data Access
domain: domains/local-vault-management
elements: [elements/project]
path: src/features/project-data-source
created_by: "agent:unknown"
---

## 정의
선택한 local vault 또는 정적 샘플에서 프로젝트 목록과 본문을 읽고, local 모드에서만
프로젝트 생성·수정·부분수정·삭제 권한을 제공하는 데이터 접근 경계.

## 포함 / 제외
- 포함: manifest 목록 파생, slug별 본문 lazy read, local/static 분기, local CRUD gate.
- 제외: 단일 활성 프로젝트 선택 상태, ontology 관계 판정, 정적 샘플 쓰기.

## 근거
- `src/features/project-data-source/model/use-projects.ts`: local/static 목록 분기
- `src/features/project-data-source/model/use-project-body.ts`: static asset 또는 local
  file handle 본문 읽기
- `src/features/project-data-source/model/use-project-mutations.ts`: CRUD와 static 쓰기 차단
- `src/features/project-data-source/model/use-project-mutations.test.ts`: 경로·key 보존,
  rename, 중복, UUID, 삭제 검증
- `src/views/project-detail/ui/ProjectDetailPage.test.tsx`: 본문 fallback 우선순위 검증

## 확신도
medium: 구현·mutation 테스트·소비자 테스트는 있으나 목록/본문 hook의 직접 통합 검증은 제한적.
