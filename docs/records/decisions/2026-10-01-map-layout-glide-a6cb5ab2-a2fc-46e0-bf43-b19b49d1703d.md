---
id: a6cb5ab2-a2fc-46e0-bf43-b19b49d1703d
date: 2026-10-01
---
## 2026-10-01 — The layout morph glides each concept on the canvas spring with its container

**Why**: the 2026-09-30 layout morph moved every ghost on one linear `easeMotion` progress, so a container and its children arrived as a cloud with no protagonist, and a second pick restarted from rest with a kink.
**Prior**: extends 2026-09-30 map layout morph (0d8a6f67) and applies the motion identity (one spring, one light) to it; its switch choice, handoff, crossfade, ceilings and settle-on-input stand.
**Decision**: positions move on `SPRING.canvas` in closed form, sampled by elapsed time. The containment tree is re-rooted at the selected concept (else the project, else each other component's root one step later); each concept is its re-rooted parent plus a polar offset (shortest arc, a turn past 150 degrees follows the siblings' median sense, linear radius, linear under 2 px). Its own motion starts min(3, distance) x `STAGGER`; mass is 1 + `massForDegree`, at most 2. A pick in flight carries each concept's velocity into the next travel. Alpha and style take `easeMotion` over `--motion-base`; reduced motion still crossfades on `--motion-fast`.
**Dissent**: keep the camera clock and linear interpolation: shorter (200-420 ms against 571-913 ms) and already measured, but no leader, no containment and a kinked reversal.
**Falsifier**: 90% of the summed travel later than 540 ms or any concept outside 0.5% at 950 ms; a child crossing its container in a wide turn; sampling 10k concepts over 2 ms or planning them over 30 ms.
**Owner**: Stark
