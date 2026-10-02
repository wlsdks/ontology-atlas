---
id: db6d6efa-8686-4433-891a-8ec43d9f61f5
date: 2026-10-02
---
## 2026-10-02 — Stop ends only the owned native model request

**Why**: Source inspection shows Stop suppresses late direct-model results but passes no cancellation to native HTTP, retaining the connection and vault audit reservation until completion or timeout.
**Prior**: Keeps 2026-08-01 "The fourth connection is a door" and 2026-08-02 "The local agent forces an answer after 3 rounds of evidence gathering and closes at 60 seconds": keyless opt-in transport, model policy and deadlines stand.
**Decision**: Connect existing Stop and caller retirement to only their owned native request in vault chat and local Compile. Settle the rejected send's existing audit record before replacement transmission to the same vault; preserve completed outcomes, write consent and the audit format.
**Dissent**: Source inference has no observed Stop incident yet. The shared-context independent reviewer requires installed baseline and final proof; ending Atlas's connection does not prove the model server stops inference.
**Falsifier**: Baseline Stop already closes the connection and releases its audit reservation; cancellation reaches another request; rejected work remains live; audit evidence is lost; or same-vault replacement fails solely on the canceled reservation.
**Owner**: jinan (optimization request); Codex implementation, independently reviewed
