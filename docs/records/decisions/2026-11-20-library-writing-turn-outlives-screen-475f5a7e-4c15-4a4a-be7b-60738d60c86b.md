---
id: 475f5a7e-4c15-4a4a-be7b-60738d60c86b
date: 2026-11-20
---
## 2026-11-20 — A Library turn that may write outlives the screen; its request is answered from the Runs list

**Why**: Owner, 2026-11-20: background work must keep going, in view, while the person moves around. A writing Library turn ends when Library is left (`docs/specs/2026-11-20-long-work-in-background.md`, item 6).
**Prior**: 387a3c17: overturns "Not kept: the Library" and, for a Library turn, "opening the agent elsewhere ends a kept panel first" (the newcomer waits, starting no agent); for Library turns closes its dissents "nothing shows the agent working or waiting" and "a write receipt for a turn ending while away reaches no review surface". Upholds 2026-08-21 (92); 2026-09-07 (`docs/DECISIONS.md:554`; falsifier: a page landing that `wiki-validate` rejects, or no way to make the card come back); 2026-09-06 (`:725`; falsifier: a verdict for text other than what landed); 15443720; 04edab8a; 2026-08-17 (56); 5e2f4838; the 2026-08-24 notification hold.
**Decision**: two steps. A: a writing Library turn is kept by the app session; write mode and judge are read at each request; a request turns the work card into "Waiting for permission" and **Review** opens the Library conversation; Stop and a folder switch refuse later requests and end the process after 5 s. B, only after A merges and its installed-app capture exists: **Review** opens the Runs list, where the conversation's card offers **Allow once** and **Deny** only. Navigation, Hide, Escape, a hidden window and time never answer.
**Dissent**: approval leaves the screen holding the evidence; a standing choice writes while nobody looks at Library; prove the second surface before building it.
**Falsifier**: two adapters that may write run for one folder; a page lands under a standing choice after the mode moved to ask or after Stop (then writing turns end with the screen again); bytes change before **Allow once**, or the owner undoes a write allowed from the list (then **Review** stays on Library). A hidden-window wait over 5 minutes moves the notification slice up.
**Owner**: Stark
