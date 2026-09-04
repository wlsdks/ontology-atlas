---
uid: c7498dcb-c410-447f-b9ce-535e13228e5f
slug: elements/full-detail-a1
kind: element
title: Full Detail A1
display_ko: 전체 상세
domain: domains/topology-navigation
path: src/widgets/full-detail-a1
created_by: "agent:unknown"
---

Full node detail opt-in panel widget.

## Evidence

- Primary implementation: `src/widgets/full-detail-a1/ui/FullDetailA1.tsx#FullDetailA1Props`
- Supporting implementation: `src/widgets/full-detail-a1/lib/full-detail-groups.ts#buildFullDetailGroups`
- Focused test: `src/widgets/full-detail-a1/ui/FullDetailA1.test.tsx#renders a heading + row for each code path when codeLocations is non-empty`

## Includes

- The opt-in "expanded datasheet" full node detail surface: header, engraved metric strip, four direction groups, reach sentence, and agent handoff row.
- Sharing one `groups`/`reach` fact model (`buildFullDetailGroups`, reach lib) between its two entry points: the topology datasheet's full-detail action and the legacy `/ontology` node detail.

## Excludes

- The default compact node popover shown on a map click; full detail is an explicit escalation from it, never the click default (forbidden.md).
- Building the reach/group facts from the graph itself, owned by the referenced `lib/full-detail-groups` and `lib/full-detail-reach` modules as computation, consumed here as rendering.
- Editing node meaning or relations, owned by elements/ontology-meaning-editor.
