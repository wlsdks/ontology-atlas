---
slug: elements/landing-first-impression
kind: element
title: Landing First Impression
domain: onboarding-ux
relates: [elements/locale-switch, elements/root-locale-redirect]
---

# Landing First Impression

The dedicated marketing landing page (`src/views/landing/ui/LandingPage.tsx`) was retired in the 2026-07-18 root-first-open change. There is no separate marketing screen anymore: the public first screen is the root topology hub itself (`src/views/home/ui/HomePage.tsx`) — with no vault selected it renders this project's own dogfood sample plus a first-run starter card in the INDEX panel (`src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx`), and `/download` (`src/views/download/`) absorbed the macOS download and product-exploration copy.

The first-run card must read cleanly both visually and through DOM/accessibility text, because it is the user's first signal that the ontology workbench is precise rather than decorative: it introduces Ontology Atlas as a codebase ontology that grows with AI and routes toward loading a local vault or the macOS download, with no login or backend setup.

Any first-viewport product sentence split across a visual line break must keep a real text boundary between its clauses, so screen readers, copied text, and automated audits read the same sentence the eye does.
