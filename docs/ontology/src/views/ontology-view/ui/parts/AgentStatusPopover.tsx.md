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

The popover now includes a compact supported-setup strip: Claude Code connects through `.mcp.json`, while Codex connects through `.codex/config.toml` or CLI MCP setup. This keeps the boundary explicit: Context Atlas prepares MCP/CLI handoff packets, but does not open or control an agent chat session inside the app.

On narrow mobile viewports, the popover uses a compact 17rem width so MCP setup and one-paste briefing actions stay inside a 360px viewport, then expands back to the richer 22rem panel from the `sm` breakpoint upward.
