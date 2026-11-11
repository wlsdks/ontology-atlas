---
id: 1b0b79d3-5bba-4111-aff1-3b16a98abb1d
date: 2026-11-12
---
## 2026-11-12 — A control's height picks its type

**Why**: owner, 2026-11-11 (in Korean): sizes are not unified the way a design system unifies them, and the best combination of sizes matters. A rendered census of 15 routes on a 375-concept vault found three type sizes at 32px: 11px on 14 buttons, 2 fields and 4 segments, 12.5px on 12 segments and 8 buttons, 14px on 4 fields; `Button sm` set 14px at 32px in 124 places.
**Prior**: keeps the height ladder of 2026-08-03 (`docs/DECISIONS.md`, "the ladder decides control height") and extends 2026-08-16 (10), which raised Select text to `text-body`. Overturns the field rule that `md` (32px) sets 14px so a typed value outranks its label: that evidence came from /project/new, which uses `lg` (40px, 14px) fields and keeps them.
**Decision**: one rule for every single-line control: `label` at 24px, `body` from 28 to 36, `body-lg` at 40 and 44. The value layer, `Button` and `Select` carry the pair; chip `xs` joins the 24px step; a 32px segment well holds 28px segments. A call site names a type step only beside a height it sets by hand. Weighed against a form tier (14px) beside a workbench tier (12.5px) at the same height, which keeps two sizes on one row wherever a field meets a chip.
**Dissent**: 12.5px in a 32px field is smaller than the 14px a person typed before; dense forms that stay on `md` read tighter. Chrome labels stay `text-label` at 36px and `TabBar` labels `body` at 40px, so the rule has two named gaps.
**Falsifier**: at 32px a typed value reads no stronger than its 11px label in a form the owner uses; a control at one height renders two type sizes outside the named gaps; or a label that fit at 11px clips or wraps at 12.5px at the 1040px minimum.
**Owner**: Stark
