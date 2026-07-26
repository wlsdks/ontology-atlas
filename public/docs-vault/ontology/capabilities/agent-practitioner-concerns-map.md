---
slug: capabilities/agent-practitioner-concerns-map
kind: capability
title: Agent Practitioner Concerns Map
display_ko: AI 사용자들의 걱정 정리
display_en: What AI Users Worry About
domain: ai-agent-partner
elements: []
relates: [capabilities/agent-graph-readiness, capabilities/agent-onboarding-brief, capabilities/mcp-conflict-guard, capabilities/mcp-server, capabilities/session-start-ontology-context, documents/agent-practice-research]
---

AI agent 기능을 추가할 때 먼저 확인하는 실패 모드 지도. Ontology Atlas 는 agent 를 직접 채팅처럼 대체하기보다, Claude Code / Codex 같은 agent 가 더 적은 추측으로 repo ontology 를 읽고, 검증하고, 갱신하게 돕는다.

`src/shared/lib/ontology-tree/agent-query-recipes.ts` 의 `AGENT_PRACTITIONER_CONCERNS` 가 단일 source of truth 다. 현재 순서는 `context`, `tools`, `evidence`, `drift`, `workflow` 이며, `formatAgentPractitionerConcernsChecklist()` 를 통해 `agent-briefing-packet.ts` 의 handoff 체크리스트로 소비된다. 한때 이 순서를 화면에 노출하던 UI 들은 모두 사라졌다: `/ontology/edit` 의 관계 저장 확인 모달 (`RelationWriteConfirm.tsx`) 은 2026-07-24 xyflow ERD 빌더 은퇴와 함께 제거됐고 (관계 쓰기 확인은 이제 나침 무대 `/ontology/studio` 의 인라인 소켓 채우기로 대체 — `capabilities/studio-relation-write-confirm`), 그 이전 2026-07 지도 재구성 때는 graph DB 쿼리 cockpit 도 제거됐다. 따라서 이 concern 순서는 이제 UI 표면이 아니라 agent handoff 패킷 안에서 산다.

각 concern 은 짧은 화면 문구만 갖지 않는다. 모델 안에 `researchSignals`, `sourceUrls`, `productResponse` 를 함께 저장해 Claude Code context-window / MCP / subagent 관행, Codex sandbox / approval / telemetry 관행, LangChain context engineering / observability / human-in-the-loop 관행, MCP least-privilege / consent / audit 보안 관행을 Ontology Atlas 제품 판단 기준으로 압축한다.

`formatAgentPractitionerConcernsChecklist()` 는 이 research-backed concern map 을 Claude Code 또는 Codex 에 붙여넣을 수 있는 체크리스트로 만든다. 화면은 복잡하게 늘리지 않고, agent 에게 전달되는 payload 안에서 "왜 이 기준이 필요한지", "어느 공개 근거를 확인했는지", "Ontology Atlas 가 무엇으로 대응하는지"를 같이 보존한다.

이 capability 는 agent-facing 기능을 추가하기 전 gate 로 쓰인다. 새 기능이 ontology entrypoint, MCP boundary, runnable proof, stale memory/drift, small read-check-write-sync loop 중 무엇을 강화하는지 말할 수 없으면 아직 제품에 넣지 않는다.