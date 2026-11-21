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
- A head on the base branch's first-parent line has **no commits beyond main**,
  so it is never called merged. A head that is an ancestor of the base branch
  and not on that line is **merged** and folds into the Merged group. The main
  checkout and a worktree on the base branch are never merged rows.
- A lock names its holder. Claude Code writes
  `claude agent agent-<id> (pid <pid> start <time>)`; the time is the session's
  start in UTC. Atlas reads the start time of that one pid (macOS
  `proc_pidinfo`) and compares it with the reason within one second: a match is
  a live holder, a mismatch or a gone pid is a lock left by an ended session,
  and a reason it cannot read counts as held. The lock time is the `locked`
  file's modified time. No other process is read.
- A worktree that an Atlas agent session (ACP) works in sits under
  **Claude Agent in Atlas**.

## The board

The headline states the situation: how many tasks are stuck, else how many are
running on this Mac. Under it, the counts of running, stuck and ready-to-merge
tasks. Ready to merge stays at zero until the server side is connected.

The board is a route map across two grounds, **On this Mac** and **On the
server**, split by the `push` seam, with one ruler of stations shared by every
row. Rows group by holder:

1. **Stuck**: a worktree whose folder is missing (with the `git worktree
   prune` command as text), or whose lock was left by an ended session.
2. One group per agent session, in the order the sessions started, each in its
   own ink: a trunk from the session header, and one branch per worktree it
   holds, titled from its branch name (`feat/library-first-run-stage` reads
   "library first run stage") with the branch in mono underneath.
3. **Not held by an agent**: unlocked worktrees, most recent commit first, with
   the time and author of that commit.
4. **Merged**: rows whose line runs to the `main` rail.

The server ground shows only that it is not connected (**Show PRs and CI from
github.com**, as text); no request leaves the machine.

## Live updates

While the screen is visible, it stats Git's worktree records once a second
(`work_status_fingerprint`, no process spawned) and reads again only when they
changed: a worktree added or removed, locked or unlocked, or committed to. A
hidden screen asks nothing.

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
