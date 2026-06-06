---
slug: elements/ontology-node-detail-modal
kind: element
title: Ontology Node Detail Modal
domain: views
relates: [capabilities/agent-graph-readiness, elements/ontology-review-brief, elements/ontology-tree-view]
elements: [src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx, src/views/ontology-view/ui/OntologyViewPage.tsx, tests/e2e/ontology-ui.spec.ts]
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected-node detail experience on `/ontology` as a centered modal workbench instead of a narrow fixed right rail.

The user-visible purpose is not "show every graph fact in a tiny side panel." The modal answers four questions with separate LNB sections: what this concept means, which relations give it meaning, which Claude/Codex MCP proof to run next, and what review/write guard should happen before changing the vault.

The workbench opens through `createPortal` so the page tree does not turn it back into an inline right rail. `src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` locks the modal contract: centered dialog, internal scroll shell, LNB navigation, one active section at a time, and no narrow `md:right-6` / `md:w-[360px]` desktop rail.

The overview section deliberately does not render the old `ontology-signal-rail` mini panel. That card repeated the same classification, relation, and agent-proof facts already owned by the LNB summary and the Agent tab, while making the screen feel like nested small panels. The current split is:

- LNB summary: selected concept, kind, relation counts, source slug.
- Overview: readable summary plus kind classification check.
- Relations: direct relation preview, relation type distribution, reachability controls, ego graph, and related source docs.
- Agent: copyable `node_profile`, `blast_radius`, `all_paths`/`relation_check`, and post-change sync gate.
- Review: vocabulary/review questions and write guard handoff.

The overview kind classification card now consumes the shared `getOntologyKindTone()` contract, but it treats kind color as a data mark rather than card decoration. The card uses a neutral surface, a thin left stripe, and a compact labeled marker with icon + kind label; it does not use a solid colored card fill or glow ring. `NodeDetailPanel.layout.test.tsx` verifies the project card exposes the muted indigo tone data, labeled marker, and stripe, which keeps Browse aligned with the topology map without making the modal look like a generated AI dashboard.

This element is related to `capabilities/agent-graph-readiness` because the selected concept modal is where a human should hand an AI agent the next focused graph proof instead of asking the agent to guess from a dense visual graph.

Dogfood note: the first tone slice used Atlas MCP to locate `elements/ontology-node-detail-modal` and its backlinks, used CodeGraph to trace the shared tone path, then added a focused layout contract before widening to color, graph-build, and agent handoff tests. The follow-up anti-AI design slice used MCP `health` / `workspace_brief` / `agent_brief` to confirm the graph was ready, then used CodeGraph to inspect `OntologyViewPage`, `getOntologyKindTone()`, and the topology tone tests before replacing the loud magenta/yellow treatment with a muted qualitative tone contract.
