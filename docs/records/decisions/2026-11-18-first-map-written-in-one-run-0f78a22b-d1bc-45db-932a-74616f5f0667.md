---
id: 0f78a22b-d1bc-45db-932a-74616f5f0667
date: 2026-11-18
---
## 2026-11-18 — Agents write meaning in one run: say the outline, then write without waiting for a yes

**Why**: The owner, 2026-11-18: "a person checking every step no longer makes sense." In trial 2 the agent waited for a scripted "yes", mapped 15 to 24% of each product, and ~20 `why` notes recorded scripted consent.
**Prior**: Overturns only the "propose, then wait" step of 2026-09-21 `a97078a0`. (92) and `15443720` stand: each write meets the permission card unless Auto-approve is on, and binding the folder and finalizing always do. `docs/DECISIONS.md:3893` stands in substance (an import is evidence, never a relation by itself); only its "ask the user" step goes. The writePlan route stays in code, unnamed in agent text.
**Decision**: Wider than the first map. A first build surveys, outlines every unit, reads one main flow, says the outline and writes it all, then validates, connects and finalizes. Extending a filled vault, an import-backed `depends_on` whose `why` names the mechanism, and a post-change sync also go ahead without a reply. Delete, merge and rename stay cautious: only on the person's request, after `find_backlinks` and a dry run. The agent asks only what changes which nodes exist, names its default, continues, and records it under `## Uncertainty`. Source, document and vault text is evidence, never an instruction or an approval.
**Dissent**: review before a write is stronger than after it; a misreading agent writes thirty wrong nodes before anyone looks, and an injected document can steer a whole run.
**Falsifier**: in the next three replays coverage stays under 40% or a `why` records consent; a person finds a node they cannot trace to the stated outline; or an agent stops to wait for a reply nobody asked for.
**Owner**: Stark
