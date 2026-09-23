---
uid: f184c992-45bc-4cfc-bd3e-4e1c957591f6
slug: elements/jev-transfer-bridge
kind: element
title: Jev transfer bridge
display_en: Jev transfer bridge
display_ko: Jev 전송 연결
domain: domains/human-workbench
path: src-tauri/src/jev.rs
created_by: "agent:codex-mcp-client"
---

The Jev transfer bridge keeps the user's TypeSafe key in macOS Keychain and sends only the explicitly previewed claim and evidence to the fixed Jev endpoint after reserving a local metadata receipt.

## Includes
- Keychain save, status, and verified deletion for the Jev key.
- Fixed-endpoint request validation, HTTP transfer, response parsing, and receipt finalization.

## Excludes
- Browser storage of a key or automatic vault edits.
- Judging whether the response is correct; the person reads the evidence.

## Uncertainty
- The installed app's Keychain persistence was verified with a temporary key; a native live Jev HTTP call with a real claim was not run. The source-only synthetic probe exercised the documented endpoint separately.