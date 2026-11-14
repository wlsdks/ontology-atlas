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
its latest report and the Run now, Edit, Pause/Resume, and Remove actions (removal requires
an inline confirmation);
older runs expand on demand. Document results retain checked counts, stale pages,
updated files, and tool receipts when recorded. An empty lane presents one first
schedule action. A lane with schedules is one list panel whose column header uses the row's own grid, with the
three facts after it. While a lane has no schedule, or the screen cannot hold one yet, the page is
one stage centred in the window: an artwork of an example schedule (its name marked "e.g. …", with
the default cadence) over a time line whose runs each leave a result, a title, one sentence for the
state and the one action. Saving the first schedule fades the stage into the list while the new row
rises. The new-schedule button keeps its place in the header bar. The header bar starts at the page
gutter like every destination's; the body wears the 960px column centred at every width, as Agents does.
Without a folder, the installed app opens a folder in place.
The browser explains the installed-app requirement. Cancelling a new schedule returns keyboard
focus to the header action in both lanes, including after an unfocused native pointer click.

Edit opens the schedule's own sheet on the schedule as it stands, with its name, cadence and
scope editable. Saving keeps its id and its run history and recomputes its next run. When the
edit lets the schedule do more than this Mac allowed (run more often or on more days, read or
write somewhere new, or rewrite a stale page instead of marking it), the press reads "Allow and
save" above a line saying so, and saving allows the new version on this Mac. The allowance
moves to the new version as the save starts, so the old version cannot start a run while the
file is written, and it moves back if the save fails. A pass checks the allowance again just
before its agent turn, and does not start the turn for a version this Mac no longer allows.

A missing schedule file is a valid empty collection and offers the first schedule action.
Unreadable or malformed files remain protected from overwrite; when Atlas cannot read
`.ontology-atlas/rounds.json`, as after the folder moved, the screen names that file and asks
to check the folder is where Atlas opened it, instead of asking for the file to be fixed.
Switching lanes temporarily disables the previous lane's create action until navigation
commits. A link that names a schedule (`?round=<id>`) opens that schedule's row.

A document schedule is a rule the Library keeps on its own while Atlas is open on this Mac:
what to check, how often, and what it may write. **Pages still match their sources** hashes
every cited source and runs the page check with no agent turn; when a page went stale it either
marks it or spends one agent turn redrafting only the stale sources, and the new page waits as
a draft. **Documents from a service** is one agent turn per pass through one attached connector:
re-read what the service sent, bring in what is new (capped), and redraft the pages that
changed. Registration is one sheet whose primary press reads **Allow and save** above the exact
scope granted and the daily agent-turn bill in words; during a pass that standing scope answers
every permission request and refuses anything outside `sources/` and draft `wiki/` pages,
naming the refusal in the run. Schedules live in `.ontology-atlas/rounds.json` and their runs
in `.ontology-atlas/rounds-ledger.jsonl`. Decision:
`docs/records/decisions/2026-09-17-library-rounds-standing-scope-*.md`.

The Documents lane owns its run history. Once a document pass has run, a **Run history**
section stands below the schedule list: the ledger of passes on a time axis, newest first,
with columns for time, schedule and result. A held pass is one quiet line; a pass that found a
stale page, wrote, refused or failed is a card naming its pages, each a press into Wiki; a pass
in flight stands at the top while it runs. Sleep gaps stay out until the person ticks the
checkbox that counts them, which appears only when a gap was recorded. Before any document
pass has run, or with only sleep gaps recorded, nothing is drawn: the schedule list already
says nothing has run. A `?round=<id>` link narrows the history to that schedule, named beside
the heading, until the person opens or closes a row. The retired Library address
`/library/?tab=rounds` replaces itself with `/automations/?kind=documents`, keeping `round`.
Decision: `docs/records/decisions/2026-11-14-automations-own-run-records-*.md`.

A failed run states what stopped it and what to do next,
and a run that found no agent links to Agents. A run whose result or next time could not be
written still moves the schedule on, and its row says which file refused the write.

Times follow this Mac's wall clock: a run falls on the first minute the clock reads the
cadence's grid, and a next run computed in another time zone moves to this one's grid and is
saved there. When the clocks go forward, a time the clock skips runs at the first minute after
the jump, so a 24-hour schedule still runs on the day whose midnight does not exist. When they
go back, a time the clock shows twice runs both times, so an hourly schedule runs at both
01:00s. A missed run catches up once, never before the folder has been read. Resuming a
schedule whose time passed while it was paused runs it at the next boundary, not as a
catch-up. A round paused or removed while it waited behind another pass does not run.

Ontology schedules stay read-only: they may inspect evidence and propose changes,
never write concepts, relations, files, or meaning receipts. An Atlas write the agent asks
for during a pass is refused at once and named in the run's tool activity. Document rounds
keep their previously approved Library scope, and a page they write lands only as a draft,
judged as the agent's edit tool applies the write and against the page as the pass's earlier
writes left it, under whatever letter case or Unicode form the path is spelled in. A write to a
spelling that differs from an existing page only in case or Unicode form is refused, and so is
a page whose frontmatter writes a key twice. A pass knows the pages under `wiki/` from the files
on disk when it starts, not from the folder's last scan. It never writes over a file that
carries `kind:`, wherever it is filed, and never writes through a symbolic link or into a folder
it did not find as a real folder when it started. After the agent's turn, Atlas reads back every
page the pass wrote. A page that no longer holds what the pass's own write left changed after
the pass wrote it: Atlas leaves it as it is and says so, and if the page no longer reads as a
draft, the run fails and names it. A page that still holds the pass's own text but does not
read `status: draft`, repeats a frontmatter key, or carries `describes:` or `kind:` is put back
as the pass found it, or removed if the pass created it. Atlas first saves the text it takes out
under `.ontology-atlas/undone/`, and names that copy in the run, which is marked failed with a
sentence naming the page and the reason.
Both execute locally while the app has the folder open; this redesign does not add a background
service.

A schedule runs, by the clock or by Run now, only when the folder has it on and this Mac
allowed it exactly as it now reads: its kind, cadence, places, focus or query, what it
does to a stale page, and its cap. `rounds.json` travels with the folder, so a clone can
arrive with a round switched on; such a round, or one the folder changed since, shows
"Not on this Mac", its whole definition in words, and one press that allows it. Saving,
editing or resuming a schedule here allows it, pausing keeps the allowance, and removing
forgets it.
