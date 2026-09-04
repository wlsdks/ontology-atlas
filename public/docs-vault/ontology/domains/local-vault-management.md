---
uid: 48bf1a02-e1f8-4b8c-b06e-d6f261466109
slug: domains/local-vault-management
kind: domain
title: Local Vault & Data Source Management
display_ko: 로컬 볼트 및 데이터소스 관리
display_en: Local Vault & Data Source Management
capabilities: [capabilities/data-source-mode, capabilities/docs-vault-local, capabilities/project-data-source, capabilities/vault-git-history, capabilities/vault-sample-source]
elements: [elements/atlas-git-panel, elements/docs-vault-entity, elements/docs-vault-view, elements/docs-vault-widget, elements/git, elements/local-fs-handle, elements/native-vault-filesystem-bridge, elements/private-vault-sidecar-boundary]
created_by: human
relation_notes: { elements/native-vault-filesystem-bridge: The native vault filesystem bridge is a direct implementation element of the local vault/data source domain. }
---

## Definition
A local-first, backend-0 data source layer that selects markdown folders on the local disk (File System Access API), uses git as the source of truth, and provides demo sample vaults.

## Evidence
- README.md: "A folder of Markdown files. Each file's frontmatter declares what it is... That is the whole database."
- docs/ARCHITECTURE.md: "There is no backend, no server database, no auth provider. The user's markdown folder is the single source of truth." (risky-citation warning: cite alongside README.md for mutual verification)

## Inclusion / Exclusion
- Included: Folder selection, mode branching (vault-picked vs static/sample), active project determination, sample vaults
- Excluded: The graph editing UI itself (Studio handles graph-modeling)

## Confidence
high (0.9): Direct README citation + cross-reference with independent source (ARCHITECTURE.md)
