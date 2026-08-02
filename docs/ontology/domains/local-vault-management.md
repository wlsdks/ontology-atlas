---
uid: 48bf1a02-e1f8-4b8c-b06e-d6f261466109
slug: domains/local-vault-management
kind: domain
title: Local Vault & Data Source Management
display_ko: 로컬 볼트 및 데이터소스 관리
display_en: Local Vault & Data Source Management
capabilities: [capabilities/data-source-mode, capabilities/docs-vault-local, capabilities/project-data-source, capabilities/vault-sample-source]
elements: [elements/atlas-git-panel, elements/docs-vault-entity, elements/docs-vault-view, elements/docs-vault-widget, elements/git, elements/local-fs-handle]
created_by: human
---

## 정의
로컬 디스크의 마크다운 폴더를 고르고(File System Access API), git을 진실원으로 쓰며, 데모용 샘플 볼트를 제공하는 로컬-퍼스트·백엔드 0 데이터소스 계층.

## 근거
- README.md — "A folder of Markdown files. Each file's frontmatter declares what it is... That is the whole database."
- docs/ARCHITECTURE.md — "There is no backend, no server database, no auth provider. The user's markdown folder is the single source of truth." (risky-citation 경고 — README.md와 함께 인용하여 상호 검증)

## 포함 / 제외
- 포함: 폴더 선택, 모드 분기(vault-picked vs static/sample), 활성 프로젝트 판정, 샘플 볼트
- 제외: 그래프 편집 UI 자체(Studio는 graph-modeling)

## 확신도
high (0.9) — README 직접 인용 + 독립 소스(ARCHITECTURE.md) 대조