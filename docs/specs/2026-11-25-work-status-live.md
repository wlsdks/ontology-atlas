---
title: "Work status: session lines, the file-change pulse and load"
doc_type: spec
status: draft
area: git
date: 2026-11-25
decisions: []
---

# Work status: session lines, the file-change pulse and load

The round of Work status planned for v2.7.8. It adds four things to the screen that
`docs/features/work-status.md` describes: a line per session inside a room, with the session's
name; a pulse when a file changes; the load each room and this Mac carry; and truer words over the
list of merged changes. It builds a narrowed part of slice 3 (Progress) of
`docs/specs/2026-11-21-work-status-destination.md` ("the Work status spec") and of slice 12 of
`docs/specs/2026-11-22-work-status-coordination.md` ("the coordination spec"); where they differ,
this spec holds for this round.

## Person and moment

The owner, a developer who runs several Claude Code sessions at once and comes to Work status to
decide where to step in. His words of 2026-11-25, translated from Korean: "showing the name is
allowed"; "all of it is fine: the file-change pulse and load per worktree, and if Gradle or CPU
and GPU use while the work runs can be shown, build that too"; "it must fit the open-source
licenses and cause no issue". His words of 2026-11-21 on load are in the coordination spec
(`docs/specs/2026-11-22-work-status-coordination.md:22-25`).

Observed on his Mac on 2026-11-25, while this spec was written: Claude Code's session list held
five sessions, one of them in this repository; the repository had 2 worktrees (34 is the largest
measured, `docs/specs/2026-11-22-work-status-design.md:76`); 601 of 934 processes were his own.

No observation exists of a person who is learning coding agents, or of one who does not write
code, on this screen. The questions under Problem are written for both readers at the owner's
standing request; they are not evidence of what such a person does.

## Today

Read in the code:

- **One room, one name line, one state.** A session is called `{tool} {number}`
  (`src/widgets/work-tracks/ui/use-room-copy.ts:131-132`, `messages/en/workStatus.json:18`).
  The sessions in one folder are joined with " · " on the bezel (`use-room-copy.ts:280-281`,
  `src/widgets/work-tracks/ui/LargeRoom.tsx:240`), and the room says the strongest of their states
  (`src/shared/lib/work-status/signals/sessions.ts:5-13`, `:24`).
- **The name is dropped.** The parser reads `name`, `sessionId` and `id` into nothing
  (`src-tauri/src/work_status/agent_sessions/parse.rs:40-41`, `:54-59`); a row carries a worktree
  id, a pid and a state (`src-tauri/src/work_status/agent_sessions.rs:33-40`). The rule and the
  record say never (`.claude/rules/surfaces.md:136`, decision `929c2179`).
- **How often things are read.** Worktrees and locks: a stat every 1 to 4 s
  (`src/views/work-status/model/use-work-status.ts:5`, `:7`). A worktree's commits and
  uncommitted files: at most once in 10 s, and on a beat of 15 s times the running worktrees
  (`src/views/work-status/model/use-worktree-activity.ts:9`, `:15`, `:18-20`). The session list:
  asked every 2 s (`src/views/work-status/model/use-agent-sessions.ts:10`), read once in 10 s
  (`src-tauri/src/work_status/agent_sessions/pace.rs:6`). Relative ages: once a minute
  (`src/views/work-status/model/use-minute-clock.ts:4`).
- **The last-hour line** draws a mark per uncommitted file and per commit from the Git read, and
  a mark rises once when a read brings a newer time
  (`src/widgets/work-tracks/ui/ActivityStrip.tsx:12-17`, `:26-32`; `use-room-copy.ts:164-171`).
- **No watcher and no load.** Work status has seven modules and eight commands, none for file
  notices or load (`src-tauri/src/work_status/mod.rs:6-12`, `src-tauri/src/lib.rs:398-405`). A
  process is read for its parent, start, executable path and working folder only
  (`src-tauri/src/work_status/agent_processes.rs:5-6`, `:43-50`), and a working folder only under
  an agent (`:231-237`). Three commands each list every process (`mod.rs:74`, `:102`, `:124`).
- **A watcher crate already ships.** `notify-debouncer-full` 0.3 is a direct dependency
  (`src-tauri/Cargo.toml:51`) and resolves `notify` 6.1.1 with `fsevent-sys`
  (`src-tauri/Cargo.lock:3018-3033`); the folder watch uses it (`src-tauri/src/vault/watch.rs:3-6`).
  `NOTICE.md` lists `notify` under CC0-1.0 (`:313`), `fsevent-sys` under MIT (`:325`), and `libc`,
  `core-foundation` and `core-foundation-sys` under Apache-2.0 OR MIT (`:289`), all permitted
  (`docs/engineering/third-party-code.md:44`). No IOKit crate is in the lockfile.
- **The merged list** reads the newest 30 changes (`src-tauri/src/work_status/landed.rs:18`) on
  the first-parent line (`:131-144`) of the local `refs/heads/<base>` (`:96`). Its heading says
  "Landed on `{branch}`" and its note "It stays here after the worktree is removed, read straight
  from Git." (`messages/en/workStatus.json:181-182`, drawn at
  `src/widgets/work-tracks/ui/LandedLog.tsx:89-92`). The header chip is "Session list on" in
  English (`messages/en/workStatus.json:30`); the Korean string at `messages/ko/workStatus.json:30`
  says the list is being read.
- **The web** draws one card for the whole page
  (`src/views/work-status/ui/WorkStatusPage.tsx:87`, `.claude/rules/surfaces.md:57`).
- **The vault** has no concept for Work status; `capabilities/agent-work-visibility` is the
  activity feed read from `.ontology-atlas/activity.jsonl`.

Observed on this Mac on 2026-11-25 (commands run by hand; outputs not kept, since they hold names):

- The session-list call of `agent_sessions/call.rs`, run by hand with Claude Code 2.1.332: five
  entries, each with exactly `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, `status`.
  Every `name` was a non-empty string. Four were the session folder's name, a hyphen and two
  characters (8 to 23 characters). One, for a session started from the Claude desktop app, was a
  twelve-character phrase in Hangul with spaces, 30 bytes.
- `ioreg -r -d 1 -w 0 -c IOAccelerator`, without root, printed `PerformanceStatistics` with
  `"Device Utilization %"=31`. `sysctl kern.memorystatus_vm_pressure_level` printed 1. The Mac is
  Apple Silicon, macOS 26.6.2, 18 cores, 64 GiB.

Unknown, because not read or not seen: whether a name is typed by the person or written by Claude
Code from the conversation, and when it changes; what a background session's entry holds; where a
Gradle daemon's working folder points while it builds (no Java process was running); how much
memory `notify` holds for 40 watched folders; `docs/PRODUCT-DIRECTION.md` beyond lines 8 to 36.

## Problem and alternatives

**The questions each part must answer.** These are the definition; everything after is one answer.

| Part | A person who does not write code asks | A developer asks |
|---|---|---|
| Session lines | Which of my agents waits for me, and which window is it in? | Which session, by the name my terminal shows, is busy, waiting or done in this folder, and for how long? |
| File-change pulse | Is it still doing something right now? | Is it writing source or only running a build, and when did it last write? |
| Load | Is my Mac struggling, and which work causes it? | How much memory and CPU does each room's command tree hold, in which tool, and is the GPU the limit? |
| Merged list | What got finished? | What is on `main`, and is that my local `main` or the server's? |

**The problems, inferred from Today.** Two sessions in one checkout read as "Claude Code 1 ·
Claude Code 2" with one state, so the room cannot say which one waits, and a number matches no
window. An edit shows up to 15 s late in one running room and 90 s late with six, so the screen
cannot answer "right now". Nothing says why the Mac is slow. The merged list's note speaks of
worktrees, which the list does not depend on, and says nothing about the local branch.

**Ranked by what the person gets back against its cost.**

1. The merged list's words: a wrong reading removed for every reader, for a few catalogue lines.
2. Session lines with names: the page's core question ("who waits for me") answered per session;
   the data is already read each 10 s. The cost is one-way: a name is the person's own text.
3. The pulse: "right now" within about 2 s instead of 15 to 90 s. Cost: a new signal on the folders.
4. Load: answers a question the terminal answers badly, but it is the furthest from the product
   thesis ("needs to know ... whether to intervene", `docs/PRODUCT-DIRECTION.md:24-27`), has the
   most unknowns, and three new reads. It comes last and can be cut without touching 1 to 3.

**Alternatives.**

| Ability | Status quo | Chosen | Refused, and why |
|---|---|---|---|
| Tell sessions apart | `{tool} {number}`; costs nothing; matches no window | the name Claude Code already prints, with an off switch | the first line of the conversation (not approved; needs transcripts, refused in `87d3ada9`'s dissent); a nickname the person types in Atlas (a second store, and still matches no window) |
| See work move | the Git read's file times; no new read; late | OS file notices counted per worktree, names discarded | watching `.git` too (noise from every Git command); Moving, Quiet and Stalled states (thresholds unmeasured, the Work status spec's criterion 33); counting while hidden (overturns "visible only" of `dac7de97`) |
| See load | Activity Monitor: exact, but knows no worktree | memory and CPU summed over each agent's command tree, tools named by program name, the Mac's totals | reading command lines (see Owner question); `powermetrics` (needs sudo); a per-program GPU figure (macOS gives none without root) |

**The request, challenged.** A Gradle daemon is asked for by name. It outlives its command and
its parent is the system, so it is in no agent's tree. This spec does not read its command line:
decision `87d3ada9` says arguments are never read, and the call that returns them also returns
the process's environment. The daemon is placed by its working folder instead, if the probe in
criterion 1 shows that works, and is otherwise shown as Java.

## Flow

1. When the person opens Work status with three Claude Code sessions in one checkout, Atlas shows
   one room with a line per session: its name, what it says of itself, and for how long. The room
   is framed in amber if any line waits, and that line is first.
2. When a session has no usable name (none, empty, not text), its line reads `{tool} {number}`.
3. When the person switches Show session names off, every name leaves the screen at the next
   draw and Rust drops the names it held. Switched on, names return within one list read.
4. When an agent saves a tracked file in a worktree, that room's light flashes once within about
   2 s, its bezel says "changed just now", a tick joins the last-hour line, and the file's name
   follows from the next Git read.
5. When a build writes only ignored output, the pulse stays still and the room's load shows the
   CPU the build uses: the two together say "building, not editing".
6. When the person presses a room, the panel lists its sessions, its file changes and its load by
   tool, and one line for this Mac.
7. When macOS reports memory pressure, or CPU or GPU stays full for 30 s, the header says so in
   amber. Pressing the memory or CPU words outlines the rooms using the most; the GPU words
   explain that macOS names no program for it.
8. When the evidence is missing, Atlas says less, never more: a failed load sample shows
   `load.failed` in the panel and no header warning; a Mac that reports no GPU figure shows none;
   a folder macOS cannot watch shows `pulse.unwatched` and keeps the Git read's times.
9. When an agent's own report disagrees with the folder (the session says busy and no file has
   changed for ten minutes), Atlas shows both facts side by side and names no state from them.

## States

| State | Web | macOS app |
|---|---|---|
| Any state below | Out of scope — the page is the one card `workStatus.web.title` and `.web.body` with Get the app; a browser cannot read a session list, processes or OS file notices | see each row |
| Empty: no session in a room | Out of scope — same web card | no session lines; the room's words as today; the panel has no Sessions section |
| One session | Out of scope — same web card | its name in place of `{tool} {number}` on the bezel, floor plate and mini room, with `session.name` beside it in muted ink; the panel lists the one line |
| Two or more sessions in a folder | Out of scope — same web card | the bezel says `room.sessions`; the screen lists up to three lines under the branch, then `sessionLine.more`; the panel lists all under `panel.sessionsTitle` |
| A session with no name; names switched off | Out of scope — same web card | `session.name`; the reads panel says `names.off` |
| Session list off or unreadable | Out of scope — same web card | as today (`sessions.chip.off`, `.unreadable`); no names; the names row says `names.needsList` |
| Loading: first pulse or load read not in yet | Out of scope — same web card | no light flash and no tick; the panel's Load says `panel.reading`; nothing waits on them |
| A counted change under a minute old | Out of scope — same web card | the light flashes once per answer that carries a new change; `monitor.lastChangeNow`; `pulse.lastMinute` on the wall facts and in the panel |
| No counted change in the last hour | Out of scope — same web card | no tick; the panel says `pulse.none` and `pulse.onlyOpen` |
| Files change in a room no agent holds | Out of scope — same web card | the room stays where it is; its status line says `pulse.noAgent` |
| Error: a folder macOS cannot watch | Out of scope — same web card | `pulse.unwatched` in the panel; times from the Git read as today |
| Pulse switched off | Out of scope — same web card | no flash, no ticks; the reads panel says `pulse.off` |
| Load shown | Out of scope — same web card | `load.fact` on the wall facts of a stage room at least 600 px wide when it holds 1 GB or one core; in the panel `load.room`, up to five `load.groupLine`, `load.moreGroups`, then `load.mac` |
| Partial: the agent runs in another room | Out of scope — same web card | the room's own commands, and `load.agentElsewhere` |
| Partial: no GPU figure | Out of scope — same web card | `load.macNoGpu` and `load.gpuMissing` |
| Error: a load sample failed | Out of scope — same web card | `load.failed`; no header warning |
| Load switched off | Out of scope — same web card | no load anywhere; the reads panel says `load.off` |
| Memory low; CPU full; GPU full | Out of scope — same web card | `header.memory`, `.cpu`, `.gpu` among the header's amber parts; pressing memory or CPU outlines the three rooms using the most of it; GPU is words with `load.gpuWhy`, since no room can be named |
| The merged list | Out of scope — same web card | `landed.title` and `.note` as below |
| Largest measured: 34 worktrees; fixtures of 40 | Out of scope — same web card | six stage rooms and the floors as today; every room is watched; a panel lists at most 20 session lines |
| Windows or Linux app | Out of scope — same web card | no names, pulse or load, and nothing says so, as with the session list today |

## What is read, kept and shown

This table is the contract between the Rust readers and the page, and the edge of what leaves Rust.

| Read | When | Kept in Rust memory | Reaches the page | Never |
|---|---|---|---|---|
| A session's `name` | with each session-list read, names on | with the last list | on that session's row: one line, at most 60 characters, control and direction-override characters removed; absent when not a string or empty | a file, log, error text, storage, URL, an argument sent back to Rust, an agent session, the network; `sessionId`, `id` |
| File-change notices for the folder of each worktree drawn as a room | visible, pulse on | per worktree: the time of the last counted change, counts per 10 s step for 60 min (99 at most), and a one-way hash of each path Git already judged (4,096 at most) | per worktree: that time, those counts, whether it is watched | a file opened or stat'ed; a name or path; shelf worktrees; any folder Git does not list for this repository |
| Memory, CPU time and program name of each process under an agent program; memory, CPU time and working folder of a process named `java` outside every tree | every 5 s, visible, load on | the previous sample | per worktree: memory, CPU in cores, and at most five groups (group, count, memory, CPU) plus the rest; groups outside every room | arguments, environment, open files; a path; a name outside the closed list; a pid the page does not already hold |
| This Mac: memory in use and macOS's own pressure level, CPU in use, the GPU's "Device Utilization %" (the highest accelerator) | the same sample | the previous sample | those numbers; no GPU number when none is reported | a per-program GPU figure; `powermetrics`; any spawned program; root |

**A counted change** is a notice whose path is not under `.git`, not under a fixed list of
dependency and build folder names (`node_modules`, `target`, `.next`, `out`, `dist`, `build`,
`.gradle`, `DerivedData`, `Pods`, `.venv`, `__pycache__`, `coverage`), and not ignored by Git. The
fixed list is checked first and costs no call. Git gives the verdict for the rest, through the
hardened runner, at most once per worktree in 10 s and never twice for one path until that
worktree's `.gitignore` changes; a path is counted when its verdict arrives.

**Whose load.** A process counts once: for the worktree its own working folder lies in, else for
the worktree of its nearest ancestor that has one. The agent program counts for the room its own
folder is in. **Tool groups**, by program name: Agent programs (`claude`, `codex`), Node.js
(`node`), Rust build (`cargo`, `rustc`, `rustdoc`, `clippy-driver`), Java (`java`), Xcode build
(`xcodebuild`, `clang`, `swift-frontend`, `ld`), Python (`python3`, `Python`), Git (`git`), Other
programs. A `java` process outside every tree is called a Gradle daemon when its working folder
is Gradle's own daemon folder, and counts for a worktree while its working folder lies in one;
both rest on what criterion 1 sees. The list is a first guess that criterion 1 corrects. **CPU**
is said in cores: 1.0 is one core busy for the whole sample.

**Budgets, counted not timed** (`.claude/rules/testing.md:54`, `:58`). One load sample: one
process listing, one usage read per process under an agent (not per process on the Mac), three
reads for the Mac, no spawned program, no file. The pulse: one watcher for every room; no Git
call for a path on the fixed list or already judged; the page asks every 2 s while visible and
Rust answers from memory, so every notice between two asks arrives as one answer. Product budget,
printed from the installed app and never asserted: under 1 % of one core over a minute with 40
worktrees, and the memory the watcher adds.

**The header warns** on macOS's pressure level at warning or critical for two samples, or CPU or
GPU at 90 % or more for six (30 s), and stops after six samples below. 90 %, 30 s, 1 GB and one
core are guesses; each is one named constant.

## Design

The owner's rules hold: live facts over scenery, no empty space filled, Moru stays small. Nothing
here adds art, a chart or a card. Tokens and motion follow `.claude/rules/design.md`; `/ui-build`
settles pixels.

- **A session line** is one row of text: the session's ink mark, its name, `{tool} {number}` in
  muted ink, its state in the state's tone, and a time. The time is "for {n} min" from the read in
  which Atlas first saw that state; when the state was already so at the first read, it is the
  session's start (`session.started`). Waiting lines come first, then failed, working, replied.
  In a room where a session only runs commands, its line says `sessionLine.workingHere`.
- **The pulse has one meaning:** a flash of the room's light says a counted change arrived in the
  last answer. It is a one-shot, at most once in 2 s, never a loop, and no frame is drawn between
  answers that carry nothing. A mini room gains the same light at the start of its status line
  while a change is under a minute old. The last-hour line gains, under its marks, a tick for
  each 10 s step that had a change, in three heights (1, 2 to 5, 6 or more).
- **Reduced motion:** no flash and no rising tick; the light is steady, the tick is simply
  there, and `monitor.lastChangeNow` and `pulse.lastMinute` carry the same fact in words.
- **A counted change is a sign of work:** it keeps a held room from dozing
  (`src/shared/lib/work-status/work-tracks.ts:363-367`) and makes that worktree's Git read due,
  still at most once in 10 s. It promotes no room and names no new state.
- **The reads panel** is the panel the session-list words already open, retitled `reads.title`,
  with four rows: the session list, names, file changes, load. Each row has a switch (all on by
  default), what is true now, and one sentence of what is read and what never is. The choices
  live where the first one does (`src/shared/lib/preferences/work-status-preferences.ts:9-10`),
  and Rust holds each choice too, as it does today.

## Copy

Namespace `workStatus`. The Korean strings are in the pull request body and
`messages/ko/workStatus.json`, since documents stay English
(`.claude/rules/documentation.md`). The Korean catalogue says "merged" with the word its rooms
and shelf already use.

| Key | Where it appears | English |
|---|---|---|
| `sessions.chip.on` | header | Session list on (unchanged; only the Korean changes, from "being read" to "on") |
| `landed.title` | heading of the merged list | Merged into <code>{branch}</code> |
| `landed.note` | under that heading | One line is one merged pull request; a commit pushed without one is a line too. Atlas reads this Mac's copy of the branch, so a change you have not pulled yet is not listed. |
| `landed.none` | empty merged list | Nothing has been merged into {branch} yet. |
| `landed.landedAt` | change panel | Merged {ago} · {time} |
| `landed.commitsTitle` | change panel | Commits in this change |
| `landed.squashed` | change panel | It was merged as one commit, so there are no separate commits to show. |
| `landed.unreadable` | change panel | Atlas could not read this change's commits and files from Git. Close it and open it again to retry. |
| `reads.title` | reads panel heading | What Work status reads on this Mac |
| `names.switch` | reads panel | Show session names |
| `names.status` | reads panel, names on | A room shows the name {tool} gives each session, so you can match it to the terminal or window it runs in. A name can be a title {tool} wrote from your conversation. Atlas keeps names in memory while Work status is open; it never writes them to a file or a log, sends them anywhere, or gives them to an agent. |
| `names.off` | reads panel, names off | Atlas does not read session names. Rooms call a session by its tool and number, such as {example}. |
| `names.needsList` | reads panel, list off | Session names come from the session list, which is off. |
| `room.sessions` | bezel, two or more sessions | {count, plural, one {# session} other {# sessions}} |
| `panel.sessionsTitle` | room panel | Sessions in this folder |
| `sessionLine.workingHere` | session line | Running a command here |
| `sessionLine.forMinutes` / `.forHours` | session line | for {count} min / for {count} h |
| `sessionLine.more` | after the listed lines | {count, plural, one {and # more session} other {and # more sessions}} |
| `pulse.switch` | reads panel | Watch file changes |
| `pulse.status` | reads panel, pulse on | While Work status is open, macOS tells Atlas each time a file changes in one of this repository's worktrees, and Atlas counts the changes. It does not open the files and keeps no file name. Changes inside .git and to files Git ignores are not counted. Counts stay in memory for an hour. |
| `pulse.off` | reads panel, pulse off | Atlas does not watch for file changes. A room shows a change the next time Atlas reads Git, up to a minute and a half later. |
| `panel.pulseTitle` | room panel | File changes |
| `pulse.lastMinute` | wall facts, room panel | {count, plural, one {# file change} other {# file changes}} in the last minute |
| `pulse.lastHour` | room panel; the last-hour line's label for a screen reader | {count, plural, one {# file change} other {# file changes}} in the last hour |
| `pulse.onlyOpen` | room panel | Atlas counts only while Work status is open. |
| `pulse.none` | room panel | No file change was counted here in the last hour. |
| `pulse.noAgent` | status line of an unheld room | Files are changing here, and Atlas sees no agent in this folder. |
| `pulse.unwatched` | room panel | macOS could not watch this folder, so this room shows a change only when Atlas reads Git. |
| `load.switch` | reads panel | Read memory, CPU and GPU use |
| `load.status` | reads panel, load on | Every 5 seconds while Work status is open, Atlas reads how much memory and CPU each agent and the commands it started are using, and how busy this Mac's memory, CPU and GPU are. It reads each program's name, never its command line. Nothing is written and nothing leaves this Mac. |
| `load.off` | reads panel, load off | Atlas does not read memory, CPU or GPU use, so no room or heading shows them. |
| `panel.loadTitle` | room panel | Load |
| `load.room` | room panel | Memory {memory} · CPU {cores} of {total} cores |
| `load.fact` | wall facts | {memory} · CPU {cores} cores |
| `load.groupLine` | room panel, one per tool | {tool} ×{count} · {memory} · CPU {cores} |
| `load.tool.agent` / `.node` / `.rust` / `.java` / `.gradleDaemon` | `{tool}` above | Agent programs / Node.js / Rust build / Java / Gradle daemon |
| `load.tool.xcode` / `.python` / `.git` / `.other` | `{tool}` above | Xcode build / Python / Git / Other programs |
| `load.moreGroups` | after five tools | {count, plural, one {and # more kind} other {and # more kinds}} |
| `load.agentElsewhere` | room panel | {who} itself is counted in {branch}, the folder it was started in. This room counts only the commands it runs here. |
| `load.none` | room panel, nothing running | No agent program is running in this room, so there is no load to show. |
| `load.outside` | room panel, under the Mac's line | Running outside every room: {list} |
| `load.mac` | room panel | This Mac: memory {used} of {total} · CPU {cores} of {coreCount} cores · GPU {gpu}% |
| `load.macNoGpu` | room panel | This Mac: memory {used} of {total} · CPU {cores} of {coreCount} cores |
| `load.gpuWhy` | hint beside the GPU figure | macOS reports GPU use for the whole Mac. Naming the program that uses it needs administrator rights, which Atlas does not ask for. |
| `load.gpuMissing` | room panel | This Mac did not report GPU use. |
| `load.failed` | room panel | Atlas could not read load from macOS just now and tries again in 5 seconds. Everything else in this room is unaffected. |
| `header.memory` / `.cpu` / `.gpu` | header, amber | Memory is running low / CPU is full / GPU is full |
| `header.pointToLoad` | title of the memory and CPU words | Show the rooms using the most |

## Edge cases

- **Zero, one, largest.** No session: no lines. One: the name on the bezel. Seven in one folder:
  three lines and `sessionLine.more` on the screen, all seven in the panel. 40 worktrees: every
  room watched by one watcher; load summed over agent trees only, so 600 other processes add one
  listing and no usage read.
- **A name.** Hangul, emoji and right-to-left text are kept and cut at 60 characters, never
  inside a Hangul syllable; a line break ends it; a name of only removed characters is no name. Two
  sessions with one name are told apart by `{tool} {number}` beside it. A name is plain text: it
  is never parsed, linked or passed on, whatever it says.
- **First run.** All three reads are on, and the reads panel, one press from the header, says
  what each reads. No new macOS permission is expected, since Atlas already reads these folders
  through Git; criterion 8's walk confirms no prompt appears.
- **A moved, renamed or removed worktree.** Its watch ends with the next worktree read and its
  counts are dropped; a new folder starts from nothing. A missing folder is not watched.
- **Hidden, then shown.** The watcher and the sampler stop while Work status is hidden. Shown
  again, the counts it had are still there, the hidden stretch has no ticks, and the panel says
  `pulse.onlyOpen`; the first load sample has no CPU figure, so the panel reads `panel.reading`
  for one interval.
- **A burst.** Ten thousand writes in an ignored folder cost no Git call and count nothing. More
  than 99 changes in a step read as 99. When macOS reports it dropped notices, that step counts
  one change and nothing is rescanned.
- **Two things at once.** A switch turned off while a read is in flight: the answer is dropped.
  Two samples never run together. A process that exits between the listing and its read is skipped.
- **Sampling fails.** One failed read fails that sample only; the last good numbers are not shown
  as current.
- **Offline.** Nothing here uses the network.
- **A person editing by hand.** Their saves count like an agent's; the room with no agent says
  `pulse.noAgent`.

## Out of scope

- Reading transcripts, showing the first line of a question, a model's name, and Codex's
  questions: not approved by the owner.
- Reading a process's command line or environment: see Owner question.
- A GPU figure per program or per room: macOS gives none without administrator rights.
- Stopping, slowing or reordering anything: this round only reads (the coordination spec's
  slices 13 to 16).
- Moving, Quiet, Stalled and Idle states, the rail tile's count and reads while hidden: the Work
  status spec's slice 3, which waits for its criterion 33.
- Disk use and build-folder sizes; hooks by open files (the coordination spec's slice 12).
- The pulse and load on Linux and Windows: the watcher costs differently there and the load
  reads are other APIs.
- The web: no session list, processes or OS notices exist in a browser.
- New Moru art or poses; sound.

## Slices

Four slices with no file in common. A goes first, then B and C side by side, then D, all through
one integration branch, so `main` receives words, rules and code together. Within each slice the
work follows the ranking: merged list, session lines, pulse, load. Load can be dropped from B, C
and D without touching the rest.

| Slice | Owns | Builds alone because |
|---|---|---|
| **A. Copy, rules, documents** | `messages/en/workStatus.json`, `messages/ko/workStatus.json`, `.claude/rules/surfaces.md`, `.claude/rules/local-first.md`, `docs/features/work-status.md`, change records | the merged list's new words need no code (`landed.note` takes no new argument); other new keys wait unused |
| **B. Rust readers** | `src-tauri/src/work_status/**` (new `file_pulse/` and `load/`, the session parser, the process read), the registration lines in `src-tauri/src/lib.rs`, and `src-tauri/Cargo.toml` only to name a crate the lockfile already holds | each reader is a command with its own tests; no page calls it yet |
| **C. Page model** | `src/shared/lib/work-status/**`, `src/shared/lib/preferences/work-status-preferences.ts` and its test, `src/views/work-status/model/**` | written against the contract table above, with the bridge stubbed in tests |
| **D. Screen** | `src/widgets/work-tracks/**`, `src/views/work-status/ui/**`, a motion part under `app/styles/` with its line in `docs/DESIGN-SYSTEM.md`, `tests/e2e/work-status-*.spec.ts` | built on C with a stubbed bridge; `/ui-build`, and `/ui-proof` for the flash |

## Acceptance criteria

1. **Probes, before any code in slice B.** Given this Mac with at least four live Claude Code
   sessions (one renamed by the person, one never renamed, one started from the desktop app, one
   in the background) and a Gradle build started in a worktree of a repository that has one,
   when the probes run, then they
   print for each session the shape of `name` at start and after one prompt (present, type,
   length, whether it is the folder name with a suffix; never the text), and for the Gradle
   daemon and each heavy tool its program name, parent and working folder during and after the
   build. It passes when the 60-character rule and the tool-group list cover every shape seen and
   the daemon's folder lies in the worktree while it builds; otherwise this spec changes first,
   and a daemon that cannot be placed is shown as Java. Checked: the probes' output, attached to
   the pull request.
2. **A name stays on the screen.** Given a session list whose `name` is `ATLAS_PLANTED_7f3c`
   followed by 500 characters, a line break and a direction override, then the row carries at
   most 60 characters on one line with neither; with names off the row carries no name and Rust
   holds none; the planted text is in no log, no file under the app's data folder, no storage
   key, no URL, no argument the page sends and no line sent to an agent session; `sessionId` and
   `id` still reach no value. Checked: `src-tauri/src/work_status/agent_sessions/tests.rs`,
   `src/shared/lib/work-status/signals/sessions.test.ts`, `tests/e2e/work-status-rooms.spec.ts`.
3. **Session lines.** Given a stubbed bridge with one, three and seven sessions in one checkout
   (one waiting for approval, one busy, one replied, one unnamed, one with a 40-character Hangul
   name), then one session puts its name on the bezel; three give three lines, each with its own
   state, the waiting one first and the room framed in amber; seven give three lines and
   `sessionLine.more`, and the panel lists seven; the unnamed one reads `{tool} {number}`; no
   line wraps or overflows in a 300 px mini room or a 1512 px window. Checked:
   `signals/sessions.test.ts`, `tests/e2e/work-status-rooms.spec.ts`, a `pnpm ui:look` capture.
4. **The pulse counts what Git tracks, and nothing else leaves.** Given a temporary repository
   with 40 worktrees: a file saved in worktree A adds one to A and to no other; writes under
   `.git`, `node_modules/`, `target/` and a path its `.gitignore` names add nothing; 10,000
   writes to an ignored folder make no Git call; 500 writes to tracked files in one step read 99
   with at most one Git call for that worktree in 10 s; the reader opens no file; a file named
   `ATLAS_PLANTED_7f3c.txt` is in no payload, log or file; hidden, no watcher is alive; switched
   off, none is alive and no count is held. Checked:
   `src-tauri/src/work_status/file_pulse/tests.rs`.
5. **The flash is evidence.** Given scripted answers for 6 and 40 rooms: a light's flash starts
   only in a frame after an answer that carries a new change for that room, at most once in 2 s;
   a building with no new change draws no frame between answers; no frame interval passes 50 ms;
   under reduced motion nothing moves and `pulse.lastMinute` changes. Checked:
   `tests/e2e/work-status-pulse-motion.spec.ts`; the recording `/ui-proof` asks for.
6. **Load: whose it is, what it costs, and what a failure shows.** Given an agent stub with a
   child in worktree A that holds 200 MiB, a grandchild working in a temporary folder and an
   unrelated process: A's memory rises by at least 150 MiB, the grandchild counts for A, the
   unrelated one for no room; `ATLAS_PLANTED_7f3c` planted in an argument and an environment
   value is in no payload or log; an unlisted program counts as Other programs; one sample makes
   one listing, one usage read per process under an agent whether 10 or 600 others run, three
   reads for the Mac, no spawn and no file; with no GPU figure the rest stands; a failed read
   gives `load.failed` and no header warning; the header warns only after six samples at or over
   90 %. Checked: `src-tauri/src/work_status/load/tests.rs`,
   `src/shared/lib/work-status/signals/load.test.ts`; a printed measurement from the installed
   app with 40 worktrees.
7. **Licenses.** Given the finished branch, then `src-tauri/Cargo.lock` gains no `[[package]]`,
   `pnpm licenses:check` and `pnpm notice:check` pass, and no `// Adapted from` marker is added:
   the readers call macOS's own APIs (`libproc`, Mach, IOKit, CoreFoundation) through crates
   already locked or through declarations written here. Should a crate prove unavoidable, the
   pull request names it, its SPDX license from the permitted list, and why the system API did
   not serve, and commits `pnpm notice:build`'s output. Checked: those commands' output in the
   pull request.
8. **Words, the web, and switching off.** Given the built app in Korean and English: the merged
   list shows `landed.title` and `landed.note`, and both catalogues hold every key of Copy with
   equal arguments; `/work-status` on the web still shows the card and none of the new parts; and
   the recovery proof: each of the three new switches, turned off, removes its part within one
   read while Rust holds no name, count or sample, and turned on restores it within one interval;
   the choice survives a restart; and macOS shows no permission prompt on the first open.
   Checked: `tests/contract/messages/`, `tests/e2e/web-surface-smoke.spec.ts`,
   `tests/e2e/work-status-rooms.spec.ts`, a walk through the installed app with captures attached.

## Risks

Assume it shipped and failed. The three likeliest reasons:

1. **A name shows more than the person wants on a shared screen or in a screenshot,** because
   Claude Code wrote it from the conversation. Answer: the switch sits in the panel that explains
   the read, one line of 60 characters, nothing kept or sent (criterion 2). Falsifier: the owner
   turns names off within a week.
2. **The pulse says nothing the room did not already say, or misleads:** it flashes for a
   person's own save, or stays still for a tool that writes only ignored files. Answer: it is
   named a file change and never "the agent is working"; `pulse.noAgent`; load shows the build
   beside a still pulse; criterion 8's walk is where the owner says whether the flash helped.
3. **Load points at the wrong room or cries wolf:** one agent program serves many rooms, a Gradle
   daemon belongs to none, and 90 % is a guess. Answer: `load.agentElsewhere` and `load.outside`
   say what is not attributed; memory warnings use macOS's own level; criteria 1 and 6; and load
   is the part that can be cut without the others.

## Later

1. Tool names from command lines (Vitest, Playwright, a Gradle daemon by its class): next when the
   owner answers yes below, or when "Node.js" and "Java" prove too coarse in criterion 1.
2. Moving, Quiet and Stalled from the pulse and CPU: next when the Work status spec's criterion
   33 has its sitting.
3. Counts while Work status is hidden, and the rail tile's number: next when the gaps in the
   hour are reported as a problem.
4. Memory and CPU on each session line: next when two sessions in one room need telling apart by
   load.
5. A Codex session's name and state: next when Codex has a list to read.
6. The pulse and load on Linux and Windows: next when someone uses Work status there.
7. Acting on load (background priority, stop): the coordination spec's slices 13 to 16.

## Owner question

May Work status read the command line of a `node` or `java` process, to say "Vitest" or "Gradle
daemon" instead of "Node.js" or "Java", knowing that the one macOS call that returns a command
line also hands Atlas that program's environment variables, which Atlas would discard unread?

This spec is built on **no**: decision `87d3ada9` says arguments are never read, and the owner's
approval of 2026-11-25 named what to show, not this read. A yes adds Later 1 with its own
decision record and changes nothing else here.

## Rules and records

The lead creates three decision records with `pnpm record:new` before slice B starts; their
texts are in the pull request. Each names what it amends:

- **Session names** amends `929c2179`: `name` is read; `sessionId` and `id` are not.
- **File-change notices** builds a narrowed form of Record 4 as drafted in
  `docs/specs/2026-11-22-work-status-criteria.md:375` and keeps "visible only" of `dac7de97`.
- **Load** extends `87d3ada9` with memory, CPU time and program name, adds the Mac's totals and
  the GPU figure, and keeps arguments, environment and open files unread. If criterion 1 cannot
  place a Gradle daemon by its folder, the record is created without the `java` sentence.

Slice A changes this rule text:

- `.claude/rules/surfaces.md:126-142` (the fifth exception): `name` leaves "Never read"; a row
  says when it is read, its 60-character form and where it may not go; the gate names the new test.
- `.claude/rules/surfaces.md:94-107` (the third exception): "Read" gains memory, CPU time and
  program name for processes under an agent, the `java` read, and the Mac's totals; "Returned to
  the page" gains the per-worktree and per-group totals; "Never read" stays.
- `.claude/rules/surfaces.md`: a sixth exception, "Watching the repository's worktrees for file
  changes", with the table of this spec's contract row.
- `.claude/rules/local-first.md:44-47` says two read-only exceptions exist while
  `surfaces.md` lists five; it should point there without a count.
- `.claude/rules/forbidden.md:58` needs no change: the pulse opens no file and watches only
  folders Git lists for the chosen repository.
- `docs/features/work-status.md:88` ("Its name and ids are dropped") and `:356-358` ("Not yet:
  processes, hooks, load") change with what ships, and "Landed work" (`:311`) takes the new words.

## Revisions

- 2026-11-25: first draft.
- 2026-11-25: a `java` process outside every agent tree also reports CPU time, so a Gradle daemon's build load shows (`docs/records/decisions/2026-11-25-work-status-java-cpu-d400da6f-da60-48b3-b9fe-cf0fbd202bb6.md`).
