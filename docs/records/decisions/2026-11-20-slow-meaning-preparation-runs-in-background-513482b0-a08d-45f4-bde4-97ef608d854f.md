---
id: 513482b0-a08d-45f4-bde4-97ef608d854f
date: 2026-11-20
---
## 2026-11-20 — Slow preparation is accepted when it runs in the background with progress in view

**Why**: e4505512's falsifier "50k files over 60 min" fired: the built-in model indexes 11.9 passages/s on Metal, about 70 min for 50k. Owner, 2026-11-19: slow preparation is acceptable if it runs in the background and its progress is always visible (`docs/specs/2026-11-19-search-by-meaning.md`, Revisions and AC9, merging in #3633).
**Prior**: e4505512 (its 60-minute falsifier is retired by this record; everything else stands).
**Decision**: preparing vectors may take longer than 60 minutes for 50k files. It runs in the background, resumes after a stop, lets search use the part already prepared, and shows its progress from every tab until it finishes.
**Dissent**: a person with a large folder waits over an hour for full results, and background work competes with the map for the machine.
**Falsifier**: AC9 fails: the map's frame time p95 worsens by more than 10% while preparing, or progress is not visible from every tab.
**Owner**: Stark
