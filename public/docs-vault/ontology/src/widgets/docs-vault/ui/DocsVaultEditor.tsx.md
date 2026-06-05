---
slug: src/widgets/docs-vault/ui/DocsVaultEditor.tsx
kind: element
title: Docs Vault Editor
domain: vault-local-first
---

# Docs Vault Editor

Markdown editor used by Source Vault for local `.md` files.

It keeps file writes explicit through the Save button / Cmd+S, blocks silent overwrite on disk conflicts, and stores unsaved edits as a browser-local temporary draft before final disk save.

The editor exposes that contract in the UI as separate Auto backup and Final save states. Auto backup explains whether an unsaved browser-local draft exists for recovery, while Final save explains whether the current markdown has actually been written back to the vault file. This keeps human edits, local autosave recovery, and AI-agent/external file changes understandable without treating a browser draft as the source of truth.

The editor now also shows a compact Save -> Verify -> Revert workflow rail on wide screens. It reminds users that vault validation reads the disk version, so unsaved browser drafts must be saved before `docs-vault` checks or `ontology-atlas validate` can prove the change. It also makes the discard path explicit: Cancel removes the browser draft, while the final recovery mechanism after disk save is the repository's git diff/history.
