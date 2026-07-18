---
slug: elements/app-nav-rail
kind: element
title: App Nav Rail
domain: onboarding-ux
---

`src/widgets/app-nav-rail/ui/AppNavRail.tsx` renders the persistent left navigation rail shown on every Ontology Atlas route at desktop widths (`lg:` and up, ≥1024px). Below `lg` it renders nothing — `src/widgets/bottom-tab-bar` (Mobile Bottom Tab Bar) owns navigation instead.

The rail exposes exactly 5 destinations: Map (`/`, `/topology`), Docs (`/docs`), Builder (`/ontology/edit`), Insights (`/ontology/insights`), and Projects (`/projects`, `/project/*`). Active-item detection is a pure ladder function, `resolveActiveNavDestination` in `src/shared/lib/nav-destination.ts`, shared verbatim with the bottom tab bar so the two surfaces can never disagree on which destination is lit for a given pathname.

The rail's bottom slot shows an agent-activity status tile (icon + amber dot when a fresh heartbeat exists) and an optional `settingsSlot` prop — only `HomePage` passes one (`TopologyV2SettingsGear`, for map-specific settings like INDEX-panel default state). The rail is intentionally narrow (`--app-nav-rail-width`), so it cannot host wide popovers: `AppSettingsMenu` and `LiveActivityIndicator` mount separately in the header of the few pages that need them.

feat/rail-rollout (2026-07) extended this rail from its original single-page scope (HomePage only, feat/chrome-system) to every route — `/docs`, `/ontology/edit`, `/ontology/insights`, `/projects`, `/project/[slug]` (+`/edit`, `/new`), and `/download` — and retired the old top tab bar (`Operations Nav`, now `App Settings Menu`) and its inline ontology sub-nav switcher in the process, collapsing what used to be three overlapping navigation systems into one.
