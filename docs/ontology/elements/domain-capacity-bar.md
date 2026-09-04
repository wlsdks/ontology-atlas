---
uid: 5b66c2ec-54fa-481b-9a2a-2522820cefc9
slug: elements/domain-capacity-bar
kind: element
title: Domain Capacity Bar
display_ko: 도메인 용량 막대
domain: domains/topology-navigation
path: src/widgets/domain-capacity-bar
created_by: "agent:unknown"
---

Widget displaying node density per domain.

## Evidence

- Primary implementation: `src/widgets/domain-capacity-bar/ui/DomainCapacityBar.tsx#DomainCapacityBarLabels`
- Focused test: `src/widgets/domain-capacity-bar/ui/DomainCapacityBar.test.tsx#renders the domain title, total, and capability/element breakdown`
- Focused test: `src/widgets/domain-capacity-bar/ui/DomainCapacityBar.test.tsx#renders all nine current English Storefront tails inside the measured 192px column`

## Includes

- Rendering one domain's capability/element composition as a fully filled bar with a single boundary marker, plus the domain title and total.
- Providing a tunable title-column width for callers placing the row in containers of different widths (insights list vs. full-width project card).

## Excludes

- Deciding the domain hierarchy or counts themselves; those come from the knowledge-graph entity's census.
- Representing relative domain size across domains: the bar deliberately no longer encodes size by fill length (2026-08-09 decision); size is read from the adjacent number column.
- The INDEX panel's domain tree and search, owned by elements/topology-index-panel.
