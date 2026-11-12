---
title: Flat dial
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Flat dial

## Domain graph

The full Flat map is a force graph lit by domain. Flat answers "if I touch
this, what moves?": at rest it shows territory, and pointing lights the reach.
Each domain is a pool of soft, edgeless light in its own hue
(`--color-domain-1-rgb` to `-8-rgb`), with a crisp disc and a lit core at its
centre. Its capabilities sit around it as smaller discs in the same hue, sized
by the square root of their element count. Their elements surround them as
dots. The project sits at the hub. Domain names are large, bold and
horizontal, with a caption counting the domain's complete capability and
element membership.

Hues follow the circular domain order. Past eight domains a hue repeats, but
never on two neighbouring clusters while a free hue exists. A domain keeps its
hue for the session.

The layout is deterministic. ForceAtlas2 places domains around the hub, each
sized by the footprint its capabilities and elements need. A second pass places
each domain's capabilities with partner domains as weak far anchors, so a
capability leans toward the domains it depends on yet stays nearer its own
domain than any other. The clusters then spread to the overview's aspect, so
the first fit fills the free map. Concepts outside every domain sit in an
empty corner. Every concept keeps a disc or dot and a pick target, whether or
not its name has room.

Names are admitted per zoom step without collision: the project, every domain
block, then capabilities by dependency degree, then element names once
elements are far enough apart. Zooming in only adds names. A selected concept
is always named.

Decision `9cc79e76-48db-4606-9376-c050cb690221` and the branch records it
built on are overturned by decision `38e33f2e-dd02-4874-bd5f-2b1b5891072e`. Scoped
realms still draw domain branches.

## Scope readout

The bottom corner has one passive scope line, without a generic legend or click invitation.
Its count comes from graph membership, not visible marks or zoom: a full map shows its total,
and a recorded realm shows its known member count against that total. An unknown subset has
no scope claim. Selection and an open dock make the line step aside. A synthetic performance
fixture is explicitly labeled and suppresses the unrelated sample introduction; its names
are not authored ontology data. The frame meter remains opt-in.

## What a line counts

A line between two domains counts the `depends_on` relations (a concept's `dependencies` or `depends_on`) whose ends resolve to those two domains: a domain is itself, a capability its domain, an element its capability's domain or the domain that holds it. The count is per direction and equals what `query_ontology({operation:"domain_matrix", types:["depends_on"]})` reports for that pair (`tests/contract/analysis/domain-flow-parity.contract.test.ts`). Lines are counted aggregates, never bundles of individual relations.

At rest the strongest 40 directed domain pairs draw as thin, faint bowed arcs
whose width and ink rise slightly with the count, ending in a small open head.
They read as texture under the clusters. The hidden ones still count in
`__atlasMap.dial().budget`.

## Focus

Hovering or selecting lights a set and sinks everything else toward the
canvas. A domain lights itself and its members. A capability lights its
domain, its elements, and the capabilities it needs, is used by or relates
to, joined by thin curves. An element lights its capability's set. The project
stays lit. Resting arcs give way while a set is lit. The inks crossfade over
`--motion-fast` and jump at once with reduced motion. Names keep their places;
lit capability names join the admitted set.

## Zoom

Discs grow gently with zoom up to `--map-graph-growth-max`, while names keep
their type size. Element dots appear once they are far enough apart. A name
omitted from a crowded overview does not remove its concept. Zoom, pan,
selection, search and the navigator reach every authored concept.

## Lenses and realms

Meaning and relation inspection draw the graph as context under their lens.
Scoped domain and capability views reuse branch marks with actual kinds;
smaller scopes use a containment tree. The labelled Full map return restores
the selected root.

## Memory and first read

Within a session, an unchanged domain keeps its position and its capabilities'
positions across rebuilds; a changed domain only seeds the new layout. Hues
are kept the same way. Opening another folder clears this memory.

## Evidence

Evidence state stays attached to real concepts. Stale members carry an amber
pip, and a domain caption counts them. A concept with unknown evidence draws a
dashed hollow disc. When evidence has not been measured, a caption under the
project states that limitation.

## Performance bars

A settled map draws no frames. Glows are cached sprites and the sunk inks are
pre-mixed, so a frame is a fixed set of fills per ink. Level of detail for
2,000- and 10,000-concept folders is not yet tuned.

## Hand-off to an agent

What the graph draws, an agent can ask for:

- `query_ontology({operation:"domain_matrix", types:["depends_on"]})` or `ontology-atlas domain-matrix --types depends_on`: the counted lines.
- `query_ontology({operation:"blast_radius", slug, direction:"incoming"})` or `ontology-atlas blast-radius <slug> --direction incoming`: what a focused capability is used by.

The overview fits the graph into the free map, whose top sits below the tool
row and any band beneath it. The first fit, the fit tile and closing an
inspector use that overview framing.
