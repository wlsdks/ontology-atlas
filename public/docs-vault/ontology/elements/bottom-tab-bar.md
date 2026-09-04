---
uid: ad3f50c1-6bf9-4b4b-a1f5-b26483149940
slug: elements/bottom-tab-bar
kind: element
title: Bottom Tab Bar
display_ko: 하단 탭 바
domain: domains/onboarding-and-shell
path: src/widgets/bottom-tab-bar
created_by: "agent:unknown"
---

Mobile/web bottom tab navigation widget.

## Evidence

- Primary implementation: `src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx#TABS`
- Supporting implementation: `src/widgets/bottom-tab-bar/lib/is-tab-active.ts#isBottomTabActive`
- Focused test: `src/widgets/bottom-tab-bar/lib/is-tab-active.test.ts#hides mobile app navigation only on the standalone /download page`
- Focused test: `src/widgets/bottom-tab-bar/lib/is-tab-active.test.ts#keeps mobile app navigation on the root topology hub (root-first-open) even with no vault`

## Includes

- Rendering the mobile-only bottom navigation with the five persistent reading/planning destinations shared with the desktop rail's copy.
- Hiding on the standalone `/download` page while keeping the bar on the root topology hub even without a loaded vault.
- Sharing active-state resolution with the desktop `AppNavRail` via `resolveActiveNavDestination` so the two surfaces cannot disagree.

## Excludes

- The desktop rail's seven-destination set and overflow handling, owned by elements/app-nav-rail.
- Agents and Architecture navigation on narrow screens, which keep their own existing entry paths rather than a new bottom slot.
- The "get the app" tile visibility rule, computed by `show-get-app-tile` and only consumed here.
