---
slug: src/views/docs-vault/ui/DocsVaultPage.tsx
kind: element
title: Source Vault Page
domain: vault-local-first
---

`src/views/docs-vault/ui/DocsVaultPage.tsx` renders the `/docs` Source Vault surface.

The page is the quiet document/work surface for local-first source records. It keeps the Source Vault tree as an opt-in drawer instead of a permanent desktop sidebar, so the first viewport is not dominated by hierarchy chrome. When no document is selected, the empty state presents three low-density actions: open the Source tree, open the agent workflow guide, or jump to Topology for graph evidence.

The same surface still preserves the local-first contract: sample vs local source selection, explicit vault tools, graph DB runtime proof, and local markdown editing through the Source Vault editor.