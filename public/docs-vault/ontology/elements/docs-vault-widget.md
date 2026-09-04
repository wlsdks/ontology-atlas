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
