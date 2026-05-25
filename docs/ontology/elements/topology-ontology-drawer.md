---
slug: elements/topology-ontology-drawer
kind: element
title: Topology Ontology Drawer
domain: views
---

`src/views/home/ui/TopologyOntologyDrawer.tsx` is the ontology-aware detail panel inside `/topology`.

It turns a selected domain / capability / element node into an operational graph inspection surface: kind and source slug, direct incoming/outgoing relation counts, relation-type chips, relation previews, source document navigation, `/ontology` deep link, and `/ontology/edit?node=...` builder focus.

It also renders the collaborator brief for secondary readers. The brief uses neutral language for planning, marketing, and domain review, shows whether the concept is source-backed / impact-traceable / vocabulary-review-worthy, and points reviewers toward the next safe question before a concept is renamed, deleted, scoped, or messaged differently. The drawer now shows the same review questions inline that the copied brief exports: owner definition questions for isolated concepts, usage questions for outgoing-only concepts, dependent-confirmation questions for incoming-only concepts, and bidirectional impact questions for connected concepts. It also shows a change-impact summary that translates relation shape into the first review action and names the first incoming / outgoing neighbor when present. A copy action exports the same brief as markdown, including relation-type counts, direct relation previews, review questions, change impact, topology / ontology / builder handoff links, a read-only CLI agent check, the matching MCP `node_profile` payload, a CLI `blast-radius <slug> --depth 2 --direction incoming` impact check, the matching MCP `blast_radius` payload, and the full shared post-change sync packet. That embedded packet includes when to run the gate, the MCP checks (`health`, `cycles`, `growth_plan`, `maintenance_plan`, `validate_vault`), CLI fallbacks, and skip cases, so a collaborator brief can be pasted directly into Claude Code / Codex without losing the graph-health follow-up.

The card also exposes a compact vocabulary copy action for planning / marketing reviews that only need the term, meaning to keep, reuse context, review questions, and relation anchors. Dedicated MCP profile, impact, and sync-gate copy actions remain separate, so human vocabulary review stays readable while Claude Code or Codex still gets the small payloads it should run before changing frontmatter and then closing the graph.

The visible brief now shows the same agent handoff order before the copy buttons:
inspect `node_profile`, trace incoming `blast_radius`, then run the shared
post-change sync gate (`health`, `cycles`, `growth_plan`, `maintenance_plan`,
`validate`). That keeps the drawer from hiding Claude Code / Codex workflow in
copy payloads only; a reviewer can see the graph-proof sequence before deciding
whether to export the full brief or one focused MCP check.

The drawer owns the selected-node handoff actions as persistent navigation, not incidental content. On mobile it sits above the global bottom tabs and keeps the ontology / builder / source links in a sticky footer, so a long relation preview cannot hide the route from visual graph inspection to the tree or frontmatter-backed builder.
