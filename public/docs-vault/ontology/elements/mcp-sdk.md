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

Anthropic 의 공식 MCP TypeScript/JS SDK. `mcp/src/index.js` 가 `Server` +
`StdioServerTransport` + `CallToolRequestSchema` / `ListToolsRequestSchema` 를 사용.
Claude Code · 다른 MCP 호환 client 가 stdin/stdout JSON-RPC 로 호출.
