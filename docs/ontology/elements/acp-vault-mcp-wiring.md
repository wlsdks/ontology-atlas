---
uid: d8b2f8c4-be95-44f2-afd9-840b751deb49
slug: elements/acp-vault-mcp-wiring
kind: element
title: ACP vault MCP wiring
display_en: ACP vault MCP wiring
display_ko: ACP 볼트 MCP 연결
domain: domains/agent-access
path: src/features/acp-session/model/vault-mcp-server.ts
created_by: "agent:claude-code"
---

Hands the bundled Atlas server to a new agent session automatically, so the person's vault is already loaded the moment the conversation opens and no configuration file is ever edited.

## Includes
- Passing the bundled server in at session creation rather than asking the person to register it.

## Excludes
- Registering Atlas with agent hosts outside the app, which the connector setup does.
- Deciding what the agent may then do, which the permission rules decide.

## Uncertainty
- Read from the module header, which records a 2026-08-16 measurement where an agent read a 79-node vault without the person creating any config. That measurement was not reproduced here, and its own header calls this wiring the substance of the feature: a product claim, not a verified one.