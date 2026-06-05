---
slug: capabilities/agent-practitioner-concerns-map
kind: capability
title: Agent Practitioner Concerns Map
domain: ai-agent-partner
elements: []
relates: [capabilities/agent-graph-readiness, capabilities/agent-onboarding-brief, capabilities/mcp-conflict-guard, capabilities/mcp-server, capabilities/session-start-ontology-context]
---

# Agent Practitioner Concerns Map

AI agent 기능을 추가할 때 먼저 확인하는 실패 모드 지도. Context Atlas 는 agent 를 직접 채팅처럼 대체하기보다, Claude Code / Codex 같은 agent 가 더 적은 추측으로 repo ontology 를 읽고, 검증하고, 갱신하게 돕는다.

## 다루는 고민

- Context reliability: agent 가 어떤 AGENTS.md / CLAUDE.md / vault node / MCP result 를 근거로 삼는지 추적한다.
- Tool boundary: MCP tool 이 많아질수록 tool filtering, 이름 충돌, 승인 경계, 실패 처리가 중요하다.
- Evidence loop: agent 가 변경 후 `health`, `graph DB pack`, `post-change-sync` 로 검증했는지 제품 안에서 이어준다.
- Memory drift: markdown memory, skills, hooks, ontology node 가 중복되거나 stale 해지는 상태를 graph health 로 드러낸다.
- Workflow fit: Anthropic 이 권장하는 단순하고 composable 한 workflow 를 우선하고, 장기 자율 agent 는 증거가 있을 때만 확장한다.

## 조사 근거

- Anthropic, Building effective agents: workflows 와 agents 를 구분하고 단순한 composable pattern 과 좋은 tool definition 을 강조한다.
- Anthropic Claude Code memory docs: CLAUDE.md 계층과 import 가 session context 의 핵심 입력이다.
- OpenAI Agents SDK MCP guide: MCP transport, tool filtering, approval flow, server-prefixed tool names, partial connection failure handling 이 agent runtime 의 실제 운영 경계다.

## 제품 판단 규칙

새 기능이 다음 중 하나를 개선하지 않으면 AI-agent-first 우선순위로 보지 않는다.

1. agent 가 읽어야 할 context 를 줄이거나 더 정확히 고른다.
2. MCP / CLI tool call 의 실패나 권한 경계를 더 명확히 만든다.
3. 변경 후 graph evidence 를 더 쉽게 복사, 실행, 비교하게 한다.
4. 사람에게는 같은 정보를 더 적은 화면 부담으로 보여준다.