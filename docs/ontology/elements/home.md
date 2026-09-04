---
uid: b4366e4d-c2cd-4e86-b798-9a5665a99fb4
slug: elements/home
kind: element
title: Home
display_ko: 홈 화면
domain: domains/onboarding-and-shell
path: src/views/home
created_by: "agent:unknown"
dependencies: [elements/knowledge-graph]
relation_notes: { elements/knowledge-graph: "The topology view renders the graph model that knowledge-graph builds from vault frontmatter; src/views/home imports @/entities/knowledge-graph." }
---

/ Home entry page.

## Evidence

- Primary implementation: `src/views/home/ui/HomePage.tsx#HomePage`
- Supporting implementation: `src/views/home/model/use-home-route-state.ts#useHomeRouteState`
- Focused test: `src/views/home/ui/HomePage.accessibility.test.ts#keeps the visible label inside the longer accessible name`
- Focused test: `src/views/home/ui/HomePage.docs-drawer-shortcut.test.ts#does not toggle the drawer over an open agent dock`

## Includes

- The `/` topology hub page composing the map, INDEX panel, and datasheet for a user with a loaded vault.
- Owning route-level navigation state (selected node, panel open/closed) via `useHomeRouteState`.
- Keeping the visible accessible label consistent and preventing the docs drawer from toggling over an open agent dock.

## Excludes

- Rendering the canvas graph itself, owned by elements/topology-map-v2.
- The root `/` branch decision between gateway/first-run/home, owned by elements/root-entry.
- The knowledge-graph model this page renders, owned by elements/knowledge-graph.
