---
title: Light
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Light

The map lights a relation while something is happening on it, then settles back
to its static ink. The light runs along the relation's own line, never across
empty space, and only in the Flat and Galaxy views. With nothing happening, the
map draws no frame. Under reduced motion there is no light at all; the reveal's
ink and the static glow under the focused concept carry the same facts.

Technical contract: `src/widgets/ontology-map/light/README.md`. Values: the
`--map-light-*` tokens in `docs/DESIGN-SYSTEM.md`, "Light tokens".

## Focus

Selecting a concept (click, keyboard or search) sends one light along each
relation the map draws for it, at most 48, directional relations first, then
the better-evidenced ones. A directional relation lights from its source to its
target, so a relation pointing at the selected concept arrives at it; a
symmetric one lights outward from the selected concept. The light rides the
front of the relation's reveal and never runs ahead of the ink, at 1100 px/s
between 180 and 420 ms per relation. A neighbour the light reaches blooms once
and fades; the selected concept keeps its own glow. Selecting another concept
replaces the light; clearing the selection ends it. A selection that was already
there when the map opened, such as a deep link, does not light.

## Path

When a path between two concepts is found, its relations light hop by hop in
the walk's order, each stop blooms, and the whole path finishes within 1.2
seconds. The path's static ink remains afterwards. A path that was already
there when the map opened does not light.
