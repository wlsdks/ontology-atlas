---
id: 5e2f4838-d719-40e6-a0a3-8713d228270a
date: 2026-09-29
---
## 2026-09-29 — An unattended round refuses an Atlas write inside its turn and writes pages only as drafts

**Why**: Probed 2026-09-29: an `atlas-vault` write asked for in a round's turn waited for a card no screen draws until the pass ceiling. Reviews then found the page judge accepting non-drafts and judging stale state, other spellings of one file, and rules other than the edit tool's and other readers'; an undo that could erase a person's edit or a node the start scan missed; a changed page left unchecked; and writes that follow a link.
**Prior**: upholds and narrows 2026-09-17 `0e82da66-48d2-44f1-a923-82857d7a3710` (anything else "is rejected and named in the pass ledger"; falsifier "a write absent from the ledger"), and keeps its rule that ontology writes wait for `allow_once` in every session a person answers.
**Decision**: a session asks `autoDecide` about ontology-write requests too and honours only a rejection; a refusal names the tool. A round writes a `wiki/` page only when it leaves `status: draft`, no repeated key, no `describes:` or `kind:`, judged as the edit tool applies it against the page as the pass's earlier writes left it, by file identity, never over an alias, a `kind:` file or a link, nor into an unseen folder. After the turn Atlas undoes, with a saved copy, only what its own write left failing; a page changed since is left, and fails the run if it fails that test.
**Dissent**: letting a screen answer an ontology-write request at all widens `autoDecide`; the test that an allow note still leaves the card pending is the guard.
**Falsifier**: an Atlas write allowed without a person's `allow_once`; a round's pass waiting on an unanswered Atlas write; a round leaving a page that does not read `status: draft`; a person's edit lost to an undo; a write that lands outside the folder.
**Owner**: Stark
