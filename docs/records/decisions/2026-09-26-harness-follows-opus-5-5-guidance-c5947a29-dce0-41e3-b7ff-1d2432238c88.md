---
id: c5947a29-dce0-41e3-b7ff-1d2432238c88
date: 2026-09-26
---
## 2026-09-26 — The agent harness follows the Opus 5.5 guidance, and a fan-out lands as one bundle

**Why**: owner, 2026-09-26: rebuild the harness on the official Opus 5.5 guidance, drop checks that do not earn their place, and stop landing Workflow branches one by one (nine `design/polish-*` landings took most of 2026-09-24). The guidance says explicit re-verification steps cost tokens without quality. Ledgers over three weeks: the sensor's eslint branch spoke 117 times, the language gate twice, the em-dash branches never.
**Prior**: answers the falsifiers in the removed hook headers; keeps 2026-08-22 (96) and the `pr:land` lock.
**Decision**: remove the Stop-time reminder and its stamp, the usage recorder, the drift reporter, the refusal counter, `harness:report|outcomes|smoke` and the pre-push ledger. Keep the blocking guards (now also refusing `git -C … push --force`, `push … HEAD:main` and the REST merge), the eslint and language sensor and the census. Resident instructions shrink from 25.5 KB to 18.6 KB. Two or more branches land through `/land-bundle` with `pnpm bundle:plan|prune`: one branch, one draft, one CI run.
**Dissent**: the reminder did catch unverified stops; removed because `checks:changed`, pre-push and `pr:land` already run the lanes, so it was a fourth pass.
**Falsifier**: a landing that fails CI on something a skipped `checks:changed` would catch; `bundle:prune` deleting a branch whose content main lacks; the next fan-out landing branch by branch.
**Owner**: Stark
