---
id: bdeff3ae-66c5-4475-8035-a78d689cc861
date: 2026-10-15
---
## 2026-10-15 — The Flat dial rests centred on its rings and names each mark once

**Why**: at 1920 the dogfood overview put the ring's top 85 px above the free map and the hub 138 px left of its centre; dashed rings sampled 1.0:1 at p10; three strokes read as one grey. On arrival a second loader flashed and 27 names moved over 4 px after appearing.
**Prior**: keeps 88b537fc-3831-4e9d-823f-0465c90a65a8: its ring encoding stands, and its "later ring changes once, at the end" extends to names. 2026-09-12 "The canvas's ink is sized to the canvas" is context only, overturned whole that day; the 3:1 floor is the design system's stroke floor. Keeps the `map-fit-side-air` lanes.
**Decision**: the overview frames the outer ring about the hub, reaching past it only where the drawing overhangs both sides of an axis, as world bounds with no pixel pad, so every fit path lands on one camera. Rings are solid at 3:1 or more because they carry the main axis; fills and strokes step domain over capability over element in `--map-dial-*` neutrals, fills under 1.3:1; the frame painter adopts them for rings, domains and capability fills in the same bundle as this change (#2814). Names are placed against the resting layout, keep their first place while it stays clear, and fade in over `--motion-fast` once their mark has travelled 90 %. A loader under `--motion-base` does not show.
**Dissent**: a one-sided overhang hangs into the band, so the dogfood bottom domain loses capability names at rest: three at 1920 (19 to 16), two at 1512 (16 to 14) and four at 1280x800 (14 to 10); centring the whole drawing keeps them with the hub 51 px high at a 13 % smaller scale. At 1x an antialiased 1 px ring samples 1.65:1.
**Falsifier**: a ring under 3:1 at p10 at 2x; a hub more than 8 px off the free map's centre at 1512 or 1920; an arriving name that moves over 4 px or vanishes and returns.
**Owner**: Project owner, through the 2026-10-15 map materials and arrival brief.
