---
slug: src/views/ontology-view/ui/parts/AgentStatusPopover.tsx
kind: element
title: Agent Status Popover
domain: views
relates: [capabilities/agent-practitioner-concerns-map, capabilities/mcp-server, domains/ai-agent-partner]
---

# Agent Status Popover

Compact `/ontology` status affordance for AI agent readiness. It keeps the top-level control quiet while the expanded panel explains how Claude Code and Codex connect to the same local ontology vault.

The trigger now opens a centered settings dialog rather than an anchored popover. The dialog is fixed inside the viewport with outer padding, a bounded width/height, and an internal scroll area so the page behind it does not become the scroll surface. A left settings nav separates Connection proof, Agent handoff, and Decision checks.

The dialog is rendered through a body portal. While it is open, the rest of the app root is marked `inert` / `aria-hidden`, focus moves to the close button, Tab cycles inside the settings dialog, Escape closes it, and focus returns to the trigger. This keeps the macOS accessibility tree aligned with the visual modal instead of leaving the background ontology tree active.

The connection tab exposes readiness score, graph concept count, entrypoints, and supported setup paths for Claude Code (`.mcp.json` / `/mcp`) and Codex (`.codex/config.toml` / `codex mcp add/list`). It deliberately does not open an agent chat inside Ontology Atlas; instead it tells the user which proof must be checked in the agent app or terminal.

The first connection section now separates three verdicts: config ready, live session check required, and CLI fallback available. That keeps `.mcp.json` / `.codex/config.toml` readiness distinct from actual Claude Code / Codex tool exposure, and it gives connector-less sessions an immediate fallback path through `agent-brief`, `workspace-brief`, and `health` CLI commands.

The connection proof section includes a live-session proof contract: the agent must see the `ontology-atlas` server, `tools/list` must include all 24 tools including `index_project`, and `agent_brief` / `workspace_brief` / `health` must return healthy before the UI language treats the connection as proven.

The same proof card also names the stale client metadata case. If Claude Code, Codex, or another MCP client still describes the server as 23 tools, the popover treats that as cached tool metadata rather than a proven connection. The recovery path is reload/restart or reset/refresh cached MCP tools, then re-run `tools/list` and `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000`.

The handoff tab copies the handoff packet, graph DB gate, and first MCP calls, then shows the agent graph rail: Graph DB pack, Runtime gate, and Agent handoff. It also exposes three explicit agent work packets:

- project reanalysis: `index_project`, `workspace_brief`, `growth_plan`, and `maintenance_plan` with the CLI `index` fallback;
- ontology update: changed-node polling, health, maintenance, relation recommendations, and the docs-vault verification commands;
- selected concept strengthening: `get_concept`, `find_neighbors`, `node_profile`, `impact`, and `relation_check` for one selected slug.

These packets keep `--apply` out of the default path. Agent sessions produce plans and local proof first, then write only after the human reviews the candidate concept / relation batch.

Project reanalysis packets now use `[codebase-root]` instead of a hardcoded local path. This keeps the handoff correct when the checkout still lives at `/Users/jinan/side-project/oh-my-ontology`, while still supporting the eventual safe folder rename to `/Users/jinan/side-project/ontology-atlas`. Agents must replace `[codebase-root]` with the current checkout path before running `index_project` or the CLI `index` plan.

The same reanalysis packet now includes an evidence report section for
`index_project`. Agents must report candidate counts, import relation counts,
validation/path-drift counts, threshold filtering, and
`imports.reconciliationSummary` before proposing writes. The packet distinguishes
missing import endpoints from stale vault relations: endpoint-absent code edges
are a materialization queue, while vault relations without direct imports are
review evidence because curated semantic edges can still be valid. This makes
the copied command useful during dogfooding: it shows exactly where Atlas helped
and where the graph still needs human judgment.

The handoff tab now shows the same reanalysis evidence contract before copy:
`plan.concepts`, `imports.reconciliationSummary`, endpoint gaps, and the
`--apply` review gate are visible in the panel itself. That makes the workflow
legible to a human who is deciding whether to ask Claude Code or Codex for a
full repo reanalysis.

The decision-checks tab shows the `Agent Practitioner Concerns Map` as five compact checks: Context, Tools, Evidence, Drift, and Workflow. This makes the ontology system legible as a queryable graph database-like surface and keeps new agent-facing features tied to concrete failure modes instead of generic AI polish.

The concern map header links to the docs-vault entry for `documents/agent-practice-research` through the docs-vault deep link builder. The research stays available as a source node without adding long external-practice prose inside the popover body.
