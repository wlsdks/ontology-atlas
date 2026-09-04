---
uid: 572f5a65-1313-43ee-b0ba-df9202426306
slug: capabilities/vault-git-history
kind: capability
title: Vault Git History
display_ko: 볼트 기록
domain: domains/local-vault-management
elements: [elements/atlas-git-panel, elements/git]
path: src/widgets/atlas-git-panel
created_by: "agent:claude"
dependencies: [capabilities/docs-vault-local]
relation_notes: { capabilities/docs-vault-local: "History is read from the mounted vault folder; without a mounted local vault there is no repository to read, so the History screen degrades to setup guidance." }
---

## Definition

The ability to see what changed in the vault and when: the History destination and its panel read the vault-scoped Git status, snapshot summary, and commit history through the installed app and the read-only MCP git tools (`git_status`, `git_history`), and show them as concept-level changes a person can review. In a browser without a mounted folder the screen explains that Git runs in the app and offers the setup path instead of an empty history.

## Evidence

- src/widgets/atlas-git-panel (status, snapshot, expandable history entries)
- src/views/git (the `/git` destination composing the panel)
- mcp/README.md rows for `git_status`, `git_history`, `git_snapshot`

## Includes

- Reading and rendering vault-scoped Git status, snapshot summary, and newest-first history with changed concepts per entry.
- The `/git` destination and its honest browser degradation when no folder is mounted.
- Copying a history entry's hash and time for a handoff.

## Excludes

- Committing or pushing vault changes (`git_snapshot` and the CLI `snapshot` command belong to the agent write flow and the CLI, not this screen).
- The rail badge with the uncommitted-change count, owned by elements/app-nav-rail.
- Ontology change review and write approval, owned by elements/ontology-change-review.

## Confidence

medium-high (0.8): both elements and the MCP git tool rows exist; the capability name is proposed here and reviewed through this change.
