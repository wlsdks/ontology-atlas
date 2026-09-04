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
