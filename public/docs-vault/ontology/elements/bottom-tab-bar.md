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
