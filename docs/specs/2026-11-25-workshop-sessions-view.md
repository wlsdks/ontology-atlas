---
title: "Workshop: a view by session"
doc_type: spec
status: draft
area: git
date: 2026-11-25
decisions: []
---

# Workshop: a view by session

A second arrangement of the Workshop screen (`/work-status`; Work status in the code and in
`docs/features/work-status.md`): the same reads, drawn one session at a time instead of one folder
at a time. First slice only. "Folder" means what a room is today: a worktree or the main checkout.

## Person and moment

The owner, a developer who runs several Claude Code sessions at once, many of them in the main
checkout or sharing one worktree, and opens Workshop to decide where to step in. On 2026-11-25, in
the installed app (v2.7.9), the owner saw one room for a worktree that held two sessions: its bezel
gave only their count (`room.sessions`, `messages/ko/workStatus.json:125`) and its screen had one
line per session. The owner's words, translated from Korean: "Is it impossible to show what's
running per session rather than per worktree? Is worktree the only option?" The owner then chose
to have this spec written.

Not observed: a capture of that screen; how many sessions the owner runs in one repository (the
one count is five on the Mac, one in this repository,
`docs/specs/2026-11-25-work-status-live.md:29-31`); how often one session holds several worktrees.
Criterion 1 captures these before any code. Nobody learning coding agents, and nobody who does not
write code, has been watched here; these questions are written at the owner's standing request.

| Reader (not observed) | By session must answer |
|---|---|
| A person who does not write code | How many agents are working for me, what is each called, and which one needs me now? |
| A developer | Which session, by the name my terminal shows, waits, works or is done, for how long, on which branch, and who else is in that folder? Which worktrees does one session hold? |

## Today

Read in the code at `origin/main` (`bdbc7b2b1`). Commit `7c6ccd56d`, which makes a room say each
fact once, was not on `main` yet; this spec follows that rule.

- **A room is a folder:** one room per worktree
  (`src/shared/lib/work-status/work-tracks.ts:486-495`, `messages/en/workStatus.json:268`).
- **A session already exists in the page's model,** with a tool, start, pid, number, ink and the
  worktrees it holds (`work-tracks.ts:45-56`, `:186-220`). It is drawn only as a line in a room
  (`src/shared/lib/work-status/signals/session-lines.ts:70-105`), as the bezel's name or count
  (`:115-118`), and as a band once more than six mini rooms stand below
  (`src/widgets/work-tracks/model/building-layout.ts:70`, `:228`).
- **In a shared folder one session stands for the room:** the program with the lowest pid
  (`work-tracks.ts:107-109`, `src-tauri/src/work_status/worktrees.rs:543-545`). The room's ink and
  the time "working" on its wall are that one session's
  (`src/widgets/work-tracks/ui/WorkBuilding.tsx:44-45`,
  `src/widgets/work-tracks/ui/use-room-copy.ts:192-200`, `:430`).
- **What the page holds for a session.** From Claude Code's list: worktree, pid, one of five
  states, name (`src/shared/lib/work-status/tauri-work-status.ts:78-89`). From the process read:
  pid, tool, start (`:9-15`). From a lock: pid, start (`:17-26`). An Atlas agent session has a pid
  and no start (`:41`, `work-tracks.ts:294`). A listed session whose folder lies in no worktree of
  the repository never reaches the page (`src-tauri/src/work_status/agent_sessions.rs:244-248`).
- **What belongs to a folder.** Commits and uncommitted files are read by worktree id
  (`src-tauri/src/work_status/mod.rs:148-156`). A file-change notice carries a kind and paths, no
  process (`src-tauri/src/work_status/file_pulse.rs:214-236`). Load is summed per worktree
  (`src-tauri/src/work_status/load.rs:60-67`); the load read finds the agent above each process
  (`src-tauri/src/work_status/load/attribute.rs:186-208`) but sends it only as a note
  (`:233-244`), so no payload carries load per session.
- **Two sessions of one tool raise no warning:** a folder's tools are a set
  (`work-tracks.ts:132-138`, `:431`, `src/views/work-status/ui/WorkStatusPage.tsx:91`).
- **Choices, web, vault.** Choices live in browser storage under `atlas.workStatus.*`
  (`src/shared/lib/preferences/work-status-preferences.ts:9-19`). The web draws one card
  (`WorkStatusPage.tsx:124`). The vault has no concept for Work status (32 capabilities read).

Unknown: `docs/PRODUCT-DIRECTION.md` beyond line 60 (not read); whether Claude Code's list ever
places a session in a folder its program is not in (not seen).

## Problem and alternatives

**The problem, inferred from Today.** The owner steps into a session, a terminal to answer; the
thesis's moment is "whether to intervene" (`docs/PRODUCT-DIRECTION.md:24-27`). The screen's unit
is the folder. Where one session has one folder the two agree. They part twice: several sessions
in one folder become one room with a small line each (the owner's case), and one session with
several worktrees becomes several rooms tied together only by ink.

**What a session can truthfully say.** Every later section keeps this limit.

| Fact | Whose it is | Why |
|---|---|---|
| Name, tool and number, ink; when it started | the session's | the list, a lock and the process read give them per pid |
| State (waiting, working, finished replying, failed) and since when | the session's, for Claude Code | only Claude Code has a list |
| The folders it stands in, holds by lock or runs commands in, and who shares each | the session's | the three reads, joined by pid |
| Commits, uncommitted files, last change, file-change counts | the folder's | Git and macOS name a path, never a session |
| Memory and CPU | the folder's today | the session's own command tree, summed by Rust for the pids the page sends (Later 1, built) |

**Ranked by what the owner gets back against its cost:** the session as the unit on screen comes
first, since every fact is already on the page and no read changes. Later 1 to 4 follow in order.

| Way to see sessions | What it gives | What it costs, and why it lost |
|---|---|---|
| Status quo: rooms by folder, a line per session | nothing to build; a folder's changes in one place | what the owner saw and asked past; a session with five worktrees is five rooms |
| Replace: a room per session | the owner's unit everywhere | a shared folder's files drawn once per session, or split by a guess; folders nobody holds lose their place |
| Session panes inside a shared room | a folder's changes stay once | the unit is still the folder; a session with several worktrees stays scattered |
| A strip of sessions above the building | no mode | every session fact said twice, against `7c6ccd56d` |
| **Chosen: a switch on the same screen, By folder (the default) and By session** | the owner's unit on request; By folder untouched | a second arrangement to keep true (Risk 3) |

**The request, challenged.** "Per session" is the cause, not a symptom: the unit is wrong for how
the owner works. What it cannot give is "what this session changed", since no read says that. So
By session shows a folder's changes only where one session has the folder to itself, and says
"shared" elsewhere. Nothing changes for a person who stays in By folder.

## Flow

1. When the person opens Workshop, Atlas draws it by folder, as today, with a two-part switch in
   the header: **By folder** (pressed) and **By session**.
2. When the person presses By session, Atlas draws one block per session at work in the
   repository's folders, keeps the header and the merged list in place, and remembers the choice.
   Pressing By folder brings the building back as it was.
3. When a session has a folder to itself, its block gives that folder's commits, uncommitted files
   and last change under the branch. When sessions share a folder, each has its own block with its
   own state and time; the folder's row says **Shared with …** and gives no figure. Pressing a row
   opens that folder's panel: its changes once, and **Sessions in this folder**.
4. When one session holds several worktrees, its block lists three and then "and 2 more
   folders"; pressing that goes to By folder with that session's rooms outlined.
5. When a session starts waiting for the person, its block is framed in amber and says so with how
   long. It does not move, and the header's count outlines it.
6. When the evidence is missing (session status off or not read, or a tool with no list), Atlas
   says less: the block is named `{tool} {number}`, says **Working** while its program is seen in
   a folder, and gives no time. The header's existing words say why.
7. When a session's word and its folder disagree (it says Working; the folder last changed 25
   minutes ago), the block shows both and names no state from them.

## States

| State | Web | macOS app |
|---|---|---|
| Any state below | Out of scope — the page is the one card `web.title` and `web.body` with Get the app; a browser reads no session, and no switch is drawn | see each row |
| No repository chosen, unreadable, not a repository, Git missing | Out of scope — same web card | as today (`choose.title`, `unreadable`, `notRepository`, `atlasGit.install.*`); no switch |
| Loading: the first read is not in | Out of scope — same web card | the page title; the switch comes with the first read, and a name and state within one list read |
| Empty: no session | Out of scope — same web card | `bySession.none.title` and `.body`; the switch; `bySession.withoutSession`; the merged list |
| One session | Out of scope — same web card | one block; its folder's figures under the branch; pressing the row opens the folder's panel |
| Sessions sharing a folder | Out of scope — same web card | a block each; that folder's row reads `bySession.shared` (one other) or `.sharedMany`, with `room.twoTools` in amber when the tools differ; pressing it opens the folder's panel |
| One session, several worktrees | Out of scope — same web card | three rows, then `bySession.moreFolders`, which goes to By folder (`bySession.showInFolders`) |
| Waiting; failed | Out of scope — same web card | an amber frame; `room.waitingApproval`, `.waitingAnswer` or `.sessionFailed` with `sessionLine.forMinutes`; `header.waiting` outlines the block (`bySession.pointTo`) |
| Error: session status off or not read | Out of scope — same web card | blocks from the programs and locks Atlas sees: `session.name`, `room.working` or `room.resting`, no time; the header says `sessions.chip.off` or `.unreadable` |
| Partial: names off, or no name | Out of scope — same web card | `session.name` alone |
| Partial: a session whose own folder is outside the repository | Out of scope — same web card | a block only while it runs a command in one of the repository's folders: `session.name`, `room.working`, that folder; no name or list state |
| An Atlas agent session | Out of scope — same web card | `tool.acp`, `room.working`, its folder; no number, name or time |
| A lock an ended session left; a folder nobody holds | Out of scope — same web card | no block; counted in `bySession.withoutSession`, which goes to By folder (`bySession.showByFolder`); `header.cleanup` as today |
| Largest: 34 worktrees measured; a fixture of 12 sessions | Out of scope — same web card | every session a block, in rows of one height; the board scrolls; inks repeat after five, so name and number tell sessions apart |
| Windows or Linux app | Out of scope — same web card | the switch; blocks from locks and Atlas agent sessions (on Linux, programs too); no names or list states, and nothing says so |

## Design

`/ui-build` settles pixels under the owner's rules (live facts over scenery, no empty space, each
fact once). This fixes what a block holds.

- **A session block,** in the session's ink: its name with `{tool} {number}`; its state and since
  when, in a session line's words; then three folder rows at most: the folder the list places it
  in, the worktrees it holds by lock, then folders where it only runs commands
  (`sessionLine.workingHere`). Blocks in one row have one height.
- **A folder row** is the branch. A folder the session has to itself adds `room.commits`,
  `git.uncommitted` and `monitor.lastChange`, and in a block with one folder its newest commit
  subject. Each row is a button (`panel.open`) to the room panel, which is unchanged.
- **Order.** Blocks keep the order By folder numbers sessions in and never move for a state, as
  the stage does (`work-tracks.ts:434-438`).
- **The header.** `header.waiting` counts waiting sessions here, not rooms
  (`src/views/work-status/ui/WorkStatusPage.tsx:93`). Any other count names rooms, so pressing it
  goes to By folder first.
- **Not drawn in By session:** the shelf, Moru, the room light, the last-hour line and load.

## Copy

Namespace `workStatus`, written at `messages/en/workStatus.json:81-100`; Korean at the same lines
of `messages/ko/workStatus.json`, with Japanese and Chinese beside them, since every catalogue
must hold the same keys. Every other word By session shows is an existing key, unchanged.

| Key | Where it appears | English |
|---|---|---|
| `arrange.label` | the switch's name for a screen reader | Arrange by |
| `arrange.folder` / `arrange.session` | the switch's two parts | By folder / By session |
| `bySession.label` | the board's name for a screen reader | Sessions at work |
| `bySession.about` | the header hint, in By session | Each agent session is shown once, with what it says of itself and the folders it works in. Commits and uncommitted files belong to a folder, not to a session: where sessions share a folder, Atlas cannot tell which one changed a file, so that folder's changes are shown once, when you press it. Only sessions working in this repository's folders are shown. |
| `bySession.shared` | a shared folder's row, one other session | Shared with {who} |
| `bySession.sharedMany` | the same, two or more others | Shared with {count} other sessions |
| `bySession.moreFolders` | after three folder rows | {count, plural, one {and # more folder} other {and # more folders}} |
| `bySession.showInFolders` | title of that button | Show this session's folders by folder |
| `bySession.withoutSession` | under the blocks | {count, plural, one {# folder without a session} other {# folders without a session}} |
| `bySession.showByFolder` | title of that button | Show them by folder |
| `bySession.pointTo` | title of `header.waiting` in By session | Show which sessions |
| `bySession.none.title` | no session | No agent session is working in {repo} |
| `bySession.none.body` | under it | A session shows here when Claude Code, Codex or Claude Agent in Atlas works in one of this repository's folders. By folder shows every worktree. |

## Edge cases

- **Zero, one, largest.** None: `bySession.none`. One: one block. Twelve sessions, one holding 34
  worktrees: twelve blocks, that one with three rows and "and 31 more folders".
- **First run; offline.** By folder, and nothing is stored until the person presses the switch.
  Nothing here uses the network.
- **A name.** A 60-character Hangul name is cut in its line; state and time are never cut. Two
  sessions with one name are told apart by `{tool} {number}`. Nothing is typed in this slice.
- **One session, three reads.** A session known by a lock, a program and a list row is one block:
  they join by pid, as session lines do (`signals/session-lines.ts:76-78`).
- **A moved, renamed or unreadable folder.** The repository states take the page in both views. A
  worktree whose folder is gone has no session and is counted in `bySession.withoutSession`.
- **Two things at once.** The switch pressed during a read draws from what the page holds and asks
  nothing again. A room panel open at the switch stays open: it shows a folder in both views.

## Out of scope

- What a session changed, file by file: no read names a session for a change; it needs the tool's
  own record of its writes (slice 2 of `docs/specs/2026-11-21-work-status-destination.md`).
- Memory and CPU per session: a new field under the third read exception, which needs a decision
  record (`.claude/rules/surfaces.md:108`). Later 1.
- Sessions in other repositories: the list read returns only sessions in this repository's
  worktrees (`.claude/rules/surfaces.md:136`), and another project's folder names stay out.
- Moru per session: a Moru is cast for a worktree's room (`docs/features/work-status.md:383`); a
  second cast would give one session two characters across the views.
- A panel for a session, and answering a waiting session from Atlas: the folder's panel answers
  every press, and Work status sends no answer (`docs/features/work-status.md:123`).
- By session as the default, a link that opens it, sorting or filtering: each waits on criterion 8.

## Acceptance criteria

1. **The owner's work, counted before any code.** Given the owner's Mac during ordinary work, when
   Workshop is open in v2.7.9, then a capture is attached with counts only: sessions in this
   repository, folders with two or more sessions, sessions with two or more worktrees. If sessions
   and folders are one to one, this spec changes first. Checked: the capture on the pull request.
2. **One block per session, from what the page already holds.** Given two Claude Code sessions in
   the main checkout, a third holding five worktrees by lock with a Codex program running commands
   in one, one Atlas agent session, one lock an ended session left and one worktree nobody holds,
   when the session view is built, then it holds five sessions, each once and in session order;
   the two in the main checkout name each other and carry no figure of that folder; two folders
   count as without a session. Checked:
   `src/shared/lib/work-status/signals/session-board.test.ts` (new).
3. **A folder's changes are never a session's.** Given two sessions in one worktree with 12
   uncommitted files, one named `ATLAS_PLANTED_7f3c.ts`, when By session shows, then neither that
   name nor the count is in any block and both read `bySession.shared`; when the row is pressed,
   then the room panel shows the count, the name once and both sessions. A session alone in
   another worktree shows that worktree's figures. Checked:
   `tests/e2e/work-status-sessions.spec.ts` (new), on `tests/e2e/work-status-bridge.ts`.
4. **Each session says its own state, and less when the evidence is less.** Given three sessions in
   one folder (waiting for approval, working, finished replying), then each block says its own
   state and time, only the first is framed in amber, the order holds when the wait moves to
   another session, and `header.waiting` counts one and outlines that block. When the list read
   answers `failed` or is switched off, the blocks stay, named `{tool} {number}`, say
   `room.working` and show no time. With names off, a session named `ATLAS_PLANTED_7f3c` leaves
   that text nowhere on the page. With no session, the page shows `bySession.none.title` and the
   switch. Checked: the same e2e spec.
5. **Several worktrees, any width, both languages.** Given one session holding five worktrees, then
   its block has three rows and "and 2 more folders", and pressing that shows By folder with
   those five rooms outlined. Given 12 sessions at 1280 px and 1920 px in English and Korean, then
   blocks in one row have one height, no text leaves its block, and a 60-character Hangul name is
   cut while its state is whole. Checked: the same e2e spec; a `pnpm ui:look` capture of each.
6. **Nothing new is read, stored or sent.** Given the bridge's record of every command and
   argument, when By session is opened, a row pressed and the view switched back, then the page
   sent no command By folder does not send; no argument, storage key, storage value or address
   holds `ATLAS_PLANTED_7f3c` or a pid; storage gained one entry, `atlas.workStatus.arrangeBy`;
   the address is still `/en/work-status/`; the branch changes no file under `src-tauri/`.
   Checked: the same e2e spec; `src/shared/lib/preferences/work-status-preferences.test.ts`.
7. **Recovery: By folder is untouched and one press away.** Given six stage rooms and nine mini
   rooms, when the person goes to By session and back, then the same rooms stand in the same
   places and an open room panel stayed open; after a reload the last choice holds; a stored value
   that is neither `folder` nor `session` opens By folder; the web shows its card and no switch;
   every locale holds each key of Copy with equal arguments. Checked: the same e2e spec,
   `tests/e2e/web-surface-smoke.spec.ts`, `tests/contract/messages/`.
8. **The owner's moment, in the installed app.** Given the owner's Mac with two Claude Code
   sessions in the main checkout, when the owner presses By session, then each is one block under
   the name its terminal shows and the shared row reads Shared with …; the walk records the
   owner's answers to "does this show what each session is doing?" and "what does the shared row
   tell you?". Checked: an installed-app walk, captures on the pull request.

## Risks

Assume it shipped and failed. The three likeliest reasons:

1. **By session looks thin, and the owner goes back to By folder.** A session has few facts of its
   own, and nothing the size of a folder's lists fills a block. Answer: a block is sized to its
   facts, By folder stays the default, and criterion 8 asks; if the answer is "thin", Later 1 is
   next. Falsifier: By folder is the stored choice a week after the walk.
2. **A shared row is read as "nothing changed".** Answer: the row says Shared with … in words,
   never a blank; pressing it opens the folder; criterion 8 asks what it tells the owner. To
   reverse: show the folder's figures on each sharing block under "in this folder".
3. **The two arrangements drift,** or a session is counted twice, because a session is known
   through three reads joined by pid. Answer: one projection of the plan By folder already makes,
   criterion 2's fixture, and criterion 1's count checked by hand against Claude Code's own list.

## Later

1. What each session runs: memory, CPU and tools of its own command tree on its block, with a
   panel for a session. Next when criterion 8 says a block is thin; it adds a payload field and a
   record amending `43842310`.
2. A room per session in the building, with its own Moru: next if criterion 8's walk asks for it.
3. A warning when two sessions of one tool share a folder: next when such a collision is reported;
   today it would warn all day, since the owner shares the main checkout on purpose.
4. Sessions outside this repository: next when the owner asks where the other sessions are.
5. What a session changed, from the tool's own record: with the destination spec's slice 2.
6. By session as the default: next when it has been the owner's stored choice for a week.

## Owner question, answered

In By session, is a session a compact block of text, or a room in the building with its own Moru
and screen? On 2026-11-25 the owner left the choice to the lead ("decide it yourself, with the best
design and feature design you can"), and the lead chose the block: a session has few facts of its
own, so a room's screen would stand mostly empty or repeat a shared folder's files. Later 2 stays
the other answer.

## Rules and records

- **Not a one-way change.** The route stays `/work-status`; nothing new leaves the machine; no
  MCP, CLI or vault contract changes; no agent gains a write. No Rust reader changes, so no field,
  signal or send is added and no decision record is needed. It is built as product behaviour with
  `/ui-build`, and `docs/features/work-status.md` gains By session. Later 1 adds a field to a
  read, which needs a record (`.claude/rules/surfaces.md:108`).
- **Records relied on,** each rechecked against the code cited under Today: `929c2179` (what the
  list gives the page, for this repository's worktrees only); `3c8614d6` (a name reaches no
  storage key, address or argument; criterion 6 keeps it); `87d3ada9` (pid, tool and start per
  worktree); `43842310` (load per worktree); `1c163935` (file changes counted per worktree).
  `dac7de97` (the destination) is not reversed: By folder stays the default.

## Revisions

- 2026-11-25: first draft.
- 2026-11-25: the owner left the block-or-room question to the lead; the block holds.
- 2026-11-25: Later 1 built at the owner's request, without its panel: a block's third line gives
  its own command tree's memory, CPU and two heaviest program groups
  (`docs/records/decisions/2026-11-25-work-status-session-load-635500f0-5355-46c2-a37f-93d4cac16afc.md`).
