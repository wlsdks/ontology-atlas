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
Unreadable or malformed files remain protected from overwrite; a folder that was moved or
disconnected says so instead of asking for the file to be fixed. Switching lanes temporarily
disables the previous lane's create action until navigation commits. A link that names a
schedule (`?round=<id>`, as Library check history sends for the round it shows) opens that
schedule's row. A failed run states what stopped it and what to do next, and a review that
found no agent links to Agents.

Times follow this Mac's wall clock: a run falls on the first minute the clock reads the
cadence's grid, so a daylight-saving night neither skips nor shifts it, and a next run
computed in another time zone moves to this one's grid. A missed run catches up once, never
before the folder has been read. Resuming a schedule whose time passed while it was paused
runs it at the next boundary, not as a catch-up. A round paused or removed while it waited
behind another pass does not run.

Ontology schedules stay read-only: they may inspect evidence and propose changes,
never write concepts, relations, files, or meaning receipts. An Atlas write the agent asks
for during a pass is refused at once and named in the run's tool activity. Document rounds
keep their previously approved Library scope, and a page they write lands only as a draft.
Both execute locally while the app has the folder open; this redesign does not add a
background service.

A schedule runs, by the clock or by Run now, only when the folder has it on and this Mac
allowed it exactly as it now reads: its kind, cadence, places, focus or query, what it
does to a stale page, and its cap. `rounds.json` travels with the folder, so a clone can
arrive with a round switched on; such a round, or one the folder changed since, shows
"Not on this Mac", its whole definition in words, and one press that allows it. Saving or
resuming a schedule here allows it, pausing keeps the allowance, and removing forgets it.
