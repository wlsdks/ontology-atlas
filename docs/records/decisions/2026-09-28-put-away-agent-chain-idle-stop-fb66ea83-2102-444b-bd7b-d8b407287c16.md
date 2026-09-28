---
id: fb66ea83-2102-444b-bd7b-d8b407287c16
date: 2026-09-28
---
## 2026-09-28 — A put-away agent conversation stops its process after ten idle minutes

**Why**: owner, 2026-09-28, delegated: the ACP chain stays resident behind a closed Library or project dock, about 292 MB by the owner's count. Measured on the chain the 1.3.0 local build launches (claude-agent-acp 0.81.2, `claude`, `ontology-atlas-mcp`): idle 426–428 MB RSS and 234–247 MB physical footprint from 30 s to 600 s; once stopped, no process remains. A cold reopen reached ready in 480–605 ms, median 518 (`initialize` + `session/load`, ten runs).
**Prior**: overturns 2026-09-08 "Closing the Library dock puts the conversation away; reopening resumes the latest" where it keeps the adapter for the Library's whole visit. Its dissent (rely on resume, spare an idle adapter) now wins; its objection is kept: a waiting card keeps the chain, and the panel stays mounted, so the draft and notices stay.
**Decision**: in the Library and project docks, when the dock is closed, no turn runs and no permission waits, the adapter tree stops after 10 minutes (`PUT_AWAY_IDLE_STOP_MS`). The next opening resumes that same session through `session/load`; if it cannot load, the existing fallback opens a new conversation and clears the stale transcript.
**Dissent**: 2026-09-08's own: a warm adapter answers without a start. The first answer after a cold resume was not measured: the app's isolated login had expired, and refreshing it outside the app could rotate the login every terminal session shares.
**Falsifier**: a reopened dock whose transcript is not the conversation the agent resumed; the chain stopped while a turn runs, a permission waits or the dock is open; a cold reopen over 3 s to ready; or an idle chain under 100 MB footprint.
**Owner**: Stark (delegated 2026-09-28; landing the pull request accepts this record)
