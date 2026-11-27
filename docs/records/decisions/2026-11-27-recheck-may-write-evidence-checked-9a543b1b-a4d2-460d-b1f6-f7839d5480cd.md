---
id: 9a543b1b-a4d2-460d-b1f6-f7839d5480cd
date: 2026-11-27
---
## 2026-11-27 — After a recheck's read-only turn, Atlas itself may write evidence_checked

**Why**: A concept whose cited code moved stays stale until someone edits its document, even when nothing it says changed (59 of 94 on this vault). The owner asked for a scheduled reread that records the ones still accurate, which "never writes ontology files" forbids.
**Prior**: Narrows 2026-09-20 automations-hub-schedules (fd3d1a37) and 2026-09-17 library-rounds-standing-scope (0e82da66); both stand for the Ontology check and every Documents schedule. 2026-09-29 round-refuses-atlas-write-drafts-only (5e2f4838) stands whole: the agent's turn refuses every Atlas write.
**Decision**: Slice 1 of `docs/specs/2026-11-27-stale-concept-recheck.md`. After a recheck's read-only turn, Atlas, never the agent, may add one `evidence_checked: <start HEAD>` line to each concept the run took and the agent called still accurate, only when the document differs by that line alone and HEAD has not moved, and commits just those documents on the checked-out branch, never the remote's default branch, never pushing. `patch_concept` and `add_concepts` refuse the key. Sentence edits (slice 2) are not decided.
**Dissent**: Review before a write is stronger than after; "still accurate" is a model's unchecked claim, a false current is worse than a false stale, and text in a diff can steer a run (spec review).
**Falsifier**: A recheck commit holding a file not stale at its start or any change besides that line; or, within 30 days of the first run here, the owner or another model re-reads 20 concepts marked accurate and finds 2 or more outdated.
**Owner**: jinan
