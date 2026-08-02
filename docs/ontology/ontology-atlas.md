---
uid: 8c48b61f-1f75-448e-87a5-6ea2a7b02cf8
slug: ontology-atlas
kind: project
title: Ontology Atlas
display_ko: 온톨로지 아틀라스
display_en: Ontology Atlas
domains: []
capabilities: []
elements: []
contains: [domains/agent-integration, domains/graph-modeling, domains/local-vault-management, domains/onboarding-and-shell, domains/project-portfolio, domains/topology-navigation]
created_by: human
path: README.md
---

## 정의
로컬 마크다운 볼트의 frontmatter를 타입이 있는 계산 가능 그래프(도메인·능력·구현 증거·의존·영향)로 바꾸는 로컬-퍼스트 온톨로지 워크벤치. 개발자는 CLI/웹으로, AI 코딩 에이전트는 MCP로 같은 파일을 읽고 쓴다.

## 근거
- README.md — "Your AI coding agent forgets your codebase between sessions... turns the Markdown in your repository into a graph of your product"
- AGENTS.md — Project overview ("a local-first ontology workbench for understanding a product/system from business core to implementation evidence")

## 포함 / 제외
- 포함: 그래프 스키마·컴파일·쿼리, MCP/CLI 에이전트 연동, 로컬 볼트 관리, 토폴로지 탐색, 프로젝트 포트폴리오, 온보딩·배포·앱 셸
- 제외: 백엔드/인증/클라우드 협업 (R10에서 영구 제거, Layer 2로만 조건부 재도입)

## 확신도
high (README + AGENTS.md 직접 인용)

## Competency answers

### scope — answered

What product/system outcome and user problem define the ontology scope?

Ontology Atlas helps people and AI coding agents preserve and judge one shared, local-first meaning model of a product and the implementation evidence behind it.

- Concepts: `ontology-atlas`
- Evidence: `README.md`

### domains — answered

Which stable business responsibilities or decision boundaries form its domains?

Six stable responsibility boundaries cover agent integration, graph modeling, local vault management, onboarding and shell delivery, project portfolio work, and topology navigation.

- Concepts: `ontology-atlas`, `domains/agent-integration`, `domains/graph-modeling`, `domains/local-vault-management`, `domains/onboarding-and-shell`, `domains/project-portfolio`, `domains/topology-navigation`
- Relations: `ontology-atlas` --contains--> `domains/agent-integration`, `ontology-atlas` --contains--> `domains/graph-modeling`, `ontology-atlas` --contains--> `domains/local-vault-management`, `ontology-atlas` --contains--> `domains/onboarding-and-shell`, `ontology-atlas` --contains--> `domains/project-portfolio`, `ontology-atlas` --contains--> `domains/topology-navigation`
- Evidence: `README.md`

### abilities — answered

Which observable abilities realize those outcomes inside each domain?

The agent-integration domain exposes an MCP server and terminal workflow that let agents query, write, verify, and hand off the same ontology humans inspect.

- Concepts: `domains/agent-integration`, `capabilities/mcp-server`, `capabilities/cli-developer-entry`
- Relations: `domains/agent-integration` --capabilities--> `capabilities/mcp-server`, `domains/agent-integration` --capabilities--> `capabilities/cli-developer-entry`
- Evidence: `mcp/src`, `cli/src`

### evidence — answered

Which source artifacts provide implementation evidence for each ability?

The MCP and CLI source entrypoints are exact repository witnesses for the agent-facing read, write, verification, and handoff abilities.

- Concepts: `capabilities/mcp-server`, `capabilities/cli-developer-entry`
- Evidence: `mcp/src`, `cli/src`
- Paths: `mcp/src`, `cli/src`

### impact — answered

Which typed dependencies explain change impact across the model?

The CLI depends on the MCP server contract, so MCP schema or behavior changes define a typed impact boundary that must be verified across both surfaces.

- Concepts: `capabilities/cli-developer-entry`, `capabilities/mcp-server`
- Relations: `capabilities/cli-developer-entry` --depends_on--> `capabilities/mcp-server`
- Evidence: `cli/src`, `mcp/src`
