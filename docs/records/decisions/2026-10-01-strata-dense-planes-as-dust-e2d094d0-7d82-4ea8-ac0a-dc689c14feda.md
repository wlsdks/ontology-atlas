---
id: e2d094d0-7d82-4ea8-ac0a-dc689c14feda
date: 2026-10-01
---
## 2026-10-01 — Strata draws dense planes as dust and each domain's containment as one light sheet

**Why**: owner report, 2026-09-30: at large vault sizes Strata lags and thousands of containment lines form a solid grey curtain. Measured on the static export at 1512x982 @2x: 10,000 concepts took 59 ms of script per frame (15 fps) and 46,809 canvas draw calls; 2,000 concepts already dropped 30% of 120 Hz frames.
**Prior**: Extends 2026-09-25 "The 3D map drops the Cone and lights Strata and Neural" (090e33d4-85e9-4750-a4dc-310c93a9a4ba), whose floors, sector bands and evidence light stand. The 2026-09-06 relation ink floor and the 2026-09-07 one-device-pixel floor keep governing every line still drawn one by one.
**Decision**: a capability or element plane whose median lane gap falls under 0.9 disc diameters, or that would put more than 1,500 discs on screen, crossfades to dust (one dot per concept in its kind colour, batched by plane, evidence and depth, spread across the lane only when denser than a dot) and is fully dust by 0.5 diameters or 3,000 discs; each domain's containment into an aggregated plane becomes one gradient sheet to its slice, with a gap between neighbours. A hovered domain, the band under the pointer or the focused concept's domain resolves back to discs and lines; every level change is a 120 ms (`--map-tip-fade-ms`) opacity crossfade, identical under reduced motion because nothing travels. Vaults below the threshold draw exactly as before.
**Dissent**: from the overview of a large vault a single element can no longer be clicked directly; it takes a hover, a focus or a zoom first. The thresholds were tuned on the synthetic vault, and a redesign study may retire Strata.
**Falsifier**: a person at 2,000+ concepts who cannot say which domain owns a slice or cannot reach a named element in two gestures; a frame over 33 ms at 10,000 concepts idle or orbiting on the reference machine; any pixel difference on the sample vault.
**Owner**: jinan
