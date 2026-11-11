---
id: 1b0b79d3-5bba-4111-aff1-3b16a98abb1d
date: 2026-11-12
---
## 2026-11-12 — A control's height picks its type

**Why**: owner, 2026-11-11 (in Korean): sizes are not unified the way a design system unifies them, and the best combination of sizes matters. A rendered census of 15 routes on a 375-concept vault found three type sizes at 32px: 11px on 14 buttons, 2 fields and 4 segments, 12.5px on 12 segments and 8 buttons, 14px on 4 fields; `Button sm` set 14px at 32px in 124 places.
**Prior**: keeps the height ladder of 2026-08-03 (`docs/DECISIONS.md`, "the ladder decides control height") and extends 2026-08-16 (10). Overturns the field rule that `md` (32px) sets 14px so a typed value outranks its label: that evidence came from /project/new, which uses `lg` (40px, 14px) fields and keeps them.
**Decision**: a control's resting height picks its type: `label` at 24px, `body` from 28 to 36, `body-lg` at 40 and 44. The value layer, `Button` and `Select` carry the pair. A multi-line field takes the step of its floor, so a composer types at the 12.5px its text is read back in. A 32px segment well holds 28px segments. A call site names a type step only beside a height it sets by hand. Weighed against a 14px form tier beside a 12.5px workbench tier at one height, which keeps two sizes wherever a field meets a chip.
**Dissent**: a 32px field and the agent composer type 12.5px where they typed 14px. Named gaps: chrome labels (`text-label` at 36px), `TabBar` labels (`body` at 40px), `link`, `icon` and `tile`, and the coarse-pointer floor, which raises a control to 44px and leaves its type.
**Falsifier**: at 32px a typed value reads no stronger than its 11px label in a form the owner uses; under a fine pointer a control at one height renders two type sizes outside the named gaps; or a label that fit at 11px clips or wraps at 12.5px at the 1040px minimum.
**Owner**: Stark
