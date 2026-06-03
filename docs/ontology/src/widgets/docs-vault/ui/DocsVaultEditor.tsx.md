---
slug: src/widgets/docs-vault/ui/DocsVaultEditor.tsx
kind: element
title: Docs Vault Editor
domain: vault-local-first
---

# Docs Vault Editor

Markdown editor used by Source Vault for local `.md` files.

It keeps file writes explicit through the Save button / Cmd+S, blocks silent overwrite on disk conflicts, and stores unsaved edits as a browser-local temporary draft before final disk save.

The editor now exposes that contract in the UI as two separate states: Auto backup and Final save. Auto backup explains whether an unsaved browser-local draft exists for recovery, while Final save explains whether the current markdown has actually been written back to the vault file. This keeps human edits, local autosave recovery, and AI-agent/external file changes understandable without treating a browser draft as the source of truth.
