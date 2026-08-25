---
uid: 4b0891b9-2ab2-4c7b-a8b9-1f37b59508c6
slug: elements/app-nav-rail
kind: element
title: App Nav Rail
display_ko: 앱 내비게이션 레일
domain: domains/onboarding-and-shell
path: src/widgets/app-nav-rail
created_by: "agent:unknown"
display_en: App Navigation Rail
---

## Definition
The persistent desktop workbench navigation rail. It exposes seven primary destinations in one stable order: Map, Architecture, Docs, Insights, Projects, Agents, and Git. Architecture is additive; Git retains its active-route state, uncommitted-change badge, `G G` shortcut, and guided entry.

## Evidence
- `src/widgets/app-nav-rail`: rail rendering, moving active indicator, overflow ownership, badges, and contextual Docs href
- `src/shared/config/destinations.ts`: shared destination, route, and leader-key registry
- `src/app/providers/AppShell.tsx`: Git changeset badge and destination-shortcut wiring
- `tests/e2e/destination-shortcuts.spec.ts`: keyboard traversal across all seven destinations

## Boundary
The desktop rail owns the complete seven-destination workbench inventory and scrolls when height or UI scale requires it. The mobile bottom bar keeps its measured five persistent destinations; Git and Agents retain their existing narrow-screen entry paths rather than adding new bottom slots.

## Confidence
high (0.95): registry contracts, browser reachability measurement, and installed-app verification cover the current navigation