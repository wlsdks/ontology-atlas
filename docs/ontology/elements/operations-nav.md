---
slug: elements/operations-nav
kind: element
title: Operations Nav
domain: onboarding-ux
relates: [elements/locale-switch, elements/ontology-sub-nav]
---

# Operations Nav

`src/widgets/operations-nav/ui/OperationsNav.tsx` renders the shared top navigation for Context Atlas work surfaces: Source Vault, Ontology, and Topology.

The nav keeps workspace return, primary work-surface switching, source-mode status, language switching, theme switching, and the ontology sub-nav in one compact chrome layer. Static hosted mode routes the demo badge to the macOS download, while the installed app can route it to the local vault picker.

The mobile chrome keeps both the Home icon affordance and compact Demo/Vault mode badge at a 32px minimum hit target. That lets the top app frame stay dense without turning workspace return or local-vault readiness into tiny controls.

On mobile, workspace/status controls and primary surface tabs are separate rows. Source Vault / Ontology / Topology remain directly reachable, but the Live + Demo/Vault status cluster no longer competes for the same horizontal pixels as the tabs on phone-sized windows.
