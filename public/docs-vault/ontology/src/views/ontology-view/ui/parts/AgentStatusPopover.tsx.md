---
slug: src/views/ontology-view/ui/parts/AgentStatusPopover.tsx
kind: element
title: Agent Status Popover
domain: views
relates: [capabilities/mcp-server, domains/ai-agent-partner]
---

# Agent Status Popover

Compact `/ontology` status affordance for AI agent readiness. It keeps the top-level control quiet while the expanded panel explains how Claude Code and Codex connect to the same local ontology vault.

The popover exposes readiness score, graph concept count, entrypoints, and supported setup paths for Claude Code (`.mcp.json` / `/mcp`) and Codex (`.codex/config.toml` / `codex mcp add/list`). It deliberately does not open an agent chat inside Context Atlas; instead it copies the handoff packet or graph DB gate so the agent can run from its own app or terminal.

The expanded panel now includes an agent graph rail: Graph DB pack, Runtime gate, and Agent handoff. This makes the ontology system legible as a queryable graph database-like surface, not just an MCP setup checklist, and shows that scans, containment checks, relation parity, path evidence, and impact proof are part of the handoff contract.
