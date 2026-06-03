---
slug: src/views/ontology-view/ui/parts/AgentStatusPopover.tsx
kind: element
title: Agent Status Popover
domain: views
relates: [capabilities/mcp-server, domains/ai-agent-partner]
---

# Agent Status Popover

Compact `/ontology` status affordance for AI agent readiness. It replaces the always-prominent agent briefing CTA with an `AI agent` status pill that shows readiness score first and keeps MCP setup, CLI fallback, graph DB gate, and one-paste briefing actions inside a small popover.

This element exists to keep the human workbench calm while still making Claude Code, Codex, and Cursor handoff state visible when needed.
