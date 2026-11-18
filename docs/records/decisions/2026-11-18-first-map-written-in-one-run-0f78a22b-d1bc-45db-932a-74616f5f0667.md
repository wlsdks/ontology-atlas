---
id: 0f78a22b-d1bc-45db-932a-74616f5f0667
date: 2026-11-18
---
## 2026-11-18 — A first map is written in one run: the agent says the outline, then writes it without waiting for a yes

**Why**: The owner, 2026-11-18: "the proposal-approval procedure can go; a person looking at every step no longer makes sense." In trial 2 (three headless builds through the app's door) the agent proposed, waited for a scripted "yes", and mapped 15 to 24% of each product; about 20 relation `why` notes read "You approved…", consent from a script.
**Prior**: 2026-09-21 `a97078a0` is overturned in its "propose, then wait" step only; its card, guide topics and write-point findings stand. 2026-08-21 (92) and 2026-11-16 `15443720` stand: each write still meets the permission card unless the person turned on Auto-approve. 2026-08-09 lifecycle stands for the bulk writePlan route, which stays in code, but no agent-facing text names it.
**Decision**: The door prompt, session handoff, construction card, guides and bootstrap skill tell the agent to survey, outline every unit, read one main flow, say the outline in a few sentences and write everything in the same run, then validate, connect and finalize. It asks only a question whose answer changes which nodes exist, names its default, continues with it and records the choice under `## Uncertainty` as its own. Titles use the words a teammate says aloud. The initialize instructions shrink from 40,974 to about 4,700 characters; `connection_info` drops the `lifecycle` guide topic; the bootstrap skill loses its "the user has not approved" stop condition.
**Dissent**: review before a write is stronger than review after it; an agent that misreads the product now writes thirty wrong nodes before anyone looks, a person who never reads the outline or the diff never notices, and an injected document can steer a whole build in one run.
**Falsifier**: in the next three replays coverage stays under 40% or a relation `why` still records consent; a person finds a node they cannot trace to the outline the agent stated; or an agent stops a build to wait for a reply the prompt no longer asks for.
**Owner**: Stark
