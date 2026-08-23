---
uid: 2f1761bb-5498-4675-9c45-099709bb6c2b
slug: capabilities/docs-vault-local
kind: capability
title: Local Folder Mounting
domain: domains/local-vault-management
elements: [elements/docs-vault-entity, elements/docs-vault-view, elements/docs-vault-widget, elements/local-fs-handle, elements/native-vault-filesystem-bridge, elements/private-vault-sidecar-boundary]
path: src/features/docs-vault-local
created_by: human
relation_notes: { elements/native-vault-filesystem-bridge: The local folder mount of the installed app is evidence of native implementation performing actual file/directory mutation. }
---

## Definition
The ability to select and mount a local markdown folder via the File System Access API, using it as a real-time data source.

## Evidence
- src/features/docs-vault-local (implementation evidence)

## Confidence
high (0.9): Consistent with local-first principle documentation
