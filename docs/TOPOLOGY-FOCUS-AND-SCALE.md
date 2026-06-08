---
title: Topology — Node Focus & Scale
tags: [design, topology, graph, ux, performance, spec]
---

# Topology — Node Focus & Scale

> Design spec for how the topology view (`/`, `/topology`) reveals a node on
> click and how it stays readable + fast as the vault grows past 2–3k nodes.
> This is the canonical decision; `.claude/rules/design.md` and
> `DESIGN-SYSTEM.md` carry the short rule, this doc carries the reasoning +
> cited references.

Status: **approved direction, pre-implementation** (2026-06-08).

## Problem

Two issues, one root cause.

1. **Node click opens a near-fullscreen modal.** Clicking a node in the Sigma
   graph mounts `NodeDetailPanel`
   (`src/views/ontology-view/ui/OntologyViewPage.tsx`) as a full-bleed overlay.
   It hides the graph (you lose where the node was), repeats labels
   (`개념 정보` appears as eyebrow + left-nav tab + fact-card title), surfaces
   raw jargon (`영향받음 1 · 의존 68`, `연결함 18 · 참조됨 10`), and can
   contradict itself (`도메인 없음` while a card shows the domain). It reads as
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

## Decision

One mechanism answers both: **click → focus on the node's ego network, show a
compact anchored popover, dim/hide the rest. The default view is an overview,
not the full graph.**

This is the convergent pattern across Obsidian (local graph + hover preview),
Neo4j Bloom / Linkurious (click-to-inspect + incremental ego expand), and
Cambridge Intelligence / yFiles guidance (start focused, bring data in on
demand). See [References](#references).

## Detailed design

### Interaction states

| State | What the user sees |
|---|---|
| **Overview (default)** | Domains + hubs only (semantic-zoom level 0), not all 2–3k nodes. A short "start here" hint. |
| **Hover** | Lightweight preview: highlight the node + its direct neighbors; optional tooltip (title · kind · 1-line). No layout change. |
| **Focus (click)** | Graph keeps the node + its **ego network (direct neighbors)** at full opacity; everything else dims to `opacity 0.15` (existing filter-toggle motion) or hides. A **compact popover** anchors near the clicked node. |
| **Full detail (opt-in)** | The existing `NodeDetailPanel` content, reached via the popover's `전체 상세 →`. This is the *only* place the large surface appears — and it is now a deliberate drill, not the click default. |
| **Clear** | `Esc` / click empty canvas / popover close → restore the overview. |

### The compact popover

Anchored near the node (flips to stay on-screen), sized to content — **never
full-bleed**. Built only from design-system tokens (`--color-panel`,
`--color-divider`, `--color-border-soft`, text scale; standard panel radius, not
the oversized `28px` detail-card radius which reads as decorative at popover
size). Contents, top to bottom:

1. **Eyebrow + title** — kind label (mono, quaternary) + node title. No
   duplicate "개념 정보" stutter.
2. **One-line description** — first prose line of the node, truncated.
3. **Connected nodes** — the ego list, grouped by relation/kind, each row a
   click target that re-focuses to that neighbor (incremental ego walk, the
   Bloom/Linkurious pattern). Cap visible rows (e.g. 6) with `… +N`.
4. **Plain-language counts** — replace jargon:
   - `영향받음 1` → **"이 노드를 쓰는 곳 1"** (incoming)
   - `의존 68` → **"이 노드가 기대는 곳 68"** (outgoing/transitive)
5. **Actions rail** — keep the workbench exits the design system already
   mandates: `전체 상세 →` (full panel), `Builder` (edit), `Insights` (query).
   One row, compact.
6. **Close** (`✕` / `Esc`).

### Focus + context in the graph

- Use Sigma `nodeReducer` / `edgeReducer` to render the ego set normally and
  fade/hide the rest — no mutation of the underlying graphology instance
  ([Sigma reducers](#references)).
- Restore reducers on clear.
- "Connected only" = the ego subgraph that `NodeDetailPanel` **already
  receives** as `ego: OntologyEgoSubgraph`. The data exists; this is a
  presentation change, not a new query.

### Overview-first default

- Level 0: `project` + `domain` + hub capabilities only.
- Expand on demand: clicking a domain reveals its capabilities/elements (combo
  open/close), so the user never faces the full hairball uninvited.
- This is *semantic zoom*, not just visual zoom.

### Performance layer (scale ≥ ~2–3k → ~10k+)

Sigma (WebGL) renders ~10k nodes fine; the costs are labels, edges, and live
layout — not node count. Order of mitigation:

1. **Precompute + cache layout** — run ForceAtlas2 once, persist coordinates;
   do not re-settle on every mount.
2. **Level-of-detail labels** — `hideLabelsOnMove` / `hideEdgesOnMove` during
   interaction; show labels only above a zoom threshold or for hubs/ego.
3. **Edge culling** — keep the existing "representative edges only"
   (`1/496 표시 중`) behavior.
4. **Clustering / combos** — above ~5k, aggregate by domain into super-nodes
   that expand on demand.

## Scope / non-goals

- **In scope:** topology click → ego focus + popover; overview-first default;
  jargon → plain language; LOD/label perf settings; keep full `NodeDetailPanel`
  behind `전체 상세`.
- **Out of scope:** Builder/Insights redesign; new graph queries (ego data
  already exists); the `/ontology` tree page (it may reuse the popover later,
  but this spec targets topology).

## Open questions

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

Implementation (Sigma.js):

- Sigma.js — reducers + `hideEdgesOnMove` / `hideLabelsOnMove`:
  <https://www.sigmajs.org/docs/advanced/data/>

## Changelog

- 2026-06-08: Initial spec — approved direction (unified ego-focus popover +
  overview-first), pre-implementation.
