---
title: Work status
doc_type: feature
status: current
area: git
routes: [/work-status]
---

# Work status

Work status answers "which agent is holding which worktree, and is that work
merged yet?" for one Git repository, in the installed app. It is the tenth rail
destination (`g w`). The plan, its later slices and their acceptance criteria
live in [the spec](../specs/2026-11-21-work-status-destination.md); this page
describes what ships today: the spec's first slice, and from its seventh the
room that waits for its person.

## Which repository

Work status reads the repository the open folder lives in. Without an open
folder, or to read another repository, **Choose repository folder** grants a
read of the chosen folder for this launch, the same grant Changes uses. Nothing
in the repository is written.

## What it reads

Every read goes through the hardened Git runner in `src-tauri/src/git/runner.rs`
(no hooks, no fsmonitor, no lazy fetch, no transport):

- `git worktree list --porcelain -z` gives one row per worktree. A worktree
  outside the chosen folder appears only when its `.git` file and the
  repository's record for it point at each other.
- A row whose head has commits the base branch (`origin/HEAD`, else `main`,
  else `master`) does not have stands at **Working** with its commit count.
- A head with nothing beyond the base branch has **no commits beyond** it,
  naming the base branch. It is **merged**, and folds into the Merged group,
  only when its branch moved after it was created (the first entry of its
  reflog names another commit) and its head is an ancestor of the base branch
  off its first-parent line; a branch created at a merged commit that never
  moved is not merged. When the first-parent line cannot be read the row says
  it was **not measured**. The main checkout and a worktree on the base branch
  are never merged rows, and a row a live session holds stays under it.
- A lock names its holder. Claude Code writes
  `claude agent agent-<id> (pid <pid> start <time>)`; the time is the session's
  start in UTC. Atlas reads the start time of that one pid (`proc_pidinfo` on
  macOS, `GetProcessTimes` on Windows, `/proc` on Linux) and compares it with
  the reason within one second (two on Linux): a match is a live holder, a
  mismatch or a gone pid is a lock left by an ended session, and a reason it
  cannot read counts as held. The lock time is the `locked` file's modified
  time.
- An agent program at work in a worktree holds it too, lock or not. Atlas
  lists the person's own processes and keeps, for each, only its parent, start
  time, executable path and working folder; never arguments or environment.
  A process whose working folder is in a worktree counts for the agent
  program above it (`claude` or Claude Code's `versions/<version>`, `codex`),
  so the Codex app's one background server shows in each worktree a command
  of its runs in. An agent the system launched (parent launchd or init), such
  as that server, is not counted for its own folder, so an idle Codex app
  shows nothing. A worktree stays credited for 90 seconds after its last
  sighting while that agent still runs; sampling is every one to four seconds
  while the screen is visible, so a command shorter than that may be missed.
  Only an agent's own command tree has its working folder read. A command
  under an Atlas agent session counts for that session. A process of the same agent that
  locked worktrees joins that lock's session. Windows reads no processes;
  Gemini CLI runs as `node` and is not named.
- A worktree that an Atlas agent session (ACP) works in sits under
  **Claude Agent in Atlas**; so does the main checkout while such a session
  works there.

## Waiting for you

A program in a folder says an agent is there, not whether it works, has
finished its reply or has stopped to ask. Claude Code keeps that in its own
session list, and on macOS Work status reads it:

- **The call.** `claude agents --json`, the program found at
  `~/.local/bin/claude`, `/opt/homebrew/bin/claude` or `/usr/local/bin/claude`
  and nowhere else, with no input and an environment of `HOME` and Claude
  Code's switch against nonessential traffic. It runs under macOS's sandbox
  with every network operation denied, so nothing leaves the Mac; it and
  anything it started are killed when it ends, or after five seconds or one
  mebibyte of output. Why:
  [the decision](../records/decisions/2026-11-23-work-status-session-list-no-network-929c2179-7882-4c40-a4bc-83cfbb2612cf.md).
- **When.** Only while Work status is visible and a Claude Code process is
  seen: once in ten seconds, or a second after such a process appears or ends,
  never two at once. A state can therefore show up to ten seconds late.
- **What is kept.** For each session: its process id, its folder, its start
  and what it says of itself. Its name and ids are dropped as the list is
  parsed and reach nothing that is kept. A session
  counts only when its process is one Work status already shows and its folder
  lies in one of the repository's worktrees (the main checkout, a worktree
  under it, or one whose own `.git` file names this repository); the page
  receives the worktree, the process id and one of five states, and nothing is
  written.

| The session says | The room |
|---|---|
| it waits on a permission prompt or a sandbox request | **Waiting for your approval**: an amber frame, the words at the top of its screen, Moru looking up |
| it waits for input, a dialog or a worker's request | **Waiting for your answer**, drawn the same way |
| it is busy | **Working**, as before |
| it is idle | **Finished replying**: a quiet, unlit room, unless another tool works in the folder |
| a background session failed | **Session failed**, in amber |
| anything else, an unknown field, no list | the words the room had |

A waiting room is the first admitted to the stage and keeps its place in
session order. The header counts waiting rooms before its other warnings, and
pressing the count outlines them; a session's floor heading counts its own. A
waiting session is said even where an ended session left its lock in the
folder. The
room panel says where to answer: in the terminal or app that session runs in.
Work status sends no answer of its own.

### The status line and its switch

The header says how the read goes, and pressing the words opens a panel with
its switch:

| Header | The panel says |
|---|---|
| **Session list on** | that the list was read, or that no Claude Code session runs so nothing is read; then what the read is: the command, every ten seconds and a second after a session starts or ends while Work status is open, no network access, nothing written by Atlas |
| **Session list not read**, in amber | why: Claude Code was not found in the three folders, did not answer within five seconds, ended with an error, or printed a form Atlas does not know. Until a read succeeds no room can say that its session waits |
| **Session list off** | that Atlas does not run Claude Code, so no room can say whether its session waits or has finished replying |

Switched off, the page stops asking and tells the app, which holds the choice
too: an ask already on its way starts no `claude`, and the list held in memory
is dropped. Switched on again, the next read comes a second after the last one
at the soonest. Rooms go back to the words they had: a
program in a folder still reads **Working**. The choice is kept in this
browser profile's storage (`atlas.workStatus.sessionListRead`) and is on until
the person turns it off. Where the read never runs (Windows, Linux) the header
says nothing about it.

Limits: Claude Code only, the default settings folder only, macOS only. A
background session and a subagent's own wait have not been seen through this
read. A running session that is missing from the list is not counted or named.

## The building

The page is a building of rooms, one per worktree, under the page title and
**Choose repository folder**. There is no headline: beside the worktree count,
warning amber counts only what needs a person (**1 in one folder · 3 to clean
up**), and only the parts above zero. Clicking a count scrolls to the rooms it
counts and outlines them in amber for a moment. Mini rooms stand five to a row at most,
never narrower than 300px; a few that do not fill their row share the width beside them, up to 600px, so a name cuts only when it is really longer; a branch name mutes its `feat/` or `fix/` and, when
it does not fit, cuts in the middle so its ending survives. A window too short
for two rows of large rooms keeps one row on the stage. A single row of rooms
grows with their width, up to 640px and never much taller than wide, so a
stage of three rooms fills its band instead of standing short in it. The
building fades up from the page the first time it is drawn.

The **front stage** holds at most six large rooms. A folder two tools work in
goes first, then rooms where an agent or a command is running, one per session
before any session gets a second. A room a session holds while nothing runs,
then a missing folder, takes a slot only to fill the last row, so the stage has
no hole; otherwise it waits on its floor. A lock left by an ended session is a
clean-up chore and always waits as a mini room under **No session**. The stage reads in session
order. A large room is a screen over one rail: the screen says what the worktree is
doing and is the only place in the room with words, and Moru stands on the rail
facing it. There is no drawn floor, wall, console or prop. Its head is the branch (the only mono text); under it the
newest commits beyond the base branch, three, or on a one-row stage as many as
its longest list has while the window has the height (twenty rows at most for a
room alone on the stage, eight for rooms sharing it, so one long list does not
leave its neighbours' screens bare; the room panel has the rest), each one
ellipsised line with how long ago it landed; at its foot what is not committed, with the name of
the file changed last, and the commit count. The room standing on the base
branch lists that branch's five newest commits under **Recent commits**. A screen
at least 540 px wide sets two columns instead of the foot: the commits under a
line saying what they are, in at most 440 px, and beside them the files changed
but not committed, last changed first (sixty at most), each with its folder and
how long ago it was written, under their count. The files flow down one column
and into the next, as many columns as keep 340 px each and three at most, so a
time stays beside its name on a wide screen; a name written within ten minutes
is in the brightest ink, within the hour a step down. A room with no commits
gives the files the whole screen and says so at the end of their line instead
of keeping an empty column. When a commit lands
it slides in at the top and the oldest fades out; a file that was just changed
slides to the top of its column. The bezel under the screen names the holding
session and the state, and for a working room when its worktree last changed:
the newer of its newest commit and the uncommitted file written last, as the
last read saw them. It names no state from that time: a room whose session holds
the folder and has changed nothing for ten minutes says exactly that. A light
beside it is green while something runs. The bezel of a screen wide enough for two columns also draws the **last
hour** as one line, now at its right end: a thin mark in the session's ink for
each uncommitted file where it was last written, a wider mark for each commit
where it landed, each fading as it ages. A change that arrives while the page is
open rises once in its place on that line, and the row of a file written again
lights once behind its name; with reduced motion neither moves. A change less
than a minute old reads **just now**. The screen keeps its text size. Moru is drawn at his own
size (128 px) in every stage room: the room's width and height go to the screen,
and he only shows that work is running. Each room is as tall
as its screen or its Moru needs. A quiet room's screen is not dimmed: its words
keep their contrast and the bezel says it is quiet. The building ends under what
it holds, on the page itself: there is no slab behind the rooms. A room alone
on the stage takes the building's whole width instead of half of it, grows to
the length of its lists, and also lists **where the changes are**: the folders
its uncommitted files are in, at most three names deep, the one written last
first, each with a bar for its share of the listed files, how many files and
when one was last written. Folders past the screen's rows are counted on its
last row, and when the read listed only the newest files the line above says
so. The folders appear only when the files are in two or more and a column of
files still fits beside them. Every stage room has one form: the screen across
the room and Moru under it on the rail. A room at least 600 px wide says its
state on the wall left of Moru, at a size read across the stage, with the fact
beside it and how long the session has worked. The rail carries a cart with
one crate per commit, six at most and then `+n`, to a stop at its end
marked `main`; Git does not tell pre-push, push, PR or CI yet, so nothing is drawn
for them. Two tools in one folder are the alarm: the room is framed in amber, its screen
says so in amber beside the branch, its light and screen turn warning amber, the bezel says **Two tools in one folder**, and two Moru stand side by side
and apart in the middle of the rail, at a scale that fits both. The room's top edge splits between the two sessions' inks.
The second tool is a session of its own, numbered and inked (**Codex 1**), with a
floor row even when the shared folder is its only one. A held room with nothing
seen running for five minutes dozes; a lock left behind shows a taped crate and
a dim screen; a missing folder shows a dashed crate and the `git worktree prune`
command as text.

Rooms that do not fit the stage go to the **floors below**, right under it. A
heading names them with how many are working and how many worktrees they hold:
a plate beside the rooms when they fit one row, a line above them otherwise.
With more than six mini rooms they band by session in the order the sessions
started, plus **No session**; each band's plate has its start time and worktree
count, how many need clean-up, and how many of its rooms stand on the stage and
on the floor (**2 on stage · 3 below**), and a session whose rooms are all on the
stage has no band. Every mini room is the same size: a corner where a half-size
Moru holds still, or a crate stands, on the room's rail; the branch, one status
line and the newest commit subject with its age; and that rail along its bottom
edge, a plain line to a stop that turns green, with the line in the session's
ink, when its work is in the base branch. A mini room with a floor to itself
spreads its newest commits and what is not committed into columns. A floor that wraps spreads its rooms evenly
over its rows, so none stands alone on a row.

The **shelf** at the bottom counts worktrees merged into the base branch and
worktrees no one has touched for seven days or more. A count opens a centred
list of those branches with the time of their last commit.

Each session takes one ink for the hairline along the top of its floor plate and
mini rooms, the mark on its screens' bezels and the accents of its Moru. Until a
host is connected nothing comes from GitHub and no request leaves the machine.

## Live updates

While the screen is visible, it stats Git's worktree records and the base
branch's ref, and asks whether each locked pid still runs
(`work_status_fingerprint`, no process spawned): a second after a change, then
at twice the interval each time nothing changed, up to four seconds. It reads
again only when any of that changed: a worktree added or removed, locked or
unlocked, committed to, merged into the base branch, or its session ended. A
change shows within one interval plus one read, at most about five seconds. A hidden screen asks nothing and reads
once when it shows again; relative ages move once a minute. What each room is
doing comes from a second read of one worktree at a time (`work_status_activity`:
`git log -3` beyond the base branch and `git status`, about 150 ms of Git CPU on
this repository): after a stat of that worktree's `HEAD`, `index` or reflog moved,
or on its beat, which shares about four reads a minute across the running
worktrees, and never more than once in ten seconds for one worktree. A subject
is capped at 200 characters with control and direction-override characters
removed.

Every change plays as one sequence of about a second, and every frame shows
one copy of each room with at least one room's name on the stage: a bezel, or
the branch plaque of a room travelling as its wall. First what
leaves fades, and each moving room in turn, 80 ms after the one before, fades
what must not show while it travels: a stage room that stays a stage room
fades only what its screen says and its cart, and keeps its Moru, its screen's
frame and bezel and its hue edge while its box and scale glide to the new size; a room that changes
tier, or crosses another, fades its content to its wall, which keeps its hue
edge at its drawn thickness, carries its branch plaque so it is clear which room
moved, shrinks early and grows late so a small card is what passes the others.
Every move eases in, keeps one pace and eases out. A room that must go along
one side and then the other bends on one arc with both axes moving through the
middle; a room that would still meet another travels as its wall beneath the
rooms that keep their content. Then every
room goes to its new box at once; a room taking another's box arrives before
that room leaves it. Then content fades back in, room by room, and new rooms
rise into place. Fades out are linear, so nothing cuts. A merge plays first
where the room stands: its crate rides past the stop named `main`, the stop turns
green, blinking twice, Moru cheers the merge once, the lights go out, the room fades away and a crate
lands on the shelf as its count ticks; only then do the others move. An update
that lands mid-sequence starts the next from where each room is drawn. When a
commit lands, the newest crate drops onto the cart in three small steps, the
count cross-fades and Moru heaves a crate and pats it down through the floor.

Each
worktree's room has its own Moru from the cast, a body colour and at most
one head piece, no two alike until every character is in use and never changed
by a newer room, while the main checkout keeps the grey original; the costume
never changes what a pose means. The page under the header is one
surface, the canvas the header stands on: a room's wall is one step lighter and
its screen is the canvas's black again, so the page keeps two greys and no band
behind the rooms. A session's ink marks names, states and the floor's edge,
never a surface; while a room's work runs its rail takes a little of it, and an
idle room's screen is dim. Pointing at a room or floor steps
that session's rooms and floor up and the rest down.

Every room is one button. Pressing it opens the **room panel** beside the
building, which the building makes room for: the branch, who holds the folder
and a sentence saying what that state means, the listed commits, every listed
uncommitted file with its folder and when it was written, how many more there
are, how long the session has worked, and the folder's
path with **Copy folder path**. A room left with only a lock or only a Git
record also shows the Git command that clears it, with **Copy command**; Atlas
copies text and runs nothing. Pressing the room again, the panel's close button
or Escape closes it and returns focus to the room; a room that leaves the
building takes its panel with it. The header's hint says in one paragraph what a
room, a screen and a lit room mean.

The panel opens with its numbers in one row (commits beyond the base branch,
uncommitted files); when both are zero one sentence replaces the empty lists.
The folder's path sits at the panel's foot.

## Landed work

Under the building, and under the empty or quiet building, **Landed on `main`**
lists the base branch's newest thirty changes on its first-parent line, merges
and squashed commits alike, grouped by day: each with its kind read from a
conventional prefix, its title, its pull request number, how many files it
changed, a bar as long as the logarithm of its changed lines, and when it
landed. Worktrees are removed once their work lands, but the work stays on
this line, so the list is read from Git (`work_status_landed`, one `git log`)
and Atlas stores nothing of its own. It is read again after each worktree
reread and once a minute. Pressing a change opens it beside the building in
place of the room panel: its numbers, the branch's own commits a merge brought
(`work_status_landed_detail`, merges left out) and its files, most changed
first, with **Copy commit hash**.

Moru acts what Git and the locks show: he types at a laptop while work runs
and picks up a tool between typing loops (the second tool's Moru reads the
screen behind him, and now and then the two turn to each other and talk),
looks proud after he sends a commit down, nods off in a room quiet for long,
worries in a room whose lock was left behind, and sighs in one whose folder is
gone. He settles into a room new to the building or to the stage, and
galumphs when his room moves sideways with him in it. Each change of what he
does waits for his neutral pose, so he never jumps from one pose to another.
Atlas does not yet read whether a session waits for its person, so no room
shows that. Moru moves only in a stage room, each on screen in a visible
window; a mini room's Moru holds still, and a mini room with a lock left
behind or a missing folder shows its crate. Reduced motion shows the end
states without movement.

## States

| State | What shows |
|---|---|
| Web | `workStatus.web.*` with Get the app |
| No repository | Choose the Git repository your agents work in |
| Not a repository | the same choice |
| Git missing | `atlasGit.install.*` |
| Unreadable or not granted | `workStatus.unreadable` with the choice |
| Only the main checkout | one room for the base branch, `workStatus.empty.*`, then the landed work |
| Every worktree merged or untouched | `workStatus.quiet.*` with the shelf, then the landed work |
| Reading | the page title; the building follows |

## Not yet

Processes, hooks, load and disk (slice 2), fixes (slice 3), findings (slice 4)
and anything from GitHub (slices 5 and 6) are not built. Thinking apart from
running a command, pre-push, CI and a slow command have no room state yet; nor
does a waiting Codex session, which has no list to read.
