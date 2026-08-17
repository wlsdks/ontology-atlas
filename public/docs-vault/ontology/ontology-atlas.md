---
uid: 8c48b61f-1f75-448e-87a5-6ea2a7b02cf8
slug: ontology-atlas
kind: project
title: Ontology Atlas
display_ko: 온톨로지 아틀라스
display_en: Ontology Atlas
description: 사람과 AI 에이전트가 제품의 의미와 구현 근거를 같은 로컬 마크다운 그래프로 읽고 함께 가꾸는 온톨로지 워크벤치.
domains: []
capabilities: []
elements: []
contains: [domains/agent-integration, domains/design-system, domains/graph-modeling, domains/local-vault-management, domains/onboarding-and-shell, domains/project-portfolio, domains/topology-navigation]
created_by: human
path: README.md
---

## 정의
로컬 마크다운 볼트의 frontmatter를 타입이 있는 계산 가능 그래프(도메인·능력·구현 증거·의존·영향)로 바꾸는 로컬-퍼스트 온톨로지 워크벤치. 개발자는 CLI/웹으로, AI 코딩 에이전트는 MCP로 같은 파일을 읽고 쓴다.

## 근거
- README.md: "Your AI coding agent forgets your codebase between sessions... turns the Markdown in your repository into a graph of your product"
- AGENTS.md: Project overview ("a local-first ontology workbench for understanding a product/system from business core to implementation evidence")

## 포함 / 제외
- 포함: 그래프 스키마·컴파일·쿼리, MCP/CLI 에이전트 연동, 로컬 볼트 관리, 토폴로지 탐색, 프로젝트 포트폴리오, 온보딩·배포·앱 셸
- 제외: 백엔드/인증/클라우드 협업 (R10에서 영구 제거, Layer 2로만 조건부 재도입)

## 확신도
high (README + AGENTS.md 직접 인용)

## Competency answers

### scope: answered

What product/system outcome and user problem define the ontology scope?

Ontology Atlas helps people and AI coding agents preserve and judge one shared, local-first meaning model of a product and the implementation evidence behind it.

- Concepts: `ontology-atlas`
- Evidence: `README.md`

### domains: answered

Which stable business responsibilities or decision boundaries form its domains?

Seven stable responsibility boundaries cover agent integration, design-system stewardship, graph modeling, local vault management, onboarding and shell delivery, project portfolio work, and topology navigation.

- Concepts: `ontology-atlas`, `domains/agent-integration`, `domains/design-system`, `domains/graph-modeling`, `domains/local-vault-management`, `domains/onboarding-and-shell`, `domains/project-portfolio`, `domains/topology-navigation`
- Relations: `ontology-atlas` --contains--> `domains/agent-integration`, `ontology-atlas` --contains--> `domains/design-system`, `ontology-atlas` --contains--> `domains/graph-modeling`, `ontology-atlas` --contains--> `domains/local-vault-management`, `ontology-atlas` --contains--> `domains/onboarding-and-shell`, `ontology-atlas` --contains--> `domains/project-portfolio`, `ontology-atlas` --contains--> `domains/topology-navigation`
- Evidence: `README.md`

### abilities: answered

Which observable abilities realize those outcomes inside each domain?

Across its seven domains, Atlas exposes 27 typed capabilities for agent and terminal integration, design-system enforcement, graph modeling, local-vault control, onboarding and distribution, project portfolio work, and topology navigation.

- Concepts: `domains/agent-integration`, `domains/design-system`, `domains/graph-modeling`, `domains/local-vault-management`, `domains/onboarding-and-shell`, `domains/project-portfolio`, `domains/topology-navigation`, `capabilities/acp-runtime`, `capabilities/app-update`, `capabilities/cli-developer-entry`, `capabilities/construction-review`, `capabilities/control-primitives`, `capabilities/data-source-mode`, `capabilities/design-build-handoff`, `capabilities/design-gate-ratchets`, `capabilities/design-token-ramps`, `capabilities/desktop-download-decision`, `capabilities/docs-vault-local`, `capabilities/first-run-starter`, `capabilities/guided-tour`, `capabilities/locale-switch`, `capabilities/mcp-server`, `capabilities/ontology-blocks`, `capabilities/project-data-source`, `capabilities/project-edit`, `capabilities/project-quick-edit`, `capabilities/project-share`, `capabilities/project-source-evidence`, `capabilities/skill-process-handoff`, `capabilities/taxonomy`, `capabilities/topology-browsing`, `capabilities/vault-agent`, `capabilities/vault-ontology`, `capabilities/vault-sample-source`
- Relations: `domains/agent-integration` --capabilities--> `capabilities/acp-runtime`, `domains/agent-integration` --capabilities--> `capabilities/cli-developer-entry`, `domains/agent-integration` --capabilities--> `capabilities/mcp-server`, `domains/agent-integration` --capabilities--> `capabilities/skill-process-handoff`, `domains/agent-integration` --capabilities--> `capabilities/vault-agent`, `domains/design-system` --capabilities--> `capabilities/control-primitives`, `domains/design-system` --capabilities--> `capabilities/design-build-handoff`, `domains/design-system` --capabilities--> `capabilities/design-gate-ratchets`, `domains/design-system` --capabilities--> `capabilities/design-token-ramps`, `domains/graph-modeling` --capabilities--> `capabilities/ontology-blocks`, `domains/graph-modeling` --capabilities--> `capabilities/taxonomy`, `domains/graph-modeling` --capabilities--> `capabilities/vault-ontology`, `domains/local-vault-management` --capabilities--> `capabilities/data-source-mode`, `domains/local-vault-management` --capabilities--> `capabilities/docs-vault-local`, `domains/local-vault-management` --capabilities--> `capabilities/project-data-source`, `domains/local-vault-management` --capabilities--> `capabilities/vault-sample-source`, `domains/onboarding-and-shell` --capabilities--> `capabilities/app-update`, `domains/onboarding-and-shell` --capabilities--> `capabilities/desktop-download-decision`, `domains/onboarding-and-shell` --capabilities--> `capabilities/first-run-starter`, `domains/onboarding-and-shell` --capabilities--> `capabilities/guided-tour`, `domains/onboarding-and-shell` --capabilities--> `capabilities/locale-switch`, `domains/project-portfolio` --capabilities--> `capabilities/construction-review`, `domains/project-portfolio` --capabilities--> `capabilities/project-edit`, `domains/project-portfolio` --capabilities--> `capabilities/project-quick-edit`, `domains/project-portfolio` --capabilities--> `capabilities/project-share`, `domains/project-portfolio` --capabilities--> `capabilities/project-source-evidence`, `domains/topology-navigation` --capabilities--> `capabilities/topology-browsing`
- Evidence: `src-tauri/src/acp.rs`, `src/features/app-update`, `cli/src`, `src/entities/construction-review`, `src/shared/ui/control-class.ts`, `src/features/data-source-mode`, `.claude/skills/design-build/SKILL.md`, `eslint.config.mjs`, `app/globals.css`, `src/views/download`, `src/features/docs-vault-local`, `src/features/first-run-starter`, `src/features/guided-tour`, `src/features/locale-switch`, `mcp/src`, `src/features/ontology-blocks`, `src/features/project-data-source`, `src/features/project-edit`, `src/features/project-quick-edit`, `src/features/project-share`, `src/shared/lib/project-source-receipt.ts`, `src/views/agent-skills/ui/AgentSkillsPage.tsx`, `src/features/taxonomy`, `src/widgets/topology-map-v2`, `src/features/vault-agent`, `mcp/src/schema.mjs`, `src/features/vault-sample-source`

### evidence: partial

Which source artifacts provide implementation evidence for each ability?

All 27 capabilities carry a canonical repository entrypoint, but path existence alone does not prove every low-confidence folder-backed behavior to a source-hidden evaluator.

- Concepts: `capabilities/acp-runtime`, `capabilities/app-update`, `capabilities/cli-developer-entry`, `capabilities/construction-review`, `capabilities/control-primitives`, `capabilities/data-source-mode`, `capabilities/design-build-handoff`, `capabilities/design-gate-ratchets`, `capabilities/design-token-ramps`, `capabilities/desktop-download-decision`, `capabilities/docs-vault-local`, `capabilities/first-run-starter`, `capabilities/guided-tour`, `capabilities/locale-switch`, `capabilities/mcp-server`, `capabilities/ontology-blocks`, `capabilities/project-data-source`, `capabilities/project-edit`, `capabilities/project-quick-edit`, `capabilities/project-share`, `capabilities/project-source-evidence`, `capabilities/skill-process-handoff`, `capabilities/taxonomy`, `capabilities/topology-browsing`, `capabilities/vault-agent`, `capabilities/vault-ontology`, `capabilities/vault-sample-source`
- Evidence: `src-tauri/src/acp.rs`, `src/features/app-update`, `cli/src`, `src/entities/construction-review`, `src/shared/ui/control-class.ts`, `src/features/data-source-mode`, `.claude/skills/design-build/SKILL.md`, `eslint.config.mjs`, `app/globals.css`, `src/views/download`, `src/features/docs-vault-local`, `src/features/first-run-starter`, `src/features/guided-tour`, `src/features/locale-switch`, `mcp/src`, `src/features/ontology-blocks`, `src/features/project-data-source`, `src/features/project-edit`, `src/features/project-quick-edit`, `src/features/project-share`, `src/shared/lib/project-source-receipt.ts`, `src/views/agent-skills/ui/AgentSkillsPage.tsx`, `src/features/taxonomy`, `src/widgets/topology-map-v2`, `src/features/vault-agent`, `mcp/src/schema.mjs`, `src/features/vault-sample-source`
- Paths: `src-tauri/src/acp.rs`, `src/features/app-update`, `cli/src`, `src/entities/construction-review`, `src/shared/ui/control-class.ts`, `src/features/data-source-mode`, `.claude/skills/design-build/SKILL.md`, `eslint.config.mjs`, `app/globals.css`, `src/views/download`, `src/features/docs-vault-local`, `src/features/first-run-starter`, `src/features/guided-tour`, `src/features/locale-switch`, `mcp/src`, `src/features/ontology-blocks`, `src/features/project-data-source`, `src/features/project-edit`, `src/features/project-quick-edit`, `src/features/project-share`, `src/shared/lib/project-source-receipt.ts`, `src/views/agent-skills/ui/AgentSkillsPage.tsx`, `src/features/taxonomy`, `src/widgets/topology-map-v2`, `src/features/vault-agent`, `mcp/src/schema.mjs`, `src/features/vault-sample-source`
- Gap: Every capability now has source-visible behavior and a canonical entrypoint, but installed/runtime behavior and relation-level current-source receipts remain incomplete; path coverage is complete, end-to-end semantic proof is not.

### impact: partial

Which typed dependencies explain change impact across the model?

The declared agent-facing impact chain converges on the MCP server: the in-app ACP runtime and the terminal CLI both depend on it, and it depends on the vault ontology schema. Every one of these typed dependencies carries a written rationale.

- Concepts: `capabilities/acp-runtime`, `capabilities/cli-developer-entry`, `capabilities/mcp-server`, `capabilities/vault-ontology`
- Relations: `capabilities/acp-runtime` --depends_on--> `capabilities/mcp-server`, `capabilities/cli-developer-entry` --depends_on--> `capabilities/mcp-server`, `capabilities/mcp-server` --depends_on--> `capabilities/vault-ontology`
- Evidence: `src-tauri/src/acp.rs`, `cli/src`, `mcp/src`, `mcp/src/schema.mjs`
- Gap: Typed change-impact coverage is still limited to the agent-facing schema chain; the other responsibility domains do not yet declare reviewed cross-domain dependencies.
