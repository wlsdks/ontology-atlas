---
uid: 8c48b61f-1f75-448e-87a5-6ea2a7b02cf8
slug: ontology-atlas
kind: project
title: Ontology Atlas
display_ko: 온톨로지 아틀라스
display_en: Ontology Atlas
description: "A local-first codebase ontology workbench that records what a codebase builds, why it is structured that way, and what a change will affect, linking product meaning to implementation evidence in Markdown that people and AI agents maintain together."
domains: []
capabilities: []
elements: []
contains: [domains/agent-integration, domains/codebase-architecture, domains/design-system, domains/graph-modeling, domains/local-vault-management, domains/onboarding-and-shell, domains/project-portfolio, domains/topology-navigation]
created_by: human
path: README.md
---

## Definition
A local-first codebase ontology workbench that records what a codebase builds, why it is structured that way, and what a change will affect. It links product domains and capabilities to implementation evidence, dependencies, and impact in a computable Markdown graph that people and AI agents maintain together.

## Evidence
- README.md: "Understand what your codebase builds, why it is structured that way, and what a change will affect."
- AGENTS.md: Project overview ("a local-first codebase ontology workbench" spanning product meaning to implementation evidence)

## In Scope / Out of Scope
- In scope: Codebase ontology schema, codebase architecture governance, compilation, querying, MCP/CLI agent integration, local vault management, topology browsing, project portfolio, onboarding/deployment/app shell, and product/business meaning that explains the codebase or change impact
- Out of scope: General-purpose ontologies unrelated to a codebase; exhaustive symbol indexing; backend/authentication/cloud collaboration (permanently removed in R10, conditionally reintroduced only for Layer 2)

## Confidence
high (direct quote from README + AGENTS.md)

## Competency answers

### scope: answered

What product/system outcome and user problem define the ontology scope?

Ontology Atlas helps people and AI coding agents understand what a codebase builds, why it is structured that way, and what a change will affect by preserving product meaning and implementation evidence in one local-first codebase ontology.

- Concepts: `ontology-atlas`
- Evidence: `README.md`

### domains: answered

Which stable business responsibilities or decision boundaries form its domains?

Eight stable responsibility boundaries cover codebase architecture, agent integration, design-system stewardship, graph modeling, local vault management, onboarding and shell delivery, project portfolio work, and topology navigation.

- Concepts: `ontology-atlas`, `domains/agent-integration`, `domains/codebase-architecture`, `domains/design-system`, `domains/graph-modeling`, `domains/local-vault-management`, `domains/onboarding-and-shell`, `domains/project-portfolio`, `domains/topology-navigation`
- Relations: `ontology-atlas` --contains--> `domains/agent-integration`, `ontology-atlas` --contains--> `domains/codebase-architecture`, `ontology-atlas` --contains--> `domains/design-system`, `ontology-atlas` --contains--> `domains/graph-modeling`, `ontology-atlas` --contains--> `domains/local-vault-management`, `ontology-atlas` --contains--> `domains/onboarding-and-shell`, `ontology-atlas` --contains--> `domains/project-portfolio`, `ontology-atlas` --contains--> `domains/topology-navigation`
- Evidence: `README.md`, `docs/ontology/architecture/ontology-atlas-web.md`

### abilities: answered

Which observable abilities realize those outcomes inside each domain?

Across its eight domains, Atlas exposes 30 typed capabilities for architecture-guided development, agent and terminal integration, design-system enforcement, graph modeling, local-vault control, onboarding and distribution, project portfolio work, and topology navigation.

- Concepts: `domains/agent-integration`, `domains/codebase-architecture`, `domains/design-system`, `domains/graph-modeling`, `domains/local-vault-management`, `domains/onboarding-and-shell`, `domains/project-portfolio`, `domains/topology-navigation`, `capabilities/acp-runtime`, `capabilities/agent-work-visibility`, `capabilities/architecture-guided-development`, `capabilities/app-update`, `capabilities/cli-developer-entry`, `capabilities/construction-review`, `capabilities/control-primitives`, `capabilities/data-source-mode`, `capabilities/design-build-handoff`, `capabilities/design-gate-ratchets`, `capabilities/design-token-ramps`, `capabilities/desktop-download-decision`, `capabilities/docs-vault-local`, `capabilities/first-run-starter`, `capabilities/guided-tour`, `capabilities/locale-switch`, `capabilities/mcp-server`, `capabilities/project-data-source`, `capabilities/project-edit`, `capabilities/project-quick-edit`, `capabilities/project-share`, `capabilities/project-source-evidence`, `capabilities/reviewed-ontology-writing`, `capabilities/summary-freshness`, `capabilities/taxonomy`, `capabilities/topology-browsing`, `capabilities/vault-agent`, `capabilities/vault-git-history`, `capabilities/vault-ontology`, `capabilities/vault-sample-source`
- Relations: `domains/agent-integration` --capabilities--> `capabilities/acp-runtime`, `domains/agent-integration` --capabilities--> `capabilities/agent-work-visibility`, `domains/agent-integration` --capabilities--> `capabilities/cli-developer-entry`, `domains/agent-integration` --capabilities--> `capabilities/mcp-server`, `domains/agent-integration` --capabilities--> `capabilities/vault-agent`, `domains/codebase-architecture` --capabilities--> `capabilities/architecture-guided-development`, `domains/design-system` --capabilities--> `capabilities/control-primitives`, `domains/design-system` --capabilities--> `capabilities/design-build-handoff`, `domains/design-system` --capabilities--> `capabilities/design-gate-ratchets`, `domains/design-system` --capabilities--> `capabilities/design-token-ramps`, `domains/graph-modeling` --capabilities--> `capabilities/reviewed-ontology-writing`, `domains/graph-modeling` --capabilities--> `capabilities/summary-freshness`, `domains/graph-modeling` --capabilities--> `capabilities/taxonomy`, `domains/graph-modeling` --capabilities--> `capabilities/vault-ontology`, `domains/local-vault-management` --capabilities--> `capabilities/data-source-mode`, `domains/local-vault-management` --capabilities--> `capabilities/docs-vault-local`, `domains/local-vault-management` --capabilities--> `capabilities/project-data-source`, `domains/local-vault-management` --capabilities--> `capabilities/vault-git-history`, `domains/local-vault-management` --capabilities--> `capabilities/vault-sample-source`, `domains/onboarding-and-shell` --capabilities--> `capabilities/app-update`, `domains/onboarding-and-shell` --capabilities--> `capabilities/desktop-download-decision`, `domains/onboarding-and-shell` --capabilities--> `capabilities/first-run-starter`, `domains/onboarding-and-shell` --capabilities--> `capabilities/guided-tour`, `domains/onboarding-and-shell` --capabilities--> `capabilities/locale-switch`, `domains/project-portfolio` --capabilities--> `capabilities/construction-review`, `domains/project-portfolio` --capabilities--> `capabilities/project-edit`, `domains/project-portfolio` --capabilities--> `capabilities/project-quick-edit`, `domains/project-portfolio` --capabilities--> `capabilities/project-share`, `domains/project-portfolio` --capabilities--> `capabilities/project-source-evidence`, `domains/topology-navigation` --capabilities--> `capabilities/topology-browsing`
- Evidence: `src-tauri/src/acp.rs`, `src/features/agent-activity`, `mcp/src/architecture-profile.mjs`, `src/features/app-update`, `cli/src`, `src/entities/construction-review`, `src/shared/ui/control-class.ts`, `src/entities/vault-session`, `.claude/skills/design-build/SKILL.md`, `eslint.config.mjs`, `app/globals.css`, `src/views/download`, `src/features/docs-vault-local`, `src/features/first-run-starter`, `src/features/guided-tour`, `src/features/locale-switch`, `mcp/src`, `src/features/project-data-source`, `src/features/project-edit`, `src/features/project-quick-edit`, `src/features/project-share`, `src/shared/lib/project-source-receipt.ts`, `src/features/ontology-meaning-editor`, `mcp/src/stale-parent.mjs`, `src/features/taxonomy`, `src/widgets/topology-map-v2`, `src/features/vault-agent`, `src/widgets/atlas-git-panel`, `mcp/src/schema.mjs`, `src/entities/vault-session/model/use-sample-source.ts`

### evidence: answered

Which source artifacts provide implementation evidence for each ability?

All 30 current capabilities have one canonical repository entrypoint in frontmatter, and the current source receipt verifies that every path exists. This proves current implementation entrypoints; it does not by itself claim exhaustive runtime behavior.

- Concepts: `capabilities/acp-runtime`, `capabilities/agent-work-visibility`, `capabilities/architecture-guided-development`, `capabilities/app-update`, `capabilities/cli-developer-entry`, `capabilities/construction-review`, `capabilities/control-primitives`, `capabilities/data-source-mode`, `capabilities/design-build-handoff`, `capabilities/design-gate-ratchets`, `capabilities/design-token-ramps`, `capabilities/desktop-download-decision`, `capabilities/docs-vault-local`, `capabilities/first-run-starter`, `capabilities/guided-tour`, `capabilities/locale-switch`, `capabilities/mcp-server`, `capabilities/project-data-source`, `capabilities/project-edit`, `capabilities/project-quick-edit`, `capabilities/project-share`, `capabilities/project-source-evidence`, `capabilities/reviewed-ontology-writing`, `capabilities/summary-freshness`, `capabilities/taxonomy`, `capabilities/topology-browsing`, `capabilities/vault-agent`, `capabilities/vault-git-history`, `capabilities/vault-ontology`, `capabilities/vault-sample-source`
- Evidence: `src-tauri/src/acp.rs`, `src/features/agent-activity`, `mcp/src/architecture-profile.mjs`, `src/features/app-update`, `cli/src`, `src/entities/construction-review`, `src/shared/ui/control-class.ts`, `src/entities/vault-session`, `.claude/skills/design-build/SKILL.md`, `eslint.config.mjs`, `app/globals.css`, `src/views/download`, `src/features/docs-vault-local`, `src/features/first-run-starter`, `src/features/guided-tour`, `src/features/locale-switch`, `mcp/src`, `src/features/project-data-source`, `src/features/project-edit`, `src/features/project-quick-edit`, `src/features/project-share`, `src/shared/lib/project-source-receipt.ts`, `src/features/ontology-meaning-editor`, `mcp/src/stale-parent.mjs`, `src/features/taxonomy`, `src/widgets/topology-map-v2`, `src/features/vault-agent`, `src/widgets/atlas-git-panel`, `mcp/src/schema.mjs`, `src/entities/vault-session/model/use-sample-source.ts`
- Paths: `src-tauri/src/acp.rs`, `src/features/agent-activity`, `mcp/src/architecture-profile.mjs`, `src/features/app-update`, `cli/src`, `src/entities/construction-review`, `src/shared/ui/control-class.ts`, `src/entities/vault-session`, `.claude/skills/design-build/SKILL.md`, `eslint.config.mjs`, `app/globals.css`, `src/views/download`, `src/features/docs-vault-local`, `src/features/first-run-starter`, `src/features/guided-tour`, `src/features/locale-switch`, `mcp/src`, `src/features/project-data-source`, `src/features/project-edit`, `src/features/project-quick-edit`, `src/features/project-share`, `src/shared/lib/project-source-receipt.ts`, `src/features/ontology-meaning-editor`, `mcp/src/stale-parent.mjs`, `src/features/taxonomy`, `src/widgets/topology-map-v2`, `src/features/vault-agent`, `src/widgets/atlas-git-panel`, `mcp/src/schema.mjs`, `src/entities/vault-session/model/use-sample-source.ts`

### impact: answered

Which typed dependencies explain change impact across the model?

Eight reviewed dependencies form the current change-impact spine across agent integration, graph modeling, topology, design, onboarding, local-vault, and project-portfolio responsibilities. These are bounded declarations with written rationales, not a claim that every possible source dependency is modeled.

- Concepts: `capabilities/acp-runtime`, `capabilities/cli-developer-entry`, `capabilities/mcp-server`, `capabilities/vault-ontology`, `capabilities/topology-browsing`, `capabilities/design-token-ramps`, `capabilities/first-run-starter`, `capabilities/vault-sample-source`, `capabilities/reviewed-ontology-writing`, `capabilities/docs-vault-local`, `capabilities/project-source-evidence`
- Relations: `capabilities/acp-runtime` --depends_on--> `capabilities/mcp-server`, `capabilities/cli-developer-entry` --depends_on--> `capabilities/mcp-server`, `capabilities/mcp-server` --depends_on--> `capabilities/vault-ontology`, `capabilities/topology-browsing` --depends_on--> `capabilities/vault-ontology`, `capabilities/topology-browsing` --depends_on--> `capabilities/design-token-ramps`, `capabilities/first-run-starter` --depends_on--> `capabilities/vault-sample-source`, `capabilities/reviewed-ontology-writing` --depends_on--> `capabilities/docs-vault-local`, `capabilities/project-source-evidence` --depends_on--> `capabilities/vault-ontology`
- Evidence: `src-tauri/src/acp.rs`, `cli/src`, `mcp/src`, `mcp/src/schema.mjs`, `src/widgets/topology-map-v2`, `app/globals.css`, `src/features/first-run-starter`, `src/entities/vault-session/model/use-sample-source.ts`, `src/features/ontology-meaning-editor`, `src/features/docs-vault-local`, `src/shared/lib/project-source-receipt.ts`, `mcp/src/project-meaning-inventory.mjs`
