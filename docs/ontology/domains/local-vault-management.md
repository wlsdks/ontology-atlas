---
uid: 48bf1a02-e1f8-4b8c-b06e-d6f261466109
slug: domains/local-vault-management
kind: domain
title: "Local Vault & Data Source Management"
display_ko: 로컬 볼트 및 데이터소스 관리
display_en: "Local Vault & Data Source Management"
capabilities: [capabilities/data-source-mode, capabilities/docs-vault-local, capabilities/project-data-source, capabilities/vault-git-history, capabilities/vault-sample-source]
elements: [elements/atlas-git-panel, elements/docs-vault-entity, elements/docs-vault-view, elements/docs-vault-widget, elements/git, elements/local-fs-handle, elements/native-vault-filesystem-bridge, elements/private-vault-sidecar-boundary]
created_by: human
relation_notes: { capabilities/data-source-mode: "One authoritative source has to be decided per turn so that bundled sample facts are never drawn over a mounted local folder during restore, a folder switch, or a route change.", capabilities/docs-vault-local: "Selecting, restoring, and reopening one local Markdown folder is how a person makes their own disk the live source of truth.", capabilities/project-data-source: "Project lists and bodies are read from the selected folder or the static sample, and creating or editing a project is allowed only when a local folder is mounted.", capabilities/vault-git-history: "Git is the record of what changed in the mounted folder and when, and this is where a person reads that record as concept-level changes.", capabilities/vault-sample-source: "A web visitor who has chosen no folder still needs something to read, and the bundled example is that source, offered on the web alone.", elements/atlas-git-panel: "The panel renders the vault-scoped status, snapshot summary, and expandable history entries a person reviews.", elements/docs-vault-entity: "It builds the manifest, tree, and frontmatter backlinks from the parsed Markdown, which is the data model every vault read starts from.", elements/docs-vault-view: "The /docs page is where a mounted folder's documents are actually opened and read.", elements/docs-vault-widget: "The editor, tree navigation, and backlinks panel are where a person edits a mounted folder's Markdown, with conflict detection on save.", elements/git: "The /git destination gives the vault's read-only history a first-class address for every audience.", elements/local-fs-handle: "Browser permission for a chosen directory handle is what makes a folder readable at all, and it keeps several recent folders apart.", elements/native-vault-filesystem-bridge: The native vault filesystem bridge is a direct implementation element of the local vault/data source domain., elements/private-vault-sidecar-boundary: "Private receipts and activity logs sit beside the Markdown under `.ontology-atlas`, and this boundary keeps those writes inside the real vault folder." }
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
