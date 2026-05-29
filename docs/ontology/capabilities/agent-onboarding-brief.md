---
slug: capabilities/agent-onboarding-brief
kind: capability
title: Agent Onboarding Brief (1-paste prime)
domain: views
elements: [src/shared/lib/ontology-tree/agent-briefing-packet.ts, src/views/ontology-view/ui/OntologyViewPage.tsx]
relates: [capabilities/agent-graph-readiness, capabilities/mcp-server, domains/ai-agent-partner]
dependencies: [capabilities/ontology-hub-mode-aware]
---

`/ontology` 허브의 "Prime your AI agent" 원클릭 액션. 그동안 `/ontology/insights`
전반에 흩어져 있던 ~10개의 개별 "Copy …" 패킷(run order · graph-DB pack ·
readiness · write guardrails · CLI fallback)을 **단일 1-paste 브리핑**으로 통합한다.

`buildAgentBriefingPacket(nodes, edges, tree)` 가 기존 certified composer
(`buildAgentHandoffPrompt` · `buildAgentReadinessSummary` · entrypoint/recipe/
traversal/guardrail 빌더)를 조립하고, 맨 앞에 mental-model census + readiness
헤더만 덧붙여 완전한 에이전트 온보딩 브리핑 문자열을 만든다. 새 그래프 로직은
없고 동일 그래프 → 동일 출력(순수), 빈 vault 안전.

제품 핵심 루프(개발자 + 그 AI agent 가 한 온톨로지를 같이 키운다)에서 "에이전트에
코드베이스 메모리를 1회 주입" 단계를 한 번의 클릭으로 만든다. 텍스트 색은
mode-aware 토큰이라 다크/라이트 모두 가독. CTA 라벨/토스트만 i18n(en/ko).

design panel(3 lens + judge)으로 섹션/순서/배치 확정. agent-graph-readiness 와
같은 readiness/handoff composer 를 재사용하는 자매 capability.