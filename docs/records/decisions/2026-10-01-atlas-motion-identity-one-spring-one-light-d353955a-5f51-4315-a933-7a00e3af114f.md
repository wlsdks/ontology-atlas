---
id: d353955a-5f51-4315-a933-7a00e3af114f
date: 2026-10-01
---
## 2026-10-01 — Atlas motion identity: one spring, one light
**Why**: The thirteen primitives gave every surface a clock but no recognisable character; spatial moves used ad hoc curves and three conflicting "response" conventions, so nothing read as Atlas.
**Prior**: `docs/records/decisions/2026-09-29-motion-is-a-primitive-set-84007fc7-26fb-4a2b-88ff-05303fca6acd.md` (D24 reduced motion, D27 decoration rule, D28 budgets) stand.
**Decision**: Identity "Conduction — one spring, one light" with four principles and a tier 0–3 spending rule; route change stays tier 1. Spatial travel uses the house set `SPRING.control/surface/canvas` (k 800/300/140) at one damping ratio 0.85, mass 1, in stiffness-and-ratio grammar; mass slows a concept without more bounce. Springs are JS only (`src/shared/motion/spring.ts`, closed form); DOM receives `springEasing()` as runtime `linear()`, with no static CSS spring token. Effects stay on the `--motion-*` ramp. Existing specialisations keep their values and reasons; a new one needs a record. The selection indicator moves on `SPRING.control` first.
**Dissent**: A 239ms control settle is longer than the 180ms base clock and may read slower in rapid tab switching on a 120 Hz display.
**Falsifier**: `tests/e2e/motion-selection-indicator.spec.ts` measures normalised FFS above 0.15 or MFS above 0.27, or `/motion-verify` shows the indicator still moving after 239ms plus two frames.
**Owner**: Stark
