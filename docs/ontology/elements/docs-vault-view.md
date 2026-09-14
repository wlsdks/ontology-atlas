---
uid: a2b4089e-0496-4ad2-b09d-8f2bcefd9ce4
slug: elements/docs-vault-view
kind: element
title: Docs Vault (view)
display_ko: 온톨로지 문서 (화면)
domain: domains/local-vault-management
path: src/views/docs-vault
created_by: "agent:unknown"
dependencies: [elements/docs-vault-entity]
relation_notes: { elements/docs-vault-entity: "The Docs workbench view reads documents and manifests through the docs-vault entity; src/views/docs-vault imports @/entities/docs-vault." }
---

The ontology document workbench inside Library. It exposes only explicitly typed ontology nodes in Library, while an exact non-ontology legacy link opens a single-document compatibility reader. Implementation evidence for capabilities/docs-vault-local.

## Evidence

- Composition and tab/deep-link/draft round trip: `tests/e2e/library-workspace.spec.ts`
- Strict kind scope, state isolation, and exact-document compatibility: `tests/e2e/library-ontology-scope.spec.ts`

- Primary implementation: `src/views/docs-vault/ui/DocsVaultPage.tsx#DocsVaultPage`
- Supporting implementation: `src/views/docs-vault/ui/parts/DocFrontmatterBlock.tsx#DocFrontmatterBlock`
- Focused test: `src/views/docs-vault/ui/DocsVaultPage.vault-status-banner.test.ts#reads the source it is judging`
- Focused test: `src/views/docs-vault/ui/DocsVaultPage.vault-status-banner.test.ts#never interpolates a cause that may not exist`

## Includes

- The existing ontology page shell, composed by `src/app/library-workspace/index.tsx#LibraryWorkspace` at `/library/?tab=ontology`: its list, tree, search, counts, saved working sets, defaults, and creation stay within the five explicit authorable kinds.
- The bounded `/docs/?slug=…` compatibility entry for one exact non-ontology document, with a general Document identity and a clean return to Library; it has no generic document home.
- Composing the docs-vault entity's manifest and the docs-vault widget's editor/backlinks panels into one page.

## Excludes

- Building the manifest or backlink data itself, owned by elements/docs-vault-entity.
- The actual markdown editing surface and tree navigation, owned by elements/docs-vault-widget.
- The quick-access drawer reachable from other routes, owned by elements/docs-quick-drawer.
