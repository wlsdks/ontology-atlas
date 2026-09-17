---
id: 3466b7a8-24e0-44e1-bbc8-ff1790610dc4
date: 2026-09-18
---
## 2026-09-18 — The islands are bodies: they arrive and can be carried, and at rest they are still

**Why**: the owner, on the islands map: "isn't this a structure that moves like a force graph?" The map is laid, not simulated, so the same folder is the same picture; but a picture that appears rather than assembles has no life, and an island a hand cannot move has no weight.
**Prior**: keeps 2026-09-08 "Hover changes ink, never position, and a settled picture stops the loop" (no drift at rest) and 2026-09-18 "The Library graph is a map of islands" (the layout owns the places). Overturns nothing: the physics adds motion only on arrival and under a hand.
**Decision**: `library-islands-physics.ts` treats each island as a body with a spring to its laid home, a separation that leaves no two bodies overlapping (the larger moves less), and heavy damping at a fixed step. A folder's first map arrives: bodies start near the centre and land largest first in about half a second. A drag carries an island; the islands it runs into are shoved aside and settle back once it has passed; the dragged one keeps where it was dropped until the map is laid again. A map laid again while showing keeps each island where it stands. Rest is measured by displacement, so a body held against a neighbour is still; the frame loop stops. Reduced motion settles in place. Deterministic: no randomness anywhere.
**Dissent**: a person who loved the live force picture wants ambient life; the 2026-09-08 record and the owner's own words stand against it. The dragged island's new place is not remembered across visits.
**Falsifier**: an island moving with no hand on it and no folder change; two islands overlapping at rest; the same folder arriving to two different maps; the loop running while the map is still.
**Owner**: jinan
