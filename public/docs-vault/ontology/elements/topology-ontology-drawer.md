---
slug: elements/topology-ontology-drawer
kind: element
title: Topology Ontology Drawer
domain: views
relates: [elements/ontology-description-helper]
---

`src/views/home/ui/TopologyOntologyDrawer.tsx` is the ontology-aware selected concept workbench inside `/topology`.

It now opens as a centered modal instead of a narrow fixed right rail. The modal keeps the graph canvas visible behind a dimmed backdrop, constrains scrolling inside the dialog, and gives the selected concept enough width for readable summaries, relation evidence, edit controls, and agent handoff actions.

The internal layout is split into an LNB-style section navigator and a reading pane:

- **Ontology node**: kind/lens, source slug, short description, domain context, direct relation counts, and transitive blast-radius facts.
- **Direct relations**: incoming/outgoing counts, relation preview rows, related-node navigation, and impact-on-map toggle.
- **Agent / collaborator tools**: copyable Claude/Codex profile checks, blast-radius checks, vocabulary review, collaborator brief, and post-change sync gate.
- **Save/edit actions**: topology focus, ontology tree, builder focus, and source-document links.

This element keeps the selected-node model from `src/views/home/lib/topology-ontology-drawer.ts` intact; the change is presentation and task separation. The panel exists because selecting a node should answer "what is this concept, what is connected to it, what should an agent run next, and where can I edit it?" without forcing the user to understand raw graph/MCP internals.

The modal is mounted through a `document.body` portal. The topology canvas, Sigma overlays, and graph layout containers must not be able to inline the selected-node workbench or hide it behind canvas chrome.

Tests in `src/views/home/ui/TopologyOntologyDrawer.test.tsx` lock that the surface is a body-portal modal dialog with `aria-modal`, a `max-w-[1040px]` workbench width, internal overflow scrolling, and an LNB section navigator rather than a fixed right-side drawer.
