---
id: 0121dbf8-9041-4cea-8876-17c272b6010f
date: 2026-09-13
---
## 2026-09-13 — Append independent backlog observations and limit speculative CI

**Why**: All worktrees edited one status/evidence ledger. A Git fixture reproduces conflicts for adjacent task rows; unique per-execution files merge without textual conflicts. The owner requested unique record names and conditional parallel CI.
**Prior**: Extend the 2026-09-13 independent-worktree-records decision to backlog observations. Supersede BACKLOG.md's shared-table update rule. Refine the 2026-09-12 serialized landing policy only for opt-in speculative CI; final integration and merge stay serialized.
**Decision**: Keep BACKLOG.md as a static entrypoint. Preserve its complete prior snapshot and import 34 statuses unchanged into UUID records. Every new observation names its worktree and current parent record IDs. Multiple heads require an explicit reconciliation; timestamps never choose a winner. --parallel-ci may run early only for complete, added backlog records for distinct tasks; newer main still triggers integration and current-head checks.
**Dissent**: Separate files remove text collisions, not contradictory claims or shared-code dependencies. A later main merge can invalidate speculative CI and cost another run, so this remains opt-in and does not generalize to source changes.
**Falsifier**: A published observation is overwritten, competing heads disappear without reconciliation, an imported status changes, or early CI permits an unverified merge.
**Owner**: Repository owner, requested during the 2026-09-13 worktree-record discussion.
