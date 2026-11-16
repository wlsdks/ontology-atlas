---
id: a5cde444-6242-4b81-be37-c2de32faf1b7
date: 2026-11-16
---
## 2026-11-16 — On the Flat graph a selected domain zooms in until its members stand apart

**Why**: the owner pressed a domain of `docs/ontology` to reach one of its capabilities and found the members packed as tiny dots. The frame zoomed out to hold partner domains: at 1410x840 with both panels open a domain went to 0.66 of the clicked zoom, its closest members 16.6 to 17.9 px apart (25 to 27 px before).
**Prior**: overturns "a domain never zooms in" and the partner framing (every partner's disc held, zooming out to the map's fit) of `decisions/2026-11-13-flat-selection-one-frame-f11219c8-b204-4313-ae82-36e150092e44.md`; the rest stands, as does `decisions/2026-11-13-flat-deselect-returns-untouched-view-a047a703-57e7-4c34-86f1-ad1b512625be.md`.
**Decision**: a selected domain frames its own star (disc, name, count line, member discs) with the capability selection's slide, zoom cap and deselect return, zooming in until its two closest members stand `--map-graph-domain-apart-px` (44 px) apart, never past the scale where the star still fits; members already that far apart keep the zoom. Partner domains may leave the view. Every Flat mark answers the pointer within `--map-graph-pick-min-px` (10 px), nearest centre first, a drawn disc over a neighbour's enlarged area; the shared slack is unchanged.
**Dissent**: at a narrow window a domain click always changes the scale (1.6x to 1.8x at 1410x840) and the partner domains leave the view, so reading the reach needs a zoom out or a hover; at a wide window some domains zoom and others do not.
**Falsifier**: readers ask where a selected domain's partners went, or zoom out by hand after selecting one; or they still miss a member 44 px from its neighbour.
**Owner**: stark
