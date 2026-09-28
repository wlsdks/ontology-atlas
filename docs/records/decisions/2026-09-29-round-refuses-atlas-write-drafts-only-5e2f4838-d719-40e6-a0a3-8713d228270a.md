---
id: 5e2f4838-d719-40e6-a0a3-8713d228270a
date: 2026-09-29
---
## 2026-09-29 — An unattended round refuses an Atlas write inside its turn and writes pages only as drafts

**Why**: Probed 2026-09-29: an `atlas-vault` write asked for in a round's turn never reached the standing scope, so it waited for a card no screen draws until the pass ceiling. The page judge accepted a page not marked as a draft, and review found it judging writes against stale page state, against another spelling of the same file, and by rules other than the edit tool's and other frontmatter readers'.
**Prior**: upholds and narrows 2026-09-17 `0e82da66-48d2-44f1-a923-82857d7a3710` (anything else "is rejected and named in the pass ledger"; falsifier "a write absent from the ledger"), and keeps its rule that ontology writes wait for `allow_once` in every session a person answers.
**Decision**: a session asks its `autoDecide` about an ontology-write request too and honours only a rejection; a round's refusal names the tool. A round writes a `wiki/` page only when the page it leaves reads `status: draft`, writes no key twice and has no `describes:` or `kind:`, judged as the edit tool applies the write, against the page as the pass's earlier writes left it, by file identity; a spelling aliasing a known page is refused. After the turn Atlas reads back each page written and puts back or removes any that fails, and the run fails naming it.
**Dissent**: letting a screen answer an ontology-write request at all widens `autoDecide`; the test that an allow note still leaves the card pending is the guard.
**Falsifier**: an Atlas write allowed without a person's `allow_once`; a round's pass waiting on an unanswered Atlas write; a round leaving a page that does not read `status: draft`.
**Owner**: Stark
