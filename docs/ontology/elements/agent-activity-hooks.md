---
slug: elements/agent-activity-hooks
kind: element
title: Agent Activity CLI Contract
domain: ai-agent-partner
relates: [capabilities/agent-live-activity-contract]
---

`ontology-atlas agent-activity` is the explicit CLI contract for publishing Atlas live agent activity into `.ontology-atlas/agent-activity.json`.

The repo-local automatic heartbeat hooks were removed from `.claude/settings.json` and `.codex/hooks.json` during the 2026-06 token-budget pass. They updated the sidecar on every shell command, but that added per-command overhead and did not improve model context. Claude Code / Codex hooks now keep only the npm publish guard plus the compact SessionStart ontology summary.

Atlas can still read and display a heartbeat when a human or agent explicitly runs `ontology-atlas agent-activity <vault> ... --json`. Treat the sidecar as an explicit handoff signal, not inferred chat or shell state.