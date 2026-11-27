---
uid: 92925ef6-26b9-4b93-8001-5e6298cc90b8
slug: capabilities/vault-folder-session
kind: capability
title: Vault folder session
display_en: Vault folder session
display_ko: 볼트 폴더 세션
domain: domains/human-workbench
elements: [elements/recent-vault-reachability]
path: src/features/vault-switch/ui/RecentVaultList.tsx
created_by: "agent:claude-code"
relation_notes: { elements/recent-vault-reachability: "You asked me to turn imports I actually witnessed into dependencies: the vault-switch barrel records that this hook is used by RecentVaultList, the list this capability shows." }
dependencies: [elements/recent-vault-reachability]
---

Chooses which local folder is the open vault, remembers the folders a person has used, and lets them move between those folders without losing where they were.

## Includes
- The folder chooser, the list of known folders with their contents and last use, and the switcher in the rail.
- Resuming the one known folder on launch; with two or more known, the launch stops at the chooser and reads none of them.
- Folders that can no longer be found gathered into one quiet line at the end of the known-folder list, where they are reviewed and forgotten only when the person presses it, while live folders stay first.

## Excludes
- Reading or interpreting what is inside the folder once it is open.
- Syncing or copying a folder anywhere; the folder stays on the person's disk.

## Uncertainty
- Read from `src/features/vault-switch/` and `src/entities/local-fs-handle/` by layout plus the capability table in `docs/FEATURES.md`. A remembered folder is kept with its absolute path, which the launch chooser probes; the website keeps no folder record, and a record left by the old browser workbench is deleted at the next visit. Neither was exercised in the installed app for this revision.
- Re-read 2026-09-26: `src/features/vault-switch/ui/RecentVaultList.tsx` (bundle #1883).
