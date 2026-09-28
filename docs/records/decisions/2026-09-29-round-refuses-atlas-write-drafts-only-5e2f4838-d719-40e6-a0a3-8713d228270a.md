---
id: 5e2f4838-d719-40e6-a0a3-8713d228270a
date: 2026-09-29
---
## 2026-09-29 — An unattended round refuses an Atlas write inside its turn and writes pages only as drafts

**Why**: Probed 2026-09-29: an `atlas-vault` write requested during a round's turn never reached the standing scope, because the session asked `autoDecide` only about plain permissions; it waited for a card no screen draws until the 20-minute pass ceiling and left a generic failure instead of a named refusal. The round's page judge accepted a page not marked as a draft, although the sheet approves "pages under wiki/ that fit the template, as drafts", and it judged each write against the page as it stood when the pass began (a stale-state check).
**Prior**: upholds and narrows 2026-09-17 `0e82da66-48d2-44f1-a923-82857d7a3710` (anything else "is rejected and named in the pass ledger"; falsifier "a write absent from the ledger"), and keeps its rule that ontology writes wait for `allow_once` in every session a person answers.
**Decision**: a session asks its `autoDecide` about an ontology-write request too and honours only a rejection, so an Atlas write is never auto-allowed. A round's refusal names the tool. A round may write a `wiki/` page only when the page it leaves reads `status: draft`, judged against the page as the pass's earlier allowed writes left it, with an edit applied literally and only to a unique match.
**Dissent**: letting a screen answer an ontology-write request at all widens `autoDecide`; the test that an allow note still leaves the card pending is the guard.
**Falsifier**: an Atlas write allowed without a person's `allow_once`; a round's pass waiting on an unanswered Atlas write; a round leaving a page that does not read `status: draft`.
**Owner**: Stark
