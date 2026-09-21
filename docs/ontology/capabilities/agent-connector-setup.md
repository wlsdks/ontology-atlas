---
uid: 7ec556ec-768d-40c3-8147-19db4287a338
slug: capabilities/agent-connector-setup
kind: capability
title: Agent connector setup
display_en: Agent connector setup
display_ko: 에이전트 커넥터 설정
domain: domains/agent-access
elements: [elements/vault-connector-registry]
path: src/features/mcp-connectors/index.ts
created_by: "agent:claude-code"
dependencies: [capabilities/mcp-tool-server]
relation_notes: { capabilities/mcp-tool-server: "You asked for what depends on what: the setup proves itself by comparing the live tool inventory the server announces.", elements/vault-connector-registry: "You asked for element nodes named by role under the capability that uses them; keeping the folder's connector list is this role." }
---

Registers Atlas's MCP server with the agent hosts a person already uses, writing the client configuration and then proving the connection actually answers.

## Includes
- Writing the host configuration that names the absolute path an MCP registration needs.
- A verification step that compares the live tool inventory against what the server announced.

## Excludes
- Running the agent or supplying its model credentials.
- Registration from the website, which the repository states cannot record an absolute path.

## Uncertainty
- Read from `src/features/mcp-connectors/`, `src-tauri/src/connectors.rs` and the `mcp-verify` command by name. No host was configured during this scan, and which agent hosts are supported today was not enumerated.