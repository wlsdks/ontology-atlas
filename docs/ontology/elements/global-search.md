---
uid: 7bfee02d-2c07-438d-8a2b-5884df37d955
slug: elements/global-search
kind: element
title: Global Search
display_ko: 전체 검색
domain: domains/topology-navigation
path: src/widgets/global-search
created_by: "agent:unknown"
---

Global search widget. Evidence of implementation for capabilities/topology-browsing.

## Evidence

- Primary implementation: `src/widgets/global-search/ui/GlobalSearch.tsx#GlobalSearch`
- Supporting implementation: `src/widgets/global-search/lib/use-global-search-hotkey.ts#useGlobalSearchHotkey`
- Focused test: `src/widgets/global-search/ui/GlobalSearch.test.tsx#names the single loaded project beside the indexed count`

## Includes

- The ⌘K command palette searching ontology nodes and, when provided, projects together in one scoped result set.
- Owning result scoring and sorting via its own matchers (`matchOntologyNodes`, `matchProjects`) rather than cmdk's built-in filter.
- Stating explicitly, in title and empty state, which scope (vault or sample) is being searched.

## Excludes

- The map-local search palette (Command-K style project search), a separate widget: elements/search-palette.
- Building the searchable node list itself, sourced from `@/entities/knowledge-graph`.
- Document search inside the docs drawer, owned by elements/docs-quick-drawer.
