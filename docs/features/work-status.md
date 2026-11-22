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
describes what ships today, which is the spec's first slice.

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
  sighting while that agent still runs; sampling is once a second while the
  screen is visible, so a command shorter than that may be missed. A command
  under an Atlas agent session counts for that session. A process of the same agent that
  locked worktrees joins that lock's session. Windows reads no processes;
  Gemini CLI runs as `node` and is not named.
- A worktree that an Atlas agent session (ACP) works in sits under
  **Claude Agent in Atlas**; so does the main checkout while such a session
  works there.

## The building

The page is a building of rooms, one per worktree, under the page title and
**Choose repository folder**. There is no headline: beside the worktree count,
warning amber counts only what needs a person (**1 in one folder · 3 to clean
up**), and only the parts above zero. Clicking a count scrolls to the rooms it
counts and outlines them in amber for a moment. Mini rooms stand five to a row at most,
never narrower than 300px; a branch name mutes its `feat/` or `fix/` and, when
it does not fit, cuts in the middle so its ending survives. A window too short
for two rows of large rooms keeps one row on the stage.

The **front stage** holds at most six large rooms. A folder two tools work in
goes first, then rooms where an agent or a command is running, one per session
before any session gets a second. A room a session holds while nothing runs,
then a missing folder, takes a slot only to fill the last row, so the stage has
no hole; otherwise it waits on its floor. A lock left by an ended session is a
clean-up chore and always waits as a mini room under **No session**. The stage reads in session
order. A large room shows its branch on the wall sign (the only mono
text), the holding session's name tag over Moru, a floor lamp lit only while
something runs, a monitor whose headline is the commit count (or the state in words), and a
belt whose cart carries one crate per commit beyond the base branch, six at
most and then `+n`, toward the `main` hatch. Past the commits the belt is
dashed: Git does not tell pre-push, push, PR or CI yet, so no station or value
is drawn for them. Two tools in one folder are the alarm:
the room's light, lamp and monitor turn warning amber, the sign carries a `!`,
and two Moru stand overlapped at the room's scale with both names. The second
tool is a session of its own, numbered and inked (**Codex 1**), with a floor
row even when the shared folder is its only one. A held room with nothing seen running for five minutes
dozes; a lock left behind shows a taped crate and a dark monitor; a missing
folder shows a dashed crate and the `git worktree prune` command as text.

Rooms that do not fit the stage go to the **session floors** under it, one band
per session in the order the sessions started, plus **No session**, and a
session whose rooms are all on the stage keeps its row; each has
its start time and worktree count, how many need clean-up, and how many of
its rooms stand on the stage and on the floor (**2 on stage · 3 below**). Every
mini room is the same size: half-size Moru, the branch and one status line;
only a merged one shows its crate in `main`. A floor that wraps spreads its
rooms evenly over its rows, so none stands alone on a row.
With six mini rooms or fewer they sit in one row without bands. When working
rooms are on the floors, a line says how many.

The **shelf** at the bottom counts worktrees merged into the base branch and
worktrees no one has touched for seven days or more. A count opens a centred
list of those branches with the time of their last commit.

Each session takes one ink for the top edge of its stage rooms, floor plate and
mini rooms, its name tag and the accents of its Moru. Until a
host is connected nothing comes from GitHub and no request leaves the machine.

## Live updates

While the screen is visible, it stats Git's worktree records and the base
branch's ref once a second, and asks whether each locked pid still runs
(`work_status_fingerprint`, no process spawned); it reads again only when any
of that changed: a worktree added or removed, locked or unlocked, committed to,
merged into the base branch, or its session ended. A change shows within about
two seconds: one interval plus one read. A hidden screen asks nothing and reads
once when it shows again; relative ages move once a minute.

Every change plays as one sequence of about a second, with transform and
opacity only, and every frame shows one copy of each room. First what leaves
fades, and a room that will change tier or cross another fades its content to
its own wall. Then each room that moves goes to its new box in one piece; a
room taking another's box arrives before that room leaves it. Then content
fades back in and new rooms rise into place. A merge plays first where the room
stands: its crate rides into the `main` hatch, the hatch turns green, the
lights go out, the room fades away and a crate lands on the shelf; only then do
the others move. An update that lands mid-sequence starts the next from where
each room is drawn. Moru, the
lamp, the monitor and the belt move only in a room where something runs, on
screen, in a visible window. Reduced motion shows the end states without
movement.

## States

| State | What shows |
|---|---|
| Web | `workStatus.web.*` with Get the app |
| No repository | Choose the Git repository your agents work in |
| Not a repository | the same choice |
| Git missing | `atlasGit.install.*` |
| Unreadable or not granted | `workStatus.unreadable` with the choice |
| Only the main checkout | one room for the base branch, `workStatus.empty.*` |
| Every worktree merged or untouched | `workStatus.quiet.*` with the shelf |
| Reading | the page title; the building follows |

## Not yet

Processes, hooks, load and disk (slice 2), fixes (slice 3), findings (slice 4)
and anything from GitHub (slices 5 and 6) are not built. Waiting for an
approval, thinking, pre-push, CI and a slow command have no room state yet.
