---
slug: src/views/docs-vault/ui/DocsVaultPage.tsx
kind: element
title: Source Vault Page
domain: vault-local-first
---

# Source Vault Page

`src/views/docs-vault/ui/DocsVaultPage.tsx` renders the `/docs` Source Vault surface.

This surface is the human-facing document view over the same local markdown vault that MCP agents read and write. It keeps the current source, selected record, editor state, command palette, graph handoff copy, and local vault persistence in one page-level workflow.

The worktree drawer follows a low-complexity rule: the source tree is the primary navigation object, while pinned records, recent records, and tag filters are secondary saved views behind one `Filter & saved` disclosure. Folder branches start closed unless they contain the selected source record, so a large vault presents top-level structure before detail. A local search field narrows the tree to matching source records and auto-expands only the matching path, giving large vaults a fast way to reduce visual noise.

The drawer uses quiet native-sidebar density: minimal header chrome, readable folder labels, low-contrast saved-view rows, and soft tag chips only after the refinement disclosure opens, so the worktree does not compete with the document reading canvas.

The document inspector is also opt-in. Outline, share/print, file management, and backlinks are available from a small header button, but the right rail stays closed by default so the reader starts with one source record instead of three competing panels.

This supports the product contract that humans should understand one source record at a time, while graph evidence and agent workflows remain reachable without crowding the reading canvas.
