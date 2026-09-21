---
uid: 85047a40-bbc7-40b1-8da9-666b3439dd49
slug: elements/change-summary-headline
kind: element
title: Change summary headline
display_en: Change summary headline
display_ko: 변경 요약 제목
domain: domains/human-workbench
path: src/features/ontology-change-review/lib/change-summary.ts
created_by: "agent:claude-code"
---

Turns a proposed frontmatter change into one plain sentence naming what would change, so the decision a person is asked to make is legible before they read the diff.

## Includes
- The headline shown on the review card, and the readable name for each changed field.

## Excludes
- The decision itself.
- Rendering the full difference.

## Uncertainty
- Read from the feature's barrel comment, which states only two of this module's functions cross the feature boundary and the rest are internal. The implementation was not read, and no review card was rendered.