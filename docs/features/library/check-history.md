---
title: Library check history
doc_type: feature
status: current
area: library
routes: [/library]
---

# Library check history

### Library — Check history: the Library keeps itself current while nobody is looking (2026-09-17)

A fifth Library tab, **Check history**, in the installed app. Automations owns the
round's creation, pause, run-now, and removal controls; Library shows its pass history
and links to the same document schedule in Automations. A round is a rule the Library
keeps on its own while Ontology Atlas is open on this Mac: what to check, how often,
and what it may write. Two kinds ship. **Pages still match their sources** hashes every
cited source on this Mac and runs the page check with no agent turn, hourly, every six
hours, daily or on weekdays at a time; when a page went stale it either marks the row or
spends one agent turn redrafting only the stale sources, and the new page waits as a
draft. **Documents from a service** is one agent turn per pass through one attached
connector: re-read what the service sent, bring in what is new (capped), and redraft the
pages that changed. Registration is one sheet whose primary press reads **Allow and
save** above the exact scope granted, with the daily agent-turn bill in words; during a
pass the standing scope answers every permission request itself and refuses anything
outside `sources/` and `wiki/` pages that fit the template, naming the refusal in the
ledger. The stage opens on **Since you left**: the span the window was away, the pages
that went stale, the redrafts waiting, the refusals, and the passes that held, each page
a press into Wiki. Below it the **ledger** draws passes on a time axis, newest first: a
held pass is one quiet line, a change is a card, and a sleep gap is a hatched band with
its span, because a missed window runs once when the Mac wakes and never replays. Rounds
and their ledger live in `.ontology-atlas/` on this Mac and are not shared through Git.
The web build explains and points at the app. Decision:
`docs/records/decisions/2026-09-17-library-rounds-standing-scope-*.md`.
