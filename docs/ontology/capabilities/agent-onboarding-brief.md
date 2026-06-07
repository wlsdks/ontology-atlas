---
slug: capabilities/agent-onboarding-brief
kind: capability
title: Agent Onboarding Brief (1-paste prime)
domain: views
elements: [cli/src/lib/query-result-contract.mjs, elements/business-ontology-lens, elements/ontology-node-detail-modal, mcp/src/ontology-engine.mjs, src/shared/lib/ontology-tree/agent-briefing-packet.ts, src/views/ontology-insights/lib/collaborator-insights-brief.ts, src/views/ontology-insights/ui/parts/InsightsCollaboratorBriefPanel.tsx, src/views/ontology-view/ui/OntologyViewPage.tsx]
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

MCP `agent_brief` 와 CLI `agent-brief --json` 은 같은 business-first lens 를
문자열에만 숨기지 않고 `businessOntologyLens` 구조로 노출한다. 이 필드는
`policy: business-first`, `readOrder: outcome -> domain -> capability -> element`,
business domain 후보, capability outcome 후보, implementation evidence 후보,
그리고 "paths / APIs / routes / commands 를 ontology root 로 보지 말라"는
guidance 를 함께 반환한다. `decisionQuestions` 도 같은 구조 안에 들어가며,
질문은 business outcome, 비즈니스/제품 domain boundary, 사람이 논의할 capability
claim, 그 claim 을 증명하거나 반박하는 implementation evidence 순서로 고정된다.
그래서 connector-less agent 와 MCP-connected agent 모두 같은 payload 에서 먼저
어떤 결과를 설명하거나 개선할지 묻고, 비즈니스 경계와 역량 주장을 거쳐 구현 증거를
나중에 붙이는 순서를 기계적으로 검증할 수 있다.

`mcp/src/ontology-engine.mjs` 가 실제 `businessOntologyLens.decisionQuestions` 와
handoff prompt 문장을 만든다. `cli/src/lib/query-result-contract.mjs` 는 CLI 가
받은 agent_brief JSON 에 같은 네 질문이 없으면 실패하게 해서, 터미널 fallback 과
MCP-connected agent 가 다른 business extraction contract 를 보지 않게 막는다.

`src/views/ontology-insights/lib/collaborator-insights-brief.ts` 도 같은 shared
business lens 를 읽어 collaborator brief 의 `Business extraction checks` 섹션에
네 질문을 그대로 넣는다. 그래서 사람이 `/ontology/insights` 에서 복사한 회의/리뷰
브리프와 Claude Code/Codex 가 받는 `agent_brief` 는 같은 business outcome, business/product boundary,
capability claim, implementation evidence contract 를 본다. UI wiring 은
`src/views/ontology-insights/ui/parts/InsightsCollaboratorBriefPanel.tsx` 가 맡고,
같은 네 질문을 evidence 탭에도 직접 보여준다. 즉 사용자는 복사 버튼을 누르기 전에
화면에서 이 ontology 가 어떤 business claim 을 묻고 어떤 implementation evidence 를
요구하는지 확인할 수 있다. agent query recipe 의 focused question handoff 와
business decision brief 는 같은 질문에 `Required answer shape` 를 붙여, agent 가
outcome / boundary / capability claim / proof verdict 를 먼저 쓰고 path 나 API 는
implementation evidence 로만 인용하게 한다. 메시지 catalog 는 이 섹션 heading 만 번역한다.

`/ontology` 의미 지도의 `브리핑 복사`도 같은 loop 를 따른다. 복사된
business-to-code brief 는 사람이 읽는 도메인 -> 역량 -> 구현 증거 요약 뒤에
바로 실행 가능한 MCP first calls (`agent_brief`, `workspace_brief`, `health`) 와
CLI fallback (`ontology-atlas agent-brief docs/ontology --json`,
`ontology-atlas health docs/ontology`) 을 포함한다. 그래서 기획자나 리더가
공유한 브리핑을 받은 Claude Code / Codex 는 별도 문서 해석 없이 같은 graph
health 와 handoff payload 부터 검증할 수 있다.

`/ontology` 의미 지도는 이 검증 루프를 이제 클립보드 안에만 숨기지 않는다.
visible Agent graph DB gate 가 `agent_brief -> workspace_brief -> health` 순서를
화면에 노출해, 사람도 앱 첫 화면에서 AI agent 가 같은 ontology graph 를 읽고,
drift 를 검증한 뒤, 변경을 제안한다는 운영 계약을 확인할 수 있다. 각 gate 는
개별 복사 버튼도 제공하므로, 전체 브리핑을 복사하지 않아도 필요한 MCP check 하나를
즉시 agent 세션에 넘길 수 있다.

그 브리핑은 이제 별도 `Business evidence gate` 섹션도 포함한다. Agent 는
source folder 를 capability 로 승격하기 전에 `meaningGate.businessOntology.evidence`
행을 먼저 보고하고, 아직 제품 의미가 없는 source folder 는
`meaningGate.implementationEvidence.reviewRequiredRows` 큐로 남겨야 한다. paths,
APIs, routes, commands 는 domain/capability owner 가 분명해진 뒤 붙는 구현 증거이지
ontology root 가 아니다.

design panel(3 lens + judge)으로 섹션/순서/배치 확정. agent-graph-readiness 와
같은 readiness/handoff composer 를 재사용하는 자매 capability.
