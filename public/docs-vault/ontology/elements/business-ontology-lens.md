---
slug: elements/business-ontology-lens
kind: element
title: Business Ontology Lens
domain: views
relates: [elements/ontology-tree-view]
---

# Business Ontology Lens

`src/shared/lib/business-ontology-lens.ts` defines the shared business-first
read order: outcome → domain → capability → element. It also owns four decision
questions and their evidence criteria so paths, APIs, routes, and commands do
not become the ontology root merely because they are easy to observe.

Current runtime consumers are agent handoff formatters, not the retired
Builder or an Insights query cockpit:

- `src/shared/lib/ontology-tree/agent-query-recipes.ts` turns the lens into
  business-question graph packs and copyable agent guidance.
- `src/features/vault-ontology/ui/LiveActivityIndicator.tsx` includes the same
  questions and evidence rules in its handoff packet.
- MCP `agent_brief` and CLI result contracts expose and validate the equivalent
  `businessOntologyLens` payload for connector and terminal sessions.

The five-question Insights maintenance board uses its own tab-scoped repair
questions. It does not render this lens as a role-question strip or generic
query dashboard.
