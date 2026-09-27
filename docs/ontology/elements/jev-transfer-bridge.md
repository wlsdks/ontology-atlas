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

The native Jev transfer bridge keeps the user's TypeSafe key in the OS keychain and sends only an explicitly reviewed claim/evidence request to the fixed endpoint after reserving a local metadata receipt. Both the pasted-input entry and Library's current cited-pair preparation use this same boundary.

## Includes
- Keychain save, status, and verified deletion for the Jev key.
- Fixed-endpoint request validation, HTTP transfer, typed response parsing, and receipt finalization. The receipt does not retain the key or request text.

## Excludes
- Browser key storage, background selection of vault content, or automatic vault edits.
- Establishing that an input is semantically correct or that a response accepts meaning. Library's current-source guard and the person's evidence review remain separate responsibilities.

## Evidence
- `src-tauri/src/jev.rs` implements validation, audit reservation and transfer. `src/shared/lib/tauri-jev.ts` exposes that boundary to the two rendered entry points.

## Uncertainty
- Rust tests exercise validation, receipt reservation before sending, and parsing with a fake sender. One owner-authorized synthetic live request through the installed macOS app in PR #2059 returned contradicted; this replaces the earlier no-native-call note.
- That one synthetic observation does not qualify arbitrary claim judgments or live behavior on other platforms. The non-Unix audit-reservation test still requires refusal before transport, so the macOS observation does not establish a working Windows transfer. Audit failure remains a refusal to send; no acceptance or write authority is inferred from successful transport.
