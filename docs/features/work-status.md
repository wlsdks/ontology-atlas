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
  of its runs in. A worktree stays credited for 90 seconds after its last
  sighting while that agent still runs; sampling is once a second while the
  screen is visible, so a command shorter than that may be missed. A command
  under an Atlas agent session counts for that session. A process of the same agent that
  locked worktrees joins that lock's session. Windows reads no processes;
  Gemini CLI runs as `node` and is not named.
- A worktree that an Atlas agent session (ACP) works in sits under
  **Claude Agent in Atlas**; so does the main checkout while such a session
  works there.

## The board

The headline states the situation: how many worktrees are stuck, else how many
a live session holds, else that no live session has locked one. Under it, the
counts held and stuck. The main checkout is a row only while an agent works
in it.

The board is a route map across two grounds, **On this Mac** and **On the
server**, split by the `push` seam, with one ruler of stations shared by every
row. Rows group by holder:

1. **Stuck**: a worktree whose folder is missing (with the `git worktree
   prune` command as text), or whose lock was left by an ended session.
2. One group per agent session, in the order the sessions started, each in its
   own ink: a trunk from the session header, and one branch per worktree it
   holds, titled from its branch name (`feat/library-first-run-stage` reads
   "library first run stage") with the branch in mono underneath.
3. **No session lock**: worktrees no live session has locked, most recent
   commit first, with the time and author of that commit.
4. **Merged**: rows whose line runs to the `main` rail.

A session row at **Working** carries a chip; a worktree no session holds is a
bare dot with its commit count. A stuck row's chip names why (**Folder
missing**, **Lock left behind**) and one sentence under its line explains it,
naming the folder, with the full path as its tooltip. Two sessions of one tool
are told apart by number and start time (**Claude Code · session 2**).

Until a host is connected the server ground is a narrow strip holding the
`main` rail and one notice (**github.com is not connected. Connecting shows PRs
and CI.**), so this Mac's stations take the width; no request leaves the
machine. The ground names and the ruler stay pinned under the page header while
the rows scroll.

## Live updates

While the screen is visible, it stats Git's worktree records and the base
branch's ref once a second, and asks whether each locked pid still runs
(`work_status_fingerprint`, no process spawned); it reads again only when any
of that changed: a worktree added or removed, locked or unlocked, committed to,
merged into the base branch, or its session ended. A change shows within about
two seconds: one interval plus one read. A hidden screen asks nothing and reads
once when it shows again; relative ages move once a minute.

Every change animates from where each element was last drawn, with transform
and opacity only: a new row draws its line out of its session's trunk, a row
that leaves fades while its line draws back, a lock clearing fades the session's
ink off the row as it moves to its new group, and a row reaching Stuck or Merged
glides there while the rows around it close the gap. An update that lands
mid-motion continues from the current position. Reduced motion cross-fades to
the same end state.

## States

| State | What shows |
|---|---|
| Web | `workStatus.web.*` with Get the app |
| No repository | Choose the Git repository your agents work in |
| Not a repository | the same choice |
| Git missing | `atlasGit.install.*` |
| Unreadable or not granted | `workStatus.unreadable` with the choice |
| Only the main checkout | `workStatus.empty.*` |
| Reading | the grounds and ruler at once; rows follow |

## Not yet

Processes, hooks, load and disk (slice 2), fixes (slice 3), findings (slice 4)
and anything from GitHub (slices 5 and 6) are not built. Moru does not appear
on this screen yet.
