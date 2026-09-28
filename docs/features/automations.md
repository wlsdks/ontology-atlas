---
title: Automations
doc_type: feature
status: current
area: automations
routes: [/automations]
---

# Automations

### `/automations` — Schedules and their results

The installed app keeps Ontology and Documents in separate tabs. Each schedule row
shows its state, cadence, next due time, and latest result. Opening a row reveals
its latest report and the Run now, Pause/Resume, and Remove actions (removal requires
an inline confirmation);
older runs expand on demand. Document results retain checked counts, stale pages,
updated files, and tool receipts when recorded. An empty lane presents one first
schedule action. Without a folder, the installed app opens a folder in place.
The browser explains the installed-app requirement.

A missing schedule file is a valid empty collection and offers the first schedule action.
Unreadable or malformed files remain protected from overwrite. Switching lanes temporarily
disables the previous lane's create action until navigation commits.

Ontology schedules stay read-only: they may inspect evidence and propose changes,
never write concepts, relations, files, or meaning receipts. Document rounds keep
their previously approved Library scope. Both execute locally while the app has
the folder open; this redesign does not add a background service.

A schedule runs, by the clock or by Run now, only when the folder has it on and this Mac
allowed it exactly as it now reads: its kind, cadence, places, focus or query, what it
does to a stale page, and its cap. `rounds.json` travels with the folder, so a clone can
arrive with a round switched on; such a round, or one the folder changed since, shows
"Not on this Mac", its whole definition in words, and one press that allows it. Saving or
resuming a schedule here allows it, pausing keeps the allowance, and removing forgets it.
