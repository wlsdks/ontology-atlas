---
id: d6e56cc1-ac25-4e1c-bf9b-06a2f3345dde
date: 2026-11-16
---
## 2026-11-16 — Neural is a volume painted by three.js where WebGL2 is hardware; canvas 2D stays its fallback
**Why**: The owner asked on 2026-11-15 that Neural express 3D and be drawn with three.js, and approved the lit-sphere still. On canvas 2D a cell is a flat disc that cannot hide what stands behind it, and clusters on a ring read as a flat circle.
**Prior**: Overturns "three.js itself" in `docs/DECISIONS.md` 2026-09-06 "Strata joins Cone and Cloud" for Neural only; `three` already ships for the Library, so no package is added. Overturns the ring of `docs/records/decisions/2026-11-15-neural-cells-and-tracts-86dc7017-ec82-45f2-a4f0-ca93c952f455.md`; the rest stands. `docs/records/decisions/2026-10-01-map-light-layer-1af0cd58-582a-4700-bc6b-86d3bd206da6.md` stands: one live WebGL context per map.
**Decision**: One `NeuralFrame` per drawn frame, two painters. `neural-gl/` paints it with three.js, loaded on first entry: lit spheres that write depth, ribbons, a shell round each cluster's cells. No hardware WebGL2, a failed chunk or a lost context leaves canvas 2D drawing the same frame; picking, names and the probe never read WebGL. Clusters are packed at seven depth levels; a turn's zoom follows its angle so the cloud stays in the free area; a name clears the panels. Measured 2026-11-16, M2 Max, 1512x982 DPR 2, full Chromium headless: a turn's frame interval at 5,000 concepts is p50 8.3 ms, p95 17 ms against canvas 2D's 16.6 and 24.9 ms (equal to main); at 1,000 both are 8.3 ms. The chunk is 136 kB gzip.
**Dissent**: Two painters must stay in step, and the fallback has no occlusion or shell. Turned about 60 degrees, clusters stand behind one another and only the nearest titles show.
**Falsifier**: A turn at 5,000 concepts shows a frame interval above 50 ms with three.js but not with `?neuralgl=off`; the installed app paints a cell or tone unlike Chromium; a click selects a cell other than the one painted; two clusters overlap at rest on the dogfood vault at 1512 px.
**Owner**: Project owner, 2026-11-15, delegated to the lead.
