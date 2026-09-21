---
uid: 69bf4188-50c7-44a9-b0ce-58fc1072ba62
slug: elements/map-density-gate
kind: element
title: Map density gate
display_en: Map density gate
display_ko: 지도 밀도 게이트
domain: domains/human-workbench
path: src/widgets/ontology-map/model/density-gate.ts
created_by: "agent:claude-code"
---

Decides how much detail the map shows at the current altitude, so a wide view stays readable instead of becoming a wall of labels.

## Includes
- The thresholds at which labels, clusters and individual nodes appear or fold away.

## Excludes
- Deciding which nodes exist; it gates what is shown, never what is there.
- The label placement itself.

## Uncertainty
- Witnessed as a type-only import of the frame loop, which means the values it defines may be consumed elsewhere at runtime; that consumer was not traced. Read by name only, and never seen at any zoom level.