---
slug: capabilities/agent-live-activity-contract
kind: capability
title: Agent Live Activity Contract
domain: views
elements: [cli/src/commands/agent-activity.mjs, elements/agent-activity-hooks, src/features/docs-vault-local/model/agent-activity-status.ts, src/features/vault-ontology/ui/LiveActivityIndicator.tsx]
---

Atlas defines a live activity contract for Claude Code / Codex sessions without pretending it can read private agent state.

The implementation separates three facts:

1. **Configured** — `.mcp.json` / `.codex/config.toml` exists and points at this vault.
2. **Verified** — setup gates and MCP checks have run successfully.
3. **Live** — an agent has explicitly written a fresh heartbeat into the opened vault.

Atlas now reads the reserved local-first source `.ontology-atlas/agent-activity.json` from the opened vault during the same refresh loop that rebuilds the local manifest. `src/features/docs-vault-local/model/agent-activity-status.ts` validates and normalizes that heartbeat. The route chrome exposes `LiveActivityIndicator`: the pill labels its visible count as changed ontology nodes only when a change baseline exists, shows a compact source-state chip (`setup`, `agent`, `stale`, or `invalid`) beside `LIVE`, the trigger title/accessibility label repeats that the count is changed nodes, and its popover shows any published agent heartbeat as a separate current-work signal. The popover also names the sidecar source path, heartbeat freshness, and review mode, so a user can distinguish "Codex explicitly published this" from inferred IDE/chat state and see whether the work is ontology-focus review or source-to-business extraction.

If the heartbeat is stale, the trigger now says the agent is stale instead of repeating the old work state as if it were current. The popover still keeps the last state, focus, age, and source path for auditability. This answers the product question behind `LIVE · 6`: the number is changed ontology nodes since the current baseline, while agent liveness is a separate explicit heartbeat signal.

The baseline and heartbeat are intentionally independent. A vault can have a live Codex or Claude Code heartbeat before the user marks a change baseline, so the Live surface must remain visible when the heartbeat sidecar exists. In that state Atlas shows no changed-node count and explains that change tracking has not started yet; the heartbeat section can still show the active agent, focus, files, plan, and evidence.

The refresh contract treats the heartbeat as a hidden sidecar, not as ontology content. `src/features/docs-vault-local/model/use-local-vault.ts` must therefore re-read agent config and activity sidecars even when the markdown/image fingerprint is unchanged; otherwise Tauri watcher events for `.ontology-atlas/agent-activity.json` can arrive but the UI will still show `heartbeat 없음`.

`cli/src/commands/agent-activity.mjs` gives Claude Code, Codex, or a terminal fallback a repeatable write path for the same heartbeat. Agents can write, show, and clear the file without hand-authoring JSON, and `--json` returns the exact shape Atlas will display. The CLI result also derives the same top-level `reviewMode` as the app parser, so automation can distinguish ontology-focus review from business-extraction review without re-parsing raw focus fields.

`elements/agent-activity-hooks` connects the explicit heartbeat contract to repo-local Claude Code and Codex hooks. SessionStart writes a planning heartbeat, and PreToolUse updates shell activity into editing/verifying/complete states so Atlas can show the current agent command without scraping chat history. The hook recognizes both Claude Code `Bash` payloads and Codex desktop `exec_command` / `functions.exec_command` payloads, including the `cmd` field used by Codex. `.codex/hooks.json` wires both Codex matcher spellings to the same publish guard and activity writer, so the contract is not limited to a hand-piped proof payload.

Dogfood proof: writing a Codex desktop-style payload for `pnpm test:claude:hooks` produced `.ontology-atlas/agent-activity.json` with `agent: codex`, `state: verifying`, and the running command as focus. This session also used `ontology-atlas agent-activity docs/ontology --agent codex --state editing --focus "Expose live heartbeat source and freshness in /ontology"` to publish the exact Codex focus for this code change, then piped a Codex `functions.exec_command` PreToolUse payload into `.codex/hooks/write-agent-activity.sh` and observed the sidecar update to `codex · verifying` for the focused Vitest command. The first UI landing for that sidecar is now the route-wide Live trigger and popover: if the heartbeat is fresh and valid, the trigger itself names the agent and state (for example `CODEX · verifying`) and can carry the current focus summary on wide viewports; if it is stale, the trigger names the stale state first rather than showing a stale command as current work. The popover then shows the same heartbeat as current work or stale audit record: agent, state, focus summary, sidecar source path, freshness age, ontology slug, focused files, first planned action, and evidence split by MCP, CodeGraph, and verification. Missing, invalid, or stale heartbeat files remain visible as missing/invalid/stale so the app does not overclaim live telemetry. The trigger is a real button with `aria-expanded`, not a native `summary`, so macOS Accessibility and tests can observe whether the popover is open.

The heartbeat contract asks the agent to report `agent`, `state`, `focus`, `plan`, `evidence`, and `updatedAt`. A valid heartbeat gives Atlas enough explicit data to show what Claude Code or Codex is editing, which ontology slug it is focused on, which files are in scope, and what the next planned action is. Missing or invalid heartbeat files must stay visible as such so the app does not overclaim live telemetry.

The `/ontology` meaning-map header no longer hosts connection settings or separate agent heartbeat controls. That keeps concept selection focused on meaning, relations, and implementation proof. MCP connection proof lives in app settings, while the route-wide Live popover carries the current-work heartbeat across surfaces. The product line stays narrow: Atlas can show a shared sidecar contract that an agent chose to write, not private chat history or hidden IDE state.
