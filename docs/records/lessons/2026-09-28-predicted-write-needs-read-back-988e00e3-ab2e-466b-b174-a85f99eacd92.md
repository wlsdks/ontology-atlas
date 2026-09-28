---
id: 988e00e3-ab2e-466b-b174-a85f99eacd92
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: rounds
---
**Observed**: on #2155 round two, the round write gate approved each wiki write by predicting the page it would leave (`judgePageWrite` in `src/features/library/lib/judge-page-write.ts`), and its tests exercised only that prediction. The second review then found three ways the landed page differed from the predicted one while every write was allowed: another spelling of the same file on the default macOS volume, an edit rule of the agent's edit tool that the judge did not model, and a frontmatter key written twice that readers resolve differently. Its probes ended with the page reading `status: reviewed` in 3 of 3 runs. Round three added a read-back of every page a pass wrote, with a restore when the page fails the draft test.
**Cost**: one review round on #2155 (fix first, six items); time unknown.
**Suspected cause**: a gate that predicts another program's output is only as complete as its model of that program and the file system beneath it, and nothing measured the falsifier on disk.
**Proposed change**: rule — one line in `.claude/rules/architecture.md`: an unattended write gate that approves a predicted result also reads back the landed file and restores it when the prediction was wrong, and its tests plant a wrong landed state instead of testing only the predictor.
