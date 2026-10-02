---
id: 820f9e38-52ca-4821-b5d9-ea69ee192df1
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: map-measurement
---
**Observed**: The Galaxy cosmos engine sized its canvas and read its room through `getBoundingClientRect` (`src/widgets/ontology-map/galaxy/cosmos-engine.ts` `resize()` at f24b0b18a). A read during the topology surface's `topologyFade` entry (scale 0.995) returned `67.34,2.15 1329.32x855.70` for a 1336x860 canvas. The room's 12 px slack then held that reading, so `map-galaxy-mode-transition.spec.ts:172` failed 6 of 8 on the integration head, each time by 4.574190715176087 px. Flat fixed the same read on 2026-09-25 (`use-topology-viewport-lifecycle.ts`, "The layout size, not the painted one"). The IF slice had read the same transform as "surface resize during arrival (1441x977 to 1448x982)" and added a room hold instead.
**Cost**: one integration slice's hold plus this investigation (two builds and about 40 e2e runs); the flake reached the integration branch.
**Suspected cause**: Each map surface measures its canvas on its own, and nothing ties a new surface to the layout-size rule the first surface learned. A 0.5% size change reads as a resize unless you know about the fade.
**Proposed change**: gate: one shared measure-canvas-by-layout helper for map surfaces (Flat viewport, cosmos engine, hex board), plus a source-scan contract that flags `getBoundingClientRect()` width or height used as a map canvas size outside that helper.
