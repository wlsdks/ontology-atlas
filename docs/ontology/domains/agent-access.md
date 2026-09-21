---
uid: 6ab33364-56bc-46ab-a709-a36b5bf697ae
slug: domains/agent-access
kind: domain
title: Agent access
display_en: Agent access
display_ko: 에이전트 접근
capabilities: [capabilities/agent-connector-setup, capabilities/agent-environment-doctor, capabilities/cli-commands, capabilities/in-app-coding-agent, capabilities/mcp-tool-server, capabilities/task-agent-brief, capabilities/vault-conversation-agent]
created_by: "agent:claude-code"
relation_notes: { elements/task-scoped-agent-brief-projection: "The compact brief a coding agent receives for one task is shaped by what an agent can act on, so its projection belongs with the agent interfaces.", capabilities/mcp-tool-server: You asked which capabilities sit under each domain; you approved this one under agent access., capabilities/cli-commands: You asked which capabilities sit under each domain; you approved this one under agent access., capabilities/task-agent-brief: You asked which capabilities sit under each domain; you approved this one under agent access., capabilities/agent-connector-setup: You asked which capabilities sit under each domain; you approved this one under agent access., capabilities/in-app-coding-agent: "You asked me to add any capability the code shows that the map lacks; this is one, and the tool asked the domain to declare it back.", capabilities/vault-conversation-agent: "You asked me to add any capability the code shows that the map lacks; this is one, and the tool asked the domain to declare it back.", capabilities/agent-environment-doctor: "You asked me to add any capability the code shows that the map lacks; this is one, and the tool asked the domain to declare it back.", elements/mcp-rpc-envelope: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/mcp-server-runtime: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/mcp-initialize-instructions: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/task-navigation-evidence: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/cli-vault-bootstrap: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/cli-mcp-verify: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/vault-connector-registry: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/acp-vault-mcp-wiring: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/acp-permission-scope: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/acp-tool-policy: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/acp-runtime-gate: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/agent-system-prompt: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/agent-tool-catalog: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/agent-proposal-applier: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back., elements/llm-provider-adapter: You asked me to answer the warnings the tools return; this one asked the domain to declare the role back. }
elements: [elements/acp-permission-scope, elements/acp-runtime-gate, elements/acp-tool-policy, elements/acp-vault-mcp-wiring, elements/agent-proposal-applier, elements/agent-system-prompt, elements/agent-tool-catalog, elements/cli-mcp-verify, elements/cli-vault-bootstrap, elements/llm-provider-adapter, elements/mcp-initialize-instructions, elements/mcp-rpc-envelope, elements/mcp-server-runtime, elements/task-navigation-evidence, elements/task-scoped-agent-brief-projection, elements/vault-connector-registry]
---

The interfaces through which AI coding agents read the same reviewed meaning and propose changes to it as formal users, rather than through a separate machine-only channel.

## Includes
- The MCP tool server and the read and write inventory it advertises over JSON-RPC.
- The CLI carrying the same graph authority from a terminal.
- The task-scoped brief that hands an agent the meaning relevant to the work in front of it.
- Registering Atlas's MCP with the person's agent hosts and proving the connection works.

## Excludes
- The graph schema and storage, which the meaning layer owns.
- The human screens.
- Any guarantee that a host agent actually calls Atlas or follows the guidance it returns; a configured connection is an interface, not a promise.

## Uncertainty
- Read from `mcp/src/server/`, `mcp/src/tools/`, `cli/src/lib/cli-commands.mjs`, `mcp/src/agent-brief-compact.mjs` and `src/features/mcp-connectors/`, plus the surface table in `docs/FEATURES.md`. The advertised tool count is deliberately not recorded here because that document says the live `tools/list` owns it; no agent host was actually connected during this scan.