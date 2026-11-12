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
dots. At rest marks paint at `--map-graph-rest-hue` of their hue and no disc
glows; glow and full hue belong to the hovered or selected set. The project
sits at the hub as a disc no larger than a domain's; its spokes to the domains
draw only while the project itself is pointed at or selected, because place and
hue already say what it contains. Domain names are large, bold and horizontal,
with a quieter caption counting the domain's complete capability and element
membership. Capability names are one weight lighter, in the secondary ink.
Concepts outside every domain sit together under one caption with their count.

Hues follow the circular domain order. Past eight domains a hue repeats, but
never on two neighbouring clusters while a free hue exists. A domain keeps its
hue for the session.

The layout is deterministic: the domain order, positions and hues come from
the folder's content and the free map's size alone, so a folder draws the same
picture however fast or in whatever batches its files were read, whichever map
showed before it, and whether the product font arrived before or after the
read. ForceAtlas2 places domains around the hub, each
sized by the footprint its capabilities and elements need. A second pass places
each domain's capabilities with partner domains as weak far anchors, so a
capability leans toward the domains it depends on yet stays nearer its own
domain than any other. The clusters then spread to the overview's aspect, so
the first fit fills the free map. Concepts outside every domain sit in an
empty corner. Every domain and capability keeps a disc and a pick target,
whether or not its name has room, and a pointer inside a disc picks that disc
even where an element dot is drawn over it. An element dot answers the pointer
once it is drawn, ahead of a name but only outside every disc. A concept outside an open lens draws nothing and answers nothing.

Names are admitted per zoom step without collision: the project, every domain
block, then capabilities by dependency degree, then element names once
elements are far enough apart. Zooming in only adds names. A selected concept
and every far end of its lines are always named; a forced name keeps off every
domain title when any placement can.

Decision `9cc79e76-48db-4606-9376-c050cb690221` and the branch records it
built on are overturned by decision `38e33f2e-dd02-4874-bd5f-2b1b5891072e`. Scoped
realms still draw domain branches.

## Scope readout

Above the map's bottom edge a key row draws a small sample beside each mark
on screen: the capability disc, the resting domain arcs, and under a
selection only the line kinds that selection draws.

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
domain, its elements and every capability it needs, is needed by, relates to
or sits under (`broader`). An element lights its capability's set. The project
sinks with the rest unless it is the focus. Resting arcs give way while a set is lit. The inks crossfade over
`--motion-fast` and jump at once with reduced motion. Names keep their places;
lit capability names join the admitted set.

Only the hovered or selected capability draws its own lines: the relations it
states itself, the same connections its detail panel lists, one per far concept
and direction. Its elements' relations are not rolled up into it.

- **Needs** (a directed relation from it): a filled taper, wide at the
  capability and pointed at what it needs, in `--map-graph-arc`.
- **Needed by** (a directed relation into it): the same taper, wide at the
  concept that needs it, in the warm `--map-graph-reach`.
- **Relates**: a dotted hairline. A pair that also depends draws only the
  dependency.
- **Broader** (`is_a`): a double hairline toward the broader concept.

Direction is the taper and kind the stroke pattern, so no reading rests on hue
alone. A recorded reason
(`relation_notes`) does not reach the map's edges yet, so lines carry no mark
for it.

A selected capability, element or orphan grows to `--map-graph-selected-disc-px`
with one ring, and its name takes `--map-graph-selected-name-px` beside, below
or above it, clear of every domain title. A capability's reach line sits
beneath in the secondary ink with figures aligned as table columns: the
detail panel's two directed totals, what it depends on and what depends on it
(`is_a` included), a zero side left out. While a
member is selected its domain's name steps down to the secondary ink. When a
click opens the detail panel over the selection, the camera slides sideways at
the same scale until that name block clears the panel.

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

A settled map draws no frames. Cluster light and the lit set's glows are cached
sprites, the sunk inks are pre-mixed, and paths are grouped by ink, so a
frame's canvas calls grow with the drawn discs and names rather than the
folder. Mark objects are reused across frames. Level of detail for 2,000- and
10,000-concept folders is not yet tuned.

## Hand-off to an agent

What the graph draws, an agent can ask for:

- `query_ontology({operation:"domain_matrix", types:["depends_on"]})` or `ontology-atlas domain-matrix --types depends_on`: the counted lines.
- `query_ontology({operation:"blast_radius", slug, direction:"incoming"})` or `ontology-atlas blast-radius <slug> --direction incoming`: what a focused capability is used by, the warm tapers.

The overview fits the graph into the free map, whose top sits below the tool
row and any band beneath it. The first fit, the fit tile and closing an
inspector use that overview framing.
