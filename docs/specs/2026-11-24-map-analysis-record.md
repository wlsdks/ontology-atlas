---
title: The map shows its analysis record and what changed since
doc_type: spec
status: draft
area: map
date: 2026-11-24
decisions: [4f94c421]
---

# The map shows its analysis record and what changed since

Written on 2026-11-24 from the owner's request of the same day and a reading of the code that day.
It builds on `docs/specs/2026-11-23-one-press-maps-the-rest.md` (decision `a24bde01`) and on the
measure of decision `f7ea68cd`; neither changes in slice 1. No capture of this moment exists;
criterion 1 makes one.

## Person and moment

A developer who already runs coding agents built a map of a repository some days ago, by the app's
**Map the rest of the code** or by an agent in a terminal. Since then he and his agents merged
changes. He opens the map. The owner, 2026-11-24 (translated): "One analysis will not be enough.
We need a record, inside Atlas, of the project analysis and how much was analyzed. It must be shown
to the user, at the top of the map tab or somewhere, so they can see how many days since the last
analysis, analyze again, or register it in automation. This is a service that disappoints if it is
not continuously updated, so it must be visible. Can't we mark what we analyzed, recorded
internally? Then analyze newly added code and parts not analyzed, show it to the user, notify them
to analyze more. Show the analysis rate, which round of analysis we are on, something like
completeness."

What he does next today: nothing, or he opens the agent panel to look for a number.

## Today

- **The share of code on the map is one line in the project note**, `Not mapped yet: N of M areas,
  R of T abilities.` (`mcp/src/construction/build-depth/unmapped-areas.mjs:22`), read by the server
  (`unmapped-areas.mjs:46`) and by the app (`src/shared/lib/vault-document/not-mapped-areas.ts:31`)
  as the same counts (`tests/fixtures/not-mapped-line-cases.mjs`). The agent keeps the line; the
  server gives it and refuses `finalize_project_meaning` when it differs (decision `f7ea68cd`).
- **The line carries no date, commit or history, and leaves when everything is mapped**
  (`unmapped-areas.mjs:69`), so the app cannot tell "all on the map" from "never counted".
- **The map itself shows the share nowhere.** It is drawn in the row above the map conversation's
  composer, on the work card and as the rail ring during a run
  (`docs/specs/2026-11-23-one-press-maps-the-rest.md:53`, `messages/en/workCard.json:112`). The
  map's corner readout counts concepts
  (`src/views/home/ui/map-readouts/TopologyScopeReadout.tsx:7`).
- **A run leaves nothing behind**: "Nothing is persisted"
  (`docs/specs/2026-11-23-one-press-maps-the-rest.md:65`). History groups a run's requests as one
  row with their count (`:93`) and does not say what the run changed; whether that row survives a
  quit was not read. The field trial keeps one line per request in its own folder
  (`.claude/skills/ontology-field-trial/scripts/map-rest-ledger.mjs:2`); the product keeps none.
- **Whether a concept's code changed after it was written is known per concept, from Git, in the
  app only** (`src/features/vault-ontology/model/use-map-evidence-states.ts:15`,
  `src/views/home/model/use-changed-source-concepts.ts:13`; the server's half is
  `mcp/src/drift/evidence-drift.mjs:1`). The Flat key names it when any exists
  (`TopologyScopeReadout.tsx:78`). It says nothing about code no concept points at.
- **Every write already measures the share** when code is connected
  (`mcp/src/tools/writes/write-concepts.mjs:230`) and already leaves one line in
  `.ontology-atlas/activity.jsonl` (`mcp/src/server/write-log.mjs:82`): tool, target, summary,
  agent (`mcp/src/vault/sidecar/activity-log.mjs:19`), capped at 4,000 lines
  (`activity-log.mjs:16`).
- **`connect_project_source` records the code's HEAD and a time**
  (`mcp/src/project-source/project-source-mint.mjs:66`, `project-source-inspection.mjs:260`) in
  `.ontology-atlas/project-sources.json` (`project-source-receipt.mjs:23`), one receipt that is
  overwritten and only answers current or stale. `git_snapshot` and `finalize_project_meaning`
  record no source commit.
- **Other files in `.ontology-atlas/`**: `llm-audit.jsonl` is the log of what a model call sent,
  written by Rust before the send (`src-tauri/src/llm_audit.rs:1`); `analyses/` holds an agent's
  answers to a question, "a diagnostic record, not a kind"
  (`mcp/src/analysis-history/analysis-record.mts:4`). Neither describes building the map.
- **Git leaves `.ontology-atlas/` out by default**: its own ignore file is written once
  (`src/shared/lib/vault-folder/vault-sidecar.ts:11`), and Settings says so
  (`messages/en/nav.json:101`). Both surfaces read files there (`.claude/rules/surfaces.md:155`,
  `src/entities/vault-session/model/local-vault/vault-sidecars.ts:230`).
- **Automations cannot change the map.** "Ontology schedules stay read-only"
  (`docs/features/automations.md:94`); the brief forbids every write
  (`src/features/library-rounds/model/ontology-round-brief.ts:31`); the screen says "Nothing"
  (`messages/en/automations.json:127`). Decision `5e2f4838` refuses an Atlas write in an unattended
  pass, and "nothing scheduled may" start a mapping run
  (`docs/specs/2026-11-23-one-press-maps-the-rest.md:28`).
- **Changes reads the connected code's merged history** with no agent
  (`docs/features/change-briefing.md:12`, `:24`), and Work status answers which agent holds which
  worktree (`docs/features/work-status.md:11`). Neither reads the map.
- **A system notification is held** (`docs/DECISIONS.md:5279`) and out of the run's scope
  (`docs/specs/2026-11-23-one-press-maps-the-rest.md:102`).
- **Unknown**: how many analyses a real week of the owner's work produces, and how many of them
  run in worktrees, whose `.ontology-atlas/` is a separate folder. `pnpm decisions:find` returned
  no record for "analysis record", "source commit" or "automation schedule".

## Problem and alternatives

The map looks the same on the day it was built and three weeks later. The facts that say otherwise
exist in three places (the note's line, Git dates, the agent panel) and none says when the code was
last read or what arrived since. The request is a symptom of one cause: nothing records an
analysis, so nothing can be compared with now.

**The owner named six things.** Ranked by what each gives back against its cost:

| # | Named | Gives back | Cost | Slice |
|---|---|---|---|---|
| 1 | A record, shown on the map: share, which analysis, days since | the answer to "is this map current?" at every open | one file format, one chip | 1 |
| 2 | New and changed code since, and a nudge | the reason to act, with no agent turn | one Git read | 2 |
| 3 | Analyze only what is new or changed | keeping current costs minutes, not a rebuild | request and trial | 3 |
| 4 | Register it in Automations | the map stays current unattended | overturns two decisions | 4 |
| 5 | Notify | reaches a person who is not looking at the map | another spec owns it | Later |
| 6 | Completeness | a sense of how far the map is | facts exist; a score does not | 1–2 |

Slice 1 comes first because every other item reads the record. Item 4 is the owner's strongest
wish and comes fourth only because a schedule needs item 3's scope to be worth its cost.

**Where the record lives.**

| Way | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo: the note's line only | share, no time, no history | hidden in the agent panel | none | holds | loses: it is the complaint |
| Derive everything from the vault's Git history | dates and share over time, for every clone | wrong after a run until a commit; a typo fix reads as an analysis | Git only | a vault need not be a repository | rejected as the base; kept as Later 2 |
| A line or key on the project note, written by the server | travels in Git | one line, no history | the server would edit a concept file no card showed | holds | rejected: a side-effect write to a node |
| One tracked file per analysis in the vault | travels, merges without conflict | every agent session adds a file to the person's commits and pull requests | new folder convention and a wider write | holds | rejected for slice 1; Later 1 names what makes it next |
| App storage (IndexedDB, OS cache) | fast | invisible to a terminal agent and to the web | easy | breaks "no second canonical store" (`.claude/rules/local-first.md:36`) | rejected |
| Add fields to `activity.jsonl` or `llm-audit.jsonl` | none new | half its lines are dropped at 4,000 | easy | the audit log answers "what was sent" | rejected: wrong question, wrong lifetime |
| **`.ontology-atlas/map-analysis.jsonl`, appended by the MCP server after a write** | history, time, commit, on both surfaces and for every agent | a plain file the person can open | the hook and the measure exist | the written home for cross-surface data (`surfaces.md:155`) | chosen |

What the chosen way costs: Git leaves the file out by default, so a clone, a worktree or a second
Mac starts with no record. The share still travels, because it is in the project note.

**What changes for someone who uses the map today.** The row above the composer stays the one
control that starts a run (`a24bde01`). The Flat key's mark for changed code stays. One chip is
added to the map's top row.

### Decisions

1. **One analysis** is one stretch in which an agent wrote concepts or relations to the folder:
   every request of one press of the app's run together, or one other agent session. A session
   whose next write comes more than 60 minutes after its last begins a new analysis, so a terminal
   agent left open for days is not one analysis. Sixty minutes is six times the run's silence
   limit (`src/features/work-run/model/mapping-run.ts:76`) and has no other measurement behind
   it; reverse by changing the constant.
2. **The record is `.ontology-atlas/map-analysis.jsonl`, and only the MCP server writes it**, at
   the place it already logs a write (`mcp/src/server/write-log.mjs:82`), so a terminal agent
   counts exactly as the app's run does. A failed append never fails the write. The app reads it
   and never writes it; a run's stop reason therefore stays in the app's History, not in the file.
3. **A line holds counts, never names**: see "The record's format". No path, file name, code or
   concept title is written, so the file is safe to share if the person chooses to commit it.
4. **The code's HEAD at the count is recorded** (`sourceCommit`, with `sourceDirty`). It means
   "the share was counted against this tree", not "all code up to here was read".
5. **"Analyzed" is not a new mark.** A file is on the map when a concept points at it by `path:`
   or cited lines (`f7ea68cd`), and still current while it has not changed since that concept was
   written (Git dates, as the map reads them today). Everything else is one of three named states:
   not on the map (R of T, as last counted), changed after its concept was written, or changed
   since the last count and so not counted yet. No checkbox store is added.
6. **No completeness score.** Completeness is shown as those facts side by side, each in a
   sentence a person can check against the map. A single percentage of "done" was rejected: one
   cited line counts every ability in its file (`f7ea68cd`, dissent), and the server's count of
   rules that cite their lines depends on what one session read
   (`mcp/src/construction/build-depth/read-depth.mjs:52-65`), so neither can be multiplied into a
   score that means what it says.
7. **The words.** On screen the act is an **analysis** (owner's word; code-quality tools say
   "last analysis" and "new code"), numbered "Analysis 3"; the Korean catalogue uses the
   owner's own counting word. "On the map" and "abilities" stay as the run already uses them
   (`messages/en/workCard.json:112`).
   "Round" is not used: in this product a round is a scheduled pass (`a24bde01`: "a run is not a
   round"). "Areas" stays in the file and off the screen: no screen has shown the word.
8. **Where it shows**: one chip in the map's top row beside the other chips
   (`src/views/home/ui/map-readouts/TopologyCommandChrome.tsx:262`), 36px with `text-body` like
   them, from `md` up. It reads share, analysis number, time since. Pressing it opens a small
   panel under it and the chip stays pressed; pressing again, Escape or a press outside closes it.
   The panel has no rows that unfold and no icon-only button. The share moves from the value
   last drawn, once per change of the record; under reduced motion it swaps. The seat within the
   row is chosen in `/ui-build` and must overlap nothing at 1040×720, 1512×900 and 1920×1080.
9. **Time alone never warns.** The chip takes the warning tone only when code changed: more than
   18 new or changed files since the last count (one request names at most 18,
   `unmapped-areas.mjs:9`), or any changed file once the last analysis is 7 days old. Seven days
   has no measurement behind it; criterion 7's notes correct it.
10. **Automations.** Nothing there can analyze today, and a scheduled check that changes nothing
    would repeat what the chip counts for free. So no schedule press is drawn until slice 4, which
    lets a schedule write and needs its own decision record.

### The record's format (version 1)

One JSON object per line, UTF-8, appended after each successful write that added, changed or
removed a concept or relation. A reader keeps the last line of each `session` and sums the
sessions of each `analysis`. When a session writes its first line the server folds every earlier
session to one line, so the file holds about one line per session. New optional fields keep `v`.

| Field | Meaning |
|---|---|
| `v` | `1` |
| `analysis`, `number` | the analysis's id and its ordinal in this folder; the app gives every request of one press one id through the server's start-up settings (`mcp/src/server/runtime.mjs:35`) |
| `session` | the server process that wrote the line |
| `origin` | `press` or `session`; a reader treats any other value as `session` |
| `startedAt`, `at` | ISO times of the session's first write and of this one |
| `agent` | the name the activity log would give (`activity-log.mjs:53`), or null |
| `sourceCommit`, `sourceDirty` | HEAD of the connected code at the count and whether it had uncommitted changes; null when no code is connected or it is not a Git repository |
| `abilities` | `{ "total": T, "offMap": R }` as `validate_vault` counts them, or null |
| `areas` | `{ "total": M, "notMapped": N }`, or null |
| `concepts` | `{ "added", "changed", "removed" }` in this session so far |

## Flow

Steps 1–5 are slice 1; 6–8 slice 2; 9 slice 3.

1. When an agent's write to the folder succeeds, the server appends a line; the person does nothing.
2. When the person opens the map, Atlas reads the project note and the record and draws the chip:
   **62% on the map · Analysis 3 · 4 days ago**.
3. When the person presses the chip, the panel opens: the share in one sentence, when it was
   counted, the last five analyses (number, date, agent, share before and after, concepts added and
   changed), and **Map the rest of the code** while abilities are off the map.
4. When the person presses **Map the rest of the code**, the panel closes and the map conversation
   opens on its row with the estimate and Start; the panel starts nothing itself.
5. When an analysis is running, the chip reads **analyzing now** and its share moves once per
   request; when it ends the chip reads **today** and the panel's list has one more row.
6. When code changed since the last count, the chip says how many files, and the panel says how
   many are new and how many changed, and how many concepts were written before their code changed.
7. When more than 18 files changed, or any changed and the analysis is 7 days old, the chip takes
   the warning tone. It keeps it until an analysis counts again.
8. **When the evidence is missing**: the recorded commit is not in the repository's history (a
   rebase, a shallow clone, another repository), or the code is not a Git repository. The chip
   keeps share, number and time; the panel says which of the two it is and that Atlas cannot count
   changed files. Atlas does not guess from dates.
9. **When the agent is wrong**: a request of **Analyze new and changed code** ends having changed
   nothing, or raised the count of abilities off the map. The run stops as "no progress" under the
   run's existing rule, the analysis is recorded with what it did change, and the chip keeps the
   warning tone because the files are still uncounted or the concepts still behind.

## States

| State | Web | macOS app |
|---|---|---|
| Empty: no folder, the sample map, or a folder with no project | not drawn | not drawn |
| Empty: no record and no line (code never counted) | not drawn; `acpChat.connectSource` (`messages/en/acpChat.json:360`) stays the next step | the same |
| Loading: the folder is being read | not drawn until the note and the record are read, then fades in once | the same |
| No record, line present (a folder mapped before this shipped, or a copy of one) | `pill.shareOnly`; panel: `panel.share`, `panel.noRecord`, `panel.where`, `web.analyze` | the same with **Map the rest of the code** and `action.mapRestHelp` in place of `web.analyze` |
| Record, code connected | `pill.full`; panel: `panel.share`, `panel.counted`, up to five rows, `panel.earlier` past five, `web.analyze` | the same with **Map the rest of the code** and `action.mapRestHelp` in place of `web.analyze` |
| Record, no code connected | `pill.noShare`; panel: rows with `panel.rowNoShare` | the same |
| Everything on the map (the line is gone, the record's last count is R = 0) | `pill.full` at 100%; `panel.shareAll` | the same; no mapping action |
| Running | `pill.running`; follows the file on the web's reread | `pill.running`; follows the folder watch |
| Error: the record cannot be read, or no line in it parses | `pill.shareOnly`; `panel.unreadable` | the same |
| Partial: some lines do not parse | the lines that parse; nothing said | the same |
| Partial: the note's line is newer than the record (edited by hand, or merged from another copy) | the share is the note's; rows show their own counts | the same |
| Slice 2, nothing changed | `changed.web` in the panel | `changed.none` in the panel |
| Slice 2, files changed | `changed.web` | `pill.changed`; `changed.some`, `changed.behind` when above zero |
| Slice 2, past decision 9's bound | `changed.web` | the same in the warning tone |
| Slice 2, commit unknown or no Git | `changed.web` | `changed.unknownCommit` or `changed.noGit` |
| Slice 2, the read is still running | `pill.full` | `pill.full` until the count arrives, then one cross-fade; no placeholder text |
| Offline | the same as online: nothing here uses a network | the same |
| Largest measured: 383 abilities in 45 areas (`tests/fixtures/not-mapped-line-cases.mjs:22`). No record exists to measure, so criterion 2 plants 5,000 sessions | five rows and `panel.earlier`; the file is read once per change | the same; the tail is read as the activity log's is (`vault-sidecars.ts:230`) |
| Below `md` | Out of scope — the map's corner readout is also hidden there (`TopologyScopeReadout.tsx:20`) | Out of scope — the app's window does not go below it |

## Copy

Written to `messages/{en,ko,ja,zh}/mapAnalysis.json`. `{when}` is one of the `when.*` strings.

| Key | Where it appears | English |
|---|---|---|
| `pill.full` | chip | {percent}% on the map · Analysis {number} · {when} |
| `pill.shareOnly` | chip | {percent}% on the map · no analysis recorded |
| `pill.noShare` | chip | Analysis {number} · {when} |
| `pill.running` | chip | {percent}% on the map · analyzing now |
| `pill.changed` | chip, slice 2 | {percent}% on the map · {files} files changed since analysis {number} |
| `pill.label` | chip's accessible name | Code analysis. {summary}. Press to see each analysis. |
| `when.today` / `.yesterday` / `.days` | inside the chip and rows | today / yesterday / {days} days ago |
| `panel.title` | panel heading | Code analysis |
| `panel.share` | panel, first sentence | {mapped} of the {total} abilities found in the code are on the map ({percent}%). |
| `panel.shareAll` | panel, first sentence | All {total} abilities found in the code are on the map. |
| `panel.counted` | under it | Counted in analysis {number}, {when}. Code changed after that is not counted yet. |
| `panel.listTitle` | above the rows | Analyses in this folder |
| `panel.row` / `.rowNoAgent` | row, first line | Analysis {number} · {date} · {agent} / Analysis {number} · {date} |
| `panel.rowChange` | row, second line | {before}% → {after}% on the map · {added} concepts added, {changed} changed |
| `panel.rowFirst` | first analysis | {after}% on the map · {added} concepts added, {changed} changed |
| `panel.rowNoShare` | no code connected | {added} concepts added, {changed} changed |
| `panel.earlier` | under five rows | {count} earlier analyses are in .ontology-atlas/map-analysis.jsonl in this folder. |
| `panel.noRecord` | no record | No analysis is recorded in this folder yet. The next time an agent adds to the map, Atlas starts the record. |
| `panel.where` | under `panel.noRecord` | Atlas keeps this record in .ontology-atlas/map-analysis.jsonl in this folder. Git leaves that file out by default, so another copy of the folder starts its own record. |
| `panel.unreadable` | error | Atlas could not read .ontology-atlas/map-analysis.jsonl, so no analysis is listed. The share above comes from the project note. The next analysis adds to the file as it is. |
| `action.mapRestHelp` | under `workCard.mapping.startTitle` | Opens the map conversation, where the estimate and Start are. |
| `web.analyze` | web, in place of the action | Starting an analysis from Atlas needs the desktop app, which runs your coding agent. An agent you connect yourself over MCP adds to this record too. |
| `changed.none` | panel, slice 2 | No file in the code changed since analysis {number}. |
| `changed.some` | panel, slice 2 | Since analysis {number}, {added} new files and {changed} changed files in the code. The share above does not count them yet. |
| `changed.behind` | panel, slice 2 | {count} concepts were written before the code they point at changed. |
| `changed.unknownCommit` | panel, slice 2 | Atlas cannot count changed files: commit {commit}, which analysis {number} read, is not in this repository's history. |
| `changed.noGit` | panel, slice 2 | Atlas cannot count changed files: the connected code folder is not a Git repository. |
| `changed.web` | web, slice 2 | Counting files changed since an analysis needs the desktop app, which reads the code's Git history. |
| `action.catchUp` / `.catchUpBody` | panel, slice 3 | Analyze new and changed code / {files} files to read. About {requests} requests to your agent, about {duration}. |

## Edge cases

- **Zero, one, most**: no record and no line draws nothing; one analysis shows `panel.rowFirst`
  with no "before"; 5,000 planted sessions show five rows and `panel.earlier`.
- **First run**: the starter map has no project line and no record, so no chip; the first write of
  the first build makes the first line and the chip appears with **Analysis 1 · today**.
- **Hangul**: an agent name or a folder name in Hangul is stored as UTF-8 and drawn as text; the
  file's own name and path are ASCII.
- **Moved or renamed folder**: the record moves with the folder, since it is a file in it. A
  renamed code folder keeps its commits, so the count still works once the code is connected again.
- **Unreadable**: `panel.unreadable`; the server appends to a file it can open and leaves a file
  it cannot parse untouched.
- **Two edits at once**: two agents write the same folder; each line carries its `session`, and
  an append is one write of one line. Two sessions that mint the same `number` are listed in file
  order; the app renumbers from the first line's `number`.
- **Offline**: every read is local.
- **Uncommitted code at the count**: `sourceDirty` is true; changed files are still counted from
  the commit, and files changed but not committed at either end are not counted.
- **A clock set back, or a line dated in the future**: `when.today`.
- **A copy without the record** (clone, worktree, second Mac): the "no record" state; the share is
  right because it is in the note.

## Out of scope

- **A completeness score**: decision 6.
- **A system notification or a Dock badge**: the planned spec for notifications decides when Atlas
  may interrupt; this one gives it three facts to announce (files changed, concepts behind, days).
  The hold of `docs/DECISIONS.md:5279` stands until that spec overturns it.
- **The model's name and an analysis's cost**: the server is not told the model, and only the
  agent's own program knows the cost.
- **Listing the changed files in the panel**: a list of hundreds of paths helps no decision the
  panel offers; Changes lists them (`docs/features/change-briefing.md:12`).
- **The record in Changes, Work status or the project page**: each answers another question;
  a link is Later 4.
- **A third fact, rules that cite their lines**: decision 6; Later 5.
- **Writing the record from the app, or from a read-only tool**: one writer, and only after a
  write, as the activity log does (`activity-log.mjs:2`).

## Slices, decision records and reviewers

| Slice | What the person gets | One-way part | Needs |
|---|---|---|---|
| 1 | the record, the chip, the panel | a new file in the vault and a new side effect of every MCP write | **Record A** and one `reviewer` of the server's writer and the shared line cases, before the pull request is marked ready |
| 2 | files changed since, concepts behind, the warning tone | none: a count of file names from the connected code's Git history, inside the existing source grant; counts only cross to the page | a row in `.claude/rules/surfaces.md` and the degradation registry (`surfaces.md`, "Add every new app-only ability") |
| 3 | **Analyze new and changed code**: the run of `a24bde01` with a request that names the commit to compare from; the server names at most 18 files per request, the code of concepts written before it changed first, then new and changed files holding abilities off the map. Estimate: `ceil(files / 18)` requests at 4 minutes (`src/shared/lib/vault-document/mapping-estimate.ts:2`, `:8`), the same ceiling per press | a second kind of run whose progress is read from the record, not from the note's line | **Record B** (extends `a24bde01`), `/ontology-field-trial` on two repositories, one `reviewer` of the file ordering |
| 4 | a schedule in Automations that runs slice 3 when files changed, with a cap of requests per pass, writes passing as Auto-approve passes them (`15443720`) and everything else refused and named; registered by **Allow and save** with its scope and daily bill in words; the panel then offers **Run it on a schedule** | an agent writes to the map with nobody present | **Record C** (narrows `5e2f4838`, the "nothing scheduled" clause of `a24bde01` and `docs/features/automations.md:94`), its own states and copy in a revision of this spec, one `reviewer` with the security lens |

**Record A** (the lead writes it with `pnpm record:new` and lists it in `decisions:`). Title: the
MCP server keeps one line per agent session in `.ontology-atlas/map-analysis.jsonl`, and the map
reads it. Prior: extends `f7ea68cd` (the count it records) and `a24bde01`, whose "nothing is
persisted" still holds for the app's run state. Falsifier: a line holding a path, a file name or
code; a write that failed because the append failed; the app writing the file; a count in a line
that differs from `validate_vault` at that moment; a session that wrote nothing listed as an
analysis. Dissent to keep: Git leaves the file out, so the record does not follow the map to a
clone or a worktree; one tracked file per analysis would. `docs/ONTOLOGY-ATLAS-SPEC.md` §2 and §5
do not change: the record is no node kind and no relation. Documents that change with slice 1:
`mcp/README.md`, `docs/ARCHITECTURE.md`, `docs/features/map/`, and this vault through
`/ontology-sync`.

## Acceptance criteria

1. **The capture, first.** Given the owner's Mac and the folder he mapped, when the map opens in
   the installed app before slice 1, then the pull request holds that screen and, beside it, three
   facts read by hand: the date of the last change to a concept file, the share in the note, and
   the files changed in the code since that date. Checked: the capture and the note in the first
   pull request.
2. **The record says what happened.** Given a folder with code connected, when three server
   sessions sharing one analysis id each add concepts, a fourth session with no id patches one, and
   a fifth writes and writes again 61 minutes later, then the file reads as four analyses (one,
   one, and the fifth's two), a file of 5,000 planted sessions reads as 5,000 analyses in one
   pass, each count equals `validate_vault`'s at that write, no line holds a path or a title,
   and an append made to fail leaves the write's own result unchanged. Checked:
   `mcp/src/vault/sidecar/map-analysis-log.test.mjs`.
3. **Both readers read the same lines.** Given the shared cases (a line as written, an unknown
   `origin`, a missing optional field, a broken line between two good ones, two sessions with one
   `number`), then the server's reader and the app's reader return the same analyses. Checked:
   `tests/fixtures/map-analysis-line-cases.mjs`,
   `tests/contract/vault-format/map-analysis-line.contract.test.ts`.
4. **Every state shows its words.** Given planted folders for each row of States, then the chip
   and the panel show the keys named, the chip toggles its panel and stays pressed while it is
   open, the share moves from the value last drawn with no frame interval above 50 ms, and the
   chip overlaps no control at 1040×720, 1512×900 and 1920×1080. Checked:
   `tests/e2e/map-analysis-chip.spec.ts`; `pnpm ui:look` at the three sizes.
5. **The web reads the same file and promises nothing it cannot do.** Given the web build on a
   folder with a record, then the chip shows the same share, number and time as the app, the
   panel shows `web.analyze` and, in slice 2, `changed.web`, and each names where the ability
   works. Checked: `tests/e2e/web-surface-smoke.spec.ts`.
6. **Changed files are counted from the recorded commit.** Given a fixture repository with a
   recorded commit, then 3 added and 2 changed files read as 3 and 2, files under the ontology
   folder and under a dot folder are not counted, a commit absent from history answers "unknown
   commit", a folder without Git answers "no Git", and no file name crosses to the page. Checked:
   `src-tauri/src/git/changed_since/tests.rs`,
   `src/features/vault-ontology/model/map-analysis-freshness.test.ts`.
7. **The walk, which is the recovery proof.** On the owner's Mac, in a rebuilt installed app on
   the folder of criterion 1: the chip shows the share; two requests of **Map the rest of the
   code** make one new analysis dated today; quitting and reopening shows the same; a write from a
   terminal agent adds an analysis with that agent's name; 19 files committed to the code turn the
   chip to the warning tone with the count; removing the file by hand shows **no analysis
   recorded** with the share intact. Then for seven days the owner notes each time the chip was
   wrong or told him nothing. Checked: the walk's recording and the notes in the pull request.
8. **Analyze new and changed code catches up (slice 3).** Given two repositories nobody in the
   session has read, each mapped and then moved forward by at least 30 commits, when a headless
   chain runs the slice-3 request with each agent the app offers, then at its end the files
   changed since the last count read zero, every concept written before its code changed was
   patched or is named as left, no concept was deleted, no earlier cited rule was lost, and the
   estimate at the press is within half of the requests used. Checked: the chain's ledger from
   `/ontology-field-trial` in the pull request.

## Risks

1. **The record does not follow the map.** An agent that writes in a worktree writes that
   worktree's own `.ontology-atlas/`, so after the merge the main folder lists none of its
   analyses and counts its files as still changed. Design: the share and the concepts behind
   come from the note and from Git, which do follow. Probe: after criterion 7's week, compare
   the rows with `git log` of the ontology folder; one merged change to a concept with no row
   makes Later 1 next.
2. **The number stops meaning anything.** Twenty small terminal sessions make "Analysis 23", which
   reads as maturity and is not. Design: every row says what it changed, and decision 1's gap
   keeps one long session from hiding many. Probe: in the same week, the share of rows that
   changed two concepts or fewer; above half makes Later 3 next.
3. **"62% on the map" is read as "62% understood".** The count shows where concepts point, not
   how well they read (`f7ea68cd`, dissent). Design: the words are "on the map", the panel says
   when it was counted and what is not counted, and no score is drawn. Probe: `f7ea68cd`'s own
   falsifier, fifteen sampled abilities, on the folder of criterion 7.

## Later

Slices 2 to 4 are in the table above and come first, in that order. After them:

1. Keep the record in Git, one file per analysis, so it follows the map to clones and worktrees.
   Next when risk 1's probe finds one missing row.
2. For a folder with no record, read the last change to a concept file from Git and say
   "last changed {when}". Next when a second person opens a mapped folder they did not build.
3. Group the rows of one day and one agent. Next when risk 2's probe passes half.
4. A link from an analysis row to its conversation in History and to that day in Changes. Next
   when the owner asks what an analysis did.
5. A third fact, rules that cite their lines, once the server's count no longer depends on one
   session's reads. Next with the next change to `read-depth.mjs`.
6. The notification, in the notifications spec, fed by slice 2's three facts.

## Owner question

None. Two choices are decided here and can be reversed. The record stays out of Git by default
because the owner asked for a record kept "internally" and because every other file in
`.ontology-atlas/` is left out; Later 1 reverses it without losing a line. A schedule that writes
to the map (slice 4) follows the owner's direction of 2026-11-18 that a person approving every
write no longer makes sense (told to the lead, in no repository record; `15443720` records the
same complaint), and still waits for Record C and its reviewer before any of it is built.

## Revisions

- 2026-11-24: first draft.
- 2026-11-24: slice 1 built. Record A is `4f94c421`. Readers keep the last line per session and
  analysis, so one server process that idles past an hour spans two analyses. The server folds
  earlier sessions to their last line when an analysis begins and keeps the newest 2,000; the app
  reads the last 1 MiB. Relation writes count as a change to their `from` concept; connecting or
  disconnecting code is not an analysis.
