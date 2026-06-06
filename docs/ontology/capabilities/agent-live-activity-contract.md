---
slug: capabilities/agent-live-activity-contract
kind: capability
title: Agent Live Activity Contract
domain: views
elements: [src/views/ontology-view/ui/parts/AgentStatusPopover.tsx]
---

`/ontology` exposes a live activity lane for Claude Code / Codex sessions without pretending Atlas can read private agent state.

The current implementation separates three facts:

- MCP readiness and first-call proof are connection state.
- Desktop vault writes are visible through Tauri vault watch and the ontology changes baseline.
- Agent session presence, current file or slug focus, planned next action, and blocked reason require an explicit heartbeat packet from the agent.

`src/views/ontology-view/ui/parts/AgentStatusPopover.tsx` renders the waiting heartbeat state and provides a copyable activity contract that asks the agent to report `agent`, `state`, `focus`, `plan`, `evidence`, and `updatedAt`. This keeps the UI honest until a persistent activity stream is implemented.