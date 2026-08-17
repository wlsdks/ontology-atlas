---
uid: 2f1761bb-5498-4675-9c45-099709bb6c2b
slug: capabilities/docs-vault-local
kind: capability
title: Local Folder Mounting
domain: domains/local-vault-management
elements: [elements/docs-vault-entity, elements/docs-vault-view, elements/docs-vault-widget, elements/local-fs-handle, elements/native-vault-filesystem-bridge]
path: src/features/docs-vault-local
created_by: human
relation_notes: { elements/native-vault-filesystem-bridge: 설치 앱의 로컬 폴더 마운트가 실제 파일·디렉터리 mutation을 수행하는 네이티브 구현 증거다. }
---

## 정의
File System Access API로 로컬 마크다운 폴더를 선택·마운트해 실시간 데이터소스로 삼는 능력.

## 근거
- src/features/docs-vault-local (구현 증거)

## 확신도
high (0.9): local-first 원칙 문서와 정합
