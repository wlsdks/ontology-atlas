---
id: 6a67ace2-8351-4a02-8e66-24eb4c6a50ad
date: 2026-09-27
kind: mistake
status: reported
harness_area: gates
---
**Observed**: PR #2019's first commit (940e0164b) widened the control-adoption ratchet so that a same-file helper calling `controlClass` counted as adoption. It matched helper names against the whole opening tag (`tests/contract/control-adoption-ratchet.contract.test.ts`, `valueLayerHelpers`). My probes planted only the refactor the change was meant to allow (a GlobalSearch `filterChipClass()` helper, green) and one hand-written chip (red). Independent review then planted six laundering cases, and each counted 0 where base counted 1 or 3:
- a helper that discards the call;
- a helper with a hand-written branch;
- a mixed `TONE` map;
- a wrapped local `const className = cn(controlClass(…))`, which exempted every button in its file;
- helpers named `label` and `active`, matched through `aria-label` and `data-active`.
**Cost**: one review round and a second commit (d3e255ed1), about an hour of rework; no CI rounds.
**Suspected cause**: `/gate-probe` step 2 was applied to the defect the gate already caught, not to what the widened exemption newly lets through.
**Proposed change**: skill. Add one line to `/gate-probe` step 2: when a change widens what a gate exempts, plant cases that exploit the new exemption (mixed branches, discarded calls, name collisions with attribute words, shadowed names) and require them RED.
