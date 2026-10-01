---
id: e2d094d0-7d82-4ea8-ac0a-dc689c14feda
date: 2026-10-01
---
## 2026-10-01 — Strata draws dense planes as dust and each domain's containment as one light sheet

**Why**: owner report, 2026-09-30: large vaults lag in Strata and containment lines form a grey curtain. Static export, 1512x982 @2x: 10,000 concepts cost 59 ms of script and 46,809 draw calls a frame.
**Prior**: Extends 2026-09-25 lit Strata (090e33d4-85e9-4750-a4dc-310c93a9a4ba), whose floors, bands and evidence light stand.
**Decision**: a capability or element plane turns to dust (a dot per concept at its place) as its lane gap falls from 0.9 to 0.5 disc diameters or its on-screen discs rise from 1,500 to 3,000; each domain's containment into dust is one light sheet. Only measured-current concepts become dust; stale and unknown keep disc and ring (stale ring to current dust 1.7-2.0:1, unknown body 3.5-4.3:1; as dust 1.02-1.12 and 1.32-1.42:1). A dependency with a dust end joins one counted chord per ordered domain pair. The nearest concept within 6 px, else the sheet under the pointer, resolves its domain's slice, as do hover and focus; the pick moves only over a still dome and releases when the pointer leaves. A level change is a 120 ms opacity crossfade, at most one 60 Hz step per frame, the same under reduced motion. Below the threshold nothing changes.
**Dissent**: an element is not clickable from the overview, and zoom alone opens the element plane only to 0.44 at 10,000 concepts. Dependencies inside one domain or with an end under none (1,671 and 693 of 8,925 at 10,000) hide until their ends resolve. A mostly stale or unknown vault keeps its discs and its cost. A redesign may retire Strata.
**Falsifier**: at 10,000 concepts on the static export (1512x982 @2x, M2 Max, 120 Hz), a frame, meaning the interval between two drawn animation frames, over 33.4 ms idle or orbiting; under 99% of on-screen dust resolving its own domain; a person missing a hidden dependency at overview; any pixel change on the sample vault.
**Owner**: jinan
