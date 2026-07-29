---
slug: elements/mcp-sdk
kind: element
title: "@modelcontextprotocol/server"
domain: ai-agent-partner
path: mcp/package.json
relates:
  - capabilities/mcp-server
---

# @modelcontextprotocol/server

Official MCP TypeScript SDK. As of 2026-07-29 this project pins the **v2 line** —
`@modelcontextprotocol/server@2.0.0` with `@modelcontextprotocol/core@2.0.0`.

Upstream split the monolithic `@modelcontextprotocol/sdk` into `core` / `server` /
`node` on 2026-07-27, alongside the `2026-07-28` specification, and v2 became the
stable release line. v1 moved to a long-lived `v1.x` branch that receives bug and
security fixes for at least six months.

## The wire protocol did not move with the package

v2 ships the **same** supported-version list as v1 — measured at migration time:

```
SUPPORTED = ["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]
LATEST    = "2025-11-25"
```

The `2026-07-28` spec's `server/discover`, stateless per-request envelope, and
`subscriptions/listen` exist in v2's **type definitions** but not in its
negotiation constants. Counting those strings in the shipped bundle is not
evidence of implementation — they appear in `.d.mts` files and source maps.

So this dependency buys **the vessel, not the cargo**: when the SDK implements
`2026-07-28`, this project's move becomes a version bump instead of a package
rewrite.

## What the code uses

`mcp/src/index.js` imports `Server` from `@modelcontextprotocol/server` and
`StdioServerTransport` from `@modelcontextprotocol/server/stdio`.

Handler registration changed shape: v1 took a schema object
(`setRequestHandler(ListToolsRequestSchema, …)`), v2 takes a **method string**
(`setRequestHandler('tools/list', …)`). Passing a v1 schema to v2 throws at
startup rather than failing silently, which makes this a safe class of change.

## Old clients still connect

Verified by driving a v2 server over stdio with a `2024-11-05` `initialize`: it
negotiates that version and answers `tools/list` and `tools/call` normally.
Claude Code, Codex, Cursor and other MCP clients are unaffected by the package
migration. `mcp/src/integration.test.mjs` keeps that oldest-supported handshake
deliberately, so the backward-compatibility claim stays tested rather than
assumed.

The server does not expose a local HTTP transport, so the SDK's pre-1.24.0
DNS-rebinding advisory for unauthenticated localhost HTTP servers does not apply
to this surface; any future HTTP transport needs a separate auth and host
validation review.
