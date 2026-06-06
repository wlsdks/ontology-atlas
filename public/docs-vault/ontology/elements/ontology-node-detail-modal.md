---
slug: elements/ontology-node-detail-modal
kind: element
title: Ontology Node Detail Modal
domain: views
relates: [capabilities/agent-graph-readiness, elements/ontology-review-brief, elements/ontology-tree-view]
---

# Ontology Node Detail Modal

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the selected-node detail experience on `/ontology` as a centered modal workbench instead of a narrow fixed right rail.

The modal uses a real internal LNB tab state: Overview, Relations, Agent, and Review are mutually exclusive reading panes rather than anchor links that stack every panel in one long scroll. This keeps the selected concept readable at desktop and mobile sizes and makes the purpose of the modal clearer.

The panes map directly to the Atlas workbench loop:

- Overview explains what the concept is, its lens, relation counts, and the next Browse / Write / Query handoff.
- Relations shows direct typed neighbors plus deeper reachability, ego graph, and source evidence.
- Agent exposes copyable Claude Code / Codex MCP proof steps and the selected-node proof bundle.
- Review keeps collaborator questions, impact framing, vocabulary handoff, and post-change sync guards together.

The overview pane now opens with a kind decision card. It repeats the same project / domain / capability / element classification rules used by the MCP `agent_brief`: a path-only finding starts as an element, behavior evidence promotes it to capability, and a shared boundary across capabilities promotes it to domain. This makes the selected node color and kind label auditable instead of decorative.

The macOS dogfood pass on this repo tightened the modal for normal desktop-app widths. The LNB now appears from medium-width windows, the workbench shell uses a larger `1280px` cap, and the reading pane is promoted to 18px desktop text so the selected concept can be read without treating the panel as a narrow inspector.

The modal is intentionally closer to the app settings dialog than to a side panel: a padded viewport overlay, a stable left navigation rail, one internal scroll surface, and one purpose-built reading pane. The selected concept therefore answers why the node exists and which typed relations give it meaning before exposing edit and agent proof actions.

`src/views/ontology-view/ui/NodeDetailPanel.layout.test.tsx` guards this contract: the selected node detail must remain a centered modal, expose an LNB-style section control, and show one purpose-built pane at a time instead of reviving the old small side-panel feel.
