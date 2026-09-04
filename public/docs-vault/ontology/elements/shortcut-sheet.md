---
uid: 568703a3-2967-417a-b750-70d3b43ede16
slug: elements/shortcut-sheet
kind: element
title: Shortcut Sheet
display_ko: 단축키 시트
domain: domains/topology-navigation
path: src/widgets/shortcut-sheet
created_by: "agent:unknown"
---

Keyboard shortcut guide sheet widget.

## Evidence

- Primary implementation: `src/widgets/shortcut-sheet/lib/shortcut-scope.ts#surfaceForPathname`
- Supporting implementation: `src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx#GLOSSARY_TERMS`

## Includes

- Classifying keyboard shortcuts into contextual scope tabs (current screen, topology, docs, all) so the current-screen tab never overflows the viewport.
- Deciding a route's surface (topology, docs, or global) from its pathname with the locale prefix stripped.
- Keeping global shortcuts (⌘K, ?, Esc) visible on every tab, including "current".

## Excludes

- Registering or dispatching the shortcuts themselves: that lives in the destination-shortcut registry (`src/shared/config/destinations.ts`) and route-level handlers.
- The glossary term content shown in the sheet body, a separate constant (`GLOSSARY_TERMS`) this scope logic does not define.
- Any screen with no dedicated shortcuts (studio, insights, projects), which this logic deliberately classifies as `global` rather than inventing scoped entries.
