---
slug: src/views/docs-vault/ui/DocsVaultPage.tsx
kind: element
title: Source Vault Page
domain: vault-local-first
---

# Source Vault Page

`src/views/docs-vault/ui/DocsVaultPage.tsx` renders the `/docs` Source Vault surface.

This surface is the human-facing document view over the same local markdown vault that MCP agents read and write. It keeps the current source, selected record, editor state, command palette, graph handoff copy, and local vault persistence in one page-level workflow.

The worktree drawer follows a low-complexity rule: the source tree is the primary navigation object, while pinned records, recent records, and tag filters are secondary saved views that stay collapsed until requested. Folder branches start closed unless they contain the selected source record, so a large vault presents top-level structure before detail.

This supports the product contract that humans should understand one source record at a time, while graph evidence and agent workflows remain reachable without crowding the reading canvas.