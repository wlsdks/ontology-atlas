---
title: "Workshop control tower: controls on a press"
doc_type: spec
status: draft
area: git
date: 2026-11-27
decisions: []
supersedes: [docs/specs/2026-11-22-work-status-coordination.md]
---

# Workshop control tower: controls on a press

**In one minute.** Slices 2 to 4 of the control tower whose band is
`docs/specs/2026-11-27-workshop-control-tower.md` (slice 1, "the tower spec"). Each acts only after
one press on a list Rust offered: stop leftover processes, remove merged worktrees, move an
agent's build to the background. Pausing a build and ending an agent session are not here; the
first waits for its own record, the second is refused. The authority is
`docs/records/decisions/2026-11-27-workshop-control-tower-actions-ed30a160-8c82-4942-a3ca-40c0e59f1c53.md`
and the ninth exception in `.claude/rules/surfaces.md`.

## Person and moment

The owner's words and screenshot of 2026-11-27 are in the tower spec: warn when too many worktree
jobs run and, "if possible, even allow control commands". Standing owner answers:
`docs/specs/2026-11-21-work-status-destination.md`, "Owner answers (2026-11-21)" (3): stopping
leftover processes is one press with the list shown above it; "Owner answers (2026-11-22)" (5):
"Atlas should order heavy checks by load by itself", deferred here to Later 2.

## Today

- **Atlas signals no process it did not start** (`src-tauri/src/work_status/agent_sessions/call.rs:110`,
  `file_pulse/ignore_check.rs:117`; no such command in `src-tauri/src/lib.rs:422-434`).
- **Working folders** are read only under agent programs and for `java`
  (`src-tauri/src/work_status/agent_processes.rs:213-219`, `load.rs:163`); usage likewise
  (`load.rs:161-165`). A leftover's folder, terminal and memory are not read today.
- **Locks.** A Claude Code subagent's worktree is locked with its session's pid and start; when that
  session ends the lock reads stale (`src-tauri/src/work_status/worktrees/lock.rs:1-3`, `:36-40`).
- **Windows** reads no process (`.claude/rules/surfaces.md:104`).

**Measured, 2026-11-27, 23:05, on the owner's Mac** (`ps`, `lsof -d cwd`; output in the session
scratchpad): 62 of his processes have launchd as parent and a working folder in this repository's
folders, all without a terminal, 2.0 GB together; 58 of those folders are gone; 2 have a child.
By name: `node` 57, `Python` 2, `codex` 1, `tail` 1, `zsh` 1. The reviewer, at another moment,
counted 36 without a terminal, 33 in removed folders, none in an existing merged worktree.

**Probed by the reviewer:** a tmux server started in a worktree that is then removed matches
"parent launchd, no terminal, removed folder"; a `SIGTERM` to it ends every session in its panes.
Editors (`code .`) and VMs (colima) fall in the same class. Git 2.54.0 refuses
`git worktree remove` on a locked worktree even when the lock's pid is gone (exit 128), also with
one `--force`.

**Ignored files in the 26 listed folders** (census at 23:20 by this checkout's ignore rules, top
ignored path per folder): `src/entities/docs-vault/data/`, `messages/*.json` and
`public/docs-vault/` in all 26; `node_modules/` 23, `mcp/node_modules/` 20, `*.tsbuildinfo` 13,
`next-env.d.ts` 12, `.next/` 12, `output/` 10, `out/` 8, `src-tauri/gen/`, `src-tauri/target/` and
`src-tauri/binaries/` 7 each; then single folders with `.env.local`,
`.claude/settings.local.json`, screenshots and scratch folders. So a fixed list of build output
offers no worktree of this repository: its own generated files are in every one.

**`PRIO_DARWIN_BG`** sets the lowest scheduling priority, throttles disk I/O, and throttles network
I/O on sockets opened after the call (`man 2 setpriority`, macOS 27.0).

Unknown: what the orphans run (arguments are never read); how much longer a build takes in the
background on this Mac (criterion 6).

## Problem and alternatives

**Ranked by what the owner gets back against its cost.** (2) Leftovers: 59 measured candidates by
name, memory back, one press he already approved. (3) Merged worktrees: rooms he scrolls past; Git
restores the folder. (4) Background priority: CPU back for other work without stopping anything an
agent waits on. Pausing a build gives the most CPU back but a stopped `cargo` holds `.cargo-lock`
and an agent's command fails after 2 minutes
(`docs/specs/2026-11-22-work-status-coordination.md:147-149`), so it waits (Later 1).

| Way to give back "stop what wastes this computer" | Value | Cost, and why it lost |
|---|---|---|
| Status quo: `ps`, `kill`, `git worktree remove` by hand | exact | needs the pids, folders and Git rules the tower already holds |
| Stop by a session's whole tree | strongest | ends agents' work in flight; a `claude` process is not always a session (one is the browser's child) |
| Automatic stops and priority by rule | no press | acts unasked; the owner's answer (5) stays Later 2 |
| **Chosen: a closed rule per action, one press, re-checked** | safe by construction | each rule misses some waste on purpose (Risk 1) |

## Flow

1. When leftovers exist, the band shows `tower.leftover.button` with the count by name above it.
   When the person presses it, Atlas re-checks each and sends each one `SIGTERM`, then says how
   many quit at the next read.
2. When a worktree qualifies for removal, its room's panel shows `tower.remove.button`. Pressing it
   opens a confirm naming the branch and every ignored path outside the build-output list; on
   Remove, Atlas re-checks, unlocks a stale lock and runs `git worktree remove`.
3. When an agent's build uses more than one core, its session segment offers
   `tower.build.background`; pressing it lowers that build's priority, and pressing again restores it.
4. When a target changed since it was offered, or the evidence is missing (a start time Atlas may
   not read), Atlas does nothing to that target and says which and why.

## The contract

- **Who decides.** Rust offers each list under a generation id; the page returns only that id and
  indexes into it. The id stays valid while the confirm is open and every target in it still passes
  the identity check, for at most 10 minutes; a target that fails drops out. Nothing acts by itself,
  while Workshop is hidden, or on a pid the page names.
- **The read.** While Workshop is visible, once a minute, from the listing the load read already
  takes: for each own process whose parent is launchd, its working folder, controlling terminal and
  whether any process has it as parent; memory only for one that qualifies. No program is spawned.
- **Identity, re-read just before acting.** Start time in microseconds, uid, parent, kernel name and
  working folder; any difference refuses that pid.
- **Never.** `SIGKILL`, `SIGSTOP`; a group or `-1` signal; an agent program (`claude`, `codex`,
  Atlas's ACP adapters), Atlas or any of its ancestors, pid 1, another user's process, a terminal's
  job.
- **Leftover** (slice 2). All of: own uid; parent launchd; no controlling terminal; no child
  process; kernel name in the load read's closed tool list other than `agent` and `other` (`node`,
  `rust`, `java`, `gradleDaemon`, `xcode`, `python`, `git`), so tmux, shells, editors and VMs are
  never offered; working folder removed and under the main checkout or a listed worktree's parent
  folder, or inside a merged worktree no live lock or agent process holds. `SIGTERM` only.
- **Remove** (slice 3). Merged by the destination spec's rule; no uncommitted change; no process
  with its working folder inside; a stale lock or none. Ignored files: the build-output list from
  the census (`node_modules/` at any depth, `target/` beside a `CACHEDIR.TAG`, `.next/`, `out/`,
  `*.tsbuildinfo`, `next-env.d.ts`, `.DS_Store`) needs no word; any other ignored path is named in
  the confirm, at most ten and then a count; a path whose name `harness_source` refuses
  (`src-tauri/src/harness_source/scope.rs:59`, such as `.env*` and `settings.local.json`) refuses
  the removal. Just before acting
  Rust re-reads clean and ignored state, then runs `git worktree unlock` for a stale lock and
  `git worktree remove` without `--force`. Not on Windows until it reads processes.
- **Background** (slice 4). Processes of `rust`, `xcode`, `java` or `gradleDaemon` above 1 core,
  working folder in a listed worktree, an agent program among their ancestors.
  `setpriority(PRIO_DARWIN_PROCESS, pid, PRIO_DARWIN_BG)` and back. The load average does not fall,
  since the build still runs.
- **The log.** One line per target in app data, written before the action: time, action, worktree
  id, kernel name, pid, start time, result; never a path. The last 1,000 lines are kept.
- **If Atlas dies.** Stop and remove end as far as they got; the next read shows the rest and
  nothing resumes or repeats. A build stays in the background and finishes there.

## States

| State | Web | macOS app |
|---|---|---|
| Any state below | Out of scope — the page meant for browsers (`ce69837e`) | see each row |
| No leftover; no removable worktree; no build over a core | Out of scope — same | no button |
| Leftovers offered | Out of scope — same | `tower.leftover.counts` above `tower.leftover.button`, `tower.leftover.note` |
| Stopped | Out of scope — same | `tower.leftover.done` at the next read |
| Some still running after `SIGTERM` | Out of scope — same | `tower.leftover.someLeft`; the button offers them again |
| Changed since offered | Out of scope — same | `tower.leftover.changed`; the list redraws |
| Remove confirm | Out of scope — same | `tower.remove.title`, `.body`, `.others` when other ignored paths exist; Cancel is the default |
| Removed; refused | Out of scope — same | `tower.remove.done`; `tower.refused` naming the worktree and reason |
| A build in the background | Out of scope — same | `tower.build.backgroundOn` on the segment; `tower.build.background` again sets it back |
| Windows app | Out of scope — same | no control; `tower.windows` from the tower spec |

## Copy

Namespace `workStatus`, keys under `tower`, written in all four catalogues.

| Key | Where it appears | English |
|---|---|---|
| `leftover.counts` | above the button | {list} |
| `leftover.button` | band | Stop {count, plural, one {# leftover process} other {# leftover processes}} ({memory}) |
| `leftover.note` | under it | Each one kept running after whatever started it ended, its folder was removed or its branch merged, and it has no terminal or child process. Stopping asks each to quit; nothing else is touched. |
| `leftover.done` / `.someLeft` / `.changed` | band | {count, plural, one {# process quit.} other {# processes quit.}} / {gone} quit; {left} still running. / Nothing was stopped: these processes changed after the list was drawn. The list is updated. |
| `remove.button` | room panel | Remove this worktree |
| `remove.title` / `.body` | dialog | Remove {branch}'s worktree? / It is merged into {base} and has no uncommitted changes. Git deletes the folder with its ignored files. The branch stays, and git worktree add brings the folder back. |
| `remove.others` | dialog | These ignored files are deleted too, and Atlas cannot tell whether a build makes them again: {paths} |
| `remove.confirm` / `.done` | dialog / band | Remove / Removed {branch}'s worktree. |
| `refused` | band | {target} was not changed: {reason} |
| `build.background` / `.backgroundNote` / `.backgroundOn` | segment | Run {name}'s build in the background / It keeps running at the lowest priority, with slower disk and network, so other work finishes first. The load stays the same, since the build still runs. Press again to set it back. / In the background |

## Edge cases

- **Zero, one, largest.** None: no button. One: its name. 62 leftovers: the counts by name and one
  button; 34 worktrees: one button per qualifying room.
- **First run.** Nothing is offered before the first read; nothing is stored but the log.
- **Hangul.** A branch name in Hangul is cut at a syllable in the dialog title; paths never cut.
- **A moved, renamed or unreadable folder.** A worktree whose folder is gone is not removable here;
  its room shows it as today. A leftover whose folder was renamed fails the folder check.
- **Two edits at once.** Two Workshop windows: the second press finds its targets gone or changed
  and refuses. A session that starts in a worktree after the offer fails the re-check.
- **Offline.** Nothing here uses the network.

## Out of scope

- Pausing a build (`SIGSTOP`): Later 1, with a new record.
- Ending an agent session or subagent: refused by record `ed30a160`.
- `git worktree prune`, `--force`, deleting branches or build folders, writing to GitHub.

## Acceptance criteria

1. **Leftover rule.** Given sleepers in a temporary repository: a `node` orphan in a removed
   worktree folder, one with a child, a tmux server started in a worktree that is then removed, a
   `zsh`, a `codex` and a `node` with a terminal, then only the first is offered, with its count
   by name. Checked: `src-tauri/src/work_status/leftovers/tests.rs` (new).
2. **Identity and never.** Given an offered sleeper, when its start time, parent, uid, name or folder
   changes, or the request names pid 1, Atlas's pid or ancestor, an agent program, an unlisted pid
   or a stale generation, then a signal recorder holds no signal; no recorded call is `SIGKILL`,
   `SIGSTOP` or a group signal. Checked: the same tests.
3. **Stop result.** Given a sleeper that ignores `SIGTERM` and one that does not, then the band says
   `tower.leftover.someLeft` with 1 and 1 at the next read. Checked: `tests/e2e/work-status-controls.spec.ts` (new).
4. **Census before removal code.** A fresh census of every listed worktree's ignored paths is
   printed on the pull request with how many merged worktrees qualify and what their confirm names;
   the list changes first if any path in it held a file a person made, and slice 3 waits if none
   qualifies. Checked: a measured print.
5. **Remove and recovery.** Given merged worktrees: one with a stale lock, then it is unlocked and
   removed and `git worktree add <path> <branch>` restores it; one with a live lock, uncommitted
   change, a running process or `.env.local`, then each refuses and names why; one with
   `notes.txt` ignored, then the confirm names it; a file added between offer and press refuses.
   Checked: `src-tauri/src/work_status/worktree_removal/tests.rs` (new).
6. **Background, measured.** One Rust build in this repository timed alone, in the background, and
   in the background beside a CPU load of 2 × cores; priority back after the second press; a build
   with no agent ancestor is refused. Checked: the tests above and a measured print.
7. **Atlas dies.** After `kill -9` of Atlas between two signals of one stop, the log holds a line for
   each signal sent, and the next launch neither repeats nor resumes anything. Checked: the
   leftover tests with a child Atlas process.
8. **The owner's moment.** On the owner's Mac he stops leftovers and removes one merged worktree;
   the walk records whether he still used `ps` or `git` for either. Checked: an installed-app walk.

## Risks

1. **Something still needed is stopped** (a kind the rule did not foresee). Answer: the closed tool
   list, the no-child rule and criterion 1's tmux plant; a new kind joins the list only by a record.
2. **Removal deletes a file the person wanted.** Answer: secret names refuse, every other ignored
   path outside the list is named in the confirm, and criterion 5 plants `notes.txt`.
3. **Background priority slows the build the owner wanted first,** or its slower disk stalls an
   agent's command. Answer: criterion 6 measures it before release, and the note says so.

## Later

1. Pause and resume a build with a watchdog and a lock check: only if background priority leaves
   checks failing on timing, with its own record.
2. The owner's answer (5), checks ordered by load: the destination spec's check queue first, then
   background priority by rule when slice 4 is pressed most days.
3. Windows: process reads, then stop, background (`IDLE_PRIORITY_CLASS`) and removal there.
4. Stopping one worktree's commands under a live session: when the owner reports a runaway command
   he could not reach from its terminal.

## Owner question

None — ending a live session stays refused (record `ed30a160`), reversible by a new record.

## Revisions

- 2026-11-27: split from the tower spec after its review ("fix"): the leftover rule closed against
  session hosts; every read, the log and the generation's lifetime declared; removal unlocks a
  stale lock and names other ignored files; pause and its watchdog removed from the record.
