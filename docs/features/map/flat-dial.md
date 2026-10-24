---
title: Flat dial
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Flat dial

## Readable branch overview

Flat maps use domain label blocks with outward capability rows at every density.
The initial preview shows up to six capabilities per domain with at most four
domains, four with five or six domains, two with seven through twelve domains,
and one with larger domain sets. Larger sets keep the same branch grammar in
stable column groups. The domain's units line counts its complete capability
and element membership, independently of the visible preview.

More advertises the next bounded batch and reveals actual members. Collapse
names the additionally revealed count and restores the initial preview.
Disclosure and collapse fade interruptibly; fitting accounts for the disclosed
names and controls. Long capability names wrap within a bounded column, with
the full title available in the selected concept's inspector. Short undirected branches encode
membership; thin arrows encode dependencies in their actual directions.
Dashed `relates` links retain their distinct meaning. Hover changes ink without
moving labels. Domain blocks and member names are whole pick targets; dragging
still moves the real concept.

Every concept remains in the graph even when its name has no room. At smaller
scales, domain blocks collapse toward compact marks and readable previews wait
for enough screen room. Selected concepts receive naming priority. The project
is a compact context label above the drawing. Domain type uses the title step,
member type the body-lg step, and metadata the label step.

Decision `9cc79e76-48db-4606-9376-c050cb690221` supersedes the former six-domain,
24-row-per-domain and 48-row-overall fallback thresholds. Dense maps do not
switch back to orbital rings or the former zoom-triggered ledger.

## Scope readout

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

Detail follows screen room and explicit member disclosure. More and Collapse
remain actual canvas pick targets. Capability names wrap to at most two lines
within a bounded column, with an ellipsis when longer names overflow. Selecting
the concept exposes its full title in the inspector. A name omitted from a crowded overview does
not remove its concept from the graph. Zoom and pan can expose its neighborhood;
selection, search and the navigator provide access to authored concepts.

When a relation end leaves the free map (the viewport less the open panels),
a named stub retains its directional counts. Domain-level aggregation remains
until capability inspection; detailed relation explanations stay in relation
review.

## Lenses and realms

Meaning and relation inspection retain Flat's branch forms. Scoped domain and
capability views reuse branch marks with actual kinds; smaller scopes use a
containment tree. The labelled Full map return restores the selected root.

## Memory and first read

Vault-scoped layout memory retains domain ordering and placement across reads.
A first read places domains as their capabilities arrive and settles the final
placement after reading. Progressive disclosure retains the full graph rather
than replacing hidden concepts with synthetic nodes.

## Evidence

Evidence state stays attached to real concepts. Stale members carry an amber
mark. When evidence has not been measured, a caption under the project states
that limitation; a synthetic performance fixture is not authored evidence.

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

The overview fits the domain branches and their bounded previews into the free
map, whose top sits below the tool row and any band beneath it. The first fit,
the fit tile and closing an inspector use that overview framing. Panning while
a folder is still being read preserves the person's camera position through
placement.

Opening the map shows one loader, and none when it would show for less than `--motion-base`. Names are placed against the resting layout and appear once, where they stay: each fades in over `--motion-fast` once its mark has travelled 90 % of its rise, the hub's with the domains', and all at once with reduced motion. A domain whose chip the free map's edge cuts stays unnamed until a slot clear of lines opens; one inside the free map is named over a line only when every slot crosses one.
