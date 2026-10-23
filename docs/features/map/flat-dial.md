---
title: Flat dial
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Flat dial

## Readable branch overview

Small maps use domain label blocks with outward capability rows. The overview
shows up to six capabilities per domain and an explicit remaining-members action
that opens the domain inspector. Detailed zoom reveals continuation columns;
selected capabilities and their partners remain named even outside the preview. Short undirected
branches encode membership; thin arrows encode dependencies in their actual
directions, including separate arrows for reciprocal dependencies. Dashed
`relates` links retain their distinct meaning. The project is a compact context
label above the drawing. Hover changes ink on the whole domain, its members and
its relationships without moving any label. Domain blocks and member names are
whole pick targets; dragging still moves the real concept.

This presentation applies through six domains, 24 rows in any domain and 48 rows
overall. It retains every concept, reserves a direct-element slot while a folder
loads, and uses the same zoom-driven element disclosure and evidence states as
the packed dial. At smaller scales, domain blocks collapse to square marks and
whole names, and membership previews wait until their rows have enough room.
Selection, search and the navigator remain available at every scale. Domain
type uses the title step, member type the body-lg step, and metadata the label step.
Counts remain available on selected relationships and in the inspector.

The owner approved this direction after the earlier rollback; decision
`d170c030-35e9-4a0d-82b4-fcc00683c76b` records the boundary. The following ring and
ledger rules describe the retained dense presentation.

## Packed overview

At the overview, Flat is a dial (`src/widgets/ontology-map/dial/`). The project sits at the centre. Each domain stands on a ring by how many other domains depend on it: 32 or more, 16–31, 8–15, 4–7, 2–3 and 0–1, innermost the most depended on. A ring's range is written on its circle wherever a slot clear of lines and names is left. Around a ring, coupled domains are neighbours. A domain is drawn as its area; its capabilities appear around its chip once they have room on screen, and their elements after them. Names are whole or absent, never cut with "…", drawn in the page's typeface once every weight has loaded, on the type ramp (project 16, domain 12.5, capability 11, element and ring captions 9.5, counts 11 with tabular figures; `map-dial-tokens.contract.test.ts` holds each kind on the ramp at the shipped `--map-dial-label-scale`), and every name and count stands on a cut-out of the ground, so rings and lines stop at its edge. A domain name takes a side of its chip that no line crosses, between the lines if it must, before it lets one cross it. The project name does the same around the hub, between strands up to 36 px out, and is left off only when every one of those slots is crossed or taken. The decision is record `88b537fc` (2026-10-02).

The bottom corner has one passive scope line, without a generic legend or click invitation.
Its count comes from graph membership, not visible marks or zoom: a full map shows its total,
and a recorded realm shows its known member count against that total. An unknown subset has
no scope claim. Selection and an open dock make the line step aside. A synthetic performance
fixture is explicitly labeled and suppresses the unrelated sample introduction; its names
are not authored ontology data. The frame meter remains opt-in.

## What a line counts

A line between two domains counts the `depends_on` relations (a concept's `dependencies` or `depends_on`) whose ends resolve to those two domains: a domain is itself, a capability its domain, an element its capability's domain or the domain that holds it. The count is per direction and equals what `query_ontology({operation:"domain_matrix", types:["depends_on"]})` reports for that pair (`tests/contract/analysis/domain-flow-parity.contract.test.ts`). Lines are counted aggregates, never bundles of individual relations. A pair joined only by `relates` draws a quiet line with no number.

Links are counted between the deepest drawn ends: at the overview from domain to domain, and once a domain's capabilities are drawn, from capability to capability inside it. An end must also carry a drawn name: a capability without one folds into its domain. At rest at most 40 lines show (each end's strongest first, then the strongest of the rest, at most 6 per end once more than 12 ends show); the hidden ones still count in `__atlasMap.dial().budget`. The strongest few carry their number.

## Focus

Hovering changes ink only: every resting name and count keeps its place, the hovered mark's own name shows in the domain ink, and its links to the rest show as thin lines without numbers. Selecting a domain splits its lines by direction: **needs** (what it depends on) in indigo, **used by** (what depends on it) in the selected-edge ink, everything else receding to an opaque mix toward the canvas. Each named far domain then carries one count, 6 px beside its name in the stub's grammar (`→4 ←3`), never within 24 px of another count, or beside its chip along the line when every side of the name is taken; a far domain whose name has no room is named in its count beside its chip (`Code evidence →3`). Lines to named capabilities stay thin and unnumbered. Selecting a capability keeps only it, its needs and used-by capabilities, their chips and the hub. The inks crossfade over `--motion-fast`, and a count that appears or changes fades in place over the same step (at once with reduced motion), then one light runs per attended direction ([`light.md`](light.md)).

## Zoom

Detail follows screen room, not zoom history: the same camera scale gives the same marks. When one end of a line leaves the free map (the viewport less the open panels), the line ends in a named stub such as `Payments →3 ←2`, in capability type at every zoom (stub names no longer grow with the camera); under a selection, links from several of the selected domain's capabilities to one far end leave its chip as one stub carrying all of their counts. Zoomed into a domain (the selected one, else the one nearest the middle of the free map; hovering enters none) whose capabilities cannot all be named in place, a **ledger** lists them whole in one column beside it, joined to their discs by leaders that never cross; past its capacity it ends with `+N more`. Ledger rows, discs, chips and the hub are pick targets; lines are not, so Flat at the overview has no edge pick or edge hover card (a realm keeps them).

## Lenses and realms

The dial owns Flat's paint only at the overview with nothing narrowing it. A realm, a selected or previewed edge, a trail, a spotlight, a path or impact lens, and a selected element draw the earlier dots and lines on the same positions, so nothing jumps. The Flat overview folds nothing: double-click there selects, while folding, `+N` chips, Expand all and `?open=` work inside a realm.

## Memory and first read

Ring radii, each domain's angle and each domain's capability order are remembered per folder in `localStorage`, so an edit that changes no ring moves nothing and a reload of the same folder lands every mark where it was. A first read places domains once their capabilities are read, and applies any later ring changes once, at the end.

## Evidence

Evidence rims show where evidence is measured: stale is amber, unknown is dashed, and a domain's units line adds "N stale". When nothing was measured, every capability rim is dashed as unknown and a caption under the hub reads "Evidence not measured", placed below the first slot under the hub that the resting marks leave the project name, so it stays put while strands arrive and the name fades in; the name keeps that slot unless a strand crosses it; while the history is still being read, neither shows. The rings themselves are solid in `--map-dial-ring`, so a dashed line on the dial always means unknown evidence or a `relates` link.

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

The overview frames the outer ring about the hub, reaching past it only where the drawing overhangs on both sides, so the hub stands within 8 px of the free map's middle and the ring's top stands at least 24 px inside the free map, whose top already sits below the tool row and any band under it; the first fit, the fit tile and closing an inspector land on that one frame. The first populated dial fits this overview before assembling, including when a folder arrives in intermediate batches. Panning while the folder is still being read keeps the person's camera position through that placement.

Opening the map shows one loader, and none when it would show for less than `--motion-base`. Names are placed against the resting layout and appear once, where they stay: each fades in over `--motion-fast` once its mark has travelled 90 % of its rise, the hub's with the domains', and all at once with reduced motion. A domain whose chip the free map's edge cuts stays unnamed until a slot clear of lines opens; one inside the free map is named over a line only when every slot crosses one.
