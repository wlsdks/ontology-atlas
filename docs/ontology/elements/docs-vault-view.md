---
uid: a2b4089e-0496-4ad2-b09d-8f2bcefd9ce4
slug: elements/docs-vault-view
kind: element
title: Docs Vault (view)
display_ko: 문서함 (화면)
domain: domains/local-vault-management
path: src/views/docs-vault
created_by: "agent:unknown"
dependencies: [elements/docs-vault-entity]
relation_notes: { elements/docs-vault-entity: "The Docs workbench view reads documents and manifests through the docs-vault entity; src/views/docs-vault imports @/entities/docs-vault." }
---

/docs page. Implementation evidence for capabilities/docs-vault-local.

## Evidence

- Primary implementation: `src/views/docs-vault/ui/DocsVaultPage.tsx#DocsVaultPage`
- Supporting implementation: `src/views/docs-vault/ui/parts/DocFrontmatterBlock.tsx#DocFrontmatterBlock`
- Focused test: `src/views/docs-vault/ui/DocsVaultPage.vault-status-banner.test.ts#reads the source it is judging`
- Focused test: `src/views/docs-vault/ui/DocsVaultPage.vault-status-banner.test.ts#never interpolates a cause that may not exist`

## Includes

- The `/docs` page shell: document viewer chrome, frontmatter block display, and the local-vault starter CTA.
- Composing the docs-vault entity's manifest and the docs-vault widget's editor/backlinks panels into one page.

## Excludes

- Building the manifest or backlink data itself, owned by elements/docs-vault-entity.
- The actual markdown editing surface and tree navigation, owned by elements/docs-vault-widget.
- The quick-access drawer reachable from other routes, owned by elements/docs-quick-drawer.
