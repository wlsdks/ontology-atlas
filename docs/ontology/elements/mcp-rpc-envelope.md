---
uid: 2f49bc45-8321-46be-9d96-afa7c22595a5
slug: elements/mcp-rpc-envelope
kind: element
title: MCP result envelope
display_en: MCP result envelope
display_ko: MCP 응답 봉투
domain: domains/agent-access
path: mcp/src/server/rpc.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/mcp-tool-server]
relation_notes: { capabilities/mcp-tool-server: "You asked me to turn imports I actually witnessed into dependencies: rpc.mjs imports the tool table from server/registry.mjs to shape a result." }
---

Turns a handler's return value into the shape an agent reads, and a thrown error into a typed code with a readable message and the nearest-value hint the agent can recover from.

## Includes
- The success envelope carrying both the readable content and the structured result.
- Error typing, including the conflict a stale write raises, with a suggestion for a mistyped value.

## Excludes
- Deciding what a tool does; it only wraps the outcome.
- The transport itself.

## Uncertainty
- Read from the module header and its imports of the tool table, the conflict error and the suggestion helper. The mapping from each internal failure to each returned code was not traced.