---
slug: documents/views-domain-boundary-audit
kind: document
title: Views Domain Boundary Audit
relates: [capabilities/agent-graph-readiness, capabilities/builder-canvas-polish, capabilities/collaborator-reader-brief, capabilities/topology-ontology-inspection, documents/business-to-code-dogfood-audit, domains/views]
---

> **역사적 기록.** 이 감사는 2026-07 지도 재구성 이전 구조 기준이다. 예시로 든 `insights-query-cockpit` 등 일부 element 는 재구성 과정에서 삭제/대체되었다 — 아래 클러스터 목록은 그 시점의 스냅샷이며 도메인 분리 여부에 대한 판단(Current Decision 섹션)은 유효하다.

# Views Domain Boundary Audit

This note records the current evidence for whether `domains/views` should stay
one domain or be split into smaller ontology domains.

The answer is not "split because the React files live in different folders."
Atlas should split a domain only when the split names a reader-relevant decision
boundary: a different vocabulary, ownership area, review question, or graph
action that planners, marketers, leaders, developers, and agents should treat
separately.

## Current Evidence

The current project map shows `domains/views` as the largest product-surface
domain:

- 64 project-scope nodes.
- 17 capabilities.
- 46 elements.
- 204 internal edges.
- 32 boundary edges.
- 32 external evidence edges.
- Domain degree 131.

The whole project scope has 97 nodes, 6 domains, 33 capabilities, 57 elements,
366 internal edges, 196 external evidence edges, 0 unassigned nodes, and 0
unresolved edges. That means `views` carries most of the visible product
surface, but the graph is still healthy and assigned.

The capability scan shows several distinct clusters inside the domain:

- **Browse / reader lane**: `agent-graph-readiness`,
  `collaborator-reader-brief`, `agent-onboarding-brief`,
  `agent-live-activity-contract`, `changes-only-review`.
- **Builder / write lane**: `builder-canvas-polish`, `builder-vault-write`,
  `builder-relation-write-confirm`, `builder-deep-link-focus`.
- **Topology / spatial proof lane**: `topology-sigma-render`,
  `topology-kind-legibility`, `topology-ontology-inspection`,
  `topology-analysis-modes`, `topology-change-visualization`,
  `topology-direct-edit`.
- **Cross-surface query / proof lane**: `agent-graph-readiness` and
  `collaborator-reader-brief` connect Browse, Insights, MCP proof, and
  stakeholder handoff (the `insights-query-cockpit` element this originally
  named was deleted in the 2026-07 rebuild — see those two capabilities'
  current bodies for what replaced it).

CodeGraph also sees separate implementation entrypoints for Builder
(`OntologyEditPage`) and Insights (`OntologyInsightsPage`); the old Browse
entrypoint (`OntologyViewPage`) was retired and `/ontology` is now a redirect
to `/topology`. That still supports treating these as distinct work surfaces,
but not necessarily as separate ontology domains.

## Split Rule

Do not split `domains/views` just to mirror routes or folders. Split only if one
of these becomes true:

1. A stakeholder needs a separate first-screen lane because the shared `views`
   vocabulary hides what decision they should make.
2. A capability group has its own ownership and post-change verification gate.
3. A graph query, domain matrix row, or project map becomes harder to interpret
   because Browse, Builder, Topology, and Insights are mixed.
4. An agent handoff needs a narrower domain to avoid guessing whether the next
   action is browse, write, spatial proof, or graph DB proof.

If the split happens, candidate domains should be named for workbench behavior,
not framework structure:

- `ontology-browse` for tree, node detail, reader lanes, and selected-concept
  proof.
- `ontology-write` for Builder, relation write, and vault mutation guardrails.
- `ontology-query` for Insights, graph DB cockpit, collaborator evidence, and
  executable proof packets.
- `topology-spatial-proof` for Sigma rendering, spatial focus, path, health,
  and map-level interaction.

These names are intentionally product-facing. A non-developer should understand
what each domain helps them decide, while a developer or agent can still trace
each one down to source elements.

## Current Decision

Keep `domains/views` for now, but treat it as a watched boundary.

The graph remains healthy, project containment has no unassigned nodes, and the
Meaning Gate already exposes the reader loop before the large domain list. The
next product improvement should be UI evidence rather than a blind graph split:
show users where Browse, Write, Query, and Topology diverge after they choose a
domain, then split the ontology only when that UI evidence proves the shared
domain is hiding decisions.

## Performance Note

The large domain is not currently a graph-performance blocker. A 1000-node
synthetic graph performance check passed with compile median 18.68ms,
`graph_db_pack` median 34.79ms, and `project_map` median 10.24ms. This keeps the
current concern focused on product meaning and reader clarity, not query speed.