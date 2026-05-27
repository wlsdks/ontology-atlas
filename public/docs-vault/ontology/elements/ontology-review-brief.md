---
slug: elements/ontology-review-brief
kind: element
title: Ontology Review Brief
domain: views
---

`src/views/ontology-view/lib/review-brief.ts` and the selected-node detail panel create a compact collaborator review brief for `/ontology`.

The brief classifies the selected node as product scope, domain vocabulary, capability, implementation element, or generic concept; summarizes source, direct relation counts, and direct relation-type counts; and formats a copyable review prompt for non-developer collaborators. The visible card and markdown export now include prompt-specific review questions, matching the topology drawer reader lane: define owner for isolated concepts, explain usage for outgoing-only concepts, confirm dependents for incoming-only concepts, and trace impact for bidirectional concepts.

The card and copied markdown also include a small direct relation preview. Each row names direction, relation type, neighbor title, neighbor kind, and node id, so a collaborator can see the concrete concepts behind the count before deciding whether a vocabulary change needs owner review, dependency review, or builder cleanup.

The visible card and copied markdown now add a change-impact summary between the review questions and relation preview. It translates isolated, outgoing-only, incoming-only, and bidirectional relation shapes into the first collaborator action, and names the first incoming and outgoing neighbor when available.

For lighter planning / marketing vocabulary review, the same card can copy a compact review-vocabulary packet. It keeps only the term, node id, kind, source, meaning to preserve, reuse context, review questions, relation anchors, and direct Topology / Builder handoff links, so a collaborator can review naming or messaging without the full agent handoff block while still returning to the exact graph location.

It now includes handoff URLs for the selected node's explicit Topology Focus mode and builder focus. The visible brief card exposes the same actions, so a reader can move from tree browsing into graph inspection or frontmatter-backed editing without re-searching the concept. The visible CTA and copied review brief label this as `Topology focus`, and the URL includes `mode=focus&p=<nodeId>` rather than only the legacy selected-node query, keeping `/ontology` review briefs aligned with the topology drawer and analysis bar handoff contract.

The selected-node panel now repeats the workbench loop before the longer collaborator card as a compact Browse / Write / Query handoff rail. Browse opens Topology focus, Write opens the builder focused on the same node, and Query opens the node proof cockpit. This keeps tree selection from feeling like a terminal detail drawer: every selected concept immediately exposes the next visual inspection, frontmatter edit, and graph DB-style proof path.

For source-backed ontology nodes, the copied brief and visible card also include read-first agent checks: an MCP `node_profile` payload and a CLI `oh-my-ontology node ... --limit 8` fallback. It also exposes dedicated incoming impact checks, `query_ontology({ operation: "blast_radius", depth: 2, direction: "incoming" })` and `oh-my-ontology blast-radius ... --depth 2 --direction incoming`, so a planner or domain reviewer can ask Claude Code / Codex who depends on the concept before changing vocabulary, scope, or frontmatter. The visible card now also exposes the shared post-change ontology sync gate as its own copy action, using the same `health`, `cycles`, `growth_plan`, `maintenance_plan`, and `validate_vault` packet as agent setup, insights, topology health, and builder relation writes.
