---
title: "Workshop: a control tower for this computer's load"
doc_type: spec
status: draft
area: git
date: 2026-11-27
decisions: []
supersedes: [docs/specs/2026-11-22-work-status-coordination.md]
---

# Workshop: a control tower for this computer's load

**In one minute.** A band at the top of Workshop says in one word whether this computer is keeping
up (Room to spare, Busy, Overloaded), draws who uses its cores and memory, one segment per agent
session, and says how many worktrees running work it keeps up with. It replaces the header's
"Memory is running low" and "CPU is full". The first slice only reads; four later slices add
controls, each on one press: stop leftover processes, remove merged worktrees, move a build to the
background, pause a build. Atlas never ends an agent session. This spec supersedes
`docs/specs/2026-11-22-work-status-coordination.md` (slices 12 to 17, never built); its decision
record is `docs/records/decisions/2026-11-27-workshop-control-tower-actions-ed30a160-8c82-4942-a3ca-40c0e59f1c53.md`.

## Person and moment

The owner runs many Claude Code sessions with subagents in worktrees and opens Workshop to see
them. His words, 2026-11-27, translated from Korean: "Isn't there a feature that judges and shows
whether sessions on this PC are managed properly and efficiently, and whether each AI agent's
subagents are running? It should show how much of this PC's capacity is being used, and let me
control it. If too many subagents are used, or too many worktree jobs run, warn about it and, if
possible, even allow control commands. Visualise it like a control tower."

His screenshot of that day, relayed by the lead and not saved to a path: the header "24 worktrees
on this Mac · 35 merges today · memory is short · CPU is full"; four stage rooms; below them
"8 working · 17 worktrees" grouped by session, Claude Code 1 holding 12 worktrees and Claude Code 2
three; each card with branch, state, commits and last commit. No judgment, capacity picture or
control. Nobody learning coding agents, or not writing code, has been watched here (criterion 8).

## Today

**In the code** (`origin/main`, `07e3a4f3ee`):

- **The header's load words.** "Memory is running low" after two samples at macOS's warning or
  critical pressure; "CPU is full" and "GPU is full" after six samples at 90 % or more of the
  cores; each clears after six samples below (`src/shared/lib/work-status/signals/load.ts:9-16`,
  `:117-134`). Pressing one outlines the three heaviest rooms
  (`src/views/work-status/ui/WorkStatusPage.tsx:124-128`; `load.ts:81-89`).
- **What the load read gives** every 5 s while Workshop is visible: memory and CPU per worktree and
  per tool group, per session pid the page sent, and for the Mac memory used and total, pressure,
  CPU cores in use, core count and GPU percent (`src-tauri/src/work_status/load.rs:29`, `:46-71`).
  Pressure is `kern.memorystatus_vm_pressure_level` (`load/source.rs:94`, `:214-217`). The page
  sends session pids only in By session (`WorkStatusPage.tsx:83-87`). No load average is read.
- **Subagents** are seen only as a worktree's lock, `claude agent agent-<id> (pid … start …)`, whose
  pid is the session's (`src-tauri/src/work_status/worktrees/lock.rs:1-3`). Nothing reads a
  subagent's own file; a subagent without a worktree has no trace.
- **A working folder** is read only for processes under an agent program
  (`src-tauri/src/work_status/agent_processes.rs:213-219`).
- **Atlas signals no process it did not start.** Work status kills only its own children's process
  groups (`agent_sessions/call.rs:110`, `file_pulse/ignore_check.rs:117`), and registers no command
  that acts on another process (`src-tauri/src/lib.rs:422-434`).
- **Windows** reads no process or load (`.claude/rules/surfaces.md:104`); the room copy says "this
  Mac" (`messages/en/workStatus.json:3`).

**Measured on the owner's Mac, 2026-11-27, 22:41 to 22:50** (Apple M2 Max, 12 cores of which 8
performance, 64 GiB, macOS 27.0; `sysctl`, `uptime`, `top`, `ps`, `lsof -d cwd`; outputs kept in
the session scratchpad, not committed, since they hold folder names):

- **CPU% saturates; load does not.** At load 22.1 on 12 cores `top` showed 0.9 % idle, the same
  "full" Atlas shows at load 104 (`docs/specs/2026-11-21-work-status-destination.md:119`).
- **Where the knee is.** A 0.25 s CPU-bound loop, wall time over CPU time, against 1-minute load
  over cores: 1.40 → 1.05, 1.67 → 1.17, 1.80 → 1.01, 2.23 → 1.09, 2.33 → 1.10 and 1.50,
  2.59 → 1.07, 2.86 → 2.45, 2.91 → 5.45. Below about 2.3 a short task barely slows; near 2.9 it
  takes 2 to 5 times as long.
- **Who used it.** Of 8.0 cores the owner's processes used, 6.1 were one Claude Code session's tree,
  0.7 another's and 1.3 outside every agent; the four `claude` programs themselves used 0.13 core
  together. The busiest processes were headless Chrome, Node, `rustc` and `git`.
- **Memory.** 63 GB used of 64 GB, 26 GB of it compressed, no swap, pressure level 1 (normal):
  "used" would read as full while macOS says normal.
- **Leftovers.** 61 processes whose parent is launchd and whose working folder lies in this
  repository's folders, 2.0 GB together, 3 to 6 days old, almost no CPU; 58 of those folders no
  longer exist.
- **Not every `claude` is a session.** One `claude` process, 4 MB, is a child of the web browser.
- **Locks.** 25 worktrees; 8 locks name one session's pid and 1 another's.

Unknown: what the orphans are (arguments are never read); whether the knee holds for checks that
run minutes rather than 0.25 s; how efficiency cores change it; any Mac but this one.

## Patterns that already worked

| Pattern | Mechanism, and why it worked | How it fails | Atlas borrows | New in Atlas |
|---|---|---|---|---|
| Activity Monitor's Memory Pressure graph ([Apple](https://support.apple.com/kb/PH19650)) | judges memory by the system's own pressure, green, yellow, red, not by bytes used | people read "memory used" as a problem anyway | pressure, not bytes, decides memory | pressure beside the sessions that hold the memory |
| Docker Desktop's Resource Usage extension ([Docker](https://www.docker.com/blog/how-to-monitor-container-memory-and-cpu-usage-in-docker-desktop/)); k9s's `%CPU/L` ([k9s](https://k9scli.io/topics/config/)) | groups use by the unit the person started (a Compose project), heaviest found at once, acted on from its row; k9s states use as a share of a limit | a table must be read; no verdict | group by agent session; use against capacity | the capacity is this computer's cores and a fit measured on it |
| Grafana's pending period and keep-firing ([Grafana](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/)) | a condition must hold before it fires and is held after it clears, so a value near the line does not flap | alarm fatigue: 85 to 99 % of hospital alarms need no action ([Joint Commission, SEA 50](https://jointcommission.org/sea_issue_50)) | hold before rising, separate lines up and down, never interrupt | a level drawn on screen, not a message sent |
| FAA ground delay programs ([FAA](https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap18_section_10.html)) | when an airport's capacity drops, departures are held at origin; planes already flying are not turned back | delays pile up when capacity is misjudged | act on what starts next, never stop work in flight | the advice "fits about N" for new work; sessions are never stopped |

## Problem and alternatives

**The problem, inferred from Today.** "CPU is full" is the same words at load 22 and load 104,
names no cause and gives no number to act on, so the owner cannot tell whether to start fewer
agents or which session to slow. The measured cause is not the number of agents: their programs
use almost nothing. It is the checks their subagents run at once in many worktrees.

**Ranked by what the owner gets back against its cost.**

1. **A verdict with its cause and a fit** (this slice): every number is read already but the load
   average; read-only; answers "too many?" for each of his sessions.
2. **Stop leftover processes:** 61 measured, 2.0 GB; one press the owner approved on 2026-11-21.
3. **Remove merged worktrees:** 25 worktrees, rooms he scrolls past; Git does it and Git restores it.
4. **A build in the background:** relieves the CPU without stopping anything an agent waits on.
5. **Pause a build:** the strongest relief, but an agent's command fails after 2 minutes of waiting
   (`docs/specs/2026-11-22-work-status-coordination.md:147-149`); it needs a watchdog.

**Ways to give back "is this computer keeping up, and what do I do".**

| Way | Value | Cost, and why it lost |
|---|---|---|
| Status quo: three header words | nothing to build | "full" at every load; points at rooms, not sessions |
| Activity Monitor beside Workshop | free, exact | 726 processes, `node ×78`; groups by program, not session |
| A separate Control tower destination | room for depth | another rail place; parts load from the rooms it points to |
| Atlas throttles builds by itself (the coordination spec's Automatic) | no attention needed | acts on the person's work unasked before a person has seen the verdict once |
| **Chosen: a band on Workshop, verdict, picture, fit** | the cause in 5 seconds where the rooms are | one more band to keep true (Risk 2) |

**The request, challenged.** "Too many subagents" is a symptom: subagents cost little, and their
checks cost much. So the fit counts worktrees running work, and ending sessions is refused. Someone
who presses "CPU is full" today to find rooms presses a segment instead; the words go.

## Flow

1. When the person opens Workshop with load on, Atlas draws the tower band above the building:
   verdict, a CPU bar one cell per core with a session's segments in its ink, a memory bar, and
   slots for worktrees running work against the fit. Until a minute of samples exists it says
   Measuring.
2. When the 1-minute load over the core count stays at 1.0 or more for 30 s, the verdict becomes
   Busy; at 2.5 or more for 30 s, Overloaded, and the load past the cores is drawn as a queue
   beyond the bar's end, marked `×2.9`. Memory pressure at warning makes it at least Busy, at
   critical Overloaded. It steps down one level only after 30 s under 0.8 or 2.0.
3. When it is Overloaded, the band names the heaviest session and the fit: "8 worktrees are
   running work and this computer keeps up with about 6."
4. When the person presses a segment, Atlas outlines that session's rooms, as the header words did.
5. When the read is missing (load off, a failed sample, no session list, Windows), Atlas says less:
   no verdict from a missing figure, segments named `{tool} {number}`, a subagent without a
   worktree counted only in its session's segment, and the band says which.

## States

| State | Web | macOS app |
|---|---|---|
| Any state below | Out of scope — every app route outside the app shows the page meant for browsers (`ce69837e`); until that ships, the existing `web.title` card | see each row |
| No repository, unreadable, not a repository, Git missing | Out of scope — same | no band, as today |
| Load switched off | Out of scope — same | no band; the reads panel says `load.off` |
| First sample; under a minute of samples | Out of scope — same | `tower.verdict.measuring`; bars from the first sample; no slots |
| Room to spare | Out of scope — same | `tower.verdict.calm`; `tower.cpu`, `tower.memory`, `tower.fits` |
| Busy | Out of scope — same | `tower.verdict.busy`; the CPU bar full |
| Overloaded by CPU | Out of scope — same | `tower.verdict.over` in amber; the queue with `tower.times`; `tower.advice` |
| Memory pressure warning or critical | Out of scope — same | the memory bar's frame amber or red with `tower.pressure.*`; `tower.adviceMemory` |
| No agent running work | Out of scope — same | `tower.other` alone; `tower.noneRunning` instead of slots |
| A sample failed | Out of scope — same | `tower.verdict.unread` and `tower.failed`; bars empty |
| No GPU figure | Out of scope — same | no GPU bar |
| Largest: 34 worktrees, 12 sessions | Out of scope — same | 12 segments; one under 2 % of the bar joins `tower.moreSessions`; inks repeat after five |
| Windows app | Out of scope — same | `tower.windows`; no bars |

## Design

`/ui-build` settles pixels; this fixes what the band holds. One row, full page width, above the
building, in both arrangements.

- **Verdict:** one word and a beacon. Amber only for Overloaded; Busy reads from the full bar.
- **CPU bar:** one cell per core, segments in session start order with their inks, then Other
  programs in grey. The heaviest has its label (`tower.top`). Past the last cell, a hatched queue
  as long as the load beyond the cores, up to three bar lengths, with `tower.times` at its end;
  while it shows, the hatching drifts slowly toward the bar.
- **Memory bar:** each session's memory in its ink over the whole memory; the frame takes
  pressure's tone. **GPU:** a thin bar when reported.
- **Slots:** one square per worktree running work; the first "fits" squares inside a line, the
  rest outside it.
- **Motion:** widths ease to each sample; a rise to Overloaded flares the beacon once, at most once
  in 10 minutes. Reduced motion: no drift, flare or easing.
- **Never:** a toast, notification, sound, modal or rail badge.

**The rules.** `r` is the 1-minute load over the core count. Busy from `r ≥ 1.0` or pressure warning;
Overloaded from `r ≥ 2.5` or pressure critical; each holds six samples before rising and six under
0.8 or 2.0 before stepping down. 1.0 is where every core is taken; 2.5 sits between the last
sample where a short task kept pace (2.33) and the first where it did not (2.86). Fit
`= floor(A × 2.5 ÷ r)`, at least 1, where `A` is the worktrees with 0.1 core or more under an agent
and both are averaged over the last 5 minutes of samples. Another computer gets its own core count,
macOS's own pressure, and a fit from its own samples.

## Copy

Namespace `workStatus`, written into `messages/{en,ko,ja,zh}/workStatus.json` under `tower`.
Slices 2 to 5 use the keys after `tower.sessionNever`; they are written now because the consequence
shown before each action is part of the decision.

| Key | Where it appears | English |
|---|---|---|
| `tower.label` | the band's name for a screen reader | This computer's load |
| `tower.verdict.measuring` / `.calm` / `.busy` / `.over` / `.unread` | verdict | Measuring / Room to spare / Busy / Overloaded / Not read |
| `tower.cpu` | under the CPU bar | CPU · {cores} cores |
| `tower.times` / `.timesTitle` | queue end / its title | ×{times} / {load} tasks on average over the last minute wanted {cores} cores: {times} times what the cores can run at once. |
| `tower.memory` | under the memory bar | Memory · {pressure} |
| `tower.pressure.normal` / `.warning` / `.critical` | in `tower.memory` | normal / high / critical |
| `tower.gpu` | under the GPU bar | GPU {percent}% |
| `tower.top` | the heaviest segment | {name} · CPU {cores} cores · {memory} |
| `tower.other` | the grey segment | Other programs |
| `tower.moreSessions` | small segments joined | {count, plural, one {# more session} other {# more sessions}} |
| `tower.showRooms` | a segment's title | Show {name}'s rooms |
| `tower.fits` | beside the slots | {running, plural, one {# worktree} other {# worktrees}} running work · fits about {fits} |
| `tower.noneRunning` | instead of slots | No worktree is running work |
| `tower.advice` | under the verdict, Overloaded | {running} worktrees are running work and this computer keeps up with about {fits}. {name} uses the most. Starting no more until some finish lets the rest finish sooner. |
| `tower.adviceMemory` | under the verdict, pressure high or critical | macOS reports memory pressure as {pressure}. {name} holds the most: {memory}. |
| `tower.failed` | under `.unread` | Atlas could not read this computer's load just now and tries again in 5 seconds. |
| `tower.windows` | the band on Windows | On Windows, Atlas does not read this computer's load yet, so it does not judge it. Worktrees and sessions still show. |
| `tower.about` | the band's info hint | Atlas compares the work waiting for the CPU, macOS's average over the last minute, with this computer's cores, and judges memory by macOS's own pressure level. Busy: more work than cores, or memory pressure high. Overloaded: 2.5 times the work the cores can run, or memory pressure critical. The fit divides the worktrees running work by how many times over the cores they ran in the last 5 minutes. A subagent with no worktree of its own runs inside its session's program and is counted there. |
| `tower.sessionNever` | info hint on a session segment | Atlas does not stop agent sessions. To stop one, press Esc or Ctrl-C in its own window, where you can see what it was doing. |
| `tower.leftover.button` / `.note` | slice 2 | Stop {count, plural, one {# leftover process} other {# leftover processes}} ({memory}) / Each one's folder was removed or its branch is merged, and no agent or terminal started it. Stopping asks each to quit; nothing else is touched. |
| `tower.leftover.done` / `.changed` | slice 2 | Stopped {count}. / Nothing was stopped: these processes changed after the list was drawn. The list is updated. |
| `tower.remove.title` / `.body` | slice 3 dialog | Remove {count, plural, one {# merged worktree} other {# merged worktrees}}? / Each is merged into {base} and has no uncommitted changes. Git deletes each folder with its ignored files, such as {ignored}. The branches stay, and git worktree add brings a folder back. |
| `tower.build.background` / `.backgroundNote` | slice 4 | Run {name}'s build in the background / It keeps running at lower priority, so other work finishes first. Press again to set it back. |
| `tower.build.pause` / `.pauseNote` / `.resume` | slice 5 | Pause {name}'s build / It stops until you resume it, for 10 minutes at most. An agent waiting on it may give up after 2 minutes and try again. / Resume |

## Controls (slices 2 to 5)

What the record allows; each slice adds its own states and criteria before it is built.

- **Who decides.** Rust offers a list under a generation id; the page returns only that id and an
  index; a stale id does nothing. One press acts; removal also confirms. Nothing acts by itself.
- **Identity.** Rust keeps each offered pid's start time in microseconds, uid, kernel name, parent
  and working folder, and re-reads them just before acting; any difference refuses that pid.
- **Never.** `SIGKILL`; a group or `-1` signal; an agent program (`claude`, `codex`, Atlas's ACP
  adapters), Atlas or its ancestors, pid 1, another user's process; a terminal's foreground job.
- **Leftover** (slice 2): own uid, parent launchd, no controlling terminal, not an agent program,
  working folder in a merged worktree or in a removed folder under the main checkout or a listed
  worktree's parent folder. `SIGTERM` only.
- **Remove** (slice 3): merged by the destination spec's rule, clean, no live lock, no process, ignored
  files only `target/` with `CACHEDIR.TAG`, `node_modules/`, `.next/`, `out/`;
  `git worktree remove` without `--force`. Works on Windows.
- **Background and pause** (slices 4, 5): `rust`, `xcode`, `java` or `gradleDaemon` processes over
  1 core whose own folder is in a listed worktree and whose ancestor is an agent program.
  Background is `PRIO_DARWIN_BG` and back. Pause is `SIGSTOP` per pid, never more than 10 minutes.
- **If Atlas dies.** Each action is logged in app data before it runs. Stop and remove end as far
  as they got; the next read shows the rest. Background stays and the build finishes. A pause
  starts a detached watchdog that waits on Atlas's exit (`EVFILT_PROC`, `NOTE_EXIT`) and the
  deadline, re-checks identity, and sends `SIGCONT`; if both die, the next launch resumes every
  pause its log holds open.

## Edge cases

- **Zero, one, largest.** No agent: Other programs and `tower.noneRunning`. One session: one
  segment. 12 sessions over 34 worktrees: small segments join; the fit counts worktrees.
- **First run.** Load is on by default; Measuring for the first minute, nothing stored.
- **Hangul.** A 60-character Hangul name in `tower.top` is cut at a syllable; numbers never.
- **A moved, renamed or unreadable folder.** The repository states take the page; no band.
- **Two edits at once.** Read-only here; slices 2 to 5 rely on the generation id and re-check.
- **Offline.** Nothing here uses the network. **Load 104 on 12 cores:** the queue stops at three bar
  lengths and says `×8.7`.

## Out of scope

- Ending an agent session or a subagent: refused in the record; a subagent has no process.
- Acting while Workshop is hidden, or a warning on another screen: the third exception reads load
  only while it is visible (`.claude/rules/surfaces.md:100`).
- Automatic actions, push holds, build-folder deletion, findings from GitHub and the local model
  from the superseded spec: none is needed for "is it keeping up, and who".
- Windows process reads: Later 5.

## Acceptance criteria

1. **The thresholds, measured before code.** Given the owner's Mac over a working day, when a
   1-minute CPU-bound task is timed every 10 minutes beside the load, then the PR holds at least
   12 pairs, three of them over 2.5, and 1.0 and 2.5 change first if the slowdown at 2.5 is under
   1.5. Checked: a measured print on the pull request.
2. **The verdict rule.** Given sample fixtures at 0.9, 1.1, 2.4, 2.6, 2.2 and 1.9 times the cores
   and pressure normal, warning and critical, then each verdict rises after six samples, steps down
   only under 0.8 or 2.0 after six, one level at a time; a failed sample gives Not read; a value
   swinging across 2.5 every 10 s for 10 minutes rises at most once. Checked:
   `src/shared/lib/work-status/signals/tower.test.ts` (new).
3. **The fit.** Given 5 minutes of samples with 8 worktrees at 0.1 core or more and load 34.3 on
   12 cores, the fit is 6; with none, no fit; with one at load 1.2, 25. Checked: the same test.
4. **Only the load average is new.** Given a sampled source, then `MacLoad` carries the 1- and
   5-minute load average, the count of process reads is unchanged, and a planted
   `ATLAS_PLANTED_7f3c` argument appears nowhere. Checked: `src-tauri/src/work_status/load/tests.rs`.
5. **The picture reads.** Given the bridge at load 34.3 with two sessions at 6.1 and 0.7 cores, then
   the band says Overloaded, the first segment is about half the bar and labelled, the queue says
   `×2.9`, pressing a segment outlines that session's rooms, and the header shows no
   `header.memory`, `.cpu` or `.gpu`. At 1280 and 1920 px in English and Korean no text leaves the
   band. Checked: `tests/e2e/work-status-tower.spec.ts` (new); a `pnpm ui:look` capture.
6. **No nagging.** Given the swinging fixture of criterion 2, then no toast, dialog, notification or
   rail mark appears and the beacon flares at most once. Checked: the same e2e spec.
7. **Recovery.** When load is switched off, the band leaves and no load ask is sent; on again, it
   returns with Measuring; the Windows build shows `tower.windows`; every locale has each key with
   equal arguments. Checked: the same e2e spec, `tests/contract/messages/`.
8. **The owner's moment.** Given the owner's Mac under ordinary work, when he opens Workshop, then
   within 5 seconds he names the verdict and the session to start no more work in; the walk
   records whether he opened Activity Monitor afterwards. Checked: an installed-app walk with
   captures on the pull request.

## Risks

1. **Load lies on this hardware** (efficiency cores, a 0.25 s probe). Answer: criterion 1 recalibrates
   with a 1-minute task before any code.
2. **The band is amber all day** because the owner runs at 2.9 by choice, and he stops seeing it.
   Answer: it never interrupts and flares once in 10 minutes; criterion 8 asks; the record's
   falsifier says when to move the line.
3. **The fit is distrusted** when it says 6 and 8 run fine. Answer: `tower.about` shows the formula,
   the advice says "about", and criterion 8 asks.

## Later

1. Slice 2, stop leftover processes: next, measured 61 and 2.0 GB.
2. Slice 3, remove merged worktrees: after 2; 25 worktrees measured.
3. Slice 4, background priority: when Overloaded persists with a build as the heaviest segment.
4. Slice 5, pause with its watchdog: only if slice 4 leaves checks failing on timing.
5. Windows: CPU, memory and processes through `windows-sys`, already in the lockfile.
6. The fit handed to agents through an MCP read tool: when the owner tells an agent the fit by hand.
7. A subagent's own meta file for "running" or "finished": when worktree locks mislead.
8. Background priority by rule: when slice 4 is pressed most days.

## Owner question

None — whether Atlas may end a live session is decided no in the record, reversible by a new one.

## Revisions

- 2026-11-27: first draft; supersedes the coordination spec of 2026-11-22.
