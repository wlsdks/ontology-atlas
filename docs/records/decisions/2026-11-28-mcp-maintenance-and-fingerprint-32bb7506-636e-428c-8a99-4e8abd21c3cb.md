---
id: 32bb7506-636e-428c-8a99-4e8abd21c3cb
date: 2026-11-28
---
## 2026-11-28 — A write names one next action, and a project source is fingerprinted from Git's index

**Why**: filtering the whole-vault plan made a write's answer depend on unrelated work, and rehashing every file cost time in repository size (`connect_project_source` 940 ms, `finalize_project_meaning` 1,498 ms on this repository).
**Prior**: follows `2ff2e021`, which left both items open.
**Decision**: `postWriteMaintenance` is `{ nextAction, stepsAboutTouched }`, planned only over the touched nodes (up to 500 candidates per generator). A project source is `inventory-v3`: index blob ids plus the bytes of the files `status` reports changed, or one size-and-time walk without Git; NFC names, no file-count cut. `sourceReads` keeps one hash per citation, because a pinned citation is copied whole into a body. Measured after: 490 ms and 785 ms.
**Dissent**: the app still computes `inventory-v2` and stops at 16,000 files until its probe is ported, and a folder without Git misses an edit that keeps size and time.
**Falsifier**: a write on a vault with more than 100 outranking steps names no step about its node, or a source over 16,000 files is reported truncated.
**Owner**: stark (lead decision, 2026-11-28)
