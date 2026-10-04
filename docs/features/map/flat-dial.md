---
title: Flat dial
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Flat dial

At the overview, Flat is a dial (`src/widgets/ontology-map/dial/`). The project sits at the centre. Each domain stands on a ring by how many other domains depend on it: 32 or more, 16–31, 8–15, 4–7, 2–3 and 0–1, innermost the most depended on. The legend always says so (closer to the centre, more other domains depend on it), and a ring's range is written on its circle wherever a slot clear of lines and names is left. Around a ring, coupled domains are neighbours. A domain is drawn as its area; its capabilities appear around its chip once they have room on screen, and their elements after them. Names are whole or absent, never cut with "…". The decision is record `88b537fc` (2026-10-02).

## What a line counts

A line between two domains counts the `depends_on` relations (a concept's `dependencies` or `depends_on`) whose ends resolve to those two domains: a domain is itself, a capability its domain, an element its capability's domain or the domain that holds it. The count is per direction and equals what `query_ontology({operation:"domain_matrix", types:["depends_on"]})` reports for that pair (`tests/contract/domain-flow-parity.contract.test.ts`). Lines are counted aggregates, never bundles of individual relations. A pair joined only by `relates` draws a quiet line with no number.

Links are counted between the deepest drawn ends: at the overview from domain to domain, and once a domain's capabilities are drawn, from capability to capability inside it. At rest at most 40 lines show (each end's strongest first, then the strongest of the rest, at most 6 per end once more than 12 ends show); the hidden ones still count in `__atlasMap.dial().budget`. The strongest few carry their number.

## Focus

Hovering or selecting a domain splits its lines by direction: **needs** (what it depends on) in indigo, **used by** (what depends on it) in the selected-edge ink, everything else receding to an opaque mix toward the canvas. Selecting a capability keeps only it, its needs and used-by capabilities, their chips and the hub. The inks crossfade over `--motion-fast` (at once with reduced motion), then one light runs per attended direction ([`light.md`](light.md)).

## Zoom

Detail follows screen room, not zoom history: the same camera scale gives the same marks. When one end of a line leaves the free map (the viewport less the open panels), the line ends in a named stub such as `Payments →3 ←2`. Zoomed into a domain whose capabilities cannot all be named in place, a **ledger** lists them whole in one column beside it, joined to their discs by leaders that never cross; past its capacity it ends with `+N more`. Ledger rows, discs, chips and the hub are pick targets; lines are not, so Flat at the overview has no edge pick or edge hover card (a realm keeps them).

## Lenses and realms

The dial owns Flat's paint only at the overview with nothing narrowing it. A realm, a selected or previewed edge, a trail, a spotlight, a path or impact lens, and a selected element draw the earlier dots and lines on the same positions, so nothing jumps. The Flat overview folds nothing: double-click there selects, while folding, `+N` chips, Expand all and `?open=` work inside a realm.

## Memory and first read

Ring radii, each domain's angle and each domain's capability order are remembered per folder in `localStorage`, so an edit that changes no ring moves nothing and a reload of the same folder lands every mark where it was. A first read places domains once their capabilities are read, and applies any later ring changes once, at the end.

## Evidence

Evidence rims show only where evidence is measured: stale is amber, unknown is dashed, and a domain's units line adds "N stale".

## Performance bars

Overview and zoomed pans keep frame work at p95 ≤ 8.3 ms at synth 10,000 (`MAP_PERF_BARS=1`), the dial paints from pooled mark buffers batched by ink, and a settled map draws no frames.

## Hand-off to an agent

What the dial draws, an agent can ask for:

- `query_ontology({operation:"domain_matrix", types:["depends_on"]})` or `ontology-atlas domain-matrix --types depends_on`: the counted lines.
- `query_ontology({operation:"blast_radius", slug, direction:"incoming"})` or `ontology-atlas blast-radius <slug> --direction incoming`: what a focused capability is used by.

The first populated dial fits its overview before assembling, including when a folder arrives in intermediate batches. Panning while the folder is still being read keeps the person's camera position through that placement.
