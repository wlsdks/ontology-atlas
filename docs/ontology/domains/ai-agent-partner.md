---
slug: domains/ai-agent-partner
kind: domain
title: AI Agent Partner
capabilities: [mcp-conflict-guard, mcp-server, ontology-bootstrap-skill, ontology-extract-skill, ontology-sync-skill, session-start-ontology-context]
elements: [.claude/hooks/inject-ontology-summary.sh, mcp-sdk, mcp/src/index.js, mcp/src/parser.mjs, mcp/src/vault.mjs]
relates: [domains/ontology-core, domains/vault-local-first]
---

# AI Agent Partner

Claude Code 같은 LLM agent 가 같은 ontology 를 read/write 하는 surface.
MCP 서버 (`mcp/`) 가 23 도구 (read 15 + write 8) 를 stdin/stdout JSON-RPC
로 노출. 등록 가이드: `mcp/README.md`. 사용자 LLM 비용을 cloud 로 옮기지
않음 — agent 가 자기 LLM 으로 호출.
