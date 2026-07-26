---
slug: elements/app-nav-rail
kind: element
title: App Nav Rail
domain: onboarding-ux
---

`src/widgets/app-nav-rail/ui/AppNavRail.tsx` renders the persistent left navigation rail shown on every Ontology Atlas route at desktop widths (`lg:` and up, ≥1024px). Below `lg` it renders nothing — `src/widgets/bottom-tab-bar` (Mobile Bottom Tab Bar) owns navigation instead.

The rail exposes exactly 6 destinations: Map (`/`, `/topology`), Docs (`/docs`), Workshop (`/ontology/studio`; legacy `/ontology/edit` redirects here), Insights (`/ontology/insights`), Projects (`/projects`, `/project/*`), and Git (`/git`). Active-item detection is a pure ladder function, `resolveActiveNavDestination` in `src/shared/lib/nav-destination.ts`. The bottom tab bar shares that resolver but deliberately exposes only four core mobile destinations, so route meaning stays stable without forcing desktop workbenches into a narrow viewport.

The rail's bottom tier shows an agent-activity status tile and a `settingsSlot`. `AppShell` supplies `AppSettingsMenu` by default so every desktop surface retains the settings entry; pages only override the slot when they own a more specific control. Wide status or screen controls can still mount in a contextual page header without becoming navigation.

feat/rail-rollout (2026-07) extended this rail from its original single-page scope (HomePage only, feat/chrome-system) to the persistent application shell and retired the old top tab bar (`OperationsNav`) plus its inline ontology sub-nav switcher. The result is one navigation owner with responsive inventories, not identical button counts at every breakpoint.
