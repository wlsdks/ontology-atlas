---
uid: 54aa8df5-d4bb-40ac-912e-657c010084ee
slug: capabilities/graph-block-exchange
kind: capability
title: Graph block exchange
display_en: Graph block exchange
display_ko: 그래프 블록 교환
domain: domains/human-workbench
elements: []
path: src/features/ontology-blocks/model/merge-plan.ts
created_by: "agent:claude-code"
---

Exports a portion of the graph as a self-described block and brings one back in under a plan that says what would merge, so part of a map can move between folders without hand-copying files.

## Includes
- Collecting a region of the graph into a block with its own manifest.
- A merge plan shown before an import lands, naming what it would add or change.

## Excludes
- Any network transfer or hosted exchange; a block is a file the person moves.
- Merging without the plan being accepted.

## Uncertainty
- Read from the feature's file layout only. Neither the manifest format nor the merge rules were opened, no block was exported or imported here, and how a conflicting import is resolved is unknown.