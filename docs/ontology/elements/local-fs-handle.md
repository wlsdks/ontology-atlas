---
uid: e73d3580-a0a2-465f-9d86-9837f8cc4c35
slug: elements/local-fs-handle
kind: element
title: Local Fs Handle
display_ko: 로컬 파일시스템 핸들
domain: domains/local-vault-management
path: src/entities/local-fs-handle
created_by: "agent:unknown"
---

File System Access API handle entity. Evidence of implementation for capabilities/docs-vault-local.

## Evidence

- Primary implementation: `src/entities/local-fs-handle/api/permission.ts#verifyHandlePermission`
- Supporting implementation: `src/entities/local-fs-handle/api/store.ts#getLocalFsHandle`
- Focused test: `src/entities/local-fs-handle/api/store.test.ts#web FSA records with different folders both stay in the recent list`
