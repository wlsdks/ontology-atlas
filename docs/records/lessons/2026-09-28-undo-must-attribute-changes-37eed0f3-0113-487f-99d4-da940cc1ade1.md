---
id: 37eed0f3-0113-487f-99d4-da940cc1ade1
date: 2026-09-28
kind: mistake
status: reported
harness_area: rounds
---
**Observed**: on #2155 round three I added a read-back that restored any page a pass wrote to its pass-start text whenever the page failed the draft test (`settlePassPages` in `src/features/library-rounds/model/pass-pages.ts`). It compared the page only with the pass-start text, so the third review's probes showed a person's review made during the pass restored away (P1) and a page the pass created deleted after a person reviewed it (P2), 3 of 3 runs each. The same round built the pass-start list from the folder's last scan, so a node filed under `wiki/` counted as new (P3). This extends 988e00e3: the read-back it asked for needed to know whose text it was reading.
**Cost**: one review round on #2155 (fix first, two items); time unknown.
**Suspected cause**: I designed the undo as "the pass's before-state versus now" and never asked who else writes the same files while an unattended pass runs; the pass-start list reused the manifest because it was at hand, not because it was complete.
**Proposed change**: rule — one line in `.claude/rules/architecture.md`: an automatic undo attributes each change before reverting it (undo only what its own write left, read when that write lands), never reverts without saving what it removes, and builds its before-state from the files themselves rather than an index of them.
