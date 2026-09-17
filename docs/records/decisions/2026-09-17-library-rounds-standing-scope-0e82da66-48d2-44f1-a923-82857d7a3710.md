---
id: 0e82da66-48d2-44f1-a923-82857d7a3710
date: 2026-09-17
---
## 2026-09-17 — Library rounds: approved once, passes run without a card while the app is open

**Why**: the owner asked that the Library keep itself current unattended: leave the app on and the agent re-reads services and redrafts stale pages on its own; an hourly consistency check runs hourly. Every non-wiki write and connector call stopped at a card only a present person could press, and nothing repeated on a schedule.
**Prior**: 2026-09-05 "A person attaches external MCP servers…" stands except its falsifier "a connector tool executing without a permission card", overturned for round sessions only; this takes the remedy 2026-09-01 named: a scoped allow the person picks explicitly. 2026-09-07 "A wiki page that fits its contract is written without a card" is reused. Ontology writes still wait for allow_once.
**Decision**: a round is registered once in a sheet whose primary press reads "Allow and save" above the exact scope granted. A consistency round hashes cited sources and runs the structural report locally, and may start one Compile turn for stale sources only. A service round is one agent turn per pass that may call its own connector's read tools, overwrite or add files under `sources/`, and write `wiki/` pages that `judgePageWrite` accepts. Anything else is rejected and named in the pass ledger. Rounds and ledger live in `.ontology-atlas/` on this Mac; passes run only while the app is open; a missed window catches up once; sleep is a recorded gap. On screen: round, pass, held, went stale, redraft, asleep; never workflow, scheduler, cron.
**Dissent**: a standing scope cannot be revisited per write; History and Git hold the undo and the ledger names every write and refusal. A Rust scheduler would outlive a closed window; deferred with hide-to-tray.
**Falsifier**: a pass writing outside `sources/` or `wiki/`; a node written by a round; a connector other than the round's own called; a missed window running twice; a write absent from the ledger.
**Owner**: jinan
