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

## Includes

- Querying and re-requesting File System Access API permission state for a directory or file handle.
- Treating an undefined `queryPermission`/`requestPermission` result as granted for compatibility with older browser polyfills.
- Persisting multiple distinct web FSA handles as separate recent-vault records.

## Excludes

- The native Tauri filesystem bridge used by the installed app instead of the browser FSA API, owned by elements/native-vault-filesystem-bridge.
- Building the vault manifest once a handle is granted, owned by elements/docs-vault-entity.
- Choosing which handle is active/current: that is vault-session state, not this permission entity.
