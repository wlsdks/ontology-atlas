---
slug: elements/mcp-sdk
kind: element
title: "@modelcontextprotocol/sdk"
domain: ai-agent-partner
path: mcp/package.json
relates:
  - capabilities/mcp-server
  - domains/ai-agent-partner
---

# @modelcontextprotocol/sdk

Official MCP TypeScript/JS SDK. As of 2026-06-12 this project pins
`@modelcontextprotocol/sdk` to `1.29.0`, the latest stable v1 release. The
upstream v2 SDK/spec work is still pre-alpha, so production builds stay on v1.x
until that branch stabilizes.

`mcp/src/index.js` uses `Server`, `StdioServerTransport`,
`CallToolRequestSchema`, and `ListToolsRequestSchema`. Claude Code, Codex,
Cursor, and other MCP-compatible clients call it through stdin/stdout JSON-RPC.
The server does not expose a local HTTP transport, so the SDK's pre-1.24.0
DNS-rebinding advisory for unauthenticated localhost HTTP servers does not
apply to this surface; any future HTTP transport needs a separate auth and host
validation review.
