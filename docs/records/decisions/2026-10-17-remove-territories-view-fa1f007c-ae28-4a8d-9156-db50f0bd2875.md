---
id: fa1f007c-ae28-4a8d-9156-db50f0bd2875
date: 2026-10-17
---
## 2026-10-17 — Territories leaves the map picker; Hex keeps its morph

**Why**: owner, 2026-10-17 (in Korean): "This Territories thing is odd; I don't think it's needed?". On the dogfood vault Hex already names every capability at rest at 1512 with domain counts and stale rims (`map-hex-board.spec.ts:197`), and Flat names capabilities as they get room (88b537fc); three of six picker rows read domain to capability.
**Prior**: overturns 2026-09-24 5c88c11e. Narrows 2026-09-30 0d8a6f67 to picks into or out of Hex, and 2026-10-15 f4310914's "Territories and Hex" clause to Hex. Keeps what 6de28f78 took from 5c88c11e (one picker, the shared evidence rule, the flat map's inspector) and the 2026-09-10 one-picker rule.
**Decision**: the picker offers Flat, Hex board, Domain structure, Strata, Neural. `?view=territories` and a stored Territories pick count as no view, like any unknown value: the reader's last pick opens, else Flat. The stored key is never read and goes on the next pick. Territories' renderer, layout, marks, tokens, messages and tests are deleted.
**Dissent**: Territories alone named every capability at rest at any window size (fixed label scale, pan); Hiding it behind a flag lost: code no picker reaches. Below xl the loss is known: Hex opens on pips at 1040 (`map-hex-board.spec.ts:335-343`).
**Falsifier**: from a five-second still of Hex at 1512 on the dogfood vault, a reader cannot say which domain a named capability belongs to, or which capabilities are stale.
**Owner**: Stark
