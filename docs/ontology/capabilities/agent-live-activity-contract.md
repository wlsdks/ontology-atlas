---
slug: capabilities/agent-live-activity-contract
kind: capability
title: Agent Live Activity Contract
domain: views
elements: [cli/src/commands/agent-activity.mjs, elements/agent-activity-hooks, src/features/docs-vault-local/model/agent-activity-status.ts]
---

Atlas defines a live activity contract for Claude Code / Codex sessions without pretending it can read private agent state.

The implementation separates three facts:

1. **Configured** — `.mcp.json` / `.codex/config.toml` exists and points at this vault.
2. **Verified** — setup gates and MCP checks have run successfully.
3. **Live** — an agent has explicitly written a fresh heartbeat into the opened vault.

Atlas now reads the reserved local-first source `.ontology-atlas/agent-activity.json` from the opened vault during the same refresh loop that rebuilds the local manifest. `src/features/docs-vault-local/model/agent-activity-status.ts` validates and normalizes that heartbeat. The always-visible chrome currently exposes the shared `LiveActivityIndicator` change baseline, while the richer "which agent is editing which slug/file" heartbeat display remains the next focused UI slice.

The refresh contract treats the heartbeat as a hidden sidecar, not as ontology content. `src/features/docs-vault-local/model/use-local-vault.ts` must therefore re-read agent config and activity sidecars even when the markdown/image fingerprint is unchanged; otherwise Tauri watcher events for `.ontology-atlas/agent-activity.json` can arrive but the UI will still show `heartbeat 없음`.

`cli/src/commands/agent-activity.mjs` gives Claude Code, Codex, or a terminal fallback a repeatable write path for the same heartbeat. Agents can write, show, and clear the file without hand-authoring JSON, and `--json` returns the exact shape Atlas will display.

`elements/agent-activity-hooks` connects the explicit heartbeat contract to repo-local Claude Code and Codex hooks. SessionStart writes a planning heartbeat, and PreToolUse updates shell activity into editing/verifying/complete states so Atlas can show the current agent command without scraping chat history. The hook recognizes both Claude Code `Bash` payloads and Codex desktop `functions.exec_command` payloads, including the `cmd` field used by Codex.

Dogfood proof: writing a Codex desktop-style payload for `pnpm test:claude:hooks` produced `.ontology-atlas/agent-activity.json` with `agent: codex`, `state: verifying`, and the running command as focus. The remaining product gap is turning that sidecar into a route-wide current-work lane without putting connection settings back into the `/ontology` meaning-map command bar.

The heartbeat contract asks the agent to report `agent`, `state`, `focus`, `plan`, `evidence`, and `updatedAt`. A valid heartbeat gives Atlas enough explicit data to show what Claude Code or Codex is editing, which ontology slug it is focused on, which files are in scope, and what the next planned action is. Missing or invalid heartbeat files must stay visible as such so the app does not overclaim live telemetry.

The `/ontology` meaning-map header no longer hosts connection settings or agent heartbeat controls. That keeps concept selection focused on meaning, relations, and implementation proof. MCP connection proof lives in app settings, and a future live-focus surface should promote a valid heartbeat into a current work lane only after the product defines where that state belongs across all routes. The product line stays narrow: Atlas can show a shared sidecar contract that an agent chose to write, not private chat history or hidden IDE state.
