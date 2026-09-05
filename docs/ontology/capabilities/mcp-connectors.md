---
uid: b2242e13-b82e-40e2-aff7-ee15f5fcc911
slug: capabilities/mcp-connectors
kind: capability
title: External MCP Connectors
display_ko: 외부 MCP 연결 도구
display_en: External MCP Connectors
domain: domains/agent-integration
elements: []
path: src/features/mcp-connectors/ui/ConnectorsPanel.tsx
created_by: agent:claude
dependencies: [capabilities/acp-runtime]
relation_notes: { capabilities/acp-runtime: "A connector is a descriptor this capability hands to the ACP session in session/new; that runtime spawns it. Connectors ride only a runtime whose configuration was measured to raise a permission request for an MCP child, which today is Claude alone." }
relates: []
---

## Definition

The ability to attach an external MCP server (Notion, GitHub, Atlassian, or one somebody wrote themselves) to the in-app coding-agent conversation, so the agent can use it beside the server that reads this ontology folder. Atlas runs none of them: it passes the descriptor into the ACP handshake and the coding agent spawns the process or opens the connection. That is what keeps this inside the rule that Atlas never executes third-party code, because the extension runs in a program the person already chose to trust.

## Four fences

1. **The folder's own server cannot be shadowed.** `claude-agent-acp` lets an ACP-supplied server override a same-named one from the caller, so a connector named `atlas-vault` would replace the person's own ontology server with somebody else's. That name is refused rather than sorted around.
2. **Two connectors sharing a name are both refused.** Picking one would be picking for the person: the agent's tool list would hold the name once, with nothing saying the other exists.
3. **A bare command is refused.** The agent process runs with a sanitized environment that has no `PATH` (`SHARED_RUNTIME_ENV` in `src-tauri/src/acp.rs`) and a connector inherits it, so `npx` resolves to nothing and the session comes up with that server's tools silently absent, which reads exactly like Atlas failing.
4. **A token is never on disk.** `.ontology-atlas/connectors.json` holds a keychain reference where a credential belongs, and the writer throws rather than put a credential-shaped literal into a folder that syncs, backs up, and gets committed. The value becomes a value inside Rust one line before it leaves for the agent, so the WebView never holds one either.

## What the person is told before switching one on

Each row states what will actually run, the command and its arguments or the address, rather than the connector's friendly name, which says nothing about what executes. Beside it: the traffic goes from the coding agent straight to that service with Atlas nowhere in the middle, and `.ontology-atlas/llm-audit.jsonl` records Atlas's own model calls only, so it does not cover this. A token that can write lets the agent change things in that service too, and every call it makes still stops at a permission card first.

A name a config layer on this machine already holds is called out before the switch, because `codex-acp` drops a same-named ACP server without a word, and learning that afterwards looks exactly like Atlas failing to attach anything.

## Runtime narrowing

Connectors ride only a runtime measured to raise `session/request_permission` for an MCP child. Claude's isolated configuration was measured to do it; Codex was measured **not** to for the Atlas server (installed app, 2026-08-24: a self-registered `add_relation` changed the ontology folder with no request and no card), and nobody has measured what it does with somebody else's. A Codex session therefore receives the ontology server and nothing else, and the panel says so rather than leaving the absence to read as a broken feature.

## Where the values live

Whether a variable's value sits in this machine's keychain or beside the connector is a per-variable choice the person makes. A credential-shaped name suggests the keychain by default, but the name is not the verdict: `OPENAPI_MCP_HEADERS` is the variable Notion's own server documents and it carries a bearer token, while `NOTION_VERSION` is a date. What the name still decides absolutely is that a literal under a credential-shaped name is never written to the file.

## Implementation evidence

- src-tauri/src/connectors.rs: Read-only discovery of the four agent config files; server names, transports, commands, addresses, and environment/header key names, never a value (`no_env_value_survives_serialization`)
- src-tauri/src/connector_secrets.rs: Keychain entries under a service of their own, and the resolver that turns a reference into a value at `params.mcpServers[*].env`/`.headers` and nowhere else
- src/shared/lib/connector-record.ts and src/shared/lib/connector-store.ts: The `.ontology-atlas/connectors.json` shape, the refusal to write a credential literal, and the sidecar's own ignore rule
- src/features/acp-session/model/connector-servers.ts: The four fences and the runtime narrowing, on the way into `session/new`
- src/features/mcp-connectors/ui/ConnectorsPanel.tsx: The screen a person reads before switching one on
- .claude/rules/surfaces.md: The written boundary for reading agent config files, and the two bridge rows

## Confidence
medium (0.6): Every fence, the refusal to write a credential, the reference resolver's position, and the runtime narrowing are held by unit and contract tests. What has not been measured is the installed app itself: real discovery from this machine's own config files, a real keychain round trip, and an external server's tools appearing in a live Claude session.
