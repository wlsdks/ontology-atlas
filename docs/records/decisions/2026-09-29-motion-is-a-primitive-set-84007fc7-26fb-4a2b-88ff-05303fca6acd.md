---
id: 84007fc7-26fb-4a2b-88ff-05303fca6acd
date: 2026-09-29
---
## 2026-09-29 — Motion is a primitive set every surface uses

**Why**: motion was bespoke per surface; the 2026-09-29 motion plan found press that never animated (Tailwind v4 `translate` is not `transform`), no shared indicator, stagger or feedback grammar, and hard page cuts.
**Prior**: extends the motion family in `.claude/rules/design.md` (fast/base/settle, exit curve, reduced-motion equivalents).
**Decision**: thirteen primitives (morph, stagger, count-up, relation reveal, continuous state, expand, progress, press, hover, check draw, selection indicator, success and failure, direction), each with one `app/styles/motion-*.css` part. No new durations or easings; three named values: `--motion-stagger` 35ms, `--motion-refuse-travel` 3px, `--route-enter-translate` 6px. Every use names what it explains. Owner: pages rise 6px on `--motion-base` and only fade under reduced motion; every list staggers on first arrival, once per session per vault and list, capped at 3 steps (105ms).
**Dissent**: bespoke motion per surface; stagger only ranked lists and new arrivals, since an unranked list's order explains nothing.
**Falsifier**: a needed motion no primitive expresses without a new token; a recording where motion is read before its data; a per-window performance miss attributable to a primitive.
**Owner**: Stark
