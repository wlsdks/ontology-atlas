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
order. A large room is one scene with one floor line and one light: Moru on
the floor faces a screen on a console, and the screen is the only place in the
room with words. Its head is the branch (the only mono text); under it the
newest commits beyond the base branch, three, or up to five where a one-row stage
leaves the room height for them, each one ellipsised line
with how long ago it landed; at its foot what is not committed, with the name of
the file changed last, and the commit count. When a commit lands it slides in at
the top and the oldest fades out. The bezel under the screen names the holding
session and the state with how long it has worked, beside a light that is green
while something runs. The screen keeps its text size and at least 400 px of
width, so a subject of about 55 characters reads whole; Moru's scale gives way
instead, in half steps so his drawn pixels stay whole, and each room is as tall
as its screen or its Moru needs. A quiet room's screen is not dimmed: its words
keep their contrast and the bezel says it is quiet. The building ends under what
it holds. A room
narrower than 572 px hangs its screen on the wall above Moru. A track in the floor carries a cart with
one crate per commit, six at most and then `+n`, through a hatch in the side wall
marked `main`; Git does not tell pre-push, push, PR or CI yet, so nothing is drawn
for them. Two tools in one folder are the alarm: the room is framed in amber, its screen
says so in amber beside the branch, its light and screen turn warning amber, the bezel says **Two tools in one folder**, and two Moru stand side by side
and apart, one at the console and one beside him, both facing the screen, at a
scale that leaves the screen its width. The room's top edge splits between the two sessions' inks.
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
Moru holds still, or a crate stands; the branch, one status line and the newest
commit subject with its age; and a track along its floor, filled as far as its
work has come. A mini room with a floor to itself spreads its newest commits and
what is not committed into columns. A floor that wraps spreads its rooms evenly
over its rows, so none stands alone on a row.

The **lobby** is the building's ground floor, under the floors and above the
shelf. A few Moru of a crew (four, and one more for each worktree no live session
holds, at most twelve) come in from an edge, wander, greet, high-five, swap hats,
nap and prank on tiptoe, and go out again: two to four at a time, never more
than five. Nothing there stands for a worktree, and one line on the floor says
so. It holds still under reduced motion and stops while the window is hidden or
the lobby is off screen.

The **shelf** at the bottom counts worktrees merged into the base branch and
worktrees no one has touched for seven days or more. A count opens a centred
list of those branches with the time of their last commit.

Each session takes one ink for the top edge of its stage rooms, floor plate and
mini rooms, the mark on its screens' bezels and the accents of its Moru. Until a
host is connected nothing comes from GitHub and no request leaves the machine.

## Live updates

While the screen is visible, it stats Git's worktree records and the base
branch's ref once a second, and asks whether each locked pid still runs
(`work_status_fingerprint`, no process spawned); it reads again only when any
of that changed: a worktree added or removed, locked or unlocked, committed to,
merged into the base branch, or its session ended. A change shows within about
two seconds: one interval plus one read. A hidden screen asks nothing and reads
once when it shows again; relative ages move once a minute. What each room is
doing comes from a second read of one worktree at a time (`work_status_activity`:
`git log -3` beyond the base branch and `git status`, about 150 ms of Git CPU on
this repository): after a stat of that worktree's `HEAD`, `index` or reflog moved,
or on its beat, which shares about four reads a minute across the running
worktrees, and never more than once in ten seconds for one worktree. A subject
is capped at 200 characters with control and direction-override characters
removed.

Every change plays as one sequence of about a second, and every frame shows
one copy of each room with at least one bezel on the stage. First what
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
where the room stands: its crate rides into the `main` hatch, the hatch turns
green, blinking twice, Moru cheers the merge once, the lights go out, the room fades away and a crate
lands on the shelf as its count ticks; only then do the others move. An update
that lands mid-sequence starts the next from where each room is drawn. When a
commit lands, the newest crate drops onto the cart in three small steps, the
count cross-fades and Moru heaves a crate and pats it down through the floor.

Rooms tell themselves apart from the branch name alone: each has one of six
props on its console. Each
worktree's room also has its own Moru from the cast, a body colour and at most
one head piece, no two alike until every character is in use and never changed
by a newer room, while the main checkout keeps the grey original; the costume
never changes what a pose means. A lit
screen lights the wall around it and a pool on the floor in the session's ink and
rims Moru's side that faces it; an idle room's screen is dim. Pointing at a room or floor steps
that session's rooms and floor up and the rest down; rooms have no action, so
they take no press or focus.

Moru acts what Git and the locks show: he types at a laptop while work runs
(the second tool's Moru reads the screen behind him), nods off in a room quiet
for long, and sighs in a room whose lock was left behind or whose folder is
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
| Only the main checkout | one room for the base branch, `workStatus.empty.*` |
| Every worktree merged or untouched | `workStatus.quiet.*` with the shelf |
| Reading | the page title; the building follows |

## Not yet

Processes, hooks, load and disk (slice 2), fixes (slice 3), findings (slice 4)
and anything from GitHub (slices 5 and 6) are not built. Waiting for an
approval, thinking, pre-push, CI and a slow command have no room state yet.
