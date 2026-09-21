---
uid: 42ddbc44-8c77-4c1d-b5aa-67ef42a873a5
slug: elements/mcp-server-runtime
kind: element
title: MCP server runtime facts
display_en: MCP server runtime facts
display_ko: MCP 서버 런타임 사실
domain: domains/agent-access
path: mcp/src/server/runtime.mjs
created_by: "agent:claude-code"
---

Holds the process-level facts every handler needs (which vault and repository roots are bound, how each was resolved, and the session's compiled graph cache), and fails fast at import time if a root is wrong.

## Includes
- The resolved roots and their resolution method, which the connection check reports.
- The per-session cache and the limit on listener registration.

## Excludes
- Choosing the roots; it records what was configured.
- Any tool behaviour.

## Uncertainty
- Read from the module header, which explains that the guard must throw before the transport attaches or a client reads the crash as silence. That failure path was not exercised.