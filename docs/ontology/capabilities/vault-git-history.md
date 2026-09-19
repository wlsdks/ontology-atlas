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
- Reading older history one page at a time from the end of the list, and stating when the first commit has been reached.
- Following the loaded vault while the screen is open: the desktop file watcher's `vault-changed` event triggers a read-only re-read of status, diff and history.
- Showing an automatic `ontology snapshot` subject in the reader's language wherever it is drawn, with the raw subject kept as the audit trail.
- Listing, inside a commit's detail, the other commits that changed the focused document (`git_history` scoped to one path) and jumping to any of them, reading the list deeper when needed.
- Restoring exactly one document from the screen behind a confirm that names what is lost: discarding its uncommitted changes (`git_restore_file` with `HEAD`) or bringing back a past commit's version, which lands as an uncommitted change. The command refuses a path outside the vault, a never-committed document, a source without the document, and a source whose `uid`, `slug`, or `merged_uids` differs from the file on disk.
- The `/git` destination and its honest browser degradation when no folder is mounted.
- Copying a history entry's hash and time for a handoff.

## Excludes

- Committing or pushing vault changes (`git_snapshot` and the CLI `snapshot` command belong to the agent write flow and the CLI, not this screen).
- Restoring more than one document at once, or restoring through MCP or ACP: `git_restore_file` is an app-only command, and joining the agent surface would be its own decision.
- The rail badge with the uncommitted-change count, owned by elements/app-nav-rail.
- Ontology change review and write approval, owned by elements/ontology-change-review.

## Confidence

medium-high (0.8): both elements and the MCP git tool rows exist; the capability name is proposed here and reviewed through this change.
