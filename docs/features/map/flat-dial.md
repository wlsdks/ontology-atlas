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

A name, with its caption or count line, is not drawn where any of its lines
would reach under the chrome over the map: a side panel (out to the canvas
edge, so the gap beside the rail counts), the key's row, or a control in the
tool row. The selection's own name and count line always draw, however it was
selected: the camera framed them, and they are what the reader chose. Admission
runs per zoom step in world space, so this is judged as the frame draws, against
boxes measured whenever the camera measures the panels.

Names are admitted per zoom step without collision: the project, every domain
block, then capabilities by dependency degree, then element names once
elements are far enough apart. Zooming in only adds names. A selected concept,
with its count line, is placed before every other name and always named, then
the far ends of its lines and the lit capabilities, then lit element names. A
forced name keeps off every domain title when any placement can, and under a
lit picture never sits on another concept's name: a capability whose only sides
would overprint one is left out, and the detail panel still lists it; a lit
element name also keeps the selected title gap
from every domain title, prefers a side clear of every disc, never sits on the
selection's ring, and one with no side clear of names and the ring is left out
rather than overprinted. Under a lit picture a lit name tries its
sides in a fixed order (right, left, below, above) and takes the first that no
lit line crosses and no other name or disc occupies. Where every free side is
crossed, the name keeps the first free side and draws on a backing: a
rounded veil of the canvas ground just around its glyphs, translucent enough
that the domain light beneath dims rather than being cut out, and opaque
enough that no line reads through the glyphs;
a lit domain name a line crosses is backed the same way. Placement is checked
against each lit line's drawn curve over the whole zoom step, so the result
holds at any zoom inside the step, and costs O(lit names × lit lines).

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
canvas. A domain lights itself, its members and every domain it needs or is
needed by; those domains light their own disc and name, not their members. A capability lights its
domain, its elements and every capability it needs, is needed by, relates to
or sits under (`broader`). An element lights itself, its capability and that
capability's domain, so it shows where it lives, and the far end of each of its
own lines; it does not light its capability's other lines. The project
sinks with the rest unless it is the focus. Resting arcs give way while a set is lit. Names keep their places;
lit capability names join the admitted set.

The lit set arrives as a wave: the focus first, then the rest of the set in
order of distance from it, while everything else sinks. Each line draws from its
source end toward its target, landing as its far concept lights. A pointer that
rests on a concept for less than 80 ms lights nothing, so sweeping across the
map does not flicker. Pointing or selecting elsewhere moves straight from the
picture on screen to the new one: the old lines retract toward their source
while the new ones draw. Leaving (deselect, Escape, the pointer leaving) retracts
the lines and returns the rest picture faster than it arrived. After a selection's
lines have drawn, one small light runs once along each, from what is needed
toward what needs it, then the map rests and draws no frame. With reduced
motion every state lands at once and no light travels.

A hovered or selected capability or element draws only its own lines: the
relations it states itself, the same rows its detail panel lists
(`readConceptReach` and the map share `conceptLines`), one per far concept and
direction. A capability's elements' relations are not rolled up into it.

- **Needs** (a directed relation from it): a filled taper, wide at the
  selection and pointed at what it needs, in `--map-graph-arc`.
- **Needed by** (a directed relation into it): the same taper, wide at the
  concept that needs it, in the warm `--map-graph-reach`.
- **Relates**: a dotted hairline. A pair that also depends draws only the
  dependency.
- **Broader** (`is_a`): a double hairline toward the broader concept.

Direction is the taper and kind the stroke pattern, so no reading rests on hue
alone. A recorded reason
(`relation_notes`) does not reach the map's edges yet, so lines carry no mark
for it.

A hovered or selected domain draws its reach at domain level: the partner
domains its detail panel lists, one taper per partner and direction in the same
two inks, so a pair that depends both ways draws two tapers bowed apart. A
domain taper stands for every `depends_on` relation between the two domains in
that direction and widens with their count, from `--map-graph-line-taper-px` by
`--map-graph-line-taper-gain-px` per relation to `--map-graph-line-taper-max-px`,
the same screen width at every zoom. It leaves or lands just outside the
domain's own member star (a trim capped at 0.8 of the distance to the curve's
control point, so a large star beside a near partner can still hold the start),
fading in
from transparent over `--map-graph-line-fade-px` behind a round cap so it
emerges from the cluster's light, and reaches the partner's disc. A partner the camera cannot pan into view keeps its taper,
which runs off the edge toward it. The key names the two kinds as domains it
needs and domains that need it.

A selected capability, element or orphan grows to `--map-graph-selected-disc-px`
with one ring, and its name takes `--map-graph-selected-name-px` beside, below
or above it, at least `--map-graph-selected-title-gap-px` from every domain
title. A capability's or element's reach line sits
beneath in the secondary ink with figures aligned as table columns: the
detail panel's two directed totals, what it needs and what needs it (an `is_a`
line is drawn in its own style and counted by neither), a zero side left out. A selected domain's reach line takes
its caption's row under its name, in the same words, counting partner domains
joined by `depends_on` alone (`is_a` and `related_to` leave a domain's reach),
and equals the two domain counts its detail panel shows; the panel still lists
the membership the caption counted. The layout keeps members clear of the wider
of the caption and that reach line, so the row never lands on a member. A partner domain's title that a lit
domain line would run through takes the side above its disc when no lit line
crosses that side and no disc sits under it, so the line meets the disc;
otherwise it stays below on a backing. While a
member is selected its domain's name steps down to the secondary ink. When a
click selects, or a selection arrives from outside the canvas (the explorer,
search or a link), the camera frames the selection, its domain disc and every lit
concept inside that domain, with every side their names may take (the selection's own on the side it
takes when every side cannot fit), inside the
free map (clear of the explorer, the detail panel, the tool row and the key)
and `--map-graph-frame-margin-px` from each of those edges. When the whole lit
reach fits at the current zoom it frames the whole reach; far ends in other
domains otherwise may stay off screen. When the domain's lit set does not fit
it zooms out only as far as it needs and never below the opening fit. When the
framed view does not read clear, it zooms in about the selection, at most
`--map-graph-select-zoom-max-ratio` times the zoom of the click (for selections
made one after another with no pan or zoom between, the zoom of the first), never past the
zoom band's top, and only as far as the domain's lit set, its names on the
sides they take there, still fits and every far end the panned view showed in
the free map stays there. Within that range it takes the smallest zoom
that reads best, judged in order: no two lit names in the domain overlap and
none sits on a lit disc; the selection's ring keeps
`--map-graph-selected-disc-gap-px` from its domain disc; the most concepts in
the domain named. An element's picture is its lines, whether a capability or a domain holds it, so it zooms in only while
every far end, named, still fits, and only until its own name stands clear of
the names and discs beside it; when the far ends do not fit at the current zoom
it keeps that zoom. A domain selection never zooms in, because its picture is its
reach: it pans its disc, member star, name and reach line clear of the explorer
and the detail panel by the frame margin, zooming out only when they cannot fit
at the current zoom, and, when every partner domain's disc and name fit in the free map at
the current zoom, pans them all in; otherwise it pans in the partners nearest
to it, in order of distance, up to the first one that no longer fits with them,
so a farther partner may still land in view while a nearer one stays out. A zoom
that reads no better than the view the click left is never taken, and one under a
sample step is taken only when it reads clear or betters one of the first two
judgments, so a click stays a small move,
the rest of the map stays in view, and framing the landed view again moves
nothing. The fit bisects
eight times and the search samples eight zooms per octave, then bisects four
times: at most one name admission per zoom step. The
move is the least pan that frames, with any zoom, as one slide on the canvas
spring: a second selection mid-slide retargets it from where the camera is,
and a press or drag stops it at once. Deselecting returns the camera to where it
was before the first selection of the chain, unless the reader has panned or
zoomed since; a selection a deep link arrived on returns to the overview. An
arrow-key walk recentres as it goes, which is the reader travelling: letting go
after it stays where the walk arrived.

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

The map waits for the name font before its first frame, at most one second,
because names size the layout: a map drawn in the fallback face would be laid
out again when the font arrived and move every mark it had just shown.

The first time a folder opens in a session, the map assembles once, within
about 700 ms: domains leave the project, each domain's capabilities grow out
of it nearest first, element dots follow, and each name fades in once its mark
has landed. Each domain's light travels with it. Returning to the map from
another screen shows the settled picture at once, and any press lands the
assembly immediately.

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
