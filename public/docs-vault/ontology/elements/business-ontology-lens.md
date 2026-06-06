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

The same gate now makes the graph-database-style query path visible without
turning the concept map into an implementation dashboard. It shows facets,
domain coupling, and bounded path evidence as the first business graph DB pack:
read distribution, inspect domain pressure, then plan `all_paths` before using
a path as proof. The copyable brief carries the matching MCP calls and CLI
fallbacks, so people and Claude Code / Codex can replay the same question set
against the local markdown ontology.

Each business graph DB pack row is also individually copyable. That matters for
usage: a planner can copy the facets query, a product/domain reviewer can copy
the coupling query, and an AI agent can copy the bounded path query with the
MCP plan call, CLI fallback, and evidence rule in one packet. The row-level
copy keeps the concept map simple while making graph DB-style verification an
immediate action rather than hidden documentation.

Those rows now show and copy the evidence checkpoint that makes the query useful
as ontology proof: scan queries must report `totalMatches`, `limited`, and
`followUp`; domain coupling must report cross-domain edge pressure with the hub
domains; bounded path queries must confirm `evidence.pathsComplete` before a
path can support a business decision. The user sees not just which graph query
to run, but what result contract must be satisfied before changing the ontology.

The `/ontology/insights` graph verification cockpit also mirrors that contract
inside the run-order tab. Query rows now carry a compact evidence contract label
next to their MCP/CLI counts, so an agent or human can move from `facets`,
`match_nodes`, `match_edges`, `domain_matrix`, or `all_paths` directly to the
result fields that must be reported before the graph answer is treated as proof.
The run-order tab also exposes the scan/path evidence contract as one readable
summary line, which keeps the macOS app and accessibility tree from hiding the
most important rule: report scan completeness and path completeness before using
query rows in a decision.

That summary is now copyable as an agent handoff contract. The copied packet
names the scan contract, path-completeness contract, `pnpm dogfood:graph-db`
runtime gate, and the decision rule for deferring graph-backed business changes
when completeness has not been reported.

MCP `query_ontology({operation: "agent_brief"})` and CLI
`ontology-atlas agent-brief --json` expose those questions as
`businessOntologyLens.decisionQuestions`, and the copyable handoff prompt prints
the same section. That keeps the macOS app, CLI, and MCP agent payload on one
business-first contract instead of letting UI copy and agent data drift apart.

`src/shared/lib/business-ontology-lens.ts` now owns those decision questions in
the same shared lens object as `policy`, `readOrder`, and `guidance`. The
`/ontology/insights` role-question strip renders the compact
`business-first · domain -> capability -> element` lens before graph operations,
and copied reader handoffs include the exact extraction checks: identify the
business/product boundary, state the capability claim in human decision
language, then attach implementation evidence that proves or disproves it.
