---
slug: src/views/ontology-view/ui/parts/AgentStatusPopover.tsx
kind: element
title: Agent Status Popover
domain: views
relates: [capabilities/agent-practitioner-concerns-map, capabilities/mcp-server, domains/ai-agent-partner]
---

# Agent Status Popover

Compact `/ontology` status affordance for AI agent readiness. It keeps the top-level control quiet while the expanded panel explains how Claude Code and Codex connect to the same local ontology vault.

The popover exposes readiness score, graph concept count, entrypoints, and supported setup paths for Claude Code (`.mcp.json` / `/mcp`) and Codex (`.codex/config.toml` / `codex mcp add/list`). It deliberately does not open an agent chat inside Context Atlas; instead it copies the handoff packet, graph DB gate, first MCP calls, or agent feature decision checklist so the agent can run from its own app or terminal.

The expanded panel includes an agent graph rail: Graph DB pack, Runtime gate, and Agent handoff. It now also shows the `Agent Practitioner Concerns Map` as five compact checks: Context, Tools, Evidence, Drift, and Workflow. This makes the ontology system legible as a queryable graph database-like surface and keeps new agent-facing features tied to concrete failure modes instead of generic AI polish.

The concern map header links to the docs-vault entry for `documents/agent-practice-research` through the docs-vault deep link builder. The research stays available as a source node without adding long external-practice prose inside the popover body.
