---
slug: domains/ai-agent-partner
kind: domain
title: AI Agent Partner
capabilities:
  - mcp-server
  - mcp-list-concepts
  - mcp-get-concept
  - mcp-find-evidence
  - mcp-add-concept
  - mcp-add-relation
elements:
  - mcp/src/index.js
  - mcp/src/parser.mjs
  - mcp/src/vault.mjs
relates:
  - domains/vault-local-first
  - domains/ontology-core
---

# AI Agent Partner

Claude Code 같은 LLM agent 가 같은 ontology 를 read/write 하는 surface.
MCP 서버 (`mcp/`) 가 5 도구를 stdin/stdout JSON-RPC 로 노출. 등록 가이드:
`mcp/README.md`. 사용자 LLM 비용을 cloud 로 옮기지 않음 — agent 가 자기 LLM 으로 호출.
