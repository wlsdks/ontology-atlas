---
id: adcb5cba-f2cc-4d8f-b451-d34b09be578d
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: performance
---
**Observed**: After compiler dictionary regression coverage was added, the zero-result read hint still treated constructor, toString and hasOwnProperty as existing domains in an empty census. A focused helper regression failed because an inherited Object.prototype value was truthy. The query read handler also accumulated counts into ordinary prototype-bearing objects. Explicit own-key checks and prototype-free internal counters corrected this without changing normal hint results in 500 comparisons.
**Cost**: One deliberate failing regression and targeted census probes; separate engineering time unmeasured.
**Suspected cause**: Auditing dictionary writers alone missed a consumer that used truthiness as an existence check.
**Proposed change**: none; include absent-key consumers in literal-key regression cases, not only serialization and count builders. Test genuinely absent and genuinely present prototype-named keys separately.
