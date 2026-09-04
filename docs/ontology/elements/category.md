---
uid: 8d195cf8-8a8c-4166-94a8-fa5034cb1e8c
slug: elements/category
kind: element
title: Category
display_ko: 분류
domain: domains/graph-modeling
path: src/entities/category
created_by: "agent:unknown"
---

Kind/category classification data entity. Implementation evidence for capabilities/taxonomy.

## Evidence

- Primary implementation: `src/entities/category/model/types.ts#Category`
- Supporting implementation: `src/entities/category/model/defaults.ts#DEFAULT_CATEGORIES`

## Includes

- The `Category` type: cluster-box id, label/labelEn, order, map position, size, radius, and border style used by the topology map.
- The seed `DEFAULT_CATEGORIES` (in-progress, planned) with byte-compatible legacy IDs.

## Excludes

- Rendering the cluster box on the map canvas, owned by elements/topology-map-v2.
- Status lifecycle values, a separate taxonomy entity (elements/status).
- Choosing colours beyond the fixed four border-style presets; the design system reserves indigo for hub nodes.
