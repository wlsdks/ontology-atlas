---
uid: 7a4d1bd8-9496-4b98-93ae-2ede8e623048
slug: elements/vault-source-import
kind: element
title: Vault source import
display_en: Vault source import
display_ko: 볼트 원본 가져오기
domain: domains/human-workbench
path: src/features/library/lib/add-sources.ts
created_by: "agent:claude-code"
---

Brings raw source documents into the open folder so later pages have originals to cite, with the same single action on the desktop app and in the browser.

## Includes
- Choosing files and copying them into the folder's sources directory.
- A summary of what landed and what was skipped.

## Excludes
- Converting or parsing what it imports; the files arrive as they are.
- Producing any page from them.

## Uncertainty
- Read from the module header and its imports of the desktop file bridge. The browser path was not traced, so whether the two surfaces really behave identically rests on the header's claim rather than on anything measured here.