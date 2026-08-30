---
uid: 2f1761bb-5498-4675-9c45-099709bb6c2b
slug: capabilities/docs-vault-local
kind: capability
title: Local Folder Mounting
display_ko: 내 폴더 열기
domain: domains/local-vault-management
elements: [elements/docs-vault-entity, elements/docs-vault-view, elements/docs-vault-widget, elements/local-fs-handle, elements/native-vault-filesystem-bridge, elements/private-vault-sidecar-boundary]
path: src/features/docs-vault-local
created_by: human
relation_notes: { elements/native-vault-filesystem-bridge: The local folder mount of the installed app is evidence of native implementation performing actual file/directory mutation. }
---

## Definition
The ability to select, restore, and reopen one local Markdown vault as the real-time source of truth. On desktop, picker, recent-vault, and cold-restore ingress apply the same rule: when a selected project contains Markdown under `<project>/atlas`, that child is persisted and built as the canonical vault; direct standalone vault folders remain valid. A new manifest replaces the old source atomically rather than combining roots or falling back to a bundled sample.

## Evidence
- src/features/docs-vault-local (entry UI: open/create/guide/starter actions)
- src/entities/vault-session/model/use-local-vault.ts and LocalVaultProvider.tsx (the mounted vault's session state; moved out of the feature on 2026-08-30 because every vault-reading feature depends on it)

## Confidence
high (0.9): Consistent with local-first principle documentation
