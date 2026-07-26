---
slug: capabilities/project-ontology-indexing
kind: capability
title: Project Ontology Indexing
display_ko: 코드베이스 훑어 근거 모으기
display_en: Scan the Codebase for Evidence
domain: ai-agent-partner
elements: [cli/src/commands/index.mjs, cli/src/integration.test.mjs, elements/app-settings-menu, mcp/src/analyze.mjs, mcp/src/index.js, mcp/src/integration.test.mjs]
dependencies: [capabilities/cli-developer-entry, capabilities/mcp-server]
relates: [capabilities/ontology-bootstrap-skill]
---

# Project Ontology Indexing

`index_project` is the canonical read-only checkpoint for turning an unfamiliar repository into an evidence-backed ontology proposal. It combines repository-shape analysis, import evidence, active-vault validation, candidate reconciliation, and exact review calls without writing markdown. The CLI pair is `ontology-atlas index`; `--apply` remains an explicit post-review action.

The extraction contract follows the knowledge-representation meaning of ontology: a formal, explicit, shared conceptualization, not a folder tree with labels. Source files and imports are `observed`; README headings and folder-derived meanings are `proposed`; only persisted ontology meanings are `shared`. Automatic business assertions remain zero and human approval is required.

A compact semantic evidence pack makes the MCP usable without a skill, shell, or CodeGraph. It returns bounded excerpts and headings from high-signal mission, product-capability, product-contract, architecture, and agent-guidance documents. Agents use that evidence to define scope, stable domains, observable capabilities, implementation evidence, and typed dependencies while citing every claim.

The result includes five competency questions covering product outcome, domain boundaries, capabilities, implementation evidence, and change-impact dependencies. `extractionContract.qualityGates` reports provenance, semantic evidence availability, explicit uncertainty, shared-concept availability, and approval readiness. `meaningGate.proposedBusinessOntology` keeps README/code-derived concepts separate from established vault concepts.

Validation now states whether the active vault is proven to describe the analyzed repository. A matching project or in-repository starter vault is applicable; a mismatched active vault is reported as diagnostic context rather than analyzed-project quality. This prevents a foreign repository scan from presenting unrelated vault path drift as a defect in the target project.

Muse dogfooding is the reference adversarial run: a pnpm monorepo with HTML README title, shell comments inside code fences, operational README sections, starter ontology nodes, and many workspace packages. The clean run identifies `Muse`, 41 implementation elements, zero automatic business claims, a semantic evidence pack, explicit review gates, and no writes; a fresh MCP-only agent can then propose cited domains/capabilities without promoting package names into business concepts.

The write rule stays conservative: review the evidence, answer the competency questions, resolve ambiguous aliases, and accept the exact concepts and relations before calling `add_concepts` / `add_relations` or CLI `--apply`.