---
uid: cc71c7c2-a617-432c-8275-61be491640c5
slug: elements/gesture-hint
kind: element
title: Gesture Hint
display_ko: 제스처 힌트
domain: domains/topology-navigation
path: src/widgets/gesture-hint
created_by: "agent:unknown"
---

Map gesture hint overlay widget.

## Evidence

- Primary implementation: `src/widgets/gesture-hint/ui/GestureHint.tsx#STORAGE_KEY`

## Includes

- Showing a one-time, auto-dismissing (10s) touch-gesture hint overlay on coarse-pointer environments.
- Persisting dismissal in local storage so the hint does not repeat once seen.

## Excludes

- Any pointer/mouse-only environment; the hint gates entirely on `(pointer: coarse)`.
- The map gesture handling itself (pan/zoom/rotate), owned by elements/topology-map-v2.
- The keyboard shortcut sheet, a separate overlay owned by elements/shortcut-sheet.
