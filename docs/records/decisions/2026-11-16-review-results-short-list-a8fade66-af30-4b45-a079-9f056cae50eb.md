---
id: a8fade66-af30-4b45-a079-9f056cae50eb
date: 2026-11-16
---
## 2026-11-16 — The review results tab is a short list of findings to check

**Why**: After a real review in the installed app the owner said the review results tab was dizzying and that they could not tell why it was needed. Its first screen mixed the findings with a dozen pieces of record keeping: status facts, a map checkbox, an earlier-questions disclosure, one disclosure per evidence document, the original answer and request JSON.
**Prior**: Refines 2026-09-05 "Meaning review keeps diagnostic analyses with their evidence and history" (`docs/DECISIONS.md`) and `decisions/2026-11-16-map-dock-two-sections-6a63e0bd-60dd-47e0-9bd2-b2c4cf601ab7.md`: evidence and history stay, one press further away.
**Decision**: The first screen holds what a person acts on: the count of findings to check, the review request, one line saying these are the AI's guesses, and a two-line row per finding. Pressing a row selects its target on the map and replaces the list with that finding: full text, "Have it fixed" (one request to the agent; each write still waits for permission and is not recorded as a new review), "Keep for later" and "Dismiss" in one press with an optional reason, and its source documents as plain rows. The map marks findings while the tab shows a run whose basis is current; the checkbox is gone. Status facts, the original answer, the evidence as read, request details, export and the meaning-judgement archive move behind "Record details", a centre dialog.
**Dissent**: The evidence as it was read no longer sits beside the finding, so a reader sees the current document first; a judgement without a typed reason leaves a thinner record; the map overlay cannot be switched off while the tab is open.
**Falsifier**: Readers judge findings without opening the target or a source document; dismissed findings need reasons to be understood later; or readers ask how to hide the marks on the map.
**Owner**: stark
