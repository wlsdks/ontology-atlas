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

feat/rail-rollout (2026-07) re-aligned this bar to four core destinations: Map, Docs, Insights, and Projects. Workshop remains an immersive desktop write workbench and Git remains a desktop workbench; neither is forced into the narrow bar. Active-tab detection shares the pure `resolveActiveNavDestination` ladder with `AppNavRail`, so a route has one semantic destination even when that destination has no mobile button.

The active tab uses an icon capsule, indigo border, and color feedback so the current work surface reads immediately on small screens. The fixed bar uses the canonical opaque bottom-tab surface, border, shadow, 56 px minimum height, and safe-area padding. It remains visible on the root Topology first-run state and is hidden only on the standalone `/download` surface.
