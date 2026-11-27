---
uid: 7a4d1bd8-9496-4b98-93ae-2ede8e623048
slug: elements/vault-source-import
kind: element
title: Vault source import
display_en: Vault source import
display_ko: 볼트 원본 가져오기
domain: domains/human-workbench
path: src/features/library/lib/sources/add-sources.ts
created_by: "agent:claude-code"
---

Brings raw source documents into the open folder so later pages have originals to cite, with one action in the desktop app.

## Includes
- Choosing files and copying them into the folder's sources directory.
- A summary of what landed and what was skipped.

## Excludes
- Converting or parsing what it imports; the files arrive as they are.
- Producing any page from them.

## Uncertainty
- Read from the module header and its imports of the desktop file bridge. The copy runs in the app through the native source picker and importer; it was not run against the installed app for this revision.