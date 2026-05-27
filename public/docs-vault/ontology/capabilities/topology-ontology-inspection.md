---
slug: capabilities/topology-ontology-inspection
kind: capability
title: Topology Ontology Inspection
domain: views
elements: [builder-node-query-focus, ontology-deeplink-node-resolver, topology-ontology-drawer, topology-ontology-drawer-model, topology-selected-node-resolver]
---

`/topology` supports ontology-aware node inspection instead of treating non-project nodes as empty project selections.

When a user selects a domain, capability, or element node, the drawer summarizes the source document, direct incoming/outgoing relation counts, relation-type chips, and a bounded relation preview. It also links to the ontology tree, builder focus, and source document so the topology can become the start of an edit or investigation flow. Browser coverage opens a selected-node URL directly and verifies the drawer plus ontology, builder, and source-document handoff links.

The selected-node URL flow accepts both graph IDs and vault slugs. `/topology?p=capability:topology-ontology-inspection` and `/topology?p=capabilities/topology-ontology-inspection` resolve to the same drawer node, keep the Sigma selection aligned with the graph ID, and preserve a shareable handoff context.

The tree and builder now keep selected-node context across their different identifier forms: `/ontology` can open a node from either graph IDs like `capability:mcp-server` or vault slugs like `capabilities/mcp-server`, while builder focus receives the vault `.md` slug it can select on the canvas.

The drawer includes a collaborator brief that translates the selected concept into planning / marketing / domain-review language. It identifies whether the node is a product scope, shared domain vocabulary, user-visible capability, implementation element, or generic ontology concept, then gives a review prompt such as owner definition, usage explanation, dependent confirmation, or bidirectional impact tracing. The visible card and copied brief now include review questions matched to that prompt, so a reviewer knows what to answer before the concept becomes shared vocabulary. They also include a change-impact summary with first incoming / outgoing neighbors, so relation shape turns into an explicit next review action. The copied brief carries relation-type counts and a bounded incoming/outgoing relation preview, so Focus mode can export the selected node's ego-graph evidence instead of only a plain concept summary.

For lighter planning / marketing vocabulary review, the drawer also copies a compact review-vocabulary packet. That packet extracts just the term, slug, kind, source, meaning to preserve, reuse context, review questions, and relation anchors. It gives non-developer collaborators a small artifact for naming and messaging review without asking them to parse MCP payloads or the full agent handoff brief. The same drawer still exposes the shared post-change sync gate beside terminal CLI and executable `query_ontology(...)` MCP profile / impact checks, so a vocabulary or frontmatter follow-up can start in Codex or Claude Code before MCP is registered, then close with the same health / cycles / growth / maintenance / validate loop used by `/ontology`, insights, topology health, and builder writes. This keeps non-developer collaborators in a reader lane without turning the product away from the developer + AI agent workbench.
