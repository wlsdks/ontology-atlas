---
uid: 24f84dd5-f402-4929-8670-75ddd05cdd20
slug: elements/search-palette
kind: element
title: Search Palette
display_ko: 검색 팔레트
domain: domains/topology-navigation
path: src/widgets/search-palette
created_by: "agent:unknown"
---

Search palette (Command-K style) widget. Implementation evidence for capabilities/topology-browsing.

## Evidence

- Primary implementation: `src/widgets/search-palette/ui/SearchPalette.tsx#SearchPalette`
- Supporting implementation: `src/widgets/search-palette/model/fuzzy-search.ts#searchProjects`

## Includes

- The map's Command-K style palette searching the currently loaded vault or sample: projects first, with a supporting top-3 document match section.
- Its own lightweight title/excerpt/slug/tag substring matcher for documents (`matchVaultDocs`), independent of the global-search matchers.

## Excludes

- The application-wide ⌘K command palette searching ontology nodes and projects together, a separate widget: elements/global-search.
- Document content rendering; matches only navigate to the docs vault.
- Fuzzy project search scoring logic itself, delegated to `model/fuzzy-search`.
