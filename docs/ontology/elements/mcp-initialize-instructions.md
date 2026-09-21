---
uid: 6d930d57-1c9e-4343-a64d-3ec84f670d94
slug: elements/mcp-initialize-instructions
kind: element
title: MCP initialize instructions
display_en: MCP initialize instructions
display_ko: MCP 초기화 안내문
domain: domains/agent-access
path: mcp/src/server/instructions.mjs
created_by: "agent:claude-code"
---

Composes the guidance an agent receives the moment it connects, ordered so that a host which keeps only the first part still gets the identity line and the construction card.

## Includes
- The ordered sections, with the live tool inventory left as a placeholder the registry fills.
- The design that anything a truncating host drops stays reachable through the guide topics.

## Excludes
- The per-tool descriptions, which are delivered whole and separately.
- Enforcing that a host reads any of it.

## Uncertainty
- Read from the module header, which records a live session where these instructions were cut mid-sentence at roughly 2,048 characters. Whether the current ordering survives every host was not tested, and this session did receive a truncated copy.