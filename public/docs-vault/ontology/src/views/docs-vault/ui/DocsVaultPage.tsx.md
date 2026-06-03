---
slug: src/views/docs-vault/ui/DocsVaultPage.tsx
kind: element
title: Source Vault Page
domain: vault-local-first
---

# Source Vault Page

`src/views/docs-vault/ui/DocsVaultPage.tsx` renders the `/docs` Source Vault surface.

The page is the human reading and local markdown navigation lane: source tree, selected source record, local/sample source switch, palette, and vault tools. It keeps Files / Graph / Agent execution context behind a compact `Source status` popover instead of showing a numbered 01 / 02 / 03 flow in the first viewport.

This keeps the document surface calm while preserving the graph handoff: Files prove local markdown source, Graph opens the compiled ontology view, and Agent exposes the copyable graph DB runtime gate for Claude Code, Codex, Cursor, or terminal fallback.