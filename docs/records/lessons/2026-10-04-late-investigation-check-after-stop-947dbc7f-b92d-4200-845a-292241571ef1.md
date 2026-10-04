---
id: 947dbc7f-b92d-4200-845a-292241571ef1
date: 2026-10-04
kind: mistake
status: reported
harness_area: acp
---
**Observed**: A newly guarded investigation captured activeTurnRef before awaiting source revalidation. After Stop cleared that ref, the late check used the old local object to finish and changed idle back to ready. The real hook regression failed with ready instead of idle; checking the current activeTurnRef identity before finishing fixed it.

**Cost**: One focused failing run; aggregate time and tokens unknown.

**Suspected cause**: A snapshot of mutable lifecycle state was treated as current authority after a new await.

**Proposed change**: none — after every external await, compare the live generation, session, client and turn identity before updating status or prompting. Keep the late-check-after-Stop regression and the actual prompt-RPC count assertion.
