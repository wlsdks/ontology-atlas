---
uid: a7acdee6-5bc8-4135-ab1a-b6dd474868be
slug: elements/topology-controls
kind: element
title: Topology Controls
display_ko: 지도 컨트롤
domain: domains/topology-navigation
path: src/widgets/topology-controls
created_by: "agent:unknown"
---

Map pan/zoom/reset control widget. Implementation evidence for capabilities/topology-browsing.

## Evidence

- Primary implementation: `src/widgets/topology-controls/ui/HubRail.tsx#HubRail`
- Supporting implementation: `src/widgets/topology-controls/ui/TopologyEmptyState.tsx#TopologyEmptyState`
- Focused test: `src/widgets/topology-controls/ui/HubRail.storage.test.tsx#renders closed instead of throwing when reading storage fails`
- Focused test: `src/widgets/topology-controls/ui/HubRail.storage.test.tsx#still opens when the write fails`
