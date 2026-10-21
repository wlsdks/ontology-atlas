---
title: Flat dial
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Flat dial

Flat uses the existing canvas renderer in `src/widgets/ontology-map/dial/`. An indigo project hexagon anchors neutral domain squares and capability circles. Maps of up to six domains balance domains around the centre. Through twelve domains, groups with up to fifteen members open outward in stable shelves joined by actual ownership branches; seven to twelve domains retain separated radial packing. Larger maps retain compact packing. Usage ranges (32+, 16–31, 8–15, 4–7, 2–3, 0–1 other domains) appear in domain captions, without visible rings. Small-map distance does not encode usage. Names remain whole or absent and use the existing type ramp. Branches and dependency paths leave the text ground clear. The current decisions are `a8491b2b` and its density refinement `b21d8349` (2026-10-22), superseding visible axes in `88b537fc` and `bdeff3ae`.

The bottom corner has one passive scope line, without a generic legend or click invitation.
Its count comes from graph membership, not visible marks or zoom: a full map shows its total,
and a recorded realm shows its known member count against that total. An unknown subset has
no scope claim. Selection and an open dock make the line step aside. A synthetic performance
fixture is explicitly labeled and suppresses the unrelated sample introduction; its names
are not authored ontology data. The frame meter remains opt-in.

## What a line counts

A line between two domains counts the `depends_on` relations (a concept's `dependencies` or `depends_on`) whose ends resolve to those two domains: a domain is itself, a capability its domain, an element its capability's domain or the domain that holds it. The count is per direction and equals what `query_ontology({operation:"domain_matrix", types:["depends_on"]})` reports for that pair (`tests/contract/analysis/domain-flow-parity.contract.test.ts`). Lines are counted aggregates, never bundles of individual relations. A pair joined only by `relates` draws a quiet line with no number.

Links are counted between the deepest drawn ends: at the overview from domain to domain, and once a domain's capabilities are drawn, from capability to capability inside it. An end must also carry a drawn name: a capability without one folds into its domain. At rest at most 40 lines show (each end's strongest first, then the strongest of the rest, at most 6 per end once more than 12 ends show); the hidden ones still count in `__atlasMap.dial().budget`. Overview paths have no count or arrow; selecting reveals their directional counts.

## Focus

Hovering changes ink only and temporarily previews a different domain over the existing selection; leaving restores the selection: the subject stays bright, partners take a middle ink step, unrelated groups and the project recede; every resting name and count keeps its place, the hovered mark's own name shows in the domain ink, and its links to the rest show as thin lines without numbers. Selecting a domain splits its lines by direction: **needs** (what it depends on) in indigo, **used by** (what depends on it) in the selected-edge ink, everything else receding to an opaque mix toward the canvas. Each named far domain then carries one count, 6 px beside its name in the stub's grammar (`→4 ←3`), never within 24 px of another count, or beside its chip along the line when every side of the name is taken; a far domain whose name has no room is named in its count beside its chip (`Code evidence →3`). Lines to named capabilities stay thin and unnumbered. Selecting a capability keeps only it, its needs and used-by capabilities, their chips and the hub. The inks crossfade over `--motion-fast`, and a count that appears or changes fades in place over the same step (at once with reduced motion), then one light runs per attended direction ([`light.md`](light.md)).

## Zoom

A wholly visible map stays aggregated until a domain is selected. Beyond that overview, detail follows screen room, not zoom history: the same camera scale gives the same marks. When one end of a line leaves the free map (the viewport less the open panels), the line ends in a named stub such as `Payments →3 ←2`, in capability type at every zoom (stub names no longer grow with the camera); under a selection, links from several of the selected domain's capabilities to one far end leave its chip as one stub carrying all of their counts. Zoomed into a domain (the selected one, else the one nearest the middle of the free map; hovering enters none) whose capabilities cannot all be named in place, a **ledger** lists them whole in one column beside it, joined to their discs by leaders that never cross; past its capacity it ends with `+N more`. Ledger rows, discs, chips and the hub are pick targets; lines are not, so Flat at the overview has no edge pick or edge hover card (a realm keeps them).

## Lenses and realms

The dial owns Flat's paint only at the overview with nothing narrowing it. A realm, a selected or previewed edge, a trail, a spotlight, a path or impact lens, and a selected element draw the earlier dots and lines on the same positions, so nothing jumps. The Flat overview folds nothing: double-click there selects, while folding, `+N` chips, Expand all and `?open=` work inside a realm.

## Memory and first read

Ring radii, each domain's angle and each domain's capability order are remembered per folder in `localStorage`, so an edit that changes no ring moves nothing and a reload of the same folder lands every mark where it was. A first read places domains once their capabilities are read, and applies any later ring changes once, at the end.

## Evidence

Evidence warnings aggregate on domains at rest: a domain pip and its units line report stale members. Individual stale rims turn amber under attention; unknown evidence remains dashed. When nothing was measured, every capability rim is dashed as unknown and a caption under the hub reads "Evidence not measured", placed below the first slot under the hub that the resting marks leave the project name, so it stays put while strands arrive and the name fades in; the name keeps that slot unless a strand crosses it; while the history is still being read, neither shows. A dashed line means unknown evidence or a `relates` link; no ring is painted.

## Performance bars

Overview and zoomed pans keep frame work at p95 ≤ 8.3 ms at synth 10,000 (`MAP_PERF_BARS=1`), the dial paints from pooled mark buffers batched by ink, and a settled map draws no frames.

Dial drags restrict force relaxation, neighbor tug and overlap separation to disclosed members,
while retaining the held concept outside the viewport. Orphaned tug and separation offsets
remain in position writeback until they settle. The full graph remains available for disclosure
and relation queries.

## Hand-off to an agent

What the dial draws, an agent can ask for:

- `query_ontology({operation:"domain_matrix", types:["depends_on"]})` or `ontology-atlas domain-matrix --types depends_on`: the counted lines.
- `query_ontology({operation:"blast_radius", slug, direction:"incoming"})` or `ontology-atlas blast-radius <slug> --direction incoming`: what a focused capability is used by.

The overview frames the domain extents about the hub, reaching past them only where the drawing overhangs on both sides, so the hub stands within 8 px of the free map's middle and the domain extents stand at least 24 px inside the free map, whose top already sits below the tool row and any band under it; the first fit, the fit tile and closing an inspector land on that one frame. The first populated dial fits this overview before assembling, including when a folder arrives in intermediate batches. Panning while the folder is still being read keeps the person's camera position through that placement.

Opening the map shows one loader, and none when it would show for less than `--motion-base`. Names are placed against the resting layout and appear once, where they stay: each fades in over `--motion-fast` once its mark has travelled 90 % of its rise, the hub's with the domains', and all at once with reduced motion. A domain whose chip the free map's edge cuts stays unnamed until a slot clear of lines opens; one inside the free map is named over a line only when every slot crosses one.
