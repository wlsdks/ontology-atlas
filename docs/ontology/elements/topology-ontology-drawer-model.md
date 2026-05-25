---
slug: elements/topology-ontology-drawer-model
kind: element
title: Topology Ontology Drawer Model
domain: views
---

`src/views/home/lib/topology-ontology-drawer.ts` builds the read model for the topology ontology drawer.

It summarizes selected-node incoming/outgoing relation counts, relation-type distribution, source slug, and a bounded relation preview. It also derives the collaborator brief lens, review prompt, and change-impact summary from node kind plus relation direction: isolated concepts ask for owner definition, outgoing-only concepts ask for usage explanation, incoming-only concepts ask for dependent confirmation, and bidirectional concepts ask for impact tracing. Each review prompt maps to a small set of review questions that the UI and copied brief share, while the impact summary carries the first incoming and outgoing neighbor when available.

The model also formats a copyable markdown collaborator brief with kind, node id, review lens, source, relation counts, relation-type counts, review prompt, review questions, change impact, and a bounded preview of direct incoming/outgoing relations. The brief can now carry a handoff block for the current topology URL, ontology deep link, builder focus link, read-only CLI `oh-my-ontology node <slug> [vault] --limit 12` agent check, MCP `query_ontology({ operation: "node_profile", slug, depth: 2, limit: 12 })` payload, incoming impact checks, and the shared post-change sync gate. That keeps the topology drawer aligned with `/ontology` review briefs: a collaborator can review vocabulary in the graph, then Claude Code / Codex can profile impact and close any follow-up edit with health / cycles / growth / maintenance / validate. `src/views/home/lib/topology-ontology-drawer.test.ts` covers relation counts, preview ordering, collaborator review classification, impact classification, and brief formatting so the topology reader lane remains stable.
