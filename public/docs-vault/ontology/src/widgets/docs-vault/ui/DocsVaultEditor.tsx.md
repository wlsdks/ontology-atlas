---
slug: src/widgets/docs-vault/ui/DocsVaultEditor.tsx
kind: element
title: Docs Vault Editor
domain: vault-local-first
---

# Docs Vault Editor

Markdown editor used by Source Vault for local `.md` files. It keeps file writes explicit through the Save button / Cmd+S, blocks silent overwrite on disk conflicts, and now stores unsaved edits as a browser-local temporary draft before final disk save.

This element supports the human-facing editing loop: draft safely, understand what is not on disk yet, then make the final local-first write deliberately.