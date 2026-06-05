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

- Context reliability: agent 가 어떤 AGENTS.md / CLAUDE.md / vault node / MCP result 를 근거로 삼는지 추적한다. Gate 는 `agent_brief` 또는 `workspace_brief` 가 시작점과 blocker 를 이름으로 돌려주는지다.
- Tool boundary: MCP tool 이 많아질수록 tool filtering, 이름 충돌, 승인 경계, 실패 처리가 중요하다. Gate 는 Claude Code 의 `/mcp` 또는 Codex 의 `codex mcp list` 로 실제 연결을 확인하는 것이다.
- Evidence loop: agent 가 변경 후 `health`, `graph DB pack`, `relation_check`, `post-change-sync` 로 검증했는지 제품 안에서 이어준다. Gate 는 설명 라벨이 아니라 복사 가능한 proof command 다.
- Memory drift: markdown memory, skills, hooks, ontology node 가 중복되거나 stale 해지는 상태를 graph health 와 maintenance queue 로 드러낸다.
- Workflow fit: 단순하고 composable 한 read-check-write-sync loop 를 우선하고, 장기 자율 agent / subagent handoff 는 해당 loop 가 통과한 뒤에만 확장한다.

## 조사 근거

- Anthropic Claude Code MCP docs: Claude Code 는 MCP 로 외부 tool/data source 에 연결하며, Atlas 는 직접 채팅을 열기보다 repo MCP 연결과 첫 query 를 준비해야 한다.
- Anthropic Claude Code best practices: context window 가 빨리 차고 성능이 저하될 수 있으므로, CLAUDE.md / slash commands / MCP / hooks / subagents 를 작은 역할과 검증 가능한 workflow 로 다뤄야 한다.
- Anthropic evals for AI agents: multi-turn agent loop 는 tool call, 환경 변경, 재현 가능한 grading 을 같이 봐야 하며, agent 가 테스트 환경의 우회 경로를 악용하지 않도록 proof 를 명확히 해야 한다.
- Anthropic trustworthy agents: agent 는 스스로 tool use 를 지시하고 subagent 로 작업을 넘길 수 있으므로, human review, 권한 경계, handoff evidence 가 제품 안에 드러나야 한다.
- OpenAI Codex agent loop: Codex 는 user, model, tools 사이의 loop 로 동작하므로, Atlas 의 역할은 loop 앞뒤의 ontology context 와 runtime gate 를 제공하는 것이다.

## 제품 판단 규칙

새 기능이 다음 중 하나를 개선하지 않으면 AI-agent-first 우선순위로 보지 않는다.

1. agent 가 읽어야 할 context 를 줄이거나 더 정확히 고른다.
2. MCP / CLI tool call 의 실패나 권한 경계를 더 명확히 만든다.
3. 변경 후 graph evidence 를 더 쉽게 복사, 실행, 비교하게 한다.
4. stale memory / duplicate concept / unresolved relation 을 유지보수 작업으로 드러낸다.
5. 사람에게는 같은 정보를 더 적은 화면 부담으로 보여준다.