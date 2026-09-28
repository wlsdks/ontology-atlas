---
id: f9cefcd0-e1f9-4917-b309-17a5ef8f08ed
date: 2026-09-28
kind: tool-efficiency
status: reported
harness_area: acp-measurement
---
**Observed**: for #2133, a scratchpad script spawned the chain the app launches: the cached `claude-agent-acp` 0.81.2 bin, `CLAUDE_CONFIG_DIR` set to the app's `agent-config/claude-acp`, and the bundled `ontology-atlas-mcp`. `session/prompt` answered `Failed to authenticate: OAuth session expired and could not be refreshed`, and with a scratch `HOME` it answered `Authentication required`. `initialize`, `session/new` and `session/load` need no login, so memory (426-428 MB RSS, 234-247 MB footprint), stop time and cold resume to ready (480-605 ms) were measured, but the first answer after a resume was not.
**Cost**: about 15 minutes of setup; the decision record carries one unmeasured number.
**Suspected cause**: the app mirrors the terminal Claude login into its own keychain item only inside `acp_start` (`prepare_runtime_isolation` in `src-tauri/src/acp.rs`). The mirror goes stale once the terminal rotates its refresh token, and refreshing it from a script could rotate the token that every terminal session on the machine shares.
**Proposed change**: none: an ACP latency measurement that needs a real answer drives the installed app, so `acp_start` refreshes the mirror, rather than a standalone script.
