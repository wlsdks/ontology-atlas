---
uid: cfdab26b-0dc7-44e9-ad3b-a9db4afeb7e6
slug: elements/recent-node-row
kind: element
title: Recent Node Row
display_ko: 최근 노드 줄
domain: domains/topology-navigation
path: src/widgets/recent-node-row
created_by: "agent:unknown"
---

Recently viewed node list row widget.

## Evidence

- Primary implementation: `src/widgets/recent-node-row/ui/RecentNodeRow.tsx#RecentNodeRowProps`
- Focused test: `src/widgets/recent-node-row/ui/RecentNodeRow.test.tsx#stacks title over subtitle and shows trailing metadata`
- Focused test: `src/widgets/recent-node-row/ui/RecentNodeRow.test.tsx#renders as a link when href is provided`

## Includes

- The shared two-line row grammar (title over kind·domain, trailing date, optional secondary trailing text) for "a concept changed recently" lists.
- Rendering as a map-focus link when a graph node resolves, or an inert row for a dangling document with no resolvable node.

## Excludes

- Computing which nodes are "recent": that census comes from the knowledge-graph entity, this row only renders a given entry.
- The insights freshness tab and the `/projects` recent-activity strip layouts themselves, which are separate call sites reusing this row.
- Full node detail on click beyond navigating to the map focus.
