---
uid: 5cd03c77-f1ed-448f-bb17-c4c3c804418a
slug: capabilities/data-source-mode
kind: capability
title: Data Source Mode Branching
display_ko: 데이터 출처 모드 분기
domain: domains/local-vault-management
elements: []
path: src/features/data-source-mode
created_by: "agent:unknown"
---

## Definition
The ability to keep one authoritative data source across the shared web/app bundle. A vault-less web visitor may use an explicit bundled sample; a mounted web vault and the installed app use one local manifest. The installed app remains neutral during restore, folder switches, and the pre-paint turn of an LNB route change, so static sample facts are never drawn over a local vault.

## Evidence
- src/features/data-source-mode (implementation evidence)
- docs/FEATURES.md: "Mode branching (data source)" section (Note: risky-citation warning: includes negated/deprecated-state descriptions; requires re-verification)

## Confidence
medium-high (0.85): However, the citation from docs/FEATURES.md needs freshness verification.
