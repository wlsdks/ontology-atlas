---
uid: ef8e3784-815c-4201-ad2e-f8d799af737a
slug: elements/docs-vault-entity
kind: element
title: Docs Vault (entity)
display_ko: 문서함 (엔티티)
domain: domains/local-vault-management
path: src/entities/docs-vault
created_by: "agent:unknown"
---

Vault data model entity. Implementation evidence for capabilities/docs-vault-local.

## Evidence

- Primary implementation: `src/entities/docs-vault/lib/build-local-manifest.ts#buildLocalManifest`
- Supporting implementation: `src/entities/docs-vault/lib/build-vault-markdown.ts#buildVaultMarkdown`
- Focused test: `src/entities/docs-vault/lib/build-local-manifest.backlinks.test.ts#counts folder-prefixed frontmatter refs (dependencies/relates/describes) as backlinks to the target doc`
- Focused test: `src/entities/docs-vault/lib/build-local-manifest.backlinks.test.ts#does NOT mint phantom backlinks for element/file-path refs that match no doc slug`

## Includes

- Building the local vault manifest (documents, tree, backlinks) from parsed Markdown frontmatter.
- Computing frontmatter-based backlinks across the relation reference keys (`domains`, `capabilities`, `elements`, `dependencies`, `relates`, `contains`, `describes`, `domain`), matching the MCP `find_backlinks` key set.
- Serializing a document back to vault Markdown (`buildVaultMarkdown`).

## Excludes

- Rendering the manifest as UI: the entity only builds the data model; elements/docs-vault-view and elements/docs-vault-widget render it.
- File system access itself (opening, reading, writing handles), owned by elements/local-fs-handle.
- The build-time dogfood manifest fallback, generated separately by `scripts/build-docs-vault.mjs`.
