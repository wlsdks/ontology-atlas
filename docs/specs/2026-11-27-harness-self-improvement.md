---
title: Self-improvement in Harness, first slice — check agent memory against the code
doc_type: spec
status: draft
area: harness
date: 2026-11-27
decisions: []
---

# Self-improvement in Harness, first slice — check agent memory against the code

**In one minute.**

- *Agent memory* is the notes a coding agent writes for itself and reads in every session. Claude
  Code keeps one folder of them per repository; here it holds 173 notes.
- Notes go wrong silently. On 2026-10-14 two commits moved most of `scripts/` and
  `tests/contract/` into subfolders, and 15 citations in the notes still name the old places, such
  as `scripts/pr-land.mjs` for `scripts/landing/pr-land.mjs`. Another 7 name deleted files.
- *Self-improvement* here means the files around the agent get better; the model does not change.
  It works when an outside check judges each change, and fails when the model judges itself.
- **First slice.** Harness gets a view called Improve. One press of **Check memory** checks every
  file path in every note against Git, live on screen. Where Git recorded a move, Atlas proposes a
  one-line change. The person keeps each one, or all of them from one list; one Undo puts them
  back. No model is called and nothing leaves the computer.
- **Why Atlas.** Inside the agent tool, the agent that wrote a note judges it. Atlas judges it
  against Git, shows each change before writing, and keeps the earlier version.
- **Next:** shorten the memory index, then turn repeated corrections into proposed rules. Each
  reuses this loop: run live, propose one line, keep, undo.

**Words.** A *note* is one Markdown file in that folder; the *index* is `MEMORY.md`, the note
loaded at session start. A *citation* is a path or `pnpm` script between backticks. A *move* is a
commit where Git pairs a removed path with an added one. To *keep* a change is to let Atlas write it.

## What self-improvement means here

A survey for this spec of what the field calls self-improvement found that the forms with evidence
use an outside signal: a correction, a test, or the code a note cites. This spec builds only forms
in which such a signal judges each change and a person keeps it. Not built:

| Form | Why not |
|---|---|
| Writing notes or rules without review | Planted text in memory files attacks current and future sessions of Claude Code and Codex ([Gadgil et al., "Bad Memory", 2026](https://arxiv.org/abs/2607.14611)). Context files raised cost by over 20% without raising success ([Gloaguen et al., "Evaluating AGENTS.md", 2026](https://arxiv.org/abs/2602.11988)). |
| A loop where the model critiques itself | Without outside feedback, models "struggle to self-correct" and sometimes get worse ([Huang et al., ICLR 2024](https://arxiv.org/abs/2310.01798)). |
| An agent that rewrites its own program | It improves benchmarks ([Darwin Gödel Machine, 2025](https://arxiv.org/abs/2505.22954)), but Atlas does not own the agent's code, and each run costs many full benchmark passes. |
| Automatic prompt tuning of `AGENTS.md` | It needs a numeric score and many runs per change; the research shortlist found no cheap score for a repository's instructions. |
| A button that writes an `AGENTS.md` overview | Repository overviews did not help (Gloaguen et al., above). |
| A memory engine inside the agent's loop, or model training | Atlas runs beside the agent, not inside it. |

## Person and moment

1. **The owner, who runs Claude Code and Codex on many worktrees (observed in words, not on
   screen).** 2026-11-27, translated: "Let's build self-improvement, a new feature: one click in
   Harness makes self-improvement possible. It needs to show the work as it happens, right before
   your eyes, and look great." Then: "Research what self-improvement is in many ways, then plan."
   No capture exists of him reading or fixing his agent's memory. Acceptance criterion 1 takes one.
2. **Someone learning coding agents (not observed)** may not know the folder exists; the stage
   names it and its path.
3. **Someone who wants an ontology without agents** has no memory folder; the view says so
   (`empty.*`) and nothing else changes for them.

## Today

Read at `origin/main` `cebf739211`. No running screen was looked at; the brief names no port.

- **Harness has two views and writes nothing.** `HARNESS_VIEWS` is `overview` and `architecture`
  (`src/views/architecture/lib/harness-view-state.ts:1`); every Harness reader is read only
  (`.claude/rules/surfaces.md:79-92`, `:110-125`).
- **No Atlas code reads agent memory or transcripts.** The settings reader opens fixed file names,
  never a folder listing (`src-tauri/src/harness_scopes/mod.rs:1-3`); Work status reads no
  transcript (`src-tauri/src/work_status/agent_sessions.rs:3`).
- **The shared agent config writer is not built.** The settings spec places it in
  `src-tauri/src/agent_config/` (`docs/specs/2026-11-22-harness-agent-settings.md:583-587`), which
  does not exist, and its record allows hook entries only (`3b55c4d4`, line 9). An atomic write
  that never follows a link exists (`src-tauri/src/confined_files.rs:1-4`, `:183`).
- **A shared background card exists** (`src/features/work-run/model/work-run.ts:24`,
  `src/app/providers/AppShell.tsx:420`).
- **Atlas's stale-evidence rule does not follow moves:** a path not on disk is `missing`, with no
  successor looked for (`mcp/src/drift/evidence-verdict.mjs:92-125`).
- **What gates miss.** Of late fixes read by hand, gates caught breakage and missed "the app saying
  something untrue" (`docs/specs/2026-11-27-when-people-cannot-keep-up.md:249-257`). A stale note
  is that kind of fault.
- **Vendor facts, read 2026-11-27.** Claude Code keeps memory in
  `~/.claude/projects/<project>/memory/`, one per Git repository, shared by its worktrees; the
  first 200 lines or 25KB of `MEMORY.md` load at session start and the rest "is dropped"; it
  reminds Claude to shorten the index near a limit; `autoMemoryDirectory` moves the folder
  ([memory docs](https://code.claude.com/docs/en/memory)). Codex memories are off by default, "a
  helpful recall layer", and "don't rely on editing them by hand"
  ([Codex memories](https://learn.chatgpt.com/docs/customization/memories?surface=cli)).
- **Measured on the owner's Mac, 2026-11-27,** by scratchpad scripts, counts only. The folder for
  this repository holds 173 notes, 864 KB; the index is 134 lines and 24,059 bytes and none of its
  171 links is broken. Notes hold 97 path citations; 38 distinct paths in 28 notes do not resolve.
  All 77 `pnpm` citations resolve. Of the 38, by Git's record: 15 moved to a path that exists
  today, 2 moved and were later deleted, 5 were deleted, 1 is a generated path Git ignores, and 15
  were never in this repository. Of 274 sessions here since 2026-10-15, 10 hold 77 transcript
  records naming one of the 15 old paths; one is a file-not-found tool error (a text search, not a
  parser). Codex's `~/.codex/memories/MEMORY.md` is 73,644 bytes.

**Unknown:** how often a stale note misleads the agent without an error, for example by an extra
search; whether other people's memory folders drift as much; whether Claude Code rewrites a note
while a session is running and Atlas writes it at the same moment.

## Patterns that already worked

| Pattern | Mechanism, and why it worked | How it fails | What Atlas borrows (mechanism only) |
|---|---|---|---|
| GitHub Copilot memory ([GitHub blog, 2026](https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/)) | Each memory stores "references to specific code locations"; before use, the agent checks them and corrects a memory the code contradicts. In an A/B test, pull requests merged 90% of the time with memories against 83% without. The code is the outside judge. | A citation can resolve while its meaning has moved on. The check runs inside the agent at use time, so a wrong correction is never seen. | A note is judged by the code it cites. New here: the check runs outside the agent, before any session, using Git's move record, and the person keeps each change. |
| Moving a file in an editor (VS Code's `updateImportsOnFileMove` setting, [VS Code docs](https://code.visualstudio.com/docs/languages/javascript)) | At the moment of a move, the editor finds references and shows a preview of each change to confirm. The person sees every edit before it lands. | It sees only the moment of the move and only files it indexes. Notes in a home folder are missed, which is how these 15 went stale. | A preview of each reference change with confirm. New here: after the fact, in a folder outside the repository. |
| Link checkers and permanent redirects ([Sphinx `linkcheck`](https://www.sphinx-doc.org/en/master/usage/builders/index.html); HTTP 301, [RFC 9110 §15.4.2](https://www.rfc-editor.org/rfc/rfc9110#section-15.4.2)) | A moved page leaves a forwarding address; a checker follows it and reports the new one. Fixing needs no judgment. | Alarm fatigue: links outside the checker's reach and flaky targets flood the report, and people stop reading it. | Git's move record as the forwarding address; paths Git never saw are counted, never flagged. |
| Itemized playbook updates ([Zhang et al., "Agentic Context Engineering", 2025](https://arxiv.org/abs/2510.04618)) | Contexts grow by small item edits; whole rewrites caused "context collapse", where "iterative rewriting erodes details over time". | Items pile up without pruning. | One path per change; the rest of the note stays byte for byte. |

## Problem and alternatives

**Ranked by value against cost.** (1) Citations: 22 stale paths, 15 fixable with no judgment and
no model, Git as judge; cheap, but measured harm is small (one tool error in 274 sessions). (2)
The index: 24,059 of 25,000 bytes, and lines past the limit stop loading; merging needs a model,
and Claude Code already prompts Claude to shorten. (3) Corrections into rules: the largest value,
but it needs a new read of transcripts (5 GB here) and a model. The rest need (3) or the unbuilt
hook writer. **Citations come first** because they build the whole loop (run live, propose, keep,
undo, version) on the safest change there is, and (2) and (3) reuse every part.

**Cause or symptom.** The cause: a note is written once and never checked while the code moves.

| Option | Gives back | Costs | Verdict |
|---|---|---|---|
| Status quo: the agent finds the stale path when a read fails | nothing until it fails; the note stays wrong for every later session | a failed read and a search each time; nobody sees the note | loses |
| Ask the agent to "check your memory" in an Atlas conversation | could also fix meaning | tokens; the note's author judges itself; a whole-file rewrite risks context collapse; the notes go to the provider | loses for slice 1; slice 3 uses the agent with evidence |
| A hook that rewrites memory when a file is moved | fixes future moves | misses the 22 already stale paths; writes without review; a hook is code | Later, as an option |
| **Atlas checks every citation against Git and proposes one line per move** | 15 changes in one press, each seen and undoable | a new read and a new write outside the repository, under one decision record | **chosen** |

**One click against "the person decides".** One press runs the whole check, live, and writes
nothing. Writing takes a second press: **Keep** on one change, or **Keep all {count} moves** after
a popup lists every one-line change. One Undo reverses either. A deleted file is never in Keep
all, because Git gives it no new place.

**One-way change.** This reads a folder Atlas never read and writes files another product owns:
one decision record, "Harness reads Claude Code's memory folder for the connected repository and
changes one cited path per keep", extending `3b55c4d4` with a seventh exception in
`.claude/rules/surfaces.md`, and one `code-reviewer` pass on the read and write boundary. Later
slices that call the person's agent cross the provider boundary: the screen says what the agent
will be sent, and `.ontology-atlas/llm-audit.jsonl` does not cover the provider's own traffic.
Versions sit in the app's data folder, not beside the notes, because Claude Code may read any file
in its memory folder. They are the person's text, which `.claude/rules/local-first.md:15` lets
Atlas keep only by this record, as `3b55c4d4` did for hooks; each is kept 90 days, mode 0600.

## Flow

**Layout.** A strip across the top holds one mark per note, the index first beside a gauge of its
bytes against 25,000. Below it, the list on the left and the detail on the right.

1. When the person opens Harness › **Improve** in the app with a repository connected, Atlas lists
   that repository's memory folder and draws the strip. Below it are `stage.title`, `stage.body`,
   the folder path and **Check memory**. No note text is read yet.
2. When they press **Check memory**, the button becomes the progress line and marks fill one by
   one: the index's links in order, then the rest by name. Each citation puts a tick on its mark.
3. A citation that resolves settles to the resting colour. A path Git never saw is only counted.
   For a path Git saw removed, Atlas asks for the commit: a moved path lifts off its mark as a
   chip and travels down into the list, the new folder segment growing in on the way (`landing/`
   in `scripts/landing/pr-land.mjs`); a removed one travels into "No longer in this repository".
4. When they switch tabs, the check continues and the shared background card shows
   `card.running` with the same count; coming back shows the strip where it is.
5. When the check ends, motion stops and the first change is selected. The detail shows the line
   from the note, Now above After you keep it with only the path differing, and the commit, date
   and subject of the move.
6. When they press **Keep**, Atlas checks the note is unchanged since the check, saves its text as
   a version, and replaces only that path. The two diff lines merge into one, the row takes
   Kept, and a toast offers Undo.
7. When they press **Keep all {count} moves**, a centred popup lists every change; confirming
   writes them, rows take Kept in order, and one toast offers one Undo.
8. **Evidence missing or wrong.** A move that leads to a path also gone is followed to the last
   move; if that path is missing, the citation joins the removed group with no proposal. A note
   changed after the check refuses Keep (`error.changedSince`). In a shallow clone, paths removed
   before its first commit are counted as not checked. Unreadable Git judges nothing (`error.git`).
9. When they press **Undo**, Atlas restores the saved version if the note still holds what Atlas
   wrote; otherwise it puts back only the path when the new path is still on that line, or
   refuses (`error.undoChanged`).

**Motion.** Each movement carries one event (a note read, a citation judged, a chip reaching its
group, two lines merging) and ends with it; nothing loops or moves at rest. Moves ease in and out
with no overshoot, a chip keeps its size in flight, and the list opens room before a chip lands.
Reduced motion turns each into a crossfade in place. Between events and after the end, no frame
is requested.

## States

| State | Web | macOS app |
|---|---|---|
| Any | Card `web.title`, `web.body`, `harness.browserAction`; the Improve view stays in the bar, so the address answers | as below |
| No repository connected | Out of scope — the web shows the card above | Harness's existing `harness.noSource` stage and connect action |
| Empty: no memory folder or no notes | Out of scope — as above | `empty.title`, `empty.body` with the path Atlas looked at; no button |
| First run | Out of scope — as above | Strip, gauge `stage.indexSize`, `stage.title`, `stage.body`, `stage.folder`, `stage.start`, `stage.local` |
| No model connected | Out of scope — as above | Same as First run; slice 1 calls no model, so no model is mentioned |
| Running | Out of scope — as above | `run.progress`, `run.checkingNote` or `run.askingGit`, `run.stop`; on other tabs `card.running` |
| Stopped | Out of scope — as above | `run.stopped`; findings so far stay; `action.checkAgain` |
| Partial | Out of scope — as above | `partial.body` above the list; the rest works |
| Failed | Out of scope — as above | `error.git`, `error.folder` or `error.link`; `action.checkAgain`; nothing changed |
| Nothing found | Out of scope — as above | `done.cleanTitle`, `done.cleanBody`, `groups.notJudged`; `action.checkAgain` |
| Done with findings | Out of scope — as above | `done.foundTitle`; list `groups.moved`, `groups.gone`; detail `detail.*`; `action.keep`, `action.leave`, `action.copyPath`, `action.keepAll`; elsewhere `card.found`, `card.open` |
| Kept | Out of scope — as above | `kept.tag`; toast `toast.kept` or `toast.keptAll` with `toast.undo`; then `toast.undone` or `error.undoChanged` |
| Write refused | Out of scope — as above | `error.changedSince` or `error.writeFailed`; the note unchanged |
| Managed Claude Code settings on this Mac | Out of scope — as above | Check runs; `managed.body`; no Keep buttons; `action.copyPath` |
| Largest measured (173 notes, 38 broken paths) | Out of scope — as above | Same as Done; the list scrolls inside its pane; the strip keeps one mark per note |

## Copy

All keys are in `messages/<locale>/harnessImprove.json` (en, ko, ja, zh), except `views.improve`,
which is in `messages/<locale>/harness.json`.

| Key | Where it appears | English |
|---|---|---|
| `harness.views.improve` | Harness view bar | Improve |
| `stage.title` | Stage heading | Agent memory, checked against today's code |
| `stage.body` | Under the heading | Claude Code reads these notes in every session. Atlas checks each file path they name against this repository's Git history. |
| `stage.folder` | Under the strip | {count, plural, one {# note} other {# notes}} in {path} |
| `stage.indexSize` | Beside the index gauge | Loaded at session start: {used} of {limit} |
| `stage.start` | Primary button | Check memory |
| `stage.local` | Under the button | Reads files on this computer only. Nothing is sent anywhere, and no note changes until you keep the change. |
| `run.progress` / `run.checkingNote` / `run.askingGit` / `run.stop` | Progress line | {done} of {total} notes checked / Checking {note} / Looking up {path} in Git history / Stop |
| `run.stopped` | After Stop | Stopped after {done} of {total} notes. What was found so far stays in the list. |
| `groups.moved` / `groups.gone` | List group headings | Moved, new place known / No longer in this repository |
| `groups.notJudged` | Under the list | {count, plural, one {# path names a file outside this repository and was not checked} other {# paths name files outside this repository and were not checked}} |
| `detail.line` / `detail.now` / `detail.afterKeep` | Detail | Line {line} of {note} / Now / After you keep it |
| `detail.movedBody` | Detail, moved | {old} moved to {new} on {date} in commit {commit}: {subject} |
| `detail.goneBody` | Detail, removed | {old} was removed on {date} in commit {commit}: {subject}. Git records no new place, so Atlas proposes no change. Rewrite or delete this line yourself. |
| `detail.hiddenLine` | Detail, secret-shaped line | This line looks like it holds a key or token, so Atlas does not show it. Open {note} in your editor. |
| `action.keep` / `action.leave` / `action.copyPath` / `action.checkAgain` | Detail and stage | Keep / Leave as is / Copy new path / Check again |
| `action.keepAll` | Above the list | Keep all {count} moves |
| `keepAll.title` / `keepAll.body` / `keepAll.confirm` / `keepAll.cancel` | Centred popup | Change {count} lines in {files} notes / Each line changes only the path shown. Every other character in each note stays as it is. One Undo puts all of them back. / Keep all {count} / Cancel |
| `toast.kept` / `toast.keptAll` / `toast.undo` / `toast.undone` | Toast | Changed line {line} of {note}. / Changed {count} lines in {files} notes. / Undo / Put {note} back as it was. |
| `kept.tag` | List row | Kept |
| `done.cleanTitle` / `done.cleanBody` / `done.foundTitle` | After the check | Every path in these notes is where they say / {paths} paths in {notes} notes checked against Git at {commit}. / {count} lines point to files that are not there |
| `empty.title` / `empty.body` | No memory | No Claude Code memory for this repository / Atlas looked in {path} and found no notes. Claude Code writes them there once auto memory is on. If autoMemoryDirectory is set in a settings file, the notes are elsewhere and Atlas does not read them. |
| `partial.body` | Above the list | {count} notes were not read: {reason}. Their paths are not in the list. |
| `error.git` / `error.folder` / `error.link` | Stage | Could not read this repository's Git history, so no path was judged: {reason} / Could not open {path}: {reason}. Nothing was changed. / {path} is a link, and Atlas opens memory only through real folders, so nothing was read. |
| `error.changedSince` / `error.writeFailed` / `error.undoChanged` | Toast | {note} changed after the check, so Atlas did not change it. Check memory again to see its current lines. / Could not write {note}: {reason}. The note is unchanged. / {note} changed after Atlas wrote it and the new path is no longer on line {line}, so nothing was put back. |
| `managed.body` | Above the list | Your organisation manages Claude Code on this Mac, so Atlas changes no memory file here. Copy each new path instead. |
| `web.title` / `web.body` | Web card | Checking agent memory needs the app / Claude Code keeps these notes in your home folder, which a browser cannot open. The app reads them and changes a line only when you keep the change. |
| `card.running` / `card.found` / `card.open` | Shared background card | Checking memory · {done} of {total} / {count} lines to review in Claude Code memory / Open |

## Edge cases

- **Zero, one, largest.** No notes: Empty. One note: one mark, same flow. Largest measured: 173
  notes, 864 KB, 97 path citations. At most 2,000 notes of at most 1 MiB each are read; the rest
  is Partial with its count.
- **First run.** Nothing persists between launches except saved versions.
- **Hangul, BOM, CRLF.** Only the path's bytes change; everything around it stays byte for byte. A
  `:L12` suffix is kept and not judged. The same path twice on a line is two changes.
- **Folder moved, renamed, unreadable or a link.** The folder comes from the main checkout's path,
  which worktrees share. A link anywhere refuses (`error.link`); a folder that vanishes mid-check
  is Failed, with no findings kept.
- **Two edits at once.** Keep and Undo compare the note with what was read and what Atlas wrote,
  and refuse on any difference.
- **Text is data.** "Ignore previous instructions", a URL or a shell line in a note changes
  nothing: no model reads it, Atlas runs and opens nothing from it, and a proposed path comes only
  from Git. A secret-shaped line (a private key header, `sk-`, `ghp_`, `AKIA`, `token=`) is never
  shown; no note text reaches a log or an error.
- **Offline** works fully. **Windows and Linux:** Harness reads on macOS only and says so.

## Out of scope

- Codex memory: Codex asks people not to edit it by hand; reading it needs its own record.
- The repository's `AGENTS.md`, `.claude/rules/` and skills: clean of moved paths today (Later 2).
- Line-number citations: none here is out of range, and judging one needs the old file's text.
- A folder set by `autoMemoryDirectory` or `CLAUDE_CONFIG_DIR`: Atlas cannot read those values.
- Rewording a note whose file was deleted: it needs judgment, so a later slice brings the model.
- Running on a schedule: Automations could, but nothing shows people want it unasked.

## Acceptance criteria

1. **The moment and the five-second test.** Given the installed app on the owner's Mac, when he
   first opens Improve, a screen recording shows what he looks at before pressing anything, and
   within five seconds he says what it does; the pull request quotes him (installed-app walk).
2. **The right findings.** Given `tests/fixtures/memory-citation-cases.json` and a fixture
   repository with a move, a move chain, a move then delete, a delete, an ignored path, a path
   never in history and a shallow clone, each citation lands in its group with the right new path
   (the Rust tests of the new memory module).
3. **One path changes, nothing else.** Given notes with Hangul, a BOM, CRLF and one path twice on a
   line, a kept change differs from before only in that path's bytes; a note changed after the
   check, a link in the path and managed settings each refuse with no write (same tests).
4. **Recovery.** Given one kept change and a Keep all of three, Undo leaves the notes
   byte-identical to before, also after an app restart; a note changed in between gets only its
   path back, or `error.undoChanged` and no write (Rust tests and one installed-app walk).
5. **The boundary.** Given notes planting "ignore previous instructions", a shell line, a URL, a
   `pnpm` citation and a secret-shaped token, no process starts, no socket opens, nothing outside
   the memory folder and the version store is written, and the secret line reaches no page, log
   or error (Rust tests, `tests/contract/desktop/memory-check-boundary.contract.test.ts`).
6. **Live, smooth, then still.** Given a bridge stub with 173 notes, the count only rises; leaving
   to the map shows `card.running` with the same count and returning continues it; no element
   jumps between two frames; after the end, no frame is requested for 10 seconds
   (`tests/e2e/harness/harness-improve.spec.ts`, measured per frame).
7. **Web.** Given the web build, Improve shows `web.title` and Get the app, and the entry is in
   `DEGRADED_SURFACES` (`tests/e2e/web-surface-smoke.spec.ts`).
8. **Field check: does a kept change reduce a repeated mistake.** Given this repository on the
   owner's Mac, Atlas finds 15 moves, or the pull request explains the difference. Keep 8, chosen
   by a fixed seed; hold back 7 as the do-nothing group for 14 days. Then count, per group, the
   tool calls in those days' sessions that name an old path. If either count is under 10, the
   result is "no detectable difference", which today's rate (77 records in six weeks) predicts.
   Then keep the 7. A scratchpad script's counts go into a revision of this spec.

## Risks

1. **The mistake is too rare to matter.** One tool error in 274 sessions. Answer: criterion 8 says
   so plainly. If it shows no difference, slice 2 comes next unchanged, and this check becomes the
   first step of each later run instead of a view of its own.
2. **Atlas checks a folder no session reads.** `CLAUDE_CONFIG_DIR` or `autoMemoryDirectory` can put
   memory elsewhere, and this Mac starts sessions from four settings folders. Answer: the stage
   always shows the path it read. Probe before building: the owner's `/memory` in a session
   started from each settings folder names the same memory folder.
3. **Atlas and Claude Code write the same note at once.** Answer: compare before every write, an
   atomic replace, a version first, and refusal on any difference. Probe: criterion 3 runs while a
   test process rewrites the note in a loop.

## Later

1. **Shorten the index** with the person's own agent: item-level merges and moves to topic notes,
   each a diff, saying what leaves the computer. Next: the index is at 96% of 25,000 bytes.
2. **Repository instruction files, and Codex memory read only.** Next when a check finds a move.
3. **Corrections into proposed rules** from transcripts under a new record: two incidents and a
   quote per rule, sent to the agent only after the person agrees. Next once keep and undo hold.
4. **Check a rule before keeping it:** replay about 20 past tasks three times, old against new,
   beside a do-nothing run, token cost shown first. Next when slice 3 proposes rules.
5. **Flag planted instructions in memory** with no commit or correction behind them. Next when a
   real case appears.
6. **A rule that keeps being broken becomes a proposed hook.** Next after the hook writer ships.
7. **Draft a skill** from a repeated procedure. Last: self-written skills measured no gain in the
   research note (not verified here).

## Owner question

Atlas would change lines inside Claude Code's own memory folder, a folder another product writes.
May slice 1 write there, with a diff, Keep, Undo and saved versions, or should it only show each
new path with Copy? Default if unanswered: write, as specified. Reverse by removing Keep and
Keep all, which leaves Copy.

## Revisions

- 2026-11-27: first draft.
