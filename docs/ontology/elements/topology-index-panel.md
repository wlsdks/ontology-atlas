---
uid: 83ab7e8f-4019-46d2-9545-97a20df8683d
slug: elements/topology-index-panel
kind: element
title: Topology Index Panel
display_ko: 지도 INDEX 패널
domain: domains/topology-navigation
path: src/widgets/topology-index-panel
created_by: "agent:unknown"
---

Map index (INDEX) panel widget. Implementation evidence for capabilities/topology-browsing.

## Evidence

- Primary implementation: `src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx#TopologyIndexPanel`
- Supporting implementation: `src/widgets/topology-index-panel/ui/TopologyIndexTab.tsx#TopologyIndexTab`
- Focused test: `src/widgets/topology-index-panel/lib/domain-subcounts.test.ts#counts capability/element descendants recursively, not just direct children`
- Focused test: `src/widgets/topology-index-panel/lib/domain-subcounts.test.ts#returns zero counts for a domain with no children`

## Includes

- The left INDEX panel: domain/capability/element tree with All and Recently Changed lenses, search filtering, and roving-tabindex keyboard navigation.
- Gating the "make a map from my code" starter door on a measured concept-count ceiling so an already-substantial vault is never mistaken for an empty one.

## Excludes

- Computing per-domain descendant subcounts, delegated to `lib/domain-subcounts` and only consumed here.
- The domain composition bar shown inside rows, a separate widget: elements/domain-capacity-bar.
- The map canvas and node rendering itself, owned by elements/topology-map-v2.
