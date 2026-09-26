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
