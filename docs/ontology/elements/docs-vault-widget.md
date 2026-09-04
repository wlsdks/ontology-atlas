---
uid: ad381f17-ccc6-4ce5-b6e7-2141e487781d
slug: elements/docs-vault-widget
kind: element
title: Docs Vault (widget)
display_ko: 문서함 (위젯)
domain: domains/local-vault-management
path: src/widgets/docs-vault
created_by: "agent:unknown"
---

Vault tree/list UI widget. Implementation evidence for capabilities/docs-vault-local.

## Evidence

- Primary implementation: `src/widgets/docs-vault/ui/DocsVaultEditor.tsx#DocsVaultEditor`
- Supporting implementation: `src/widgets/docs-vault/ui/DocsVaultBacklinks.tsx#DocsVaultBacklinks`
- Focused test: `src/widgets/docs-vault/lib/server-doc-content.test.ts#includes root and relative static-export candidates for locale docs routes`
- Focused test: `src/widgets/docs-vault/lib/server-doc-content.test.ts#encodes path segments without flattening nested slugs`

## Includes

- The document editor (markdown toolbar, mention-relation autocomplete, save with `expectedMtime` conflict detection) and its tree/list navigation.
- The backlinks panel showing documents referencing the open document.
- Static-export-compatible content resolution for locale-prefixed docs routes.

## Excludes

- Building the vault manifest or backlink data, owned by elements/docs-vault-entity.
- The page-level shell and frontmatter block composition, owned by elements/docs-vault-view.
- The quick-access drawer used for jumping to a document from elsewhere, owned by elements/docs-quick-drawer.
