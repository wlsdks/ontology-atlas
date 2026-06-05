---
slug: elements/operations-nav
kind: element
title: Operations Nav
domain: onboarding-ux
relates: [elements/locale-switch, elements/ontology-sub-nav]
---

# Operations Nav

`src/widgets/operations-nav/ui/OperationsNav.tsx` renders the shared top navigation for Context Atlas work surfaces: Source Vault, Ontology, and Topology.

The nav keeps workspace return, primary work-surface switching, source-mode status, language switching, app settings, and the ontology sub-nav in one compact chrome layer. Static hosted mode routes the demo badge to the macOS download, while the installed app can route it to the local vault picker.

`AppSettingsMenu` turns the top-right gear into an actual settings popover instead of a single-purpose theme toggle. It groups display mode, language, Source Vault, and AI agent connection verification entry points so users can distinguish app preferences from MCP runtime proof without hunting across separate buttons.

The settings popover also shows the MCP first calls an agent should run (`agent_brief`, `workspace_brief`, `health`) plus the CLI fallback verification command. This keeps the app honest: it can guide a human to the right proof, while the actual connection claim still has to be proven inside the Codex or Claude session where tools are exposed.

The popover separates "setup ready" from "session proof needed" so a human can see why the app may have valid MCP configuration while Codex or Claude still needs a restarted session and a live `tools/list` / first-call check.

The mobile chrome keeps both the Home icon affordance and compact Demo/Vault mode badge at a 32px minimum hit target. That lets the top app frame stay dense without turning workspace return or local-vault readiness into tiny controls.

On mobile, workspace/status controls and primary surface tabs are separate rows. Source Vault / Ontology / Topology remain directly reachable, but the Live + Demo/Vault status cluster no longer competes for the same horizontal pixels as the tabs on phone-sized windows.
