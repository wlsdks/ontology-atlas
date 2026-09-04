---
uid: b2cf15e3-d6ca-4c32-b7d1-4f1fd49c682b
slug: elements/status
kind: element
title: Status
display_ko: 상태
domain: domains/graph-modeling
path: src/entities/status
created_by: "agent:unknown"
---

Node status value entity. Implementation evidence for capabilities/taxonomy.

## Evidence

- Primary implementation: `src/entities/status/model/defaults.ts#DEFAULT_STATUSES`
- Supporting implementation: `src/entities/status/model/types.ts#Status`

## Includes

- The `Status` type and the eight seeded lifecycle statuses (idea through deprecated) with stable IDs and dot colours.
- Keeping status IDs byte-compatible with the earlier literal union so stored project records keep resolving.

## Excludes

- Category/cluster taxonomy, a separate entity: elements/category.
- Rendering the status dot or label in any specific surface: those are consumers of this data, not part of it.
- Project integrity checks that reference status IDs, owned by elements/project.
