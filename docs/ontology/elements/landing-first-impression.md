---
slug: elements/landing-first-impression
kind: element
title: Landing First Impression
domain: onboarding-ux
relates: [elements/locale-switch, elements/root-locale-redirect]
---

# Landing First Impression

`src/views/landing/ui/LandingPage.tsx` renders the public first screen for users who have not selected a local vault yet.

The hero headline introduces Ontology Atlas as a codebase ontology that grows with AI, then routes users toward the macOS download and product exploration without login or backend setup. Its first-viewport copy must read cleanly both visually and through DOM/accessibility text, because this is the user's first signal that the ontology workbench is precise rather than decorative.

The headline keeps a real text boundary between `Codebase ontology` and `that grows with AI` even though the words are split across a visual line break, so screen readers, copied text, and automated audits read the same product sentence.
