---
slug: capabilities/agent-onboarding-brief
kind: capability
title: Agent Onboarding Brief (1-paste prime)
domain: views
elements: [elements/ontology-node-detail-modal, src/shared/lib/ontology-tree/agent-briefing-packet.ts, src/views/ontology-view/ui/OntologyViewPage.tsx]
relates: [capabilities/agent-graph-readiness, capabilities/mcp-server, domains/ai-agent-partner]
dependencies: [capabilities/ontology-hub-mode-aware]
---

Agent onboarding brief composer. 그동안 `/ontology/insights` 전반에 흩어져 있던
개별 "Copy …" 패킷(run order · graph-DB pack · readiness · write guardrails · CLI
fallback)을 **단일 1-paste 브리핑**으로 통합하는 순수 패킷 빌더다.

`buildAgentBriefingPacket(nodes, edges, tree)` 가 기존 certified composer
(`buildAgentHandoffPrompt` · `buildAgentReadinessSummary` · entrypoint/recipe/
traversal/guardrail 빌더)를 조립하고, 맨 앞에 mental-model census + readiness
헤더만 덧붙여 완전한 에이전트 온보딩 브리핑 문자열을 만든다. 새 그래프 로직은
없고 동일 그래프 → 동일 출력(순수), 빈 vault 안전.

제품 핵심 루프(개발자 + 그 AI agent 가 한 온톨로지를 같이 키운다)에서 "에이전트에
코드베이스 메모리를 1회 주입"할 수 있는 payload를 만든다. `/ontology` 의미 지도
상단에서는 중복 agent connection CTA를 제거했으므로, 이 composer는 Insights,
CLI/MCP handoff, 또는 향후 명확히 배치된 agent setup surface에서 사용한다.

design panel(3 lens + judge)으로 섹션/순서/배치 확정. agent-graph-readiness 와
같은 readiness/handoff composer 를 재사용하는 자매 capability.
