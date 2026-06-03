---
slug: src/views/docs-vault/ui/DocsVaultPage.tsx
kind: element
title: Source Vault Page
domain: vault-local-first
---

# Source Vault Page

`src/views/docs-vault/ui/DocsVaultPage.tsx` renders the `/docs` Source Vault surface.

It keeps the source record workspace quiet by making tree navigation opt-in through a drawer, routing graph evidence to the agent workflow/topology surfaces, and keeping local-vault file writes explicit.

The selected-record inspector is intentionally compact: primary actions stay as small icon controls, while outline, share/print, file management, and backlinks live behind disclosure sections. This keeps the human reading surface focused on the current markdown document while preserving graph navigation and source-record operations on demand.