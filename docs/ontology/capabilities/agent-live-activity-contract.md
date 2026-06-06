---
slug: capabilities/agent-live-activity-contract
kind: capability
title: Agent Live Activity Contract
domain: views
elements: [cli/src/commands/agent-activity.mjs, src/features/docs-vault-local/model/agent-activity-status.ts, src/views/ontology-view/ui/parts/AgentStatusPopover.tsx]
---

`/ontology` exposes a live activity lane for Claude Code / Codex sessions without pretending Atlas can read private agent state.

The implementation separates three facts:

- MCP readiness and first-call proof are connection state.
- Desktop vault writes are visible through Tauri vault watch and the ontology changes baseline.
- Agent session presence, current file or slug focus, planned next action, and blocked reason require an explicit heartbeat packet from the agent.

Atlas now reads the reserved local-first source `.ontology-atlas/agent-activity.json` from the opened vault during the same refresh loop that rebuilds the local manifest. `src/features/docs-vault-local/model/agent-activity-status.ts` validates and normalizes that heartbeat, while `src/views/ontology-view/ui/parts/AgentStatusPopover.tsx` renders missing, invalid, stale, and live states.

`cli/src/commands/agent-activity.mjs` gives Claude Code, Codex, or a terminal fallback a repeatable write path for the same heartbeat. Agents can write, show, and clear the file without hand-authoring JSON, and `--json` returns the exact shape Atlas will display.

The heartbeat contract asks the agent to report `agent`, `state`, `focus`, `plan`, `evidence`, and `updatedAt`. A valid heartbeat lets Atlas show what Claude Code or Codex is editing, which ontology slug it is focused on, which files are in scope, and what the next planned action is. Missing or invalid heartbeat files stay visible as such so the app does not overclaim live telemetry.
