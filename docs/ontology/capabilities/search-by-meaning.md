---
uid: 6711d9f1-8020-4103-9d00-76b1c545450f
slug: capabilities/search-by-meaning
kind: capability
title: Search by meaning
display_en: Search by meaning
display_ko: 의미 검색
domain: domains/human-workbench
elements: []
path: src/features/vault-vectors/model/use-vector-search.ts
created_by: "agent:claude-code"
---

Finds passages in the open folder by what they say, not only by shared words, and lists them on the Library's Wiki desk beside word matches. The installed app turns each passage into a vector with a built-in model, or with a model the person already runs on this computer, and keeps the vectors in the OS cache.

## Includes
- The built-in model fetched only by a preparation that carries the consent dialog's press; any other pass that finds it absent ends without fetching (`src-tauri/src/vault/vectors/job.rs:L643-L647`). The app side asks through `src-tauri/src/vault/vectors/commands.rs`.
- Background preparation with a Stop that holds across restarts, shown in the long-work card and the Library rail ring.
- Word and meaning results fused by reciprocal rank, each row naming its reason.
- Settings rows that list and delete the vectors and the model.

## Excludes
- The web build.
- Sending folder text or vectors off this computer.

## Uncertainty
- Measured with local model files and a local runner; the in-app download was not run. Windows paths are exercised only by CI.
