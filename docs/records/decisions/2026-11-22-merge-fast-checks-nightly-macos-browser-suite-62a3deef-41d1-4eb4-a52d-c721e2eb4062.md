---
id: 62a3deef-41d1-4eb4-a52d-c721e2eb4062
date: 2026-11-22
---
## 2026-11-22 — Merging needs the fast checks; the browser suite runs nightly on macOS and gates stable releases

**Why**: owner, 2026-11-22. 15 of 60 Checks runs and 10 of 60 browser runs red, 14 reruns, 10 of 55 trains red; a label overlap failed only on Linux fonts, which the app does not ship on.
**Prior**: overturns d3420920 (train specs plus smoke set, whole suite per push) and the pull-request half of df55e37f; replaces 31ac0de3's Linux shards and `Playwright (chromium k/3)` names; narrows "One pull request is one CI run" to Checks. Keeps fcd74815, 4fc75f5b, 77b860b5, 9f2c7994, (96) and "A gate may check the product, never the clock".
**Decision**: `main` requires one context, `Required checks`, which needs `success` from the plan and every Checks lane. `e2e.yml` runs on schedule and dispatch only, never cancelled, on three `macos-15` shards plus a surfaces job; a stable release needs a green whole run on its commit. `pr:land` names a red or stale nightly and still merges. `tests/quarantine.json` holds at most 10 files for 14 days; expiry fails the nightly, and leaving needs 65 of 65 `prove` repeats.
**Dissent**: a screen defect is found up to a day late; Linux and Windows fonts go unmeasured; a quarantined file parks its healthy tests too; five macOS jobs make a release and the nightly queue each other; a scoped subset at merge would catch some of this sooner.
**Falsifier**: the nightly red three nights running with no fix and no entry; a stable release over a red or absent browser run; a merge-smoke defect reaching a stable release; the macOS run over 25 minutes or delaying a release build over 10; a Linux or Windows layout defect a run there would have caught; the registry full for two weeks; more than 3 of 30 merges red then green on rerun.
**Owner**: Stark
