---
title: Topology — Node Focus & Scale
tags: [design, topology, graph, ux, performance, spec]
---

# Topology — Node Focus & Scale

> Design rationale and implemented contract for how the topology map reveals a
> node on click and stays readable + fast as the vault grows. `/topology` is the
> explicit map address; `/` is the map only after a vault is available (a web
> visitor without one sees the gateway).
> This is the canonical decision; `.claude/rules/design.md` and
> `DESIGN-SYSTEM.md` carry the short rule, this doc carries the reasoning +
> cited references.

Status: **implemented direction** (initial rationale approved 2026-06-08;
current renderer and interaction contract verified against source 2026-08-23).

## Historical problem statement (2026-06-08; Sigma-era implementation superseded)

Two issues, one root cause.

1. **Node click opens a near-fullscreen modal.** Clicking a node in the former Sigma
   graph mounts `NodeDetailPanel`
   (`src/views/ontology-view/ui/OntologyViewPage.tsx`) as a full-bleed overlay.
   It hides the graph (you lose where the node was), repeats labels
   (`Concept Info` appears as eyebrow + left-nav tab + fact-card title), surfaces
   raw jargon (`Affected by 1 · Depends on 68`, `Connects to 18 · Referenced by 10`), and can
   contradict itself (`No domain` while a card shows the domain). It reads as
   auto-generated, not as a focused tool.
2. **The whole graph is shown at once.** The default view drops every node
   (287 in the dogfood vault, 2–3k+ in real ones) into one canvas — a
   "hairball." Most nodes are just dots; only hubs are labelled; there is no
   "start here." This breaks *comprehension* well before WebGL breaks
   *performance*.

**Root cause:** the product violates the foundational infovis principle —
*overview first, zoom and filter, then details-on-demand*
([Shneiderman 1996](#references)). It does the opposite: details-as-fullscreen
and everything-at-once.

## Decision (implemented)

The current mechanism is: **click → durable ego focus, camera framing, compact
`TopologyV2DetailPanel`, and dimmed unrelated graph.** The default map is a
semantic-zoom overview, not the full graph. Full detail is an explicit
`FullDetailA1` drill-down.

This is the convergent pattern across Obsidian (local graph + hover preview),
Neo4j Bloom / Linkurious (click-to-inspect + incremental ego expand), and
Cambridge Intelligence / yFiles guidance (start focused, bring data in on
demand). See [References](#references).

## Detailed design

### Current interaction states

| State | What the user sees |
|---|---|
| **Overview (default)** | Project/domain/hub spine is visible first; semantic-zoom tier and density gates reveal more only when useful. |
| **Hover** | Hover emphasis/ripple may light the hovered ego set, without changing durable focus or camera. |
| **Focus (click)** | `focus-state` keeps the node and bounded direct-neighbor ego readable, dims unrelated nodes/edges, and the camera reframes through the canvas layer. |
| **Detail (opt-in)** | `TopologyV2DetailPanel` is the compact current datasheet; its explicit action opens `FullDetailA1` for deeper detail. |
| **Clear** | The pointer state machine clears focus on the selected node again or empty-canvas interaction; the page Escape ladder closes one active layer at a time. |

### Current compact detail panel

`TopologyV2DetailPanel` is the current compact DOM layer coordinated with the
canvas. It keeps the selected ontology fact legible without replacing the map,
groups direct connections and evidence, exposes current document/relation/edit
or handoff actions where available, and offers an explicit full-detail drill.
Its geometry is part of the map contract rather than an independent modal.

The following 2026-06-08 content model is retained as historical rationale,
not a claim about a Sigma-era `NodeDetailPanel` API:

1. **Eyebrow + title** — kind label (mono, quaternary) + node title. No
   duplicate "Concept Info" stutter.
2. **One-line description** — first prose line of the node, truncated.
3. **Connected nodes** — the ego list, grouped by relation/kind, each row a
   click target that re-focuses to that neighbor (incremental ego walk, the
   Bloom/Linkurious pattern). Cap visible rows (e.g. 6) with `… +N`.
4. **Plain-language counts** — replace jargon:
   - `Affected by 1` → **"Places using this node: 1"** (incoming)
   - `Depends on 68` → **"Required items: 68"** (outgoing/transitive)
5. **Actions rail** — keep the workbench exits the design system already
   mandates: `View Details` (full panel), `Builder` (edit), `Insights` (query).
   One row, compact.
6. **Close** (`✕` / `Esc`).

### Current focus + context in the graph

- `model/focus-state.ts` owns durable selected ego state and hover emphasis;
  `topology-physics-step.ts` and the canvas draw layer apply the focus/dim and
  tier-reveal result without changing the graph data model.
- `engine/camera.ts` springs camera movement within scale and pan bounds.
- The current detail panel and `FullDetailA1` consume the selected node's
  current relation/evidence view; they are not the retired `NodeDetailPanel`.

### Current overview-first default

- Level 0: `project` + `domain` + hub capabilities only.
- Expand on demand: clicking a domain reveals its capabilities/elements (combo
  open/close), so the user never faces the full hairball uninvited.
- This is *semantic zoom*, not just visual zoom.

### Current performance layers

`topology-map-v2` is a canvas-2D renderer, not Sigma/WebGL. Its current layers
are explicit and measured before a renderer change:

1. **Force/layout** — Graphology-backed ForceAtlas2 starts from deterministic
   seeds, has a bounded synchronous warm/release budget, and restricts drag
   work to the relevant local subgraph.
2. **Camera** — spring, momentum, zoom clamps, and visible-tier pan bounds keep
   navigation inside the drawable world.
3. **Focus and visibility** — ego focus, semantic-zoom tiers, density gates,
   cluster chips, and tier-aware hit testing avoid drawing or interacting with
   irrelevant detail.
4. **Canvas frame work** — the draw layer controls labels, edges, attention,
   and DOM-overlay coordination under the visible frame budget.

## Scope / non-goals

- **In scope:** the implemented map focus state, camera, compact detail panel,
  full-detail drill, semantic zoom, density controls, and canvas performance
  layers.
- **Out of scope:** a second renderer, a separate Builder/tree/ERD surface, or
  treating retired `/ontology` routes as current topology ownership.

## Historical open questions (resolved or superseded by the implemented contract)

- Ego depth in the popover: 1-hop only, or 1-hop list + "expand to 2-hop"?
- Should hover preview ship in v1 or follow the click-focus work?
- Overview level 0 membership: hubs by degree, or domains-only?

## References

Design + UX principle:

- Ben Shneiderman, *The Eyes Have It: A Task by Data Type Taxonomy for
  Information Visualizations* (1996) — "Overview first, zoom and filter, then
  details-on-demand." <https://infovis-wiki.net/wiki/Visual_Information-Seeking_Mantra>

Large-graph strategy (start focused, avoid hairballs, expand on demand):

- Cambridge Intelligence — *Graph visualization at scale*:
  <https://cambridge-intelligence.com/visualize-large-networks/>
- Cambridge Intelligence — *Fixing data hairballs*:
  <https://cambridge-intelligence.com/how-to-fix-hairballs/>
- Cambridge Intelligence — *Layouts for large network visualization*:
  <https://cambridge-intelligence.com/large-network-visualization/>
- yFiles — *Guide to visualizing knowledge graphs*:
  <https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs>

Node-detail / ego-on-click patterns in shipping tools:

- Obsidian — Graph view (local graph shows only connected notes; hover preview):
  <https://obsidian.md/help/plugins/graph>
- Neo4j Bloom — expand/collapse on node click:
  <https://community.neo4j.com/t/how-can-i-implement-the-functionality-to-expand-and-collapse-nodes-in-neo4j-bloom-by-simply-clicking-on-nodes/63830>
- Linkurious Enterprise vs Neo4j Bloom (incremental investigation UX):
  <https://linkurious.com/blog/linkurious-enterprise-neo4j-bloom/>

Current implementation:

- `src/widgets/topology-map-v2/` — custom canvas-2D renderer, camera, focus,
  attention layers, pointer handling, and DOM overlay coordination.
- Graphology + ForceAtlas2 — graph data and layout inputs only.
- The Sigma.js note from the initial spec is historical; Sigma has no current
  dependency or runtime consumer. Its public documentation remains a principle
  source only, not an API contract for this renderer.

## Changelog

- 2026-06-08: Initial spec — approved direction (unified ego-focus popover +
  overview-first), pre-implementation.
