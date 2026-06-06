---
slug: elements/business-ontology-lens
kind: element
title: Business Ontology Lens
domain: views
relates: [elements/ontology-tree-view]
---

# Business Ontology Lens

`src/shared/lib/business-ontology-lens.ts` defines the shared business-first read-order contract used by the ontology browse surface. The lens keeps the visible `/ontology` meaning gate aligned with the agent handoff contract: business/product domains first, then product capabilities, then implementation evidence.

This element exists so UI copy, copyable briefs, and agent-facing payloads do not drift back toward path/API/route-first ontology framing.

The `/ontology` meaning gate now surfaces the same lens as explicit business
decision questions: who uses the concept to decide, which user or operating
outcome changes, and which implementation evidence proves the meaning. The
copyable brief includes those questions so human reviewers and AI agents keep
business decisions ahead of source paths when extending the graph.

MCP `query_ontology({operation: "agent_brief"})` and CLI
`ontology-atlas agent-brief --json` expose those questions as
`businessOntologyLens.decisionQuestions`, and the copyable handoff prompt prints
the same section. That keeps the macOS app, CLI, and MCP agent payload on one
business-first contract instead of letting UI copy and agent data drift apart.
