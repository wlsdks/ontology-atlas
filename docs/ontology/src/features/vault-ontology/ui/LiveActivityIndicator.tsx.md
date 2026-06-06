---
slug: src/features/vault-ontology/ui/LiveActivityIndicator.tsx
kind: element
title: Live Activity Indicator
domain: views
---

`src/features/vault-ontology/ui/LiveActivityIndicator.tsx` renders the operations-nav Live badge that explains changed ontology nodes and the current AI-agent heartbeat.

Dogfood evidence, 2026-06-06: Codex used CodeGraph to locate `LiveActivityBadge`, Atlas MCP to inspect `capabilities/agent-live-activity-contract`, and macOS Accessibility `AXPress` plus Computer Use observation to prove the installed `/Applications/Ontology Atlas.app` opens the Live popover. The popover now exposes a real button contract (`aria-expanded` / `aria-controls`), a dialog body, and a dedicated close button; jsdom tests also cover Escape and outside-pointer dismissal.

Follow-up evidence, 2026-06-06: the trigger no longer renders a stale heartbeat as `CODEX · verifying` or another current work state. It renders the agent plus the stale label in the closed pill, while the popover keeps the old state and age for inspection.
