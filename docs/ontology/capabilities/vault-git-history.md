---
uid: 0ec083fe-79bd-4118-97a6-7bf411a9d0c9
slug: capabilities/vault-git-history
kind: capability
title: Vault Git history
display_en: Vault Git history
display_ko: 볼트 Git 이력
domain: domains/human-workbench
elements: []
path: src/views/git/index.ts
created_by: "agent:claude-code"
---

Shows the open vault folder's own Git status and history, and takes snapshot commits of it, so a change to recorded meaning stays inspectable as an ordinary diff.

## Includes
- Status and history for the vault folder, and snapshot commits scoped to it.
- Reading a past version of a meaning file as it stood at a commit.

## Excludes
- The analyzed product repository's own history; this is the meaning record's history, not the code's.
- Branching, merging, pushing, or any remote operation.

## Uncertainty
- Read from `src/views/git/`, `src/widgets/atlas-git-panel/`, `mcp/src/git-tools.mjs` and `src-tauri/src/git.rs` by name, plus the repository's note that a browser has no right to run Git and degrades to a card. No commit or snapshot was taken during this scan.