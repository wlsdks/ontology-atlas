---
slug: domains/project-portfolio
kind: domain
title: Project Portfolio Management
display_ko: 프로젝트 포트폴리오 관리
display_en: Project Portfolio Management
capabilities: [capabilities/project-edit, capabilities/project-quick-edit, capabilities/project-share]
elements: [elements/src/entities/project, elements/src/views/project-detail, elements/src/views/project-editor, elements/src/views/project-selector, elements/src/widgets/project-drawer]
---

## 정의
하나의 볼트 안에서 여러 project 노드를 목록화·조회·편집·공유하는 관리 영역.

## 근거
- AGENTS.md — Project overview (project/domain/capability/element kind 위계, 다중 프로젝트 컨테인먼트)
- src/features/project-edit, project-quick-edit, project-share (구현 증거)

## 포함 / 제외
- 포함: 프로젝트 상세/편집기/셀렉터, 빠른 편집, 공유 링크
- 제외: 프로젝트가 담는 도메인/능력 자체의 의미(그건 각자 도메인)

## 확신도
medium (0.7) — AGENTS.md 근거는 간접적, 주로 폴더 증거에 의존. 재검토 권장