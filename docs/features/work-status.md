---
title: Work status
doc_type: feature
status: current
area: git
routes: [/work-status]
---

# Work status

Work status answers "which agent is holding which worktree, and is that work
merged yet?" for one Git repository, in the installed app.
The rail and the page heading call it **Workshop**; the route,
the code and these documents keep the name Work status. It is the tenth rail
destination (`g w`). The plan, its later slices and their acceptance criteria
live in [the spec](../specs/2026-11-21-work-status-destination.md); this page
describes what ships today: the spec's first slice, from its seventh the
room that waits for its person, and from
[the live round](../specs/2026-11-25-work-status-live.md) a line per session
with its name, the file-change pulse and the load each room carries.

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
  Gemini CLI runs as `node` and is not named. The load read below adds memory,
  CPU time and program name for the processes under an agent, on macOS only.
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
- **What is kept.** For each session: its process id, its folder, its start,
  what it says of itself and, while **Show session names** is on, its name.
  Its ids are dropped as the list is parsed and reach nothing that is kept. A
  name is kept only when it is text: control and direction-override characters
  are removed, and it is cut to one line of at most 60 characters, never inside
  a Hangul syllable. It is held with the last list and dropped with it, never
  written to a file, a log or storage, and never sent to an agent or the
  network. Why:
  [the decision](../records/decisions/2026-11-25-work-status-session-names-3c8614d6-9b02-4b18-9e12-95d935c9434c.md).
  A session
  counts only when its process is one Work status already shows and its folder
  lies in one of the repository's worktrees (the main checkout, a worktree
  under it, or one whose own `.git` file names this repository); the page
  receives the worktree, the process id, one of five states and the name, and
  nothing is written.

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

### A line per session

A room with one session puts the session's name where `Claude Code 1` stood,
with `Claude Code 1` beside it in muted ink so two sessions of one name stay
apart; a session with no name, or with names switched off, keeps
`Claude Code 1`. A folder two or more sessions share says how many on its bezel
and lists up to three lines under the branch, then how many more: each line
has the session's ink mark, its name, its tool and number, its state in that
state's tone, and how long it has been so, counted from the read in which Atlas
first saw the state (its start when it was so from the first read). Waiting
lines come first, then failed, working and replied, and the room is framed in
amber when any line waits. A session the list places in another folder of this
repository, and that only runs commands in this room, says **Running a command
here**; a session no list speaks for (its folder is outside the repository, the
list is off, or its tool has none) has a line with no state. The room panel
lists every session under **Sessions in this folder**, twenty at most. In a
folder two sessions of one tool share, the room's ink and the time on its wall
are the session that holds it (the program with the lowest pid), while the
bezel counts both.

### By folder or by session

A switch in the header, **By folder** and **By session**, arranges the same
reads two ways while the building has rooms. By folder is the building above
and the default; Atlas keeps the last choice in this browser profile's storage
(`atlas.workStatus.arrangeBy`, `folder` or `session`, never a name or pid), and
any other stored value opens By folder. The plan is
[`docs/specs/2026-11-25-workshop-sessions-view.md`](../specs/2026-11-25-workshop-sessions-view.md).

By session draws one block per agent session at work in the repository's
folders, in the order the building numbers sessions, so a block never moves for
a state. A block has the session's ink along its top (faint while its program
is not seen at work), its name with `{tool} {number}` beside it, its own state
in that state's tone and since when, in the words its line in a room uses, or
when its program started; with no list it says **Working** while its program is
seen, else **Resting**. A session that waits is framed in amber, and the
header's waiting count counts sessions; pressing it outlines their blocks. Any
other header count names rooms, so pressing it shows By folder first.

Under that, on the room's black screen, up to three of its folders: the one the
list places it in, then the worktrees it holds, then folders it only runs
commands in, and **and 2 more folders**, which shows By folder with its rooms
outlined. Commits, uncommitted files and the last change belong to a folder,
not to a session, and nothing Atlas reads says which of two sessions in one
folder changed a file. So a folder row gives those figures only where the
session has the folder to itself, with the newest three commits when it is the
block's one folder; a shared folder's row says **Shared with** the other
session, or how many, and **Two tools at work** in amber when their tools
differ. Every row opens that folder's room panel, where its changes are shown
once; closing it returns to the row. Under the blocks, **1 folder without a
session** shows By folder. With no session at all, the board says **No agent
session is working in** the repository. By session draws no Moru, shelf, light
or last-hour line. While load is on, a block's third line gives the memory and
CPU of the session's own command tree, its program and every command it
started wherever that runs (for a session Atlas started, the agent and its
commands, not the adapter Atlas runs it through), with its two heaviest program groups besides the
agent itself; it holds in a shared folder, since it counts no other session's
processes. By session sends the pids of the sessions it shows with each load
ask (By folder sends none); nothing else it reads differs. The figures come
with the next sample, up to 5 seconds after By session is pressed.

### The reads panel

A small sliders button in the header opens **What this screen reads**: one
line saying everything is read on this Mac only and nothing is saved or sent,
then one row each for session status, session names, file changes and memory,
CPU and GPU. Each row is its name, one line on what it shows (or what is
missing while it is off), and an On/Off switch; all are on by default. **How
each one is read**, folded beneath, holds the full account of each read: when
it runs, what it reads and what it never keeps or sends. The choices are kept
in this browser profile's storage beside the session-status choice, and the
app holds each one too.

The header carries words only when rooms can no longer say who waits:

| Header | The session-status row says |
|---|---|
| nothing beside the button | that it shows which session waits for your answer; the folded account names the command, every ten seconds and a second after a session starts or ends while Work status is open, no network access, nothing written by Atlas |
| **Session status not read**, in amber | why: Claude Code was not found in the three folders, did not answer within five seconds, ended with an error, or printed a form Atlas does not know. Until a read succeeds no room can say that its session waits |
| **Session status off** | that Atlas does not run Claude Code, so no room can say whether its session waits or has finished replying |

Pressing the words opens the same panel.

Switched off, the page stops asking and tells the app, which holds the choice
too: an ask already on its way starts no `claude`, and the list held in memory
is dropped. Switched on again, the next read comes a second after the last one
at the soonest. Rooms go back to the words they had: a
program in a folder still reads **Working**. The choice is kept in this
browser profile's storage (`atlas.workStatus.sessionListRead`) and is on until
the person turns it off. Where the read never runs (Windows, Linux) the header
says nothing about it.

Session names switched off leave the screen at the next draw and the app drops
the names it held; switched on, they return within one list read. With
session status off, the names row says names come from that list.

Limits: Claude Code only, the default settings folder only, macOS only. A
background session and a subagent's own wait have not been seen through this
read. A running session that is missing from the list is not counted or named.

## File changes

On macOS, while Work status is visible and **Watch file changes** is on, the
app takes macOS's file-change notices for the folder of each worktree drawn as
a room, through the watcher the folder watch already uses: one watcher for
every room, and none for a shelf worktree. A notice counts as a file change
when its path is not under `.git`, not under a dependency or build folder
(`node_modules`, `target`, `.next`, `out`, `dist`, `build`, `.gradle`,
`DerivedData`, `Pods`, `.venv`, `__pycache__`, `coverage`) and not ignored by
Git; Git answers that through the hardened runner at most once per worktree in
ten seconds, and never twice for one path until that worktree's `.gitignore`
changes. No file is opened and no file name is kept: per worktree the app holds
the time of the last counted change and counts in ten-second steps for an hour
(99 at most per step). Why:
[the decision](../records/decisions/2026-11-25-work-status-file-change-notices-1c163935-120b-4f73-9c2e-9cf11f023ee3.md).

The page asks every two seconds while visible, and the app answers from memory.
A counted change flashes the room's light once, at most once in two seconds and
never as a loop; the room says **changed just now** where it says its state; a mini room shows the
same light at the start of its status line while the change is under a minute
old; and the last-hour line gains a tick under its marks for each ten-second
step that had one, in three heights. The file's name follows from the next Git
read, which the change makes due, still at most once in ten seconds. A change
keeps a held room from dozing but promotes no room and names no state. With
reduced motion nothing flashes or rises, and the words carry the same fact. The
room panel's **File changes** says how many in the last minute and the last
hour, that Atlas counts only while Work status is open, and, for a folder macOS
cannot watch, that the room shows a change only when Atlas reads Git. A room no
agent holds stays where it is and says files are changing with no agent seen.
Hidden, no watcher runs and the hour has gaps; switched off, no count is held.

## Load

On macOS, every five seconds while Work status is visible and load is on, the
app reads memory, CPU time and program name of each process under an agent
program, the memory, CPU time and working folder of a `java` process outside
every agent's tree, and for the whole Mac memory in use, macOS's pressure level, CPU
in use and the GPU's busy percentage. It never reads a command line, the
environment or open files, spawns no program and needs no administrator
rights. Why:
[the decision](../records/decisions/2026-11-25-work-status-load-read-43842310-f121-42ab-973d-4b72806a0f94.md).

A process counts once: for the worktree its working folder lies in, else for
its nearest ancestor's. Programs are grouped by name: agent programs, Node.js,
Rust build, Java (a Gradle daemon when its folder gives it away), Xcode build,
Python, Git, and other programs. CPU is said in cores. A stage room at least
600 px wide shows its memory and CPU on the wall when it holds 1 GB or one
core. The room panel's **Load** gives the room's totals, up to five groups,
what runs outside every room, and one line for this Mac; GPU use is the whole
Mac's, since macOS names no program for it without administrator rights. A
room whose agent was started in another folder counts only the commands it
runs there and says so. The header warns in amber when macOS reports memory
pressure for two samples, or CPU or GPU stays at 90 % or more for six (30
seconds); pressing the memory or CPU words outlines the rooms using the most.
A failed sample says so in the panel and raises no warning; a Mac that reports
no GPU figure shows none.

By session, the page also sends the pids of the sessions it shows, at most 64,
and Rust credits each process it already measured to a session the page sent:
an Atlas agent session when one is among its ancestors, else the nearest agent
program among itself and its ancestors whose pid was sent, so a session started
inside another keeps its own tree. Only a pid the page sent comes back. A session whose figure Rust did not
give, such as one Atlas knows no pid for, shows no load line. Why:
[the decision](../records/decisions/2026-11-25-work-status-session-load-635500f0-5355-46c2-a37f-93d4cac16afc.md).

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
session and, in a room too narrow for its wall facts, the state and for a working room when its worktree last changed:
the newer of its newest commit and the uncommitted file written last, as the
last read saw them. It names no state from that time: a room whose session holds
the folder and has changed nothing for ten minutes says exactly that. A light
beside it is green while something runs. The bezel of a screen wide enough for two columns also draws the **last
hour** as one line, now at its right end: a thin mark in the session's ink for
each uncommitted file where it was last written, a wider mark for each commit
where it landed, each fading as it ages. A change that arrives while the page is
open rises once in its place on that line, and the row of a file written again
lights once behind its name; with reduced motion neither moves. A change less
than a minute old reads **just now**. The screen keeps its text size. Moru is drawn at half
his size (64 px) in every stage room, as on the floors below: the room's width and height go to the screen,
and he only shows that work is running. Every stage room has one height under
its screen at every width, whether or not it shows wall facts: the wall left of
Moru holds two lines, the state with its time, then how long it has worked, the
last minute's file changes and its load, a fact that does not fit dropping out
whole rather than cut. Moru stands left of the middle, at most 440 px in, so a
wide room has the room for them.
A room says its state once: a room that needs a person says it in amber at the top of its
screen, a room wide enough for wall facts says it on the wall, and any other room on its
bezel; the time beside the state goes to the wall when the wall shows, else to the bezel. A quiet room's screen is not dimmed: its words
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
beside it and how long the session has worked, and its bezel then carries no state; when a room's width starts or
stops fitting those words they fade, after the room's other parts have gone
dark for its move, never in one frame. The rail carries a cart with
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

## Merged work

Under the building, and under the empty or quiet building, **Merged into
`main`** lists the base branch's newest thirty changes on its first-parent
line, merges and squashed commits alike, grouped by day: each with its kind
read from a conventional prefix, its title, its pull request number, how many
files it changed, a bar as long as the logarithm of its changed lines, and when
it was merged. The page itself never scrolls: the building keeps its height
and the list takes the rest of the window, at least its heading and two rows,
and scrolls inside that strip, its last row fading at the edge. The stage counts
its rooms on the whole window, so the list's strip only stops screens growing
taller. A ? beside the heading explains the list: one line is one merged pull request, and a commit pushed without
one is a line too. The list is read from Git (`work_status_landed`, one
`git log`) on this Mac's copy of the branch, so a change not pulled yet is not
listed, and Atlas stores nothing of its own. It is read again only when a worktree's
head or standing changes, since the base branch moves only with them. The
heading counts today's changes and the last seven days' (one `git rev-list
--count`, so the week may hold more than the thirty listed); a day the list
stops in shows no count. Pressing a change opens it beside the building in
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
Moru moves only in a stage room, each on screen in a visible
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
| First file-change or load read not in yet | no flash or tick; the panel's Load says `workStatus.panel.reading` |
| A folder macOS cannot watch | `workStatus.pulse.unwatched`; times from the Git read |
| A load sample failed | `workStatus.load.failed`; no header warning |
| No GPU figure | `workStatus.load.macNoGpu` and `workStatus.load.gpuMissing` |
| Names, file changes or load switched off | that part leaves every room; the reads panel says `workStatus.names.off`, `.pulse.off` or `.load.off` |
| Windows or Linux app | no names, file changes or load, and nothing says so |

## Not yet

Hooks and disk (slice 2), fixes (slice 3), findings (slice 4) and anything from
GitHub (slices 5 and 6) are not built. Thinking apart from running a command,
pre-push, CI and a slow command have no room state yet, and file changes and
load name none either; nor does a waiting Codex session, which has no list to
read. A process's command line is not read, so Node.js is not told into Vitest
or Playwright. File changes and load are not read while Work status is hidden,
or on Linux and Windows.
