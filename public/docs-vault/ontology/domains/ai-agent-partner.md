---
slug: domains/ai-agent-partner
kind: domain
title: AI Agent Partner
capabilities: [agent-config-onboarding, capabilities/agent-practitioner-concerns-map, capabilities/project-ontology-indexing, firebase-deploy-skill, mcp-conflict-guard, mcp-server, ontology-bootstrap-skill, ontology-extract-skill, ontology-sync-skill, session-start-ontology-context]
elements: [.claude/hooks/block-npm-publish.sh, .claude/hooks/inject-ontology-summary.sh, elements/agent-activity-hooks, mcp-sdk, mcp/src/index.js, mcp/src/parser.mjs, mcp/src/vault.mjs]
relates: [domains/ontology-core, domains/vault-local-first]
---

# AI Agent Partner

Claude Code 같은 LLM agent 가 같은 ontology 를 read/write 하는 surface.
MCP 서버 (`mcp/`) 가 24 도구 (read 16 + write 8) 를 stdin/stdout JSON-RPC
로 노출. 등록 가이드: `mcp/README.md`. 사용자 LLM 비용을 cloud 로 옮기지
않음 — agent 가 자기 LLM 으로 호출.

`.claude/hooks/block-npm-publish.sh` 는 agent 가 사용자 명시 승인 없이 npm
publish 계열 명령을 실행하지 못하게 막는 안전장치다. `pnpm test:claude:hooks`
가 hook wiring 과 publish guard 동작을 focused gate 로 검증한다.
