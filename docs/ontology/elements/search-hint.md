---
uid: 15683f06-ba71-4703-8212-1f87138e5c01
slug: elements/search-hint
kind: element
title: Search Hint
display_ko: 검색 힌트
domain: domains/topology-navigation
path: src/widgets/search-hint
created_by: "agent:unknown"
---

Search hint overlay widget.

## Evidence

- Primary implementation: `src/widgets/search-hint/ui/SearchHint.tsx#SearchHint`
- Focused test: `src/widgets/search-hint/ui/SearchHint.test.tsx#reads 3D while the flat view is on`
- Focused test: `src/widgets/search-hint/ui/SearchHint.test.tsx#exposes utility-lane token contracts on search and auto-arrange actions`

## Includes

- The map toolbar search/relayout/expand-all controls and their responsive suppression rules (phone focus, phone sheet, right inspector reserved, INDEX panel reserved widths).
- Reading the current density and 3D-view state to adjust hint copy and control layout.

## Excludes

- The actual search palette overlay opened from this control, owned by elements/search-palette.
- The 3D/2D view toggle menu content itself (`View3dMenu`), a distinct sub-component this widget only opens.
- The touch-gesture hint overlay, a separate widget: elements/gesture-hint.
