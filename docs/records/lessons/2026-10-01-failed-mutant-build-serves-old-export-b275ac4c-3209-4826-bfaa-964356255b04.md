---
id: b275ac4c-3209-4826-bfaa-964356255b04
date: 2026-10-01
kind: mistake
status: reported
harness_area: e2e
---
**Observed**: proving #2222's click case fails with the old colour-focus gating put back, the mutant `pnpm build` stopped on a type error and left the previous export in `out/`; the static server on port 4050 kept serving it and the case passed, which read as "the check does not catch the defect" until the build's exit code was checked.
**Cost**: one extra build and run, about 5 minutes; a wrong verdict on the check was one step away.
**Suspected cause**: put-back runs chain `pnpm build` and the spec by hand, the spec does not wait on the build's exit status, and the static server serves whatever `out/` holds.
**Proposed change**: rule: in the testing rule's put-back step, run the spec only after the mutant build exits 0 and the served bundle contains the planted change (for example a grep in `out/` for a string the mutant adds).
