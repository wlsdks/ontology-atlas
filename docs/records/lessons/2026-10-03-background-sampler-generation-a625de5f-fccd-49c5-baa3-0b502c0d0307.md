---
id: a625de5f-fccd-49c5-baa3-0b502c0d0307
date: 2026-10-03
kind: mistake
status: reported
harness_area: motion-proof
---
**Observed**: A multi-phase background motion sampler reused a shared running flag. A queued callback from the preceding phase resumed when the next phase re-enabled it, inserting repeated rAF timestamps into the new array. The raw phase JSON reported median gap 0 and apparent rates over 120 fps while an isolated 90-frame calibration delivered about 60 fps.
**Cost**: One complete 17-phase recording required new measurement; elapsed cost unknown. The raw movie remains real footage but the affected property traces are rejected.
**Suspected cause**: Cancellation by a boolean did not distinguish callback generations; callbacks retained the earlier selector but wrote into the new shared sample array.
**Proposed change**: none. Give every diagnostic phase a generation token, reject callbacks from an older phase before sampling, and verify strictly increasing rAF timestamps before deriving cadence. Capture ceilings, encoded source cadence, and unique app frame cadence remain separate values.
