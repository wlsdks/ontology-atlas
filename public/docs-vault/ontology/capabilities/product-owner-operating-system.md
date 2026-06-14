---
slug: capabilities/product-owner-operating-system
kind: capability
title: Product Owner Operating System
domain: onboarding-ux
elements: [elements/product-owner-operating-system-doc]
relates: [capabilities/agent-onboarding-brief, capabilities/topology-ontology-inspection]
---

# Product Owner Operating System

`docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` is the product decision gate for Atlas
work. It exists because the project can easily drift into a feature factory:
prettier graph controls, more panels, more commands, and more AI copy without a
clear user or agent outcome.

The capability makes contributors translate requests into observable
phenomena before building. A valid pass names the target user moment, current
substitute, problem, ontology value, agent value, simplification, runtime
evidence, and PO verdict. That keeps Relief/Topology, MCP, CLI, vault, and
macOS app changes tied to the core workflow: people and AI agents share one
local-first ontology of a product/system.

The gate is also agent-facing. AGENTS.md instructs Codex, Claude Code, Cursor,
and other agents to use the PO pass before user-visible product work. That
means a future agent should not respond to "make it prettier" by changing CSS
first; it should first identify the shipped behavior that blocks ontology
understanding or agent handoff, then shape the smallest slice that proves the
outcome in the right runtime.
