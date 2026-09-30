---
id: 38f5f67c-f068-47c7-a6f9-b2aa9fd63521
date: 2026-09-29
---
## 2026-09-29 — Press travels on the translate property
**Why**: Tailwind v4 compiles `translate-*` to the `translate` property. Button listed `transform` in its transition, so its 1px press was a hard cut (normalised MFS 2.06, 0 intermediate frames), its `motion-reduce:transform-none` guard left the 1px travel in place, and chips, icons, rows and segments had no press at all.
**Prior**: `docs/records/decisions/2026-09-29-motion-is-a-primitive-set-84007fc7-26fb-4a2b-88ff-05303fca6acd.md` (D6, D7).
**Decision**: `CONTROL_TRANSITION` transitions colour, background, border, shadow and `translate`. Detached shapes, Button, ChromeTile, ChromeChip and the Select trigger add `CONTROL_PRESS_TRAVEL` (1px) plus one surface step; flush shapes press with one surface or ink step and no travel; `onAccent` presses with `--shadow-control-press`. Reduced motion uses `motion-reduce:active:translate-none`, because an unqualified `translate-none` loses to `.x:active` on specificity. The select chevron rotates through `transform`. Presence is a contract; hoverless calls, registered positions without press and transform-property mismatches are `judgeRatchet` ratchets.
**Dissent**: A 1px travel on every chip may read as noise in dense rails; the surface step alone would carry the press.
**Falsifier**: `tests/e2e/motion-press.spec.ts` shows a detached control with MFS above 0.35, or any `translate` other than `none` under reduced motion.
**Owner**: design system (P-PRESS).
