---
uid: 1a523531-1db3-44e3-89f2-4f62ef713e0d
slug: elements/recent-vault-reachability
kind: element
title: Recent vault reachability
display_en: Recent vault reachability
display_ko: 최근 볼트 접근 가능성
domain: domains/human-workbench
path: src/features/vault-switch/model/use-recent-vault-reachability.ts
created_by: "agent:claude-code"
---

Checks whether each folder a person has opened before can still be opened now, so a remembered folder that has moved or lost permission says so instead of failing when clicked.

## Includes
- A per-row probe of whether the folder is reachable, and what the row should offer when it is not.
- Drawing the list once, from the check's first answer within a short deadline, so a row never flashes as unreachable before its answer arrives.

## Excludes
- Opening the folder.
- Remembering the list, which is stored elsewhere.

## Uncertainty
- Read from the feature barrel, which notes this hook is used only by the recent-folder list inside the feature. Its implementation was not read, and the difference between desktop absolute paths and browser handles was not exercised.
- Read 2026-09-26: `use-recent-vault-reachability.ts` itself (bundle #1883).
