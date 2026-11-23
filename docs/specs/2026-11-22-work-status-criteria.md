---
title: "Work status: acceptance criteria and decision record text"
doc_type: spec
status: draft
area: git
date: 2026-11-22
decisions: []
---

# Work status: acceptance criteria and decision record text

How anyone can tell slices 1 to 11 of Work status work, and the record texts for their one-way
changes, split on 2026-11-22 from `docs/specs/2026-11-21-work-status-destination.md` ("the Work status spec" below). Section names used
here without a file are that spec's, or, for Cases, Motion, Design direction and Copy, those of
`docs/specs/2026-11-22-work-status-design.md`.

## Person and moment

None — in the Work status spec.

## Today

None — in the Work status spec.

## Problem and alternatives

None — in the Work status spec.

## Flow

None — in the Work status spec.

## States

None — in `docs/specs/2026-11-22-work-status-design.md`.

## Copy

None — in `docs/specs/2026-11-22-work-status-design.md`.

## Edge cases

None — in the Work status spec.

## Out of scope

None — in the Work status spec.

## Acceptance criteria

Criteria keep their numbers across both specs: 4 to 9 and 16 to 18 are in the coordination spec;
15 moved here with the queue. Criteria 33 to 44 answer the direction of 2026-11-22, and 41 is the
promise itself.

1. **Slice 1, dogfood.** Given this repository, when the owner opens Work status in the installed
   app, then within 2 s every worktree `git worktree list --porcelain` reports appears, each lock's
   worktree sits under the session its pid names (bands until slice 2 retires them). Measured
   2026-11-22: 11 worktrees in 0.21 s at load 15; 34 in 0.7 s at load 50. Checked:
   `src-tauri/src/work_status/worktrees/tests.rs`, which prints the time and fails only above 10 s
   (5x the budget, since parallel builds share the machine), and an installed-app capture.
2. **Slice 1, merged and locks.** Given temp repositories with a zero-commit worktree, a merged
   one, a branch created at a merged commit that never moved, the main checkout, a lock whose UTC
   time matches a live pid, one whose pid was reused, and one unparseable, then only the merged
   one is merged, the reused pid reads stale, and the unparseable lock reads live. The reason's
   time is read as UTC whatever the local zone: a fixed reason parses to its UTC epoch, so the
   result cannot depend on `TZ`. Checked: same file, on macOS, Linux and Windows CI.
3. **Slice 1, live.** When a worktree is added and removed, the row arrives and leaves within 5 s,
   no frame interval over 50 ms, zero frames at rest. Checked: the watch cadence and its stop on
   hide and unmount by `src/views/work-status/model/use-work-status.test.ts`; the motion by a
   per-frame recording of the static build with 20 worktrees, attached to the pull request, since
   the screen needs the desktop bridge and the web build has none.
10. **Slice 10, nothing before opt-in.** Given a fresh install and a github.com remote, when the
    screen opens, then the spawned-process spy sees only `gh --version` and `gh config get`, no
    request reaches any GitHub host until Confirm, and every later request has a log line and an
    `outbound-paths.ts` row. Checked: `github/gh.rs` tests and the outbound-paths contract.
11. **Slice 10, hostile `gh` inputs.** Given an `origin` carrying a token, an owner of `../../user`,
    a host `evil.example` not in the gh config, and a `gh` planted in `node_modules/.bin`, then no
    token is shown or logged, no request runs for the bad owner or host, and the planted `gh` never
    runs. Checked: same tests.
12. **Slice 10, budget.** Given a recorded 60-PR fixture visible for one simulated hour, counted
    requests in the bucket spent stay at or under 1,000, stop within one interval of hiding, slow
    under 1,500 remaining and pause under 500. Checked: `github/budget.rs` simulated-clock test.
13. **Slice 11, dogfood CI.** Given this session's integration PR, when a job fails, its room shows
    the failing job and step within one interval and takes the stage's second class. Checked:
    installed-app capture.
14. **Slice 11, five-second read.** Three readers who did not do the work each name, within 5 s, the
    room that needs a person, why, and how long the running CI has left. Checked: a recorded walk.
19. **Slice 2, dozens.** Given fixtures of 0, 1, 6, 34, 40 and 60 worktrees at 1920×1080 and
    1040×720, the stage holds at most six large rooms in the order of Design direction, every other
    worktree is exactly one mini room or one shelf count, and no room overlaps another or is cut by
    the window. Checked: `src/shared/lib/work-status/work-rooms.test.ts`; `pnpm ui:look` captures.
20. **Slice 2, motion per frame.** Given the desktop bridge stubbed in the page
    (`tests/e2e/work-status-bridge.ts`, answering `work_status_read` and `work_status_fingerprint`
    as `tests/e2e/library-work-harness.ts` does for the Library) and scripted snapshots of 6 and 40
    rooms that add a room, remove one, promote a mini room, demote a large one, merge and fold one,
    end a session, and land a second change mid-glide: every moving box meets the `motionShares`
    bars of Motion (`ffs` ≤ 0.15, `mfs` ≤ 0.27, at least 8 frames between), `smoothnessViolations`
    is empty, a board with no running state draws zero frames between reads, and under reduced
    motion no box travels. The 50 ms frame interval is checked headed with `MAP_PERF_BARS=1` at 40
    rooms on this Mac. Checked: `tests/e2e/work-status-rooms-motion.spec.ts` in CI; the headed
    run's print and recording attached.
21. **Slice 2, no invented activity.** A worktree with no live session is a dark room with no
    figure; a live session with no command holds one pose; a loop runs only in a running state and
    stops within one read of its end. Checked: the room scene's unit test beside the built widget
    (`src/widgets/work-tracks/model/room-look.test.ts` on `feat/work-status-rooms`).
22. **Slice 5, live Git.** Given a temp repository with 40 worktrees and a spy on spawned
    processes: when one worktree commits, switches branch, stages a file, pushes to a local bare
    remote, and stops a rebase on a conflict, each shows in the snapshot within 2 s; an edit not
    yet staged shows within 15 s; a minute with no notice and no beat spawns no Git process; a
    worktree whose files change every second spawns at most six `git status` a minute; 200 reads racing
    an agent's `git commit` never fail it or change an index's modified time. Checked:
    `src-tauri/src/work_status/{watch,git_state}/tests.rs`; the CPU and memory budget by a
    measured print in the installed app.
23. **Slice 8, time left.** Given histories of 0, 2 and 20 passed runs with their start loads, the
    first two read "No estimate yet"; the third shows the median and 90th percentile of the
    whole-run time, times the start-load factor, minus elapsed; a history whose serial phase takes
    30 s gives an estimate at least 30 s above its longest lane; a finished lane never widens the
    range; no shown number is below zero; a run that ends with a failed lane puts its room in the
    second class with the lane named; a symlinked or 1 GB record is ignored. Checked:
    `estimate/tests.rs`, `hook_runs/tests.rs`. Dogfood: over ten real pushes the finish falls
    inside the range first shown at least seven times (a `pnpm` probe).
24. **Slice 9, the writer, with recovery.** Given a settings file that is absent, holds other hooks
    and an `env` value `ATLAS_PLANTED_7f3c`, is invalid JSON, changes after the confirm, or is a
    link: Add writes exactly the shown entries and leaves every other key equal; a version of the
    file's hooks exists before the write; the invalid, changed and linked files are untouched; the
    planted value is in no page payload, log or error; a request carrying a command string instead
    of a template id is refused; Remove after Add leaves the file byte-identical to the original.
    Checked: `src-tauri/src/agent_config/tests.rs` on macOS, Linux and Windows CI.
25. **Slice 9, a real session, hostile input and cost.** Given the entries added on this Mac and a
    real Claude Code session that thinks, runs a command and asks for approval: its room shows
    each within 1 s and is first while it asks; after Allow it leaves that state within 1 s of the
    command starting; `kill -9` while it asks leaves no asking room after 2 s. Given the helper
    fed `"session_id":"../../LaunchAgents/x"`, a 1 GB standard input, a state file replaced by a
    symlink to another file, and a tool input holding `ATLAS_PLANTED_7f3c`: no file is created
    outside `agent-state/`, the 1 GB event writes nothing and ends within 1 s, the link's target
    is unchanged, and neither the planted value nor a transcript path is in `agent-state/`. Over
    200 tool calls the helper's CPU time is at most 10 ms at the 95th percentile and a tool call
    starts at most 5 ms later at the median, or the slice does not ship. Checked: a recorded
    installed-app walk; `agent_state/tests.rs`; a `pnpm` probe printing both costs.
26. **Slice 11, CI time left.** Given a recorded fixture of 20 runs and its workflow file, the
    estimate follows the longest unfinished chain through that file's `needs` plus the queue wait
    and narrows as jobs finish; with the file unreadable, jobs count as running together and
    `eta.noOrder` shows; with reading paused, the countdown holds its last value and `eta.frozen`
    gives the read time; a ready PR takes the third class. Checked: `github/estimate.rs` tests.
27. **Slices 7 and 9, the probe, before any code.** By hand on this Mac. For slice 7,
    `claude agents --json` is run from Atlas's fixed call: once with the default folder, and once
    with `CLAUDE_CONFIG_DIR` set to each of the owner's other settings folders and nothing else.
    Recorded: which sessions each call lists, whether the default call lists another folder's,
    whether `status` and `waitingFor` follow a session made to ask for approval and how late,
    whether a subagent's wait shows, whether any connection leaves the machine while it runs, and
    the time, CPU and peak memory of one call. For slice 9, one `async` entry that appends its
    event name to a scratch file is pasted into one `settings.json`: whether it fires in a session
    already running, a new session, a subagent, a session started with another
    `CLAUDE_CONFIG_DIR`, and, pasted into `~/.codex/hooks.json` and trusted in `/hooks`, in Codex;
    which of the nine events arrive; the median delay on a tool call. Each slice builds only what
    the probe saw, and this spec is corrected to match first. Checked: the probe's recorded output.
28. **Slice 9, Codex.** Given the probe saw Codex fire: after Add to Codex the page shows
    `agentState.codexTrust`, no Codex room changes state before `/hooks` trust, and after it a
    Codex session's working and approval states show within 1 s. Given it did not: no Add to
    Codex is offered and Codex rooms show progress from beats only. Checked: a recorded walk.
29. **Slice 9, removal and versions.** Given Atlas's entries added to two listed files, then a hook
    of the person's own and a change to another key in one of them: Remove takes out exactly
    Atlas's entries in both, and the person's hook and the other key are byte-equal. The version
    store holds the hooks from before each write; after 201 writes it holds 200; a version file
    holds `hooks` only (the planted `env` value is absent) with mode 0600; a version folder
    replaced by a link is not followed. A picked file inside another repository's work tree is
    refused. Checked: `src-tauri/src/agent_config/tests.rs`.
30. **Slice 9, Windows.** On Windows the page shows `agentState.windows` and no Add button, rooms
    draw from locks and Git, and criterion 24 passes on Windows CI. No Windows machine is walked.
    Checked: `src/features/work-agent-state/ui/agent-state-offer.test.tsx`; Windows CI.
31. **Slice 10, first: what a conditional request costs.** Before polling is built, `gh api` with
    `If-None-Match` against this repository shows that a 304 leaves `x-ratelimit-used` unchanged
    in the REST bucket `pr:land` spends; if it does not, every interval in Polling doubles and
    this spec is revised first. Then, on a simulated clock: the PR list is asked every 60 s, a
    running run's jobs every 30 s, everything every 3 min with no run in progress; when
    `remaining` falls by more than 20 a minute beyond Atlas's own requests for 2 min, intervals
    double until it stops. Checked: a `pnpm` probe's printed headers; `github/budget.rs` tests.
32. **Slice 10, fetch.** With the toggle off, no `git fetch` is ever spawned. Turned on, one runs
    every 3 min while visible, through `runner.rs`, never with `--prune`, each with a log line and
    an `outbound-paths.ts` row; while a sleeper named `git` has its working folder in one of the
    repository's worktrees, or a ref lock file exists, none starts, and one runs at the next
    interval after; hidden, none. Checked: `src-tauri/src/work_status/fetch/tests.rs`.
15. **Slice 4, before and after: the owner's case.** Four worktrees of this repository push at the
    same moment on this Mac, once with no slot folder and once with the queue. Printed for both:
    each push's `pre-push` result with the timing tests that failed, the time until the last one
    ends, the peak 1-minute load. It passes when no push fails on a timing test with the queue,
    its peak load is lower, and its last push ends at most twice as late; otherwise the limit, the
    0.75 and the 20 s change here first, and if no setting passes the slice does not ship.
    Checked: a `pnpm` probe, output attached.
33. **Slice 3, the probe, before any code.** Over one working sitting on this Mac with at least
    ten agent worktrees, a `pnpm` probe records for each worktree the gaps between beats, and the
    owner marks, at five moments he chooses, which rooms he knows to be working, waiting for him or
    finished. It passes when no room he marked working would read Stalled and at least four of
    five he marked waiting or finished would read Quiet, Stalled or Idle; otherwise the
    thresholds, or the beat list, change in this spec first. Checked: the probe's output.
34. **Slice 3, beats, states and what leaves Rust.** Given a temp repository with 40 worktrees:
    a file saved in worktree A moves A's last beat within 2 s and no other room's; writes under
    `.git`, `node_modules/`, `target/` and a path its `.gitignore` names give no beat; a process
    in A's folder that uses CPU gives a beat and one that sleeps gives none; on a simulated clock
    a held room reads Moving, then Quiet at 2 min, Stalled at 10 and Idle at 60, and returns to
    Moving at the next beat; a session whose locked worktree has a beat never reads Stalled; a
    worktree with beats and no session is a dark room with marks; a file named
    `ATLAS_PLANTED_7f3c.txt` appears in no serialized payload, log or file. Checked:
    `src-tauri/src/work_status/progress/tests.rs`, `src/shared/lib/work-status/progress.test.ts`.
35. **Slice 3, the pulse is evidence, and its cost.** Given the bridge stub and scripted beats in
    6 and 40 rooms: a lamp's glow starts only in a frame after a snapshot that carries a new beat
    for that room, at most once a second; a board with no beat draws zero frames between reads;
    the mark's shift and a Stalled promotion meet criterion 20's bars; under reduced motion no
    glow and no travel. With Work status hidden the stalled count on the rail changes within 5 s
    of the snapshot that changes it. On this Mac, 40 worktrees with six builds running stay inside
    Progress's budget, visible and hidden. Checked: `tests/e2e/work-status-progress-motion.spec.ts`;
    a measured print from the installed app with the peak memory and what holds it.
36. **Slice 4, the contract: liveness, fairness and recovery.** Given scripts that ask for slots
    and a simulated load: with no `slots/` folder, an unknown `VERSION` or a stale `atlas` file a
    script starts within 3 s; Atlas killed with `kill -9` while three scripts wait lets each run
    within 15 s and print why; a holder killed with `kill -9` frees its bay within 2 s and the
    first ticket starts; with load held at 2 per core exactly one check runs at a time and every
    ticket starts within the ceiling; tickets start in asking order; a ticket moved first starts
    next, Undo restores its place, and a ticket passed three times still starts within the
    ceiling; a ticket from a repository Atlas has not opened starts within 3 s and fills no bay;
    two scripts racing for one free slot leave one holder; a nested job with
    `ATLAS_SLOT_LEASE` writes no ticket; a symlinked ticket, a 1 GB ticket, a ticket naming pid 1
    and one whose pid works outside its worktree are never granted and stall nothing; Atlas sends
    no signal to any process. Checked: `src-tauri/src/work_status/slots/tests.rs` on macOS, Linux
    and Windows CI, `scripts/lib/slots/slots.test.mjs`.
37. **Slice 4, the queue on screen, per frame.** Given the bridge stub and scripted snapshots with
    6 and 40 rooms and 0, 1, 5 and 12 tickets that add a ticket, grant one, move the fourth first
    and undo it, end a holder without finishing, land a grant while the line is mid-glide, and
    change the load from 4 to 20: each ticket's number equals its place in every settled frame;
    every moving box meets criterion 20's bars (`ffs` ≤ 0.15, `mfs` ≤ 0.27, at least 8 frames,
    `smoothnessViolations` empty); the gauge's cells change only in frames after a load read; a
    machine room with no ticket and an unchanged load draws zero frames; the room of each waiting
    check shows the same number as its ticket and `queue.whyLoad` or `.whySlots` with the
    snapshot's numbers; under reduced motion no box travels. Checked:
    `tests/e2e/work-status-queue-motion.spec.ts`; the headed 50 ms run attached.
38. **Slice 5, what a room changes.** Given a fixture folder whose capability C has `path:` F and
    lists an element with `path:` G, and a repository with worktrees A (changes F), B (changes G,
    uncommitted) and D (changes an unmapped file): A and B show `meaning.changes` with C and
    `meaning.shared` naming each other; D shows no capability and its panel counts one file under
    `meaning.unmapped`; with the folder closed, or one that describes another repository, no room
    shows a capability and Git facts still show. Checked:
    `src/shared/lib/work-status/signals/meaning.test.ts`, `git_state/tests.rs`.
39. **Slice 6, the panel.** Given the bridge stub at 1920×1080 and 1040×720: pressing a room, or
    Enter on it, opens the panel with its head in the next frame and its Changes within 1 s for a
    200-file branch; the board keeps at least two large rooms visible beside it; the three tabs
    switch by arrow keys; no element in it expands in place; Escape closes it and focus returns to
    the room; pressing a second room swaps the content without closing; a branch of 2,000 files
    lists 200 rows and a count. Checked: `tests/e2e/work-status-room-panel.spec.ts`; `pnpm ui:look`
    captures at both sizes.
40. **Slice 6, opening an application cannot be turned.** Given requests for a worktree id Atlas
    did not list, a listed worktree whose folder was replaced by a link or by `Evil.app`, an
    application identifier outside the closed list, and a `code` program planted first on `PATH`:
    nothing is launched and each refusal names its reason; a valid press spawns exactly one OS
    open call whose only path argument is the listed worktree's folder; the WebView's capability
    files still grant no opener permission. Checked: `src-tauri/src/work_status/open_app/tests.rs`,
    `the_webview_gets_no_opener_permission`; an installed-app walk that opens one editor and one
    terminal.
41. **The promise.** For one working day with at least ten agent worktrees and the installed app
    open, the owner notes every time he opens a terminal, an IDE, a Git client or GitHub, and why.
    After slice 3 no note says "to see whether it is still working"; after slice 4 none says "the
    push failed under load"; after slice 6 none says "to see which files it changed" or "to find
    what part it touches"; after slice 8 none says "to see whether pre-push passed", and after
    slice 11 none says "to see whether CI passed". Such a note fails the slice it names. Checked:
    the day's notes, attached to that slice's pull request.
42. **The design bar.** Captures and recordings of the heartbeat, the machine room with 0, 1 and
    12 tickets, and the panel, at 6 and 40 rooms in dark mode, each get an independent design
    verdict; every score is 4 of 5 or higher, and no verdict calls a moving element decoration.
    Checked: the verdicts in each slice's pull request.
43. **Slice 7, the read is fixed, guarded and within budget.** Given a stub program in place of
    `claude` that prints recorded lists: each known value gives the room state of the section's
    table; an unknown `status`, an extra field, cut-off JSON, 2 MiB of output and a stub that
    sleeps 30 s each leave rooms with their words from beats, the sleeper killed at 5 s; a `name`
    and a `sessionId` holding `ATLAS_PLANTED_7f3c` are in no payload, log or file; an entry whose
    pid and start match no shown session, or whose `cwd` is outside the listed worktrees, is
    dropped; a `claude` planted first on `PATH` never runs; the spawn spy sees the arguments
    `agents --json` and an environment of `HOME` alone, plus `CLAUDE_CONFIG_DIR` for an added
    folder. On a simulated clock, one visible hour with three folders and no process change makes
    at most 360 calls, never two at once; a hidden hour makes none; a new agent pid brings one
    call within 2 s. Checked: `src-tauri/src/work_status/agent_sessions/tests.rs` on macOS, Linux
    and Windows CI.
44. **Slice 7, a real session and its cost.** In the installed app on this Mac, with no entry added
    to any settings file: a Claude Code session made to ask for approval is first on the stage as
    waiting for approval within 12 s; after Allow it leaves that state within 12 s; `kill -9`
    while it asks leaves no asking room after 2 s; a session of an added settings folder shows the
    same. Over one visible hour the calls spend under 2.5 % of one core and no `claude` process
    Atlas started outlives 5 s; the peak memory of one call is reported. Checked: a recorded walk;
    a `pnpm` probe printing the cost.

## Risks

None — in the Work status spec.

## Later

None — in the Work status spec.

## Owner question

None — the owner's answers are in the Work status spec.

## Decision record text (the lead runs `pnpm record:new`)

**Record 1: the destination, its local reads and its host connection.**

**Why**: The owner, 2026-11-21, asked for a rail item showing which agent holds which worktree,
hooks, PR and CI live, and this Mac's load. Measured: 21 worktrees (17 nested), 1 open PR, 2 Claude
Code sessions holding 6 subagent worktrees, load 104 earlier and 45.3 at 20:55 on 12 cores, 82.9 GB
in six Rust build folders.
**Prior**: Uses the tenth slot e7d1f38a permits. Adds a third read exception to
`.claude/rules/surfaces.md`. Refines f741cf86: polling is a second request made without a press,
listed, logged, bounded and stopped when hidden. Applies the principle of 2026-09-08 (follow the
terminal's own login) to `gh`. Keeps 2026-08-16 (5) (Claude Agent) and `forbidden.md:37`: no
sign-in surface is added.
**Decision**: `/work-status/`, rail label Work status, `g w`, one room per worktree in three
attention tiers. Local reads through `runner.rs`: worktrees (outside the chosen folder only when
`.git` and `gitdir` point at each other), lock reasons and `locked` mtimes, first-parent ancestry.
For same-user processes, filtered by uid first: pid, parent, start time, own working folder,
executable path, CPU, memory, listening ports, controlling terminal, and open file paths only to
match `<hooksPath>/<hook name>`. One Claude Code subagent meta file per lock, at a path built from
the lock, read with `O_NOFOLLOW` and a 64 KiB cap into `finished` only. Never arguments
(`KERN_PROCARGS2`), environment, transcripts or other session files; nothing sent. PRs and CI: `gh`
only, after a confirm, through the fixed call; at most 1,000 requests an hour in the bucket spent.
Web shows a degradation card.
**Dissent**: A Changes tab would keep nine doors. Reading processes and open files tells Atlas what
a person runs; the session-file format is undocumented. `gh` reuse leaves non-developers without a
path until the App decision.
**Falsifier**: A person looks for in-flight work in Changes or Git, or cannot reach Work status at
1040×720; the planted string in any record or log; a `KERN_PROCARGS2` read in the source; a file
read through a symlink; a process other than `gh --version` or `gh config get` before Confirm;
Atlas's polling in a `pr:land` rate-limit failure.

**Record 3: Atlas adds its own hook entries to an agent's settings on a press, through one agent
config writer; in Work status they are optional.**

**Why**: The owner, 2026-11-22: rooms must show what each agent is doing. He chose a one-press add
in Work status over a pasted snippet and asked that Harness later manage hooks the same way; later
that day he chose Claude Code's own session list to carry "waiting for you" first (Record 7), so
the entries are no longer what that state rests on. They remain the only way to Codex's state, to
each event within a second, and to Harness's hook management. That day: 17 worktrees, four Claude Code and two Codex processes, four alternative Claude Code
configuration folders. A hook delays every tool call unless it is `async` (vendor documentation).
**Prior**: Overturns, for this one path, "edits no agent's configuration" in Record 2 of
`docs/specs/2026-11-22-work-status-coordination.md`. Extends the connect button's write of agent
configuration (`.claude/rules/surfaces.md`, "Two distribution channels only") to the person's own
settings files, as a fourth written exception there. Keeps 87d3ada9: Atlas reads no arguments,
environment or transcripts. Keeps `forbidden.md`, "Plugins and extension": the helper is Atlas's own
code.
**Decision**: One Rust module, the agent config writer, is the only writer of an agent's settings:
only on the person's press, after a confirm listing each target file with its exact diff; only the
entries asked for; no write to a file that is invalid, changed since the confirm, a link or not the
person's; an atomic write; no button when managed settings forbid a person's own hooks; a hook
command only from a built-in template or text the person typed in Atlas; never accepting trust for
the person. Before every write it records the file's `hooks` value, and nothing else from the file,
as a version in the app's local data (the newest 200 per file, 10 MiB a folder, mode 0600); undo
and Harness's history ride on that store, and there is no other backup. Targets are
`~/.claude/settings.json` and files the person picks in the system file picker; Atlas lists no
settings folder. Work status adds `async` entries for nine Claude Code events that run Atlas's
helper; Codex only if the probe sees its hooks fire. The helper reads at most 64 KiB, keeps the
event name, session id, working folder, notification type, time and the agent's pid and start time
in `agent-state/` in app data, in a file named by a hash of pid, start time and folder, only for a
repository chosen in Work status; drops tool data and the transcript path; prints and sends
nothing. Atlas reads that folder by file-change notice. The entries are an offer, never a
condition: without them a Claude Code room still shows waiting from the session list and every
room its progress from beats. Harness hook management may reuse the writer under these rules, and
may be the first to build it.
**Dissent**: A pasted snippet keeps Atlas out of the person's settings entirely. A user-wide entry
runs Atlas's program on every agent event in every project, chosen or not. A session that reads
another configuration folder needs one more press. Hook formats can change unannounced.
**Falsifier**: A key or entry other than Atlas's differs after Add or Remove; a write with no
press, or of a command that is neither a template nor the person's typing; tool input, a command
or a transcript path in `agent-state/`; the helper over 10 ms of CPU at the 95th percentile or
5 ms of added wait at the median; a person who cannot remove the entries from Work status; fewer
than half of this Mac's live sessions reporting a week after the add; a room state that needs the
entries to be right for Claude Code.

**Record 4: Work status watches the listed worktrees for file changes and reads the CPU time of
the commands it already counts.**

**Why**: The owner, 2026-11-22: with dozens of agents in worktrees, whether each is progressing
cannot be seen, and he ends up in a terminal. A command running says nothing about a subagent's
edits or a hung command. Agent tools' own views report only their own sessions (Why Atlas).
**Prior**: Extends the third read exception (87d3ada9, `.claude/rules/surfaces.md`) by one field,
CPU time, and adds one signal, file-change notices, as that rule requires a record for. Revises
dac7de97's "visible only": these two reads go on while the app is open on another screen. Keeps
never reading arguments, environment or open files, and `local-first.md`'s rule against scanning
arbitrary files: only folders `git worktree list` reports for the chosen repository are watched.
**Decision**: While the app is open with a repository chosen in Work status, Atlas takes the OS's
file-change notices for each listed worktree, drops paths under `.git` or ignored by Git, and
keeps per worktree a time and counts in 10-second steps for 60 minutes, in memory. It reads the
CPU time of processes it already attributes to a worktree. A file name is used only to match
ignore rules and never reaches the page, a log, a file or the network. Rooms read Moving under
2 minutes since the last beat, Quiet to 10, Stalled to 60, Idle after; the rail tile counts
stalled rooms.
**Dissent**: A watcher on forty working trees costs something even when filtered. Silence is not
proof of a stall: an agent that waits for the person and one that is stuck look alike until slice
7. Reading while hidden spends CPU for a screen nobody is looking at.
**Falsifier**: A file name from the watcher in any payload, log or file; a room the owner knows to
be working that reads Stalled; over 2 % of one core or 40 MB with 40 worktrees and six builds; a
frame drawn in a room with no beat.

**Record 5: the check queue: a versioned slot folder, the load read, and Atlas granting starts.**

**Why**: The owner, 2026-11-22: two `pre-push` runs failed on timing tests slowed by other
worktrees' work, "this happens a lot", and Atlas should order the checks by itself and show the
line. Only a program that sees every worktree and the load can.
**Prior**: Takes the slot folder out of Record 2 of
`docs/specs/2026-11-22-work-status-coordination.md` before that record exists, and changes it:
Atlas grants each start, where scripts took leases among themselves under a fixed limit. Keeps
Record 2's safety for it: files only in the slot folder, `O_NOFOLLOW`, a size cap, a closed list
of kinds, a ticket counted only for a process inside the worktree it names. Adds a read Atlas did
not make: the 1-minute load average and the core count.
**Decision**: `slots/VERSION` is `1`. A script writes a ticket and waits for a grant only while
Atlas's own file is fresh, never over 10 minutes; with no folder, another version or no Atlas it
runs at once. Atlas grants in asking order: always when no check holds a slot; otherwise under
the limit, under 0.75 load per core and 20 s after the last start. A holder whose process ended
is released within 2 s. A person may move one ticket first. Atlas signals, slows and stops no
process. The repository's `pre-push` adopts it first, as its own tooling change.
**Dissent**: The fixed limit worked with Atlas closed; this one orders nothing then. A queue adds
waiting to every push on a busy day, and a person in a hurry will skip it with `--no-verify`.
The 1-minute load lags by its nature.
**Falsifier**: Criterion 15 shows a timing-test failure with the queue, or pushes ending more
than twice as late; a ticket that waits past the ceiling; a script that hangs when Atlas is
killed; a grant to a ticket outside its worktree; any signal sent by this slice.

**Record 6: Atlas opens a listed worktree's folder in an editor or terminal the person chose.**

**Why**: The owner, 2026-11-22: there should be no need to leave Atlas. What Atlas cannot
replace, typing to an agent and reading a patch line by line, it can at least reach in one press.
**Prior**: Narrows "reveal, never launch" (the reveal row of `.claude/rules/surfaces.md`; decision
2026-08-17 (33), "Show in Finder could execute a program") for this one case, as a written
exception there. Keeps the WebView without any opener permission, and Record 2's "never drives a
terminal": nothing is typed, pasted or run.
**Decision**: On a press in the room panel, Rust asks the OS to open one application, named by an
identifier from a closed list and chosen once by the person, on one folder: a worktree Atlas
listed, checked again to be a real directory, not a link and not an application bundle. No shell,
no `PATH` lookup, no other argument. macOS first; Windows and Linux show Copy folder path.
**Dissent**: Every launch is a way to run something; the closed list will lag behind the editors
people use; a new terminal window is not the tab the agent runs in.
**Falsifier**: Any program started that is not on the list, or on a path that is not a listed
worktree; an argument beyond the folder; a launch with no press; an opener permission granted to
the WebView.

**Record 7: Work status reads Claude Code's own session list by running the person's `claude`.**

**Why**: The owner, 2026-11-22, asked which should carry "waiting for you" first and chose the
session list: Claude Code documents `claude agents --json` as "the supported way to read session
state from outside Claude Code", and it needs no write to any settings file. Measured that day: one
call 0.24 s, 0.19 s of CPU, 160 MB at its peak.
**Prior**: Applies the `gh` precedent of Record 1 (run a program the person installed, by a fixed
call) to a second program. Keeps 87d3ada9: no arguments, environment or transcript of any process
is read; this is the tool's own published output. Narrows Record 3: hook entries are optional.
**Decision**: Atlas runs `agents --json` on an absolute path from a fixed list, never a `PATH`
lookup, with the environment cleared except `HOME` and, for a settings folder the person added
through the file picker, `CLAUDE_CONFIG_DIR` set to exactly that folder. It runs after an agent
process appears, ends or moves, otherwise at most once every 10 s in all while Work status is
visible, never hidden, one at a time, killed after 5 s. The output is parsed into `pid`, `cwd`,
`startedAt`, `kind`, `status`, `waitingFor` and `state` from closed lists; anything unknown means
unknown; `name`, `sessionId` and `id` are dropped at the parse and nothing is stored. An entry
counts only for a session and worktree Atlas already shows. If the probe sees the call open a
network connection, it is not built without a confirm and an outbound-paths row.
**Amended 2026-11-23** by `docs/records/decisions/2026-11-23-work-status-session-list-no-network-929c2179-7882-4c40-a4bc-83cfbb2612cf.md`:
the probe saw a connection attempt, the owner chose to block it, and the call runs on macOS only,
under a no-network sandbox with Claude Code's nonessential-traffic switch; the start joins as
"no later than", not equal.
**Dissent**: The schema is promised to no one and can change with any release. A 160 MB process
every 10 s is heavy for one line of state. It covers one vendor; hook entries would cover that
vendor the same way they cover others.
**Falsifier**: A `name` or `sessionId` in any payload, log or file; a `claude` started from a path
off the list, with another argument, or while hidden; two calls at once; over 2.5 % of one core
across a visible hour; a release that changes the list and leaves a room showing a wrong state
instead of its words from beats.

## Revisions

- 2026-11-22: split from `docs/specs/2026-11-21-work-status-destination.md` for length, content
  unchanged: the acceptance criteria and the decision record texts.
- 2026-11-23: criterion 27's slice 7 probe was run and Record 7 amended to what it saw (the
  destination spec's "The session list" carries the numbers). Criterion 43 is checked by
  `src-tauri/src/work_status/agent_sessions/tests.rs` on macOS, with these differences: the
  environment is `HOME` and the switch; the call tests, the sleeper and the no-connection test
  run on macOS only, the parse, join and pace tests everywhere; one folder, so a steady hour makes
  exactly 360 calls. Criterion 44's recorded walk in the installed app is not done.
- 2026-11-23: the status line and switch of slice 7 are built; `use-agent-sessions.test.ts` holds
  the off choice and a hidden screen to zero asks by call count, and `work-status-rooms.spec.ts`
  walks the header's three states and a reload with the read off. The native tests no longer
  sleep: a child the program left is awaited by its pid, in three cases (the limit, a child
  holding the output, a call that went well).
