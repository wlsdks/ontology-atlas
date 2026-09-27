---
id: a186ebd2-a3ad-4f22-ac48-55ef2f27a7f5
date: 2026-09-27
kind: mistake
status: reported
harness_area: gates
---
**Observed**: #2050 added the census probes (assembled messages, `+` chains) to `scripts/quality/source-language/test-titles.test.mjs`, and the gate probe's wiring step checked only the contracts. No lane ran that file: `test:source:language` named `inventory.test.mjs` alone, the check rule for that folder routes only to that script, and the merge-base ratchet counts zero on both sides when the extractor goes blind. The gate review found it: deleting the `+` branch of `evaluatedText` left every lane green.
**Cost**: one review round and a fix commit; no CI round.
**Suspected cause**: `/gate-probe` step 4 asks where the gate runs, not where the probe that guards the gate runs, and a new `*.test.mjs` beside an existing test script is run only if that script names it.
**Proposed change**: skill: one line in `/gate-probe` step 4, that the probe's own test file must be named by a script or check rule that CI runs, shown by deleting the guarded branch and watching that command fail.
