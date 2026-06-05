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

## 제품 구현

`src/shared/lib/ontology-tree/agent-query-recipes.ts` 의 `AGENT_PRACTITIONER_CONCERNS` 가 이 다섯 고민의 순서와 영문 handoff copy 를 소유한다. `formatAgentPractitionerConcernsChecklist()` 는 같은 모델에서 Claude Code / Codex 에 붙여 넣을 체크리스트를 만든다.

`src/views/ontology-view/ui/parts/AgentStatusPopover.tsx` 와 `src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx` 는 이 공통 모델을 읽고 화면별 짧은 한국어 라벨만 입힌다. 그래서 connection popover, graph DB query cockpit, result contract tab 이 같은 concern 순서와 gate 를 공유하고, 후속 UI 는 새 문자열을 복붙하지 않고 같은 모델을 확장하면 된다.

## 조사 근거

- Anthropic Claude Code MCP docs: Claude Code 는 MCP 로 외부 tool/data source 에 연결하며, Atlas 는 직접 채팅을 열기보다 repo MCP 연결과 첫 query 를 준비해야 한다.
- Anthropic Claude Code best practices / advanced patterns: context 전략, MCP, hooks, skills, subagents 를 작은 역할과 검증 가능한 workflow 로 다뤄야 한다.
- OpenAI Codex docs: Codex 는 AGENTS.md 와 MCP 같은 항상 켜진 작업 계약을 읽고, Atlas 는 이 계약 앞뒤의 ontology context 와 runtime gate 를 제공해야 한다.
- LangChain / LangGraph production agent guidance: durable execution, trace, memory, human-in-the-loop, eval/replay 는 agent 결과를 믿기 전 확인해야 할 운영 관심사다.

## 제품 판단 규칙

새 기능이 다음 중 하나를 개선하지 않으면 AI-agent-first 우선순위로 보지 않는다.

1. agent 가 읽어야 할 context 를 줄이거나 더 정확히 고른다.
2. MCP / CLI tool call 의 실패나 권한 경계를 더 명확히 만든다.
3. 변경 후 graph evidence 를 더 쉽게 복사, 실행, 비교하게 한다.
4. stale memory / duplicate concept / unresolved relation 을 유지보수 작업으로 드러낸다.
5. 사람에게는 같은 정보를 더 적은 화면 부담으로 보여준다.