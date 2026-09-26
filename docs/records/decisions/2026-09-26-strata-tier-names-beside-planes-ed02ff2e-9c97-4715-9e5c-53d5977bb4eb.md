---
id: ed02ff2e-9c97-4715-9e5c-53d5977bb4eb
date: 2026-09-26
---
## 2026-09-26 — Strata names each plane beside its rim, and the 3D fit clears the chrome's columns when that is free

**Why**: owner, 2026-09-26: Strata's tier names sat as a list in the bottom-right corner, repeating the legend strip's key instead of naming a plane. On the product's own ontology the corner stack was what drew at both 1512x949 and 1040x720, so no row stood by its plane. The 3D fit also centred as if the utility rail's column were free map: after a switch from Strata, Neural's centre sat 61 px right of the free map's at 1512x949.
**Prior**: overturns 2026-09-07 "Strata's tier legend takes the right edge only where the fit was not going to use it" (the corner stack and its aspect predicate), whose falsifier this is. Keeps both records' rule that a name lands on no disc, concept name or chrome, and the hover raise.
**Decision**: a plane's name stands a gap outside its rim's right extreme, else its left, only where it lands on nothing: inside the free map with half a gap of air, off every other plane's disc and every name placed before it (`model/tier-names.ts`). A plane with no such place goes unnamed; the legend strip names every kind by its plane's colour. Concept names and captions give way to placed names. The 3D fit takes the rail's and the folded INDEX tab's columns (`data-map-fit-obstacle`) when that costs no scale or the chrome would cover a node, and keeps the width otherwise. After: four names by their rims at 1512x949, three at 1040x720; Neural -1.4 px and Strata 0 px from the free map's centre.
**Dissent**: at narrow widths a plane can go unnamed where the corner list printed all four words; kept, because the key names every kind and a list that names no plane is what the owner rejected. Strata at 1040x720 keeps the full width rather than centring between the chrome, since reserving the rail's column there cut fill from 73.7% to 66.9% and fused two element pairs.
**Falsifier**: a person at 1512 or 1040 who cannot say which plane a name belongs to; a name on a concept, a name or the chrome in any pose; a 3D node under a rail tile.
**Owner**: Stark
