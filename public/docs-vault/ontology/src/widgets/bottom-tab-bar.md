---
slug: src/widgets/bottom-tab-bar
kind: element
title: Mobile Bottom Tab Bar
domain: onboarding-ux
path: src/widgets/bottom-tab-bar
relates: [elements/app-nav-rail, elements/root-locale-redirect]
---

# Mobile Bottom Tab Bar

`src/widgets/bottom-tab-bar` renders the mobile primary navigation for Ontology Atlas — visible only below the `lg` breakpoint (desktop uses `elements/app-nav-rail` instead).

feat/rail-rollout (2026-07) re-aligned this bar from its previous 4 tabs (Ontology / Topology / Projects / Source Vault) to the SAME 5 destinations as the desktop rail: Map, Docs, Builder, Insights, Projects. Active-tab detection now shares one pure ladder function, `resolveActiveNavDestination` in `src/shared/lib/nav-destination.ts`, with `AppNavRail` — so mobile and desktop can never disagree on which destination is lit for a given pathname. The active tab uses an icon capsule, indigo border, and color feedback so the current work surface reads immediately on small screens. The fixed bar also carries a blurred, shadowed surface layer so tree rows do not visually bleed through the primary mobile navigation.
