---
id: 23161dc5-bc7d-43cd-880e-95f5359f7ea5
date: 2026-10-20
---
## 2026-10-20 — Motion is allowed broadly; smoothness comes first and stays binding

**Why**: The owner asked to remove the motion rules or allow them broadly, with one bar: it runs smoothly. The closed set and the 240 ms cap refused expressive motion before anyone saw it.
**Prior**: Overturns `docs/records/decisions/2026-09-29-motion-is-a-primitive-set-84007fc7-26fb-4a2b-88ff-05303fca6acd.md` (closed set, three-step stagger; overturned on the owner's direction, 2026-10-20; its recording and performance falsifiers carry over) and, of `docs/records/decisions/2026-10-01-atlas-motion-identity-one-spring-one-light-d353955a-5f51-4315-a933-7a00e3af114f.md`, the tier rule, one damping ratio, a record per spring and light only during an act. Keeps "The expression bans are lifted" (2026-09-08), the event-only light layer (2026-10-01), and 2026-09-08 "The Library graph stands still; hover changes ink, never position" (`docs/DECISIONS.md:437`), the owner's complaint: no drift on the Library graph or the map.
**Decision**: Binding, in order: smoothness (no frame interval over 50 ms, loops on compositor properties, any input settles motion, the map sleeps, ambient motion pauses hidden or offscreen, a route transition stays within `--motion-base`), reduced-motion equivalents, named values. Hover moves an inner layer so the hit box stays, and hover and focus finish within `--motion-settle`: a 600 ms hover reads as lag. Lifted: the 240 ms cap (slow 360, expressive 600, choreography 1200 ms), the closed set, still rest, travel-free pages, causal-only stagger, tier spending. A token, spring or primitive needs a line in `docs/DESIGN-SYSTEM.md`, not a record, and a spec that checks its smoothness.
**Dissent**: Ambient and long motion compete with data, drain a laptop and make the app feel slower; the tier rule was the cheapest defence (planner seat).
**Falsifier**: A recording where motion reads before its data; a frame interval over 50 ms on a bar; ambient motion running offscreen or hidden; a reader calling a frequent surface slow.
**Owner**: Stark
