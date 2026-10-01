---
id: e2d094d0-7d82-4ea8-ac0a-dc689c14feda
date: 2026-10-01
---
## 2026-10-01 — Strata draws dense planes as dust and each domain's containment as one light sheet

**Why**: owner, 2026-09-30: large vaults lag in Strata under a grey curtain of containment lines; at 10,000 concepts a frame cost 59 ms of script and 46,809 draw calls (static export, 1512x982 @2x).
**Prior**: Extends 2026-09-25 lit Strata (090e33d4-85e9-4750-a4dc-310c93a9a4ba); its floors, bands and evidence light stand.
**Decision**: a capability or element plane turns to dust (a dot per concept) as its lane gap falls from 0.9 to 0.5 disc diameters or its on-screen discs rise from 1,500 to 3,000; a domain's containment into dust is one light sheet. Every evidence state is dust with its mark: current a lit dot, stale an amber ring, unknown a dim ring (stale ring 4.7-6.7:1 on the floor, a ring's hole 4.0-5.1:1 against a lit dot); a new Git walk crossfades them. A dependency with a dust end rides a counted, arrowed chord shown only for the pointed or focused domain; the legend counts the rest. The concept nearest the pointer (6 px), else its sheet, picks the slice, held while the dome moves, re-read at rest, released on leaving. Level changes are 120 ms opacity crossfades capped at a 60 Hz step, also under reduced motion. Below the threshold nothing changes.
**Dissent**: a mostly stale vault is typical, not an edge (this repository's is 88% stale); at overview density marks merge into lanes showing only proportions, capability amber near the warning's, so one concept's evidence needs a hover or zoom. No element is clickable from the overview; zoom opens the element plane only to 0.44 at 10,000 concepts. A redesign may end Strata.
**Falsifier**: at 10,000 concepts on the static export or the desktop app with evidence about 85% stale (1512x982 @2x, M2 Max, 120 Hz), a frame (interval between two drawn animation frames) over 33.4 ms idle or orbiting, or over 1% of frames hovering; under 99% of on-screen dust resolving its own domain; asked which domains one domain depends on, a person pointing at it names under 80%; any pixel change on the sample vault.
**Owner**: jinan
