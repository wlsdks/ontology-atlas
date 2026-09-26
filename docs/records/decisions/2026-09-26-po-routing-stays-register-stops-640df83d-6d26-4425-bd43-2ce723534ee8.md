---
id: 640df83d-6d26-4425-bd43-2ce723534ee8
date: 2026-09-26
---
## 2026-09-26 — PO routing stays; the per-run pilot register stops

**Why**: owner, 2026-09-26: settle the pilot whose falsifier fired. Across 102 eligible runs boundary misses were 0, review changed the decision in 97% and reversible work avoided council in 100%, while recovery proof was resolved in 68% and owner clarity in 51%.
**Prior**: acts on 2026-09-03 "The PO routing pilot closes at its 20th decision as adjust", whose falsifier (proof resolution under 80% after ten more decisions) fired; keeps 2026-09-01 routing (`po:route`, two-reviewer default).
**Decision**: a second `adjust` policy record: keep risk routing, `/po-pass`, `/po-council` and decision fragments for significant decisions; stop requiring a run fragment and follow-up updates per eligible decision. `po:pilot` stays as a reader and CI validator of the existing register.
**Dissent**: without the register the router's avoidance and delta rates are no longer measured; accepted because the unresolved half of that register was the failure, and a real regression would surface as a boundary miss in review or a decision fragment.
**Falsifier**: a hard-to-reverse decision that ships without routing, or a boundary miss the register would have flagged.
**Owner**: Stark
