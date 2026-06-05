---
slug: src/widgets/bottom-tab-bar
kind: element
title: Mobile Bottom Tab Bar
domain: onboarding-ux
path: src/widgets/bottom-tab-bar
relates: [elements/ontology-sub-nav, elements/root-locale-redirect]
---

# Mobile Bottom Tab Bar

`src/widgets/bottom-tab-bar` renders the mobile primary navigation for Ontology Atlas.

It keeps Ontology, Topology, Projects, and Source Vault reachable as persistent thumb targets while desktop uses the shared OperationsNav chrome. The active tab now uses an icon capsule, indigo border, and color feedback so the current ontology work surface reads immediately on small screens without changing route semantics. The fixed bar also carries a blurred, shadowed surface layer so tree rows do not visually bleed through the primary mobile navigation.
