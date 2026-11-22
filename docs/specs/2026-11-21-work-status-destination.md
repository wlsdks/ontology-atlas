---
title: "Work status: who holds which worktree, what CI is doing, and what slows this Mac"
doc_type: spec
status: draft
area: git
date: 2026-11-21
decisions: [dac7de97-cd83-4c93-8b29-5fecd5db4389]
---

# Work status: who holds which worktree, what CI is doing, and what slows this Mac

A tenth rail destination, **Work status** (`/work-status/`), in the installed app. It draws one room
per worktree: who works there, what it is doing now, how far its branch is from `main`, and how long
the running check has left. This spec settles placement, sources, trust boundaries, design and copy
for slices 1 to 7. Processes and load, fixes, bottlenecks, coordination, automation and the local
model (slices 8 to 13, with Record 2) are in `docs/specs/2026-11-22-work-status-coordination.md`.
"Work status" is the one name everywhere: plain "work" already means Atlas's own long runs
(`src/features/work-run/`, `messages/en/workCard.json`).

## Person and moment

1. **The owner, running about ten agent worktrees (observed).** His words, 2026-11-21: "a left-nav
   item that shows at a glance which agent is holding which worktree, and shows CI and PR attempts
   in real time"; "show this Mac's load and tell me what the problem is (load 104 on 12 cores,
   81 GB of duplicated Rust build folders), with a one-click fix if possible"; "not the usual
   dashboard feel"; later, "analyse where the bottleneck is and make it possible to orchestrate
   that part; if a local model can handle this level of coordination, add automation so it
   coordinates by itself". He found that load by asking an agent to diagnose a slow Mac. Next he
   wants to see it, then press one thing. On 2026-11-22, after using the shipped first slice, he
   said (translated): the screen is "too static", rows are "hard to tell apart" and he "cannot see
   what each one is doing"; make it "like a game, like characters working", moving while work runs;
   drop the headline; Git state must update at once, so that he needs no separate Git client; show
   how long a PR and its CI will take, estimated from this Mac; "20 to 30 worktrees are normal
   now"; it must not look machine-made. He chose rooms from three rendered directions and approved
   its third round, rooms in one building (the lead's relay).
2. **A team lead with six people, each running agents (not observed).** The owner's words: "a team
   of six creates a huge number of PRs that get assembled and run CI; keeping track is very hard."
   No capture of a team lead exists; the first slice does not claim to serve one.
3. **A non-developer PM asking "is it done, what's stuck" (not observed).** The owner's bar: "fun
   and good-looking enough that a non-developer understands it." Acceptance criterion 14 captures
   three cold readers before slice 7 is called done.

## Today

- **This Mac, 2026-11-21, measured for this spec:** at 20:55 `git worktree list` gave 16 worktrees
  and `uptime` load averages 20.6 / 35.5 / 45.3 on 12 cores (`sysctl hw.ncpu`); at 21:30 it gave 21
  entries, 17 of them nested inside the main checkout's folder (`.claude/worktrees/`). The lead
  measured load 104 earlier the same day with 68 heavy processes from two Claude sessions and other
  workspaces.
- **"Merged" by ancestry alone is wrong:** the reviewer measured 4 of 20 worktrees whose head is an
  ancestor of `main` only because they have no commits of their own, two of them locked by live
  Claude sessions with 50 and 87 uncommitted changes.
- **Who holds a worktree is written down.** Claude Code locks each agent worktree with a reason such
  as `claude agent agent-<id> (pid 95601 start Sat Nov 21 09:47:42 2026)`; the time in the reason is
  the session's start in UTC (reviewer, verified). The lock is a file, `.git/worktrees/<id>/locked`,
  whose modified time is when it was locked.
- **Agent processes, executable names only (`ps -o comm`, `lsof -d cwd`), 21:10:** 4 `claude` and
  2 `codex` processes. The two lock pids are `claude` processes started from a shell; descendants of
  one run inside two of its subagents' worktrees. No Gemini CLI process ran; it is a Node program,
  so its executable name is `node`.
- **Session folders, names and modified times only:** Claude Code keeps
  `<config>/projects/<folder with / as ->/<session>/subagents/agent-<id>.{jsonl,meta.json}`; the
  `agent-<id>` matches the lock reason; the meta keys include `finished` (keys read, values not).
  `<config>` defaults to `~/.claude`; this Mac also uses folders set through `CLAUDE_CONFIG_DIR`,
  which Atlas cannot see. Codex keeps `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl`,
  with no folder in the path. Gemini CLI's `~/.gemini/tmp/<64 hex>/` did not match this
  repository's SHA-256, so its mapping is unverified. No vendor documents these formats as stable.
- **Git hooks:** `core.hooksPath` is `.githooks` (`pre-commit`, `commit-msg`, `pre-push`,
  `post-checkout`, `post-merge`). `pre-push` runs parallel lanes and writes each lane's exit code
  and seconds to a temporary folder (`.githooks/pre-push:85-104`). A probe hook shows as `/bin/sh`
  and its Node children as `node`. The reviewer verified that the hook's script is an open file
  of that process (`proc_pidfdinfo`), so its name can come from the open path instead of arguments.
- **Atlas's Git calls are hardened:** `src-tauri/src/git/runner.rs:36-51` sets
  `core.fsmonitor=false`, `safe.bareRepository=explicit` and `core.hooksPath=/dev/null`.
- **Build folders:** 6 worktrees hold `src-tauri/target`, 82.9 GB in total (43.0 GB in the main
  checkout). `git worktree remove` also deletes ignored files such as `.env.local` and `output/`
  (reviewer, verified).
- **GitHub, measured once:** 1 open PR (a draft); 99 of the last 100 Actions runs completed. The many
  tasks live on this Mac. **CI triggers:** `checks.yml:24,36-37`, `e2e.yml:22,33-34`; jobs skip
  drafts (`checks.yml:62`). A push to an integration branch runs no CI.
- **Atlas reads GitHub today only for Changes,** unauthenticated, after a press: `public_curl` puts
  the URL on argv and sends no `Authorization` header (`transport.rs:332-369`); a secret-bearing
  request elsewhere goes through `src-tauri/src/llm/curl.rs:5,17` (configuration over stdin).
- **`gh`:** `/opt/homebrew/bin/gh` is installed; `gh config get -h github.com user` returns the
  account with no network request; `gh auth status` makes one (reviewer).
- **`pr:land` spends both GitHub buckets:** GraphQL (`scripts/landing/pr-land.mjs:702`) and REST
  (`:707-725`); seven landers measured 2,600 REST requests an hour on 2026-09-20 (lead's note).
- **GitHub rate facts (docs.github.com, 2026-11-21):** a user's token, OAuth app or App acting for
  the user shares 5,000 REST requests an hour; a `304 Not Modified` does not count; 100 concurrent,
  900 points a minute per REST endpoint.
- **Atlas reads no load or disk information today,** and of processes only agent programs and
  the commands under them (87d3ada9). **Local models:** the built-in model is
  bge-m3, embeddings only (decision 9e9ebc55); text generation runs only through a local runner by
  address (`outbound-paths.ts:51-56`).
- **Brand rule:** Atlas's own agent list says "Claude Agent", never "Claude Code"; a sentence naming
  a separately installed product by its real name is allowed
  (`tests/contract/brand/vendor-naming.contract.test.ts:4-8`, decision 2026-08-16 (5)).
- **Rail:** nine destinations (`src/shared/config/destinations.ts:10-24`); e7d1f38a permits ten;
  `g w` is free (`:82-97`). **Repository choice:** Changes grants source reading of a chosen
  repository without a vault (`docs/features/change-briefing.md:170-174`).
- **The shipped first slice (read 2026-11-22):** a headline and a summary lead the page
  (`src/views/work-status/ui/WorkStatusPage.tsx:75-78,93-116`) above rows on one ruler. While
  visible the page asks for a stat digest each second and reads fully when it differs
  (`src/views/work-status/model/use-work-status.ts:5,48-57`). The digest covers `HEAD`, `locked`,
  `logs/HEAD`, `packed-refs`, the `worktrees` folder and the base branch's ref
  (`src-tauri/src/work_status/fingerprint.rs:10-13`): a changed index, a push and a merge or rebase
  in progress do not change it, and a row carries no uncommitted count or upstream state
  (`src/shared/lib/work-status/tauri-work-status.ts:28-43`).
- **This Mac, 2026-11-22 13:16:** 17 worktrees, load 12.4 on 12 cores, 64 GB of memory. Agent
  processes by their own working folder: Claude Code, one in the main checkout, one in a linked
  worktree, two outside this repository; Codex, two in the main checkout. Four alternative Claude
  Code configuration folders exist; which session reads which was not read.
- **`pre-push` keeps no result:** it deletes its lane codes and seconds on exit
  (`.githooks/pre-push:73-75`), so nothing records how long a past run took.
- **Agent hooks:** the facts under Agent state are vendor documentation the lead verified on
  2026-11-22, not re-read here. Unverified until criterion 27's probe: where an entry fires (a
  running session, another settings folder, Codex) and how to detect managed
  `allowManagedHooksOnly`. This repository's harness already uses both hook files
  (`.claude/settings.json`, `.codex/hooks.json`).
- **Atlas already writes agent configuration on a press:** the connect button writes absolute paths
  (`.claude/rules/surfaces.md:153`) by an atomic, `O_NOFOLLOW` write
  (`src-tauri/src/agent_setup.rs:444-447`).
- **Moru rules:** "not an ontology kind, assistant persona or work detector"
  (`docs/design/brand.md:31`); no other surface plays the permission card's rows (`brand.md:209`);
  "no idle state pretends work is occurring" (`brand.md:260`). The companion game was retired
  (e9cdf138). The board moves today by Track glide (`docs/DESIGN-SYSTEM.md:267`).
- **Renders the owner approved (2026-11-22), "rooms in one building":** read for this revision,
  `a3-6-1920.png`, `a3-30-1920.png`, `a3-states.png` and `a3-6-1920-moments-dark.png` under
  `ws-game-a3-ref/out/` in the session scratchpad, and the earlier round's 40-worktree and empty
  renders; working files for the pull request, never committed.

## Problem and alternatives

**Ranked by value against cost.** (1) Which agent and subagent holds which worktree, and whether it
is merged: highest value, local, needs only Git and the pids in locks. (2) Processes: sessions,
hooks, load and disk: today's pain, one new read boundary. (3) Safe fixes. (4) Naming the
bottleneck. (5) PR and CI live: this repository has 1 open PR, so it pays off at the integration
PR and for teams. (6) Coordinating by hand, then (7) automatically: highest leverage, highest trust
cost. (8) Team-wide view: unobserved. The first plan took this order; the direction of 2026-11-22
put slices 2 to 7 ahead of (2) to (4), (6) and (7), which the coordination spec now holds.

**Cause or symptom.** State is spread across `git worktree list`, lock reasons, `ps`, `du`, GitHub
and `pnpm pr:queue`, and only an agent asked to diagnose joins them. Load is a symptom: several
heavy jobs start at once with nothing that makes them take turns.

**Where it lives.**

| Option | Gives back | Costs | Verdict |
|---|---|---|---|
| Status quo: terminal, GitHub web, `pr:queue` | everything, to a developer | reconstruction each time; a PM cannot do it | loses: the owner asked because it fails him |
| A tab in Changes | reuses its repository grant | Changes answers "what was merged"; a live view breaks its digest | loses |
| A tab in Git | next door | Git is scoped to the vault's documents | loses: wrong repository |
| A tab in Agents | agents live there | worktrees, CI and load are not agents | loses |
| A tab in Automations | schedules and runs | it owns Atlas's own schedules | loses (rules too: the coordination spec, Automation) |
| **A tenth rail destination, Work status** | the owner's literal ask | the last slot under e7d1f38a | **chosen** |

**What the owner rejected on 2026-11-22, ranked by what each gives back against its cost.** (1) Rows
he cannot tell apart: the rooms board, drawn from facts the first slice already reads. (2) Git
state that lags: live refresh, one more local read. (3) No time left on a check: a hook's own run
record gives pre-push an estimate with no network. (4) An agent waiting on him unseen: only the
agent's hooks know it, and adding them is a one-way change (Record 3). (5) PR and CI time: it
follows the host connection. Slices 2 to 7 take this order.

**The board.** Status quo, rows on a ruler: every worktree is one line of equal weight, so 34 read
as a list and the one that needs him looks like the rest; it lost on his own use. Columns stay
ruled out as "the usual dashboard". Rooms were first rejected here because 60 PRs do not fit and
idle characters invent activity. Two rules answer both: tiers show at most six rooms large and fold
the rest, and a figure is drawn only for a session Atlas has evidence of, moving only while a
measured state runs. Rooms are not the retired game (e9cdf138): no simulation, score or saved
state. The two sides stay as one conveyor per room: left of push is this Mac, right of it the host.

**Host connection.** `forbidden.md:37` bans restoring authentication surfaces in Layer 1, with no
qualifier. Reusing `gh` adds none: Atlas shows no sign-in, holds no credential, and runs a program
the person already signed in; it is an outbound path under `local-first.md` "Outbound data" and
f741cf86, listed and logged. The device flow with Atlas's GitHub App is an in-app sign-in and is
deferred to its own decision (Later 5), although the owner approved registering the App: that
decision must first change the `forbidden.md` wording, and the App's owner could mint installation
tokens that read every installing organisation's private PRs and logs without any user, which the
dialog would have to disclose and an organisation-held key policy would have to bound.

| GitHub option | Non-developer | Enterprise | What leaves the machine | Now |
|---|---|---|---|---|
| **Reuse `gh`** | needs `gh` installed and signed in | inherits SSO and any GHES host | requests made by `gh`; Atlas never sees the token | **slice 6** |
| Device flow, Atlas's App | a code and a browser page | github.com only; org must install | user token in the keychain; the App owner gains standing access | own decision |
| Pasted token | token pages and expiry | works where both are blocked | same as device flow | Later |

**The `gh` call** is fixed: an absolute path from a fixed list (`/opt/homebrew/bin/gh`,
`/usr/local/bin/gh`, `/usr/bin/gh`, `%ProgramFiles%\GitHub CLI\gh.exe`); working folder in Atlas
app data; environment cleared except `HOME`, `GH_CONFIG_DIR`, `XDG_CONFIG_HOME` (and `APPDATA` on
Windows); always `--method GET`, never `-f`, `-F` or `--input`; endpoints from fixed templates with
owner and repository matching `^[A-Za-z0-9_.-]{1,100}$`; `--hostname` only for github.com or a host
`gh config` already lists. Userinfo is stripped from `origin` wherever it is read or shown. Before
the opt-in only `gh --version` and `gh config get -h <host> user` may run.

**Polling.** `gh api --method GET` is REST, so Atlas spends the same 5,000-an-hour bucket as
`pr:land` and every other program signed in as that account. While visible: the open-PR list every
60 s, the jobs of each run in progress every 30 s, and everything every 3 min when no run is in
progress, each with `If-None-Match`; hidden, nothing. Atlas reads `remaining` from each answer:
when it falls by more than 20 a minute beyond Atlas's own requests for 2 minutes, another program
is spending and every interval doubles until that stops; under 1,500 Atlas sends one request every
2 minutes; under 500 it pauses. At most 1,000 counted requests an hour in all: when more runs are
in progress than that allows, the job interval stretches evenly, rooms on the stage first
(criteria 12 and 31).

**Hosts.** The owner asked for other hosts; the plan keeps them. GitHub is built directly in the
first slices; the provider interface (list change requests, read state, read runs with jobs and
steps, conditional fetch in a budget) is introduced when the second host is built.

| Provider | Words on screen | Sign-in | Rate limit (vendor docs, 2026-11-21) | Order |
|---|---|---|---|---|
| GitHub, GHES | PR, CI, job, step | `gh` | 5,000/h per user; 304 free | 1 |
| GitLab.com, self-managed | merge request, pipeline, job | `glab api --hostname` | user 5,000/h Free to 25,000 Ultimate; group 5,000/h on Free | 2 |
| Bitbucket Cloud | pull request, pipeline, step | API token | repository data 1,000/h per user | 3 |
| Azure DevOps | pull request, pipeline run | `az` or a PAT | 200 TSTUs in 5 minutes | 4 |
| Bitbucket Data Center, Gitea, Forgejo | pull request, build | access token | instance-set; unknown | 5 |

## Flow

1. When the person presses **Work status** in the rail (or `g w`) with no repository chosen, Atlas
   shows the choose-repository stage; choosing one is the Changes grant.
2. When the repository opens, Atlas draws the board within 2 s: the front stage, one floor per
   session, and the shelf. A worktree outside the chosen folder appears only when its `.git` file
   and the repository's `gitdir` record point at each other.
3. When a lock names a pid, Atlas checks that pid's liveness and start time against the reason's
   UTC time (±1 s; ±2 s on Linux, which counts from boot); a match is a live holder, a mismatch a
   stale lock, an unparseable reason a live lock. A pid that exists but whose start Atlas may not
   read is believed. A worktree with no lock says "No lock".
4. When a worktree's head has nothing beyond the base branch, it says "No commits beyond {branch}"
   and offers no fix. It is merged only when its branch moved after it was created (the first
   entry of the branch's reflog names another commit than its head) and its head is an ancestor of
   the base off the base's first-parent line. A branch created at a merged commit that never moved
   is not merged: on a repository whose every base commit is a merge, that is every new
   integration or PR branch. If the first-parent line cannot be read, the standing is unknown and
   the room says "Not measured against {branch}". The main checkout and the base branch are never
   merged rooms, and a room a live session holds stays on that session's floor even once merged.
5. When an agent commits, switches branch, stages a file, pushes, or adds or removes a worktree, its
   room changes within 2 s; an edit not yet staged shows within a minute where an agent works. When
   a room's state changes class it glides to its new place, and nothing else moves.
6. When a hook that writes its run record starts, the room shows each lane and the time left: with
   no earlier run, the elapsed time and "No estimate yet"; past its usual longest time, "Slower
   than usual". When a hook ends, its result is what changed: after `pre-push`, the remote-tracking
   ref moved to the pushed head (passed) or not (stopped); after `pre-commit` or `commit-msg`,
   `HEAD` moved or not.
7. When the person presses **Add to Claude Code**, Atlas lists the settings files it would change,
   each with its exact entries, and writes them only on confirm; from then a session that asks for
   approval takes the first place on the stage within 1 s. When the file says a session is asking
   but its process has ended, the room never reads as asking; when no event arrives, rooms keep
   showing only whether a command runs.
8. When the remote is GitHub or a GHES host and nothing is connected, the dashed part of a
   conveyor offers **Show PRs and CI from {host}**; pressing it opens a dialog stating what is
   sent and received; nothing is requested before the person confirms.
9. When connected, rooms with a PR gain their PR and CI stations and the time CI has left, updated
   while the screen is visible, within the budget; hiding it stops requests. When the bucket Atlas
   spends runs low, Atlas slows, then pauses, says so beside the shelf, and CI countdowns stop.

Findings, fixes and automatic actions continue in the coordination spec's Flow.

## States

| State | Web | macOS app |
|---|---|---|
| No repository chosen | `workStatus.web.title`, `.web.body`, Get the app | `workStatus.choose.title`, `.choose.action` opens the picker |
| Loading: first read | as above | the board draws at once; rooms arrive as each worktree is read, `workStatus.reading`; input never waits |
| Error: git missing or the folder unreadable | as above | git missing reuses `atlasGit.install.*`; unreadable says `workStatus.unreadable` with Choose repository folder |
| Empty: only the main checkout | as above | `workStatus.empty.title`, `.empty.body` |
| Worktree folder missing | as above | a dark room with `workStatus.chip.missing` and `workStatus.row.missing`, with `git worktree prune` as text |
| No lock; stale lock; zero commits | as above | `workStatus.holder.noLock`; a stale lock is a dark room with `workStatus.chip.lockLeft` and `workStatus.row.lockLeft`; `workStatus.row.noCommits` |
| On this Mac only (no host connected) | as above | each conveyor is dashed after push with `workStatus.conveyor.notConnected`; slice 6 adds `workStatus.connect.offer` as its button |
| On the server only | as above | a mini room on the No session floor with `workStatus.side.notOnMac` |
| A worktree with no PR | as above | `workStatus.git.unpushed`, or `workStatus.git.pushed` with `.side.noPr` |
| Uncommitted files; operation in progress; no branch | as above | `workStatus.git.uncommitted`, `.git.operation`, `.git.detached` on the monitor's last line |
| A live session with no command; more working rooms than the stage holds | as above | `workStatus.room.quiet`, after 5 minutes `.room.silent`, a held pose; `workStatus.stage.more` |
| Find: no match | as above | `workStatus.find.none`; Escape clears the field and keeps focus in it |
| A check running: time known, under 90 s, unknown, late | as above | `workStatus.eta.range`, `.eta.about`, `.eta.unknown`, `.eta.slow` |
| Agent state: not added; confirm | as above | `workStatus.agentState.offer` with Add to Claude Code and Not now; `.confirmTitle`, `.confirmBody` and each listed file with its entries and Add another settings folder, where Cancel changes nothing |
| Agent state: added; Codex not yet trusted | as above | `workStatus.agentState.status` with Remove; when sessions stay silent, `.silent` with Add another settings folder; `.codexTrust` |
| Agent state: blocked, or the file refused | as above | `workStatus.agentState.managed` with no button; `.invalid`, `.changed`, `.linked`, `.unwritable`, `.pickRefused`, nothing written |
| Waiting for approval; thinking; finished replying | as above | `workStatus.room.asking.*` first on the stage; `.room.thinking.*`; `.room.replied` |
| The remote base was fetched over 3 min ago | as above | `workStatus.fetch.stale` with Fetch now and `.fetch.auto` (slice 6) |
| pre-push passed; stopped; result unknown | as above | `workStatus.hook.passed`; `.stopped` with `.stoppedLanes`, in the stage's second class until the head moves or a new run starts; `.unknown` |
| Ready to merge | as above | `workStatus.status.ready` with `.readyDetail`, the parcel standing at the hatch |
| CI time left while reading is slowed, paused or offline | as above | the last read's range, not counting, with `workStatus.eta.frozen` |
| `gh` not installed; signed out; no access (404) | as above | `workStatus.gh.missing`, `.signedOut`, `.noAccess`, each with Check again |
| Connecting | as above | `workStatus.connect.body`; Cancel leaves the conveyors dashed |
| Connected; stop reading | as above | `workStatus.connected.line`; `.stop`, `.stopNote` |
| Throttled | as above | `workStatus.throttle.slowing`, `.paused`, `.secondary`; data keeps its read time |
| Offline; no remote; host without a provider | as above | `workStatus.offline`, `.noRemote`, `.unsupportedHost` |
| Largest measured: 34 worktrees (2026-11-21); fixtures of 40 and 60 | as above | six large rooms, every other worktree a mini room on its floor or a shelf count; floors scroll, the header, stage and shelf stay |
| Windows app | Out of scope: same web card | "this computer" variants; rooms from locks and Git, no session by process; `workStatus.agentState.windows` in place of the Add button; PRs and CI as on macOS |

The web card follows `.claude/rules/surfaces.md:116-119` and joins `DEGRADED_SURFACES`.

## Design direction

Rooms in one building, the owner's choice of 2026-11-22 (Today). This section fixes structure and
behaviour; ink, light and pixel styling follow the approved renders. Sources are principles, not
assets: GitHub Actions' run graph and merge queue, Linear's gliding states, the Git clients under
Live Git state. Kept: one ink per session (`--work-session-1` to `-5`), the stations, push as the
crossing, help popovers. Retired: the bands and seam, rows on a ruler, the headline and summary.

**Header.** Title, `repoLine`, Find, Choose repository folder. Nothing else leads the page.

**A room** is one worktree. It has a wall sign with the branch; a floor lamp, lit in the session's
ink while a session is live there and dark when none is; Moru under a tag naming the tool and
session number; and a wall monitor: a label line ending in the elapsed and usual time or the commit
count, one large line, a small picture of the check (lanes or jobs), and one line of Git facts. A
large room also draws a conveyor under its floor: stations pre-push, push, PR, CI, a `main` hatch
at its end, a parcel standing where the branch is, and a pill over the parcel with the time left.
The parcel rides between two stations only while a timed check runs, stops short of the next when
the check runs late, and enters the hatch only on the fact. Where Atlas cannot see (no remote, no
host connected) the conveyor is dashed from there on and says why.

**Three tiers by attention.**

1. **Front stage:** at most six large rooms, by class: waiting for approval; CI failed or pre-push
   stopped; ready to merge; slower than usual; pre-push or CI running, and a merge for its moment;
   working, thinking or two tools; lock left behind or folder missing. Equals keep the order they
   arrived in, so a room moves only when its class changes: up at once, down after the lower state
   has held 5 s. Rooms beyond six lead their floors, and `stage.more` counts those that are working.
2. **Session floors:** one floor per session and one for worktrees no session holds. Its label
   gives the session, its start, its worktree count and at most three counts (`floor.sum.*`). Mini
   rooms are equal in size: a small scene, the branch, one status line, and an edge filled as far
   as the branch has come. With six or fewer, the floors merge into one row and each mini room
   names its session.
3. **Quiet shelf:** counts that open a list (merged into the base branch; unchanged for over 7 days
   with no session), then the latest merges with their times.

**Moru is drawn only where a session is evidenced and loops only while a measured state runs,**
which keeps `brand.md:31` and `:260`: state comes from the signals in Cases, never from the figure,
and a room with no running state is still. Only clips that exist are used, named by their row
`public/brand/mascot-<name>-row-128.png`: `code` (the brand guide's `laptop-code`), `think`,
`pondering`, `read` (`source-read`), `waiting` (`blink`), `await-permission` and `uncertain`.
The last two are reserved to the permission card (`brand.md:209`); slice 2 changes that row and
adds a Work status row to the table. Each room's loop starts at an offset taken from its worktree
id, so six rooms never move in step. Session identity rests on the tag and the lamp, never on
Moru's ink.

**Sizes.** The stage shows as many large rooms as fit at their minimum width, at most six: six
across at 1920, three at 1040×720. Floors scroll; the header, the stage and the shelf stay. Room
minimum sizes are new tokens in `app/styles/work-status-tokens.css` (new tokens needed). **Empty:**
one lit room with Moru's `waiting` loop, `empty.title` and `empty.body`. **Web:** the degradation
card, no rooms. **Reduced motion:** still states: figures hold a pose, a tier change cross-fades in
place over `--motion-fast`, digits swap, lamps are steady, the parcel is placed at each read.

### Cases

"Large" is a state's class on the stage; such a state also has a mini form for the seventh room on.
"Dark" is a room with its lamp off and no figure. Any room's last monitor line carries Git facts.

| State | Large | Mini | Shelf | Scene (existing clips) | Signal | Slice |
|---|---|---|---|---|---|---|
| Waiting for approval | first | yes | no | `await-permission` loop; the lamp and monitor turn amber and breathe | agent-state file: PermissionRequest or `permission_prompt`, with a live session | 5 |
| CI failed | second | yes | no | `uncertain` once, then held; the monitor takes danger ink | host: a failed job | 7 |
| pre-push stopped | second | yes | no | `uncertain` once, then held; the monitor names the lanes that failed | a hook-run record that ended with a failed lane, or a `pre-push` that ended with the remote-tracking ref unmoved; until the head moves or a new run starts | 4 |
| Ready to merge | third | yes | no | `waiting`, held; the parcel stands at the hatch | host: an open PR that is not a draft, with every check passed and no conflict | 7 |
| Slower than usual | fourth | yes | no | `pondering` loop | elapsed past the usual longest time (Time left) | 4, 7 |
| pre-push running | fifth | yes | no | `read` loop | hook-run record | 4 |
| CI running | fifth | yes | no | `waiting` loop | host: a run in progress | 7 |
| CI queued | no | yes | no | `waiting`, held | host: a run queued | 7 |
| Merged just now | keeps its place 3 s | no | then counted | held pose; the parcel enters the hatch and the lights go out | the base ref moved (Flow 4), or the host says merged | 2, 7 |
| Working | sixth | yes | no | `code` loop; lines scroll on the monitor | a command of the session runs in the folder (shipped), or PreToolUse | 2, 5 |
| Thinking | sixth | yes | no | `think` loop; a cursor blinks on the monitor | agent-state file: UserPromptSubmit or PostToolUse | 5 |
| Two tools in one worktree | sixth | yes | no | two figures, each under its tag | processes of two tools in one folder (shipped) | 2 |
| Finished replying | no | yes | no | `waiting`, held | agent-state file: Stop or `idle_prompt` | 5 |
| No command running; quiet over 5 min | no | yes | no | `waiting`, held | a live session with no command seen (shipped) | 2 |
| Lock left behind; folder missing | seventh | yes | no | dark; a taped parcel, or its outline | a stale lock; a missing folder (shipped) | 2 |
| No session, changed within 7 days | no | yes | no | dark; a parcel | last commit time (shipped) | 2 |
| No session, unchanged over 7 days; merged | no | no | counted | none | last commit time; Flow 4 (shipped) | 2 |
| No remote; host not connected | dashed conveyor and its reason | status line | no | by its other state | `origin`; the connection | 2 |
| Pushed, no PR; commits not pushed | Git facts line | status line | no | by its other state | remote-tracking ref against the head; host | 3, 7 |
| Uncommitted files; merge, rebase or cherry-pick in progress; no branch | Git facts line | status line | no | by its other state | `git status` and Git's operation files | 3 |

### Motion

Every motion starts from the drawn value, moves only `transform` and `opacity`, yields to the next
read or input by retargeting from where it is, and never restarts mid-way. A loop runs only while
its state does and pauses when the screen is hidden or its room is off screen; a board with no
running state draws zero frames between reads. Returning to the screen places rooms without travel.

| Change | What moves | Time and curve | Reduced |
|---|---|---|---|
| A room enters | it fades in rising; neighbours make room | `--motion-base` on `--motion-ease`; neighbours on `SPRING.surface`; the first open staggers once (`useStaggerOnce`, within `--motion-expressive`) | appears |
| A room leaves | it fades where it stands; neighbours close | exit clock `calc(var(--motion-base) * 0.67)` on `--motion-ease-exit`; neighbours on `SPRING.surface` | disappears |
| A tier or place changes | one element glides from its drawn box to the new one (FLIP); the large and mini faces cross-fade at their own size, so no text is stretched; rooms changed by one read start together | `SPRING.surface`, retargeted from position and speed; faces over `--motion-base`. If the recording reads abrupt across 1920, a slower `SPRING` entry (new token needed) | cross-fade in place over `--motion-fast` |
| Time left changes | each digit rolls to its value; a change of shape ("3–5 min" to "About 50 s") cross-fades (`SwapText`) | `--motion-slow` on `--motion-ease`; a new primitive in `motion-work.css` on existing tokens | digits swap |
| A check runs | the parcel rides one linear transform across the estimate's upper bound; a new estimate changes its speed from where it is and never moves it back; running lanes breathe (`.motion-run-pulse`) | linear, for the check's length | placed at each read |
| Approval is asked | the room is promoted as above; lamp and monitor cross-fade to amber and breathe; the figure cross-fades | amber in over `--motion-base`; breath period `calc(var(--motion-base) * 9)`, a work-only loop listed in `infinite-motion` | steady amber |
| A check runs late | the parcel eases to rest short of the next station; words and ink cross-fade | `--motion-settle`; ink over `--motion-fast` | placed |
| CI fails | the monitor and job marks take danger ink and the figure changes; no shake | `--motion-fast` | same end state |
| A PR merges | the monitor's words swap, the parcel runs into the hatch, the lamp and the room's light go out; after 3 s the dark room glides into the shelf's count, which rolls up by one | parcel `--motion-expressive`; light out over `--motion-slow`; fold on `SPRING.surface`, opacity on the exit clock | the count swaps, the room disappears |
| A session ends and its lock stays | the figure fades and the lamp goes out, the parcel stays; then a demotion | figure on the exit clock; light over `--motion-slow` | same end state |

**Checked per frame** (criterion 20), on the static build with the desktop bridge stubbed in the
page and scripted snapshots of 6 and 40 rooms. Every moving box: `motionShares` with a first-frame
share `ffs` of at most 0.15 and a largest frame share `mfs` of at most 0.27, the eased bar of
`tests/e2e/motion-sampler.spec.ts:71-72`, and at least 8 frames between start and end, also when a
second change lands mid-glide; `smoothnessViolations` empty, so no layout property animates; zero
frames at rest. CI enforces those. `expectSmoothMotion` enforces the 50 ms frame interval only
under `MAP_PERF_BARS=1` (`tests/e2e/motion-sampler.ts:388`), so that bar is run headed on this Mac
with 40 rooms and its printed interval attached to the pull request.

## Agents and hooks on this Mac

**Model.** Tool → session → subagent → worktree. A session is one agent process; a subagent is work
the session started, often in its own worktree; several sessions of one tool may share a
repository; two tools may touch one worktree.

**Identity comes from evidence.** A session is established by a lock's pid (with its start time), an
Atlas ACP session's pid, or an agent program: a process whose executable path is `claude`,
`claude/versions/<version>` or `codex`. A process belongs to a worktree by its **own** working
folder, matched on whole path components to the deepest worktree, including a missing one; it counts
for the outermost agent of the nearest agent's tool in its parent chain, and a chain through an ACP
pid is that session's. An agent the system launched (parent pid 1, as the Codex app's server) is not
credited for its own folder, only through its commands. An agent's process that also holds locks
joins the lock's session; a session seen only by processes reads "{tool} · session {n}", its rooms
"{tool} is running in this folder" (`holder.process`), and it sorts after locking sessions. Only
actions (slice 9, the coordination spec) require a lock or ACP pid; a name alone never makes a
process eligible for one.

| Signal | Gives | Tools | Status | Slice |
|---|---|---|---|---|
| Lock reason pid and UTC time; `locked` file mtime | subagent id, session pid, lock time | Claude Code | verified | 1 |
| ACP session pids and `cwd` | session, exactly | Claude Agent in Atlas | verified (`tauri-acp.ts:106`) | 1 |
| Own working folder, parent chain, executable path | which agent works in which worktree, under which session | Claude Code, Codex (macOS, Linux) | built 2026-11-22 | 1 |
| The hook-run record a hook writes (Time left) | a running hook, its lanes and their seconds | any hook that adopts it | contract in this spec | 4 |
| The agent-state file Atlas's helper writes from the agent's hooks | thinking, waiting for approval, finished replying | Claude Code; Codex only after the probe | documentation verified by the lead; a real session unverified until criterion 27 | 5 |

**No arguments or environment are read.** Executable names come from the kernel's process name,
confirmed by the executable path (Claude Code's kernel name is its version, `2.1.330`);
`KERN_PROCARGS2`, which copies every argument and the environment, is never read. Lane names and
results come only from the hook-run record a hook chooses to write (Time left).

**On screen:** "Claude Agent in Atlas" for ACP sessions; Claude Code, Codex, Gemini CLI for programs
the person installed.

## Live Git state

The aim: a person watching Work status needs no Git client open beside it. A room's Git facts are
its branch, commits beyond the base, uncommitted files, commits not pushed or "Pushed", an operation
in progress with its conflicts, and the last commit's time. Principles from MIT-licensed clients
(lazygit, VS Code, SourceGit, GitHub Desktop; the lead's research of 2026-11-22, not re-read here;
no code copied, no GPL or source-available client read): snapshot refs cheaply, watch `.git` and
gather changes, ignore lock files, take no lock a person's command needs, fetch on a slow clock.

| Read | When, while visible | Cost and bound |
|---|---|---|
| File-change notice on the common Git folder: `HEAD`, `refs/`, `packed-refs`, and each worktree's own `HEAD`, `index`, `locked` and operation files; `*.lock` and `objects/` ignored | always; changes gathered for 250 ms, at most 1 s | no process; a commit, branch switch, stage, push or lock is on screen within 1 s |
| The shipped stat digest, extended with each index and the remote-tracking refs | every 10 s, and at once when a notice reports lost events or the volume cannot be watched | stats only, no process; catches what a notice missed |
| `git status --porcelain=v2 --branch` in one worktree | only after a notice for that worktree's `index` or `HEAD`, at most once per 2 s per worktree and one in flight at a time; and once a minute in a worktree where an agent process works, because an edit not yet staged moves no file under `.git` | 65 ms of CPU each (the reviewer's measurement, 2026-11-22); a worktree nobody works in costs nothing |
| Agent processes | each second (shipped) | 1.6 ms a read |
| `agent-state/` and `hook-runs/` | file-change notice, never a poll | within 1 s |
| `git fetch origin` | never, unless the person turns it on (slice 6): every 3 min, never `--prune`; skipped while a `git` process has its working folder in one of the repository's worktrees or a ref lock file exists, because a fetch takes ref locks an agent's own command needs | one request per 3 min, listed in `outbound-paths.ts` and logged |

Every read goes through `runner.rs` with `GIT_OPTIONAL_LOCKS=0`, so Atlas never refreshes an index
or holds `index.lock` against an agent's commit. Atlas does not watch working trees, which build
output would flood: a staged or committed change is exact within 2 s, an edit not yet staged within
a minute where an agent works. **Hidden:** notices stop, no process is sampled, no Git runs;
returning reads everything once. **Budget at 40 worktrees with six agents working, measured in
slice 3:** under 1 % of one core over a minute; no Git process in a minute with no notice and no
agent process; no read over 250 ms on a thread that draws; under 30 MB of added resident memory,
reported with its peak.

## Time left

Jenkins (MIT) estimates a build from its recent durations; this is that principle, as a range.

**Inputs.** For a hook: its last 20 passed runs in this repository, each with its whole time from
the hook's first line to its exit, so the serial phase before the lanes counts
(`.githooks/pre-push:78-79`), with each lane's time and the load per core when the run started.
For CI: per job, the last 20 passed runs on the host; how long recent runs waited to start; and the
job order from `needs` in the run's workflow file, read at the PR's head from the local repository
(`git show <head>:<path>`, the path the run names) and named on the monitor. Now: elapsed time, the
lanes or jobs done, and for a hook the load per core when this run started.

**Formula.** A hook's usual time is the median of its whole-run times and its usual longest their
90th percentile (the maximum under ten runs), both multiplied by `max(1, load per core at this
run's start) ÷ max(1, median load per core at the start of the runs in its history)`, kept between
1 and 3: start against start, so like is compared with like and the figure does not swing with
each load sample. Once lanes run, the upper bound is also at most elapsed plus the usual longest of
the slowest unfinished lane. CI's time is the longest chain of unfinished jobs through `needs`
(median and 90th percentile per job) plus the median wait while queued; when the workflow file
cannot be read, jobs count as running together and the monitor says so. Time left is the figure
minus elapsed, recomputed at every read or poll.

**Shown.** A range in whole minutes ("3–5 min left"); "About 45 s left", counting each second, once
the upper bound is under 90 s; "Under 2 min left", naming the upper bound, once the lower bound has
passed. Past the usual longest: "Slower than usual" with the elapsed and usual times, never a
number below zero. Under three passed runs, or a lane or job with none: "No estimate yet" and the
elapsed time. The pill names what the time leads to: push, CI's end, or `main` only when the host
says the PR merges by itself once its checks pass. A CI room counts down only between reads that
succeed: while reading from the host is slowed past a minute, paused or offline, its countdown
stays at the last read's value and the last line gives that read's time (`eta.frozen`).

**The hook-run record, a versioned file contract.** `hook-runs/` in Atlas's app data, created when
a repository is first opened in Work status; without it a hook writes nothing. `VERSION` holds `1`.
A hook writes `<pid>.json` atomically from its first line, at each lane's start and end, and at its
end: its name, worktree, start, the 1-minute load and core count at its start, and per lane a name,
a state from a closed list and its seconds.
Atlas reads each with `O_NOFOLLOW` and a 4 KiB cap, shows a lane name as plain text of at most 40
characters, folds an ended record into the history and deletes it. This repository's `pre-push`
adopts it in slice 4; a hook that writes none gets a room state in slice 8 (the coordination spec).

**History store.** One file per repository in the app's OS cache folder, outside every vault: at
most 20 runs per lane or job, 256 KiB; durations, loads and lane or job names, nothing a person
wrote. Deleting it only returns estimates to "No estimate yet"; it refills from the next runs.

## Agent state from the agent's own hooks

A process tells Atlas that a command runs; whether an agent is thinking, waiting for approval or
has finished its reply is known only to its hooks. Ways to learn it: processes only (the status
quo, which stays the base); session transcripts, which hold the conversation (refused in 87d3ada9);
a snippet the person pastes, a hand edit of JSON where a slip goes unseen; or **Atlas adding its
own entries on a press**, the owner's choice of 2026-11-22 and a one-way change (Record 3).

**The agent config writer** (`src-tauri/src/agent_config/`) is the only code that writes an agent's
settings. Harness hook management will reuse it under the same rules (Later 1).

1. It writes only on the person's press: never from a rule, a schedule, the model or an agent.
2. The confirm shows each file's path and the exact entries as a diff. Rust keeps that proposal
   with the file's hash; if the file changed since, nothing is written and the confirm reopens.
3. It touches only the entries asked for; every other key keeps its value and order. A file that
   is not valid JSON, is a link, or is not the person's own is refused unchanged.
4. Before every write it records a version of the file's hooks in the version store below, then
   writes atomically, keeping the file's mode. Undo rides on that history: one press in Work
   status takes out Atlas's entries and leaves every hook the person added since.
5. When managed settings forbid a person's own hooks, it says so and offers no button. It never
   accepts trust for the person: neither Claude Code's workspace trust nor Codex's `/hooks`.
6. A hook command comes only from a built-in template or, in Harness, from text the person typed in
   Atlas; never from a vault file, a document, a PR, a branch name, an agent or the model.
7. The file's content stays in Rust: only the entries' diff and counts reach the page, and no
   content enters a log or an error. Each write is logged in app data by path, time and entry.

**The version store, part of the writer** (the owner, 2026-11-22: hooks are versioned before every
write). A version is the `hooks` value of one settings file at one moment, byte for byte, and no
other key of the file. It lives in `hook-history/<scope>-<tool>-<short hash of the file's path>/`
under the app's local data folder (on Windows `%LOCALAPPDATA%`, never the roaming folder), one JSON
file per version: a schema number, the settings file's absolute path, tool, scope, time, source
and `hooks`. The writer records the hooks as they are before a write, unless they equal the newest
version, and as written after it. Kept: the newest 200 per file within 10 MiB per folder, oldest
out first; a version saved by name is never dropped. Folder 0700, files 0600, written atomically,
no link followed; version files never enter a vault, a log, an agent turn or a model call. The
store also takes versions from callers other than the writer (first seen, changed outside Atlas,
saved by name), deletes one version or one file's history on the person's press, refuses a named
save when saved versions fill the folder, and lists and searches in Rust, returning only the
fields its reader asks for. The Harness agent settings spec builds named saves, restore of any
version or of one deleted hook, and the history screen on this store.

**Targets, and the probe that comes first.** The owner runs Claude Code from several settings
folders set through `CLAUDE_CONFIG_DIR`, each with its own `settings.json`; an entry in
`~/.claude/settings.json` reaches none of those sessions. So the confirm lists its target files:
`~/.claude/settings.json` by default, and each file the person added with **Add another settings
folder**, which opens the system file picker on that folder's `settings.json`. Atlas lists no
folder and searches no disk for settings; it remembers a picked path as a preference and refuses a
picked file inside a Git work tree unless it is that repository's own settings file. Each listed
file has its own diff and can be left out. Before any of slice 5 is built, a probe by hand pastes
one `async` entry into one file and records where it fires (criterion 27). Until it has run,
Codex is unverified and Add to Codex is not offered (criterion 28).

**What Work status adds.** One entry per event (SessionStart, UserPromptSubmit, PreToolUse,
PostToolUse, PermissionRequest, Notification for `permission_prompt` and `idle_prompt`, Stop,
SubagentStop, SessionEnd), each `{"type":"command","command":"<helper>","async":true,"timeout":5}`
under `hooks.<Event>`, recognisable by the helper's name. `async` matters: a hook otherwise delays
its tool call (default timeout 600 s). Claude Code's file watcher picks up an edited settings
file, though hooks wait for the folder's workspace trust; Codex reads `~/.codex/hooks.json` and
runs an entry only after the person trusts it in `/hooks`. Managed settings are read for
`allowManagedHooksOnly` when their file is readable; otherwise a block shows only as silence after
the add, and the screen says so.

**The helper** is a small program shipped with the app at a path that survives updates. It reads at
most 64 KiB of standard input and writes nothing when there is more. It keeps an allow-list only:
`hook_event_name` and the notification type from closed lists, `session_id` when it is at most 128
letters, digits, `-` or `_`, `cwd`, and the time; and it adds the pid and start time of the agent
process that ran it (found as 87d3ada9 finds an agent above a process), so the file joins a session
Atlas already shows and stops counting when that process ends. Everything else is dropped
(`transcript_path`, `tool_name`, `tool_input`, `tool_response`, `message`). The file's name is a
hash of that pid, its start time and `cwd`, never `session_id` or any other text from the event;
it is opened with `O_NOFOLLOW`, mode 0600, and replaced atomically. The helper prints nothing,
because an agent may read a hook's output; opens no network connection; always exits 0; and writes
only when `cwd` is inside a repository chosen in Work status.

**The agent-state file, a versioned contract.** `agent-state/` in Atlas's app data, mode 0700,
`VERSION` `1`, one file per session and folder, under 1 KiB. Atlas reads it with `O_NOFOLLOW` and a
4 KiB cap into exactly those fields, takes the event from a closed list, places `cwd` on a listed
worktree by whole path components, and deletes a file whose process has ended.

| Last event | Room state |
|---|---|
| PermissionRequest, or Notification `permission_prompt` | waiting for approval, until a later event or until a command of that session is seen running in the folder (no event follows an Allow until the tool ends) |
| PreToolUse | working |
| UserPromptSubmit, PostToolUse | thinking |
| Stop, SubagentStop, Notification `idle_prompt` | finished replying |
| SessionStart | no command running |
| SessionEnd, or the process is gone | the file no longer counts |

A subagent working by absolute paths from its session's folder reports that folder, so its state
shows in the session's own room; processes have the same limit. **Windows:** the writer is built
and tested there, but 87d3ada9 reads no processes on Windows, so the helper cannot tie an event to
a session: slice 5 shows `agentState.windows` in place of the offer, and rooms draw from locks and
Git (Later 4).

## Copy

ko is in the pull request body, written to the Wording rules of
`docs/specs/2026-11-21-library-words-and-first-run.md`. Namespace `workStatus` unless noted. On
Windows each string that says "this Mac" uses its `.pc` variant, which says "this computer". Under
"Where it appears", Row now means a room's status or last monitor line, Station its conveyor, and
Band header or Server band the line beside the shelf. Retired with the bands: `summary`,
`headline.*`, `band.mac`, `band.server`, `ruler.checks`, `ruler.ready`, `group.*`, `session.counts`,
`session.quiet`.

| Key | Where it appears | English |
|---|---|---|
| `navRail.workStatus` | Rail | Work status |
| `title` | Page heading | Work status |
| `ruler.working` / `.prePush` / `.pr` / `.ci` / `.main` | Conveyor stations | Working / pre-push / PR / CI / main |
| `repoLine` | Heading right | {repo} · {count, plural, one {# worktree} other {# worktrees}} on this Mac |
| `band.seam` | A conveyor's push station | push |
| `side.notOnMac` / `.notPushed` / `.noPr` | Mini room; Git facts line | Not on this Mac / Not pushed / Pushed, no PR |
| `session.header` | Session header | {tool} · session {number} |
| `session.started` / `.subagents` | Session header | started {time} / {count, plural, one {# subagent} other {# subagents}} |
| `session.unlocked` | Session header | a {tool} process |
| `tool.acp` | Session header | Claude Agent in Atlas |
| `tool.claudeCode` / `.codex` / `.unknown` | Session header | Claude Code / Codex / An agent; slice 8 adds `.gemini` |
| `holder.locked` | Row tooltip | {tool} subagent {id} · locked at {time} |
| `holder.lockedUnnamed` | Row | Locked at {time} |
| `holder.process` | Row | {tool} is running in this folder |
| `holder.subagent` | Row | Subagent {id} |
| `holder.lastCommit` | Row | {ago} by {author} |
| `holder.noLockQuiet` | Row | No lock |
| `holder.noLock` | Row tooltip | No lock · last commit {ago} by {author} |
| `holder.staleLock` / `.ended` | Row tooltip / Row | Locked by a {tool} session that has ended / Session ended |
| `chip.missing` / `.lockLeft` | A dark room's large line | Folder missing / Lock left behind |
| `row.lockLeft` | A dark room's last line | The {tool} session that locked this worktree has ended. {count, plural, =0 {It has no commits beyond {branch}.} one {Its # commit beyond {branch} is not merged.} other {Its # commits beyond {branch} are not merged.}} |
| `holder.twoTools` | Row | {first} and {second} both have processes in this worktree |
| `row.noCommits` / `.commits` | Row | No commits beyond {branch} / {count, plural, one {# commit} other {# commits}} beyond {branch} |
| `row.unknown` | Row | Not measured against {branch} |
| `row.missing` | A dark room's last line | The folder {folder} is missing. git worktree prune removes its record. |
| `hook.passed` / `.stopped` | Station | {hook} passed / {hook} stopped |
| `hook.unknown` | Station | Push did not complete. The hook wrote no result, so Atlas cannot say which check stopped it. |
| `station.mergedInto` | Station | Merged into {branch} |
| `station.pr` / `.draftPr` | Station | PR #{number} / Draft PR #{number} |
| `station.ci` | Station | CI {done}/{total} |
| `status.ciRunning` | Row | CI running: {job} › {step} · {elapsed} |
| `status.ciFailed` | Row | CI failed at {job} › {step} |
| `status.ready` | Row | Ready to merge |
| `status.draftNoRuns` | Row | Draft PR · no CI runs |
| `integration.collects` | Git facts line of an integration branch's room | {branch} collects {count} branches |
| `connect.notConnected` | Help on a conveyor's dashed part, before a host is connected | {host} is not connected. Connecting shows PRs and CI. |
| `connect.offer` | A conveyor's dashed part, from slice 6 | Show PRs and CI from {host} |
| `connect.body` | Dialog | While Work status is open, Atlas runs gh to read this repository's open PRs, their CI runs and steps, and merges to main from {host}, at most 1,000 requests an hour. gh sends your {host} sign-in and the repository name; nothing from your files is sent. Each request is listed in Settings › Privacy · data. |
| `connect.confirm` | Dialog button | Read PRs and CI as {account} |
| `gh.missing` | Server band | Atlas reads PRs and CI through the GitHub CLI (gh), which is not installed on this Mac. Install it, run gh auth login, then press Check again. |
| `gh.signedOut` | Server band | gh is not signed in to {host}. Run gh auth login --hostname {host} in a terminal, then press Check again. |
| `gh.noAccess` | Server band | {account} cannot read {repo} on {host}. Ask for access, or sign gh in as another account. |
| `connected.line` | Server band | From {host} as {account} · read {ago} |
| `connected.stop` / `.stopNote` | Popover | Stop reading from {host} / Atlas stops sending requests. Your gh sign-in is unchanged; gh auth logout ends it. |
| `throttle.slowing` | Server band | {host} allows {remaining} more requests this hour, so Atlas now sends one request every 2 minutes and leaves the rest of the hour's allowance to gh and other programs signed in as {account}. |
| `throttle.paused` | Server band | Paused until {time}: the hourly limit for {account} on {host} is nearly used. PRs and CI show what was read at {readAt}. |
| `throttle.secondary` | Server band | {host} asked for fewer requests. Next request at {time}. |
| `offline` | Server band | Offline. PRs and CI show what was read at {readAt}. Everything read on this Mac stays live. |
| `noRemote` | Server band | No remote, so there are no PRs or CI to show. |
| `unsupportedHost` | Server band | Atlas does not read PRs and CI from {host}. Everything read on this Mac stays live. |
| `reading` | Band foot | Reading worktrees: {read} of {total} |
| `unreadable` | Stage | {repo} could not be read. Choose the repository folder again to grant access. |
| `notRepository` | Stage | {folder} is not a Git repository. Choose the folder that holds your project's .git. |
| `searchWidgets.goTo_workStatus` | Command palette | Go to Work status |
| `choose.title` / `.action` | Stage | Choose the Git repository your agents work in / Choose repository folder |
| `empty.title` / `.body` | Stage | {repo} has only its main checkout / Each worktree gets a room here. When Claude Code or Codex starts working in one, you see it in that room. |
| `web.title` / `.body` | Web card | Work status runs in the desktop app / A browser cannot run git or read this computer's processes. In this browser you can still open your folder's map and Library. |
| `find.placeholder` / `.none` | Header field / board | Find a worktree or branch / No worktree or branch matches "{query}". |
| `stage.more` | Under the front stage | {count, plural, one {# more is working on the floors below} other {# more are working on the floors below}} |
| `floor.worktrees` / `.noSession` | Floor label | {count, plural, one {# worktree} other {# worktrees}} / No session |
| `floor.sum.asking` / `.ciFailed` / `.cleanup` / `.working` / `.checking` / `.none` | Floor label, at most three | Approval {count} / CI failed {count} / Needs cleanup {count} / Working {count} / Checking {count} / No command running |
| `shelf.merged` / `.old` | Shelf counts; pressing one opens its list | Merged into {branch} {count} / Unchanged for over 7 days {count} |
| `room.working.label` / `.big` / `room.lastCommit` | Monitor / last line | A command is running / Working / last commit {ago} |
| `room.quiet` / `.silent` / `.unheld` | Mini room | No command running · last one {ago} / Quiet for {duration} / Unchanged for {days, plural, one {# day} other {# days}} |
| `room.ended.label` / `room.missing.label` / `room.twoTools` | Monitor / last line | The session ended / The folder cannot be found / Their changes can mix. |
| `git.uncommitted` | Monitor, last line | {count, plural, one {# file changed, not committed} other {# files changed, not committed}} |
| `git.unpushed` / `.pushed` | Monitor, last line | {count, plural, one {# commit not pushed} other {# commits not pushed}} / Pushed |
| `git.operation` / `.detached` | Monitor, last line | {operation} in progress · {count, plural, =0 {no conflicts} one {# conflict} other {# conflicts}} / No branch: detached at {commit} |
| `conveyor.noRemote` / `.notConnected` | Where a conveyor turns dashed | No remote / {host} not connected |
| `room.prePush.label` | Monitor | pre-push checks |
| `eta.range` / `.about` / `.under` | Monitor, large line | {low}–{high} min left / About {time} left / Under {upper} left |
| `eta.usual` / `.slow` / `.slowDetail` | Monitor, last line / screen / last line | {elapsed} so far · usually {usual} / Slower than usual / {elapsed} so far · usually done in {usual} |
| `eta.unknown` / `.unknownDetail` | Monitor / last line | No estimate yet / {elapsed} so far. Atlas estimates once 3 runs have passed on this Mac. |
| `eta.pill.push` / `.ci` / `.main` / `.slow` | Pill over the parcel | push in {time} / CI done in {time} / main in {time} / Running late |
| `room.ci.label` / `.jobs` / `.queued` | Monitor / last line / mini room | CI running · PR #{number} / {done} of {total} jobs done / CI queued for {elapsed} · PR #{number} |
| `room.ciFailed.big` / `.pill` / `room.merged.detail` | Monitor / pill / last line | {count, plural, one {# job failed} other {# jobs failed}} / CI failed / {count} CI jobs passed · took {duration} |
| `room.asking.label` / `.big` / `.detail` | Monitor | {session} asks / Waiting for your approval / {elapsed} so far. Answer in that session. |
| `room.thinking.label` / `.big` / `room.replied` | Monitor / mini room | Between commands / Thinking / Finished replying {ago} |
| `agentState.offer` | Notice under the header, until added or dismissed | Rooms show whether a command is running. With Atlas's hook entries, {tool} also reports when it is thinking, waiting for your approval, or has finished replying. |
| `agentState.add` / `.addCodex` / `.another` / `.notNow` | Buttons | Add to Claude Code / Add to Codex / Add another settings folder / Not now |
| `agentState.confirmTitle` / `.confirmAdd` | Dialog / its button | Add Atlas's hook entries to {count, plural, one {# settings file} other {# settings files}}? / Add the entries |
| `agentState.confirmBody` | Dialog, above the entries | Atlas adds only the entries below to each file listed and changes nothing else in it. Each file's hooks are saved as a version first, so they can be restored. On each event {tool} runs Atlas's program without waiting for it. The program keeps the event's name, the session's id, its working folder and the time in Atlas's own data folder, and discards the rest: commands, file contents and the conversation. Nothing leaves this Mac. |
| `agentState.added` / `.status` | Toast / Agent state popover | Added Atlas's entries to {count, plural, one {# settings file} other {# settings files}}. A session started from now on reports its state. / {reporting} of {live} {tool} sessions report their state. |
| `agentState.silent` | Agent state popover | {count, plural, one {# running {tool} session has} other {# running {tool} sessions have}} sent no event. A session reports only once its folder is trusted in {tool}, only if it reads a settings file listed here, and only if your organisation's settings allow your own hooks. |
| `agentState.remove` / `.removed` | Button / toast | Remove Atlas's entries / Removed Atlas's entries from {count, plural, one {# settings file} other {# settings files}}. Rooms again show only whether a command is running. |
| `agentState.managed` | In place of the button | Your organisation's {tool} settings allow only its own hooks, so Atlas cannot add its entries. Rooms still show whether a command is running. |
| `agentState.invalid` / `.changed` | Toast | {file} is not valid JSON, so Atlas changed nothing. Fix the file, then press Add again. / {file} changed after the entries were shown, so Atlas wrote nothing. Check the entries again. |
| `agentState.linked` / `.unwritable` | Toast | {file} is a link to another file, so Atlas changed nothing. Press Add another settings folder and choose the file it points to. / {file} could not be written, so nothing changed: {reason} |
| `agentState.codexTrust` | Toast and popover | Added {count} entries to {file}. Codex runs them only after you trust them: type /hooks in Codex. Atlas cannot do that for you. |
| `agentState.pick` / `.pickRefused` | File picker title / toast | Choose the settings.json in the folder that session uses / {file} is not an agent settings file Atlas can add to, so nothing changed: {reason} |
| `agentState.removedKept` | Toast, when the file holds hooks Atlas did not add | Removed Atlas's entries from {file}. Your own hooks in it were left as they are. |
| `agentState.windows` | In place of the offer, on Windows | On Windows, Atlas cannot yet tell which session an event comes from, so it adds no hook entries. Rooms show which session locked each worktree. |
| `hook.stoppedLanes` | Monitor, last line | Stopped at {lanes}. Nothing was pushed. |
| `status.readyDetail` | Monitor, last line | {count} CI jobs passed. Merge PR #{number} on {host}. |
| `eta.frozen` | Monitor, last line, while reading from the host is slowed, paused or offline | Read at {readAt}. The time left is not counting down because Atlas is not reading from {host} now. |
| `eta.noOrder` | Monitor, last line | {file} could not be read, so jobs are counted as running together. |
| `fetch.stale` / `.now` | Beside the shelf, from slice 6 | origin/{branch} was fetched {ago}. Merges made on {host} since then are not shown. / Fetch now |
| `fetch.auto` / `.autoNote` | Toggle / under it | Fetch from origin every 3 minutes while Work status is open / git fetch asks {host} with your Git sign-in and updates origin's branches in this repository. Your branches and files are not changed. |
| `term.worktree` | Help | Worktree: a separate copy of the project folder, so each agent changes files without touching the others. |
| `term.subagent` | Help | Subagent: a task an agent session starts, often in its own worktree. |
| `term.hook` | Help | Hook: a check Git runs on this Mac before a commit or a push. If it stops, nothing is committed or pushed. |
| `term.pr` | Help | PR (pull request): a request to merge a branch into main, where CI and people check it. |
| `term.ci` | Help | CI: checks the host runs on a PR, such as tests and lint. Many repositories require them to pass before a merge. |
| `term.merge` / `.load` | Help | Merge: the branch's changes become part of main. / Load: how many tasks are ready to use a CPU core at once. Above the core count, tasks wait. |

A GitLab provider swaps `PR` for `merge request` and `CI` for `pipeline` through per-host keys.

## Edge cases

- **Zero worktrees:** empty stage. **One:** one large room. **Largest measured:** 34 worktrees
  (2026-11-21), 17 nested inside the main checkout, 1 PR, 2 sessions. Fixtures: 40 and 60
  worktrees, 60 PRs.
- **More than six rooms ask for approval:** six on the stage, the others lead their floors, each
  amber. **More than five sessions:** inks repeat; the floor label tells sessions apart. **A state
  that flips within seconds:** up at once, down after 5 s.
- **Nested worktrees:** a path belongs to the deepest worktree containing it on whole path
  components; walks stop at any directory holding `.git`.
- **A branch fast-forwarded into main:** its head is on the first-parent line, so it reads "No
  commits beyond main" and gets no fix; safe, and labelled honestly.
- **Two tools in one worktree:** both named, on the stage. **A process outside any worktree:**
  not shown.
- **Hangul:** branch names, paths and authors render as given; Find matches while a syllable is
  still being composed and compares NFC with NFD names. **First run:** choose stage.
- **The settings file changes between the confirm and the write:** the writer refuses and reopens
  the confirm. **Atlas is moved or deleted with its entries left:** each entry does nothing.
- **The history store is deleted or unreadable:** "No estimate yet", never an error. **The Mac
  sleeps during a check:** elapsed time includes the sleep, so it reads "Slower than usual".
- **The repository folder is moved or renamed:** the `unreadable` stage; agent-state and hook-run
  files for the old path match no worktree and are deleted when their process ends.
- **pid reuse:** a lock's pid, and an agent-state file's, is alive only if its start time matches.
- **A session that reads another settings folder:** silent until that folder's file is added
  through the picker; `agentState.status` counts it as not reporting. **The person adds a hook of
  their own after Atlas's:** Remove takes out only Atlas's entries.
- **Offline:** everything read on this Mac is unchanged; PRs and CI keep their read time and CI
  countdowns stop.

## Out of scope

- Writing to GitHub; the device flow and Atlas's GitHub App (their own decision, Later 5).
- A team view across machines; driving an agent's terminal; writing an agent's settings by any
  path but the agent config writer; listing or searching the disk for settings folders.
- Harness hook management: its own spec, on the same writer (Later 1).
- The tool or command an agent asks approval for: tool input can hold secrets and is text from an
  agent, so the approval room names only the session.
- A room's changed-file list and diff; new Moru art; sound.
- Process arguments and environment; transcript contents; every agent session file (the one file
  slice 8 reads is in the coordination spec).
- The web: no git, no processes, no browser token (`surfaces.md:110-114`).

## Slices

Slices 1 to 7 are here; slices 8 to 13 are in
`docs/specs/2026-11-22-work-status-coordination.md`. File areas are disjoint between slices
except the shared seams below. Slices 2 to 7 answer the owner's direction of 2026-11-22.

1. **Worktrees, locks and agent programs** (shipped). `src-tauri/src/work_status/worktrees/`,
   `src/shared/lib/work-status/`, `src/views/work-status/`, `src/widgets/work-tracks/`,
   `app/[locale]/work-status/`, rail entry, `messages/*/workStatus.json`.
2. **Rooms UI** (started on `feat/work-status-rooms`), from today's data only: the header, tiers,
   shelf, Find, every motion in Design direction, the empty room, and the faces of the states Cases
   marks 2; retires the headline, bands and ruler. The room model is a closed list of every state
   in Cases, so a later slice adds a face without editing it. `src/widgets/work-rooms/` (replacing
   `src/widgets/work-tracks/`), `src/shared/lib/work-status/work-rooms.ts`,
   `src/views/work-status/ui/`, `app/styles/work-status-tokens.css`, `app/styles/motion-work.css`,
   `docs/design/brand.md`, `docs/DESIGN-SYSTEM.md`, `tests/e2e/work-status-bridge.ts`.
3. **Live Git state:** notices, the extended digest, `git status` on notice, a room's Git facts.
   `src-tauri/src/work_status/{watch,git_state}/`, `src/shared/lib/work-status/signals/git.ts`,
   `src/views/work-status/model/`.
4. **Hook runs and time left:** the hook-run record, this repository's `pre-push` writing it, the
   history store, the estimate, the pre-push running, stopped and late faces.
   `src-tauri/src/work_status/{hook_runs,estimate}/`, `scripts/lib/prepush/`,
   `src/widgets/work-rooms/ui/faces/check/`, `src/shared/lib/work-status/signals/hook-runs.ts`.
5. **Agent state** (Record 3), after criterion 27's probe: the agent config writer with its version
   store, the helper, the agent-state file, the offer, confirm with its target list, and status,
   and the approval, thinking and replied faces. `src-tauri/src/agent_config/` (shared with
   Harness, which builds its history screen on the version store),
   `src-tauri/src/work_status/agent_state/`, the helper's own binary target,
   `src/features/work-agent-state/`, `src/widgets/work-rooms/ui/faces/agent/`,
   `src/shared/lib/work-status/signals/agent-state.ts`.
6. **GitHub connect and budget,** after criterion 31's probe, with the opt-in fetch:
   `src-tauri/src/work_status/github/{gh,budget}.rs`, `src-tauri/src/work_status/fetch/`,
   `src/features/work-host-connect/`, the outbound-paths rows.
7. **CI live and CI time left,** with the failed, ready and queued faces:
   `src-tauri/src/work_status/github/{poll,estimate}.rs`, `src/widgets/work-rooms/ui/faces/host/`,
   `src/shared/lib/work-status/signals/host.ts`. Server findings moved to slice 10.

**Shared seams.** Every slice adds its own lines to `src-tauri/src/lib.rs:392` (command
registration), `src-tauri/src/work_status/mod.rs` (the module list and the snapshot) and
`messages/*/workStatus.json`. `.githooks/pre-push` is edited by slice 4 here and slice 11 there;
`.claude/rules/surfaces.md` by slice 5 here (a fourth exception) and slice 8 there. A slice only
appends at a seam, and slices merge one at a time through the integration branch in slice order,
so no two edit a seam at once.

## Acceptance criteria

Criteria keep their numbers across both specs: 4 to 9 and 15 to 18 are in the coordination spec.

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
10. **Slice 6, nothing before opt-in.** Given a fresh install and a github.com remote, when the
    screen opens, then the spawned-process spy sees only `gh --version` and `gh config get`, no
    request reaches any GitHub host until Confirm, and every later request has a log line and an
    `outbound-paths.ts` row. Checked: `github/gh.rs` tests and the outbound-paths contract.
11. **Slice 6, hostile `gh` inputs.** Given an `origin` carrying a token, an owner of `../../user`,
    a host `evil.example` not in the gh config, and a `gh` planted in `node_modules/.bin`, then no
    token is shown or logged, no request runs for the bad owner or host, and the planted `gh` never
    runs. Checked: same tests.
12. **Slice 6, budget.** Given a recorded 60-PR fixture visible for one simulated hour, counted
    requests in the bucket spent stay at or under 1,000, stop within one interval of hiding, slow
    under 1,500 remaining and pause under 500. Checked: `github/budget.rs` simulated-clock test.
13. **Slice 7, dogfood CI.** Given this session's integration PR, when a job fails, its room shows
    the failing job and step within one interval and takes the stage's second class. Checked:
    installed-app capture.
14. **Slice 7, five-second read.** Three readers who did not do the work each name, within 5 s, the
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
    stops within one read of its end. Checked: `src/widgets/work-rooms/ui/room-scene.test.tsx`.
22. **Slice 3, live Git.** Given a temp repository with 40 worktrees and a spy on spawned
    processes: when one worktree commits, switches branch, stages a file, pushes to a local bare
    remote, and stops a rebase on a conflict, each shows in the snapshot within 2 s; an edit not
    yet staged shows within 60 s when an agent process is in that worktree, and otherwise at that
    worktree's next notice; a minute with no notice and no agent process spawns no Git process; six
    worktrees with agents and no notice spawn at most six `git status` a minute; 200 reads racing
    an agent's `git commit` never fail it or change an index's modified time. Checked:
    `src-tauri/src/work_status/{watch,git_state}/tests.rs`; the CPU and memory budget by a
    measured print in the installed app.
23. **Slice 4, time left.** Given histories of 0, 2 and 20 passed runs with their start loads, the
    first two read "No estimate yet"; the third shows the median and 90th percentile of the
    whole-run time, times the start-load factor, minus elapsed; a history whose serial phase takes
    30 s gives an estimate at least 30 s above its longest lane; a finished lane never widens the
    range; no shown number is below zero; a run that ends with a failed lane puts its room in the
    second class with the lane named; a symlinked or 1 GB record is ignored. Checked:
    `estimate/tests.rs`, `hook_runs/tests.rs`. Dogfood: over ten real pushes the finish falls
    inside the range first shown at least seven times (a `pnpm` probe).
24. **Slice 5, the writer, with recovery.** Given a settings file that is absent, holds other hooks
    and an `env` value `ATLAS_PLANTED_7f3c`, is invalid JSON, changes after the confirm, or is a
    link: Add writes exactly the shown entries and leaves every other key equal; a version of the
    file's hooks exists before the write; the invalid, changed and linked files are untouched; the
    planted value is in no page payload, log or error; a request carrying a command string instead
    of a template id is refused; Remove after Add leaves the file byte-identical to the original.
    Checked: `src-tauri/src/agent_config/tests.rs` on macOS, Linux and Windows CI.
25. **Slice 5, a real session, hostile input and cost.** Given the entries added on this Mac and a
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
26. **Slice 7, CI time left.** Given a recorded fixture of 20 runs and its workflow file, the
    estimate follows the longest unfinished chain through that file's `needs` plus the queue wait
    and narrows as jobs finish; with the file unreadable, jobs count as running together and
    `eta.noOrder` shows; with reading paused, the countdown holds its last value and `eta.frozen`
    gives the read time; a ready PR takes the third class. Checked: `github/estimate.rs` tests.
27. **Slice 5, the probe, before any code.** By hand on this Mac, one `async` entry that appends
    its event name to a scratch file is pasted into one `settings.json`. Recorded in the pull
    request: whether it fires in a session already running, a new session, a subagent, a session
    started with another `CLAUDE_CONFIG_DIR`, and, pasted into `~/.codex/hooks.json` and trusted
    in `/hooks`, in Codex; which of the nine events arrive; the median delay on a tool call.
    Slice 5 builds only what the probe saw fire, and this spec is corrected to match first.
    Checked: the probe's recorded output.
28. **Slice 5, Codex.** Given the probe saw Codex fire: after Add to Codex the page shows
    `agentState.codexTrust`, no Codex room changes state before `/hooks` trust, and after it a
    Codex session's working and approval states show within 1 s. Given it did not: no Add to
    Codex is offered and Codex rooms show only whether a command runs. Checked: a recorded walk.
29. **Slice 5, removal and versions.** Given Atlas's entries added to two listed files, then a hook
    of the person's own and a change to another key in one of them: Remove takes out exactly
    Atlas's entries in both, and the person's hook and the other key are byte-equal. The version
    store holds the hooks from before each write; after 201 writes it holds 200; a version file
    holds `hooks` only (the planted `env` value is absent) with mode 0600; a version folder
    replaced by a link is not followed. A picked file inside another repository's work tree is
    refused. Checked: `src-tauri/src/agent_config/tests.rs`.
30. **Slice 5, Windows.** On Windows the page shows `agentState.windows` and no Add button, rooms
    draw from locks and Git, and criterion 24 passes on Windows CI. No Windows machine is walked.
    Checked: `src/features/work-agent-state/ui/agent-state-offer.test.tsx`; Windows CI.
31. **Slice 6, first: what a conditional request costs.** Before polling is built, `gh api` with
    `If-None-Match` against this repository shows that a 304 leaves `x-ratelimit-used` unchanged
    in the REST bucket `pr:land` spends; if it does not, every interval in Polling doubles and
    this spec is revised first. Then, on a simulated clock: the PR list is asked every 60 s, a
    running run's jobs every 30 s, everything every 3 min with no run in progress; when
    `remaining` falls by more than 20 a minute beyond Atlas's own requests for 2 min, intervals
    double until it stops. Checked: a `pnpm` probe's printed headers; `github/budget.rs` tests.
32. **Slice 6, fetch.** With the toggle off, no `git fetch` is ever spawned. Turned on, one runs
    every 3 min while visible, through `runner.rs`, never with `--prune`, each with a log line and
    an `outbound-paths.ts` row; while a sleeper named `git` has its working folder in one of the
    repository's worktrees, or a ref lock file exists, none starts, and one runs at the next
    interval after; hidden, none. Checked: `src-tauri/src/work_status/fetch/tests.rs`.

## Risks

1. **Polling competes with `pr:land`** in the one REST bucket. Answer: criterion 31's probe before
   any polling code, the intervals and the burn-rate back-off in Polling, criterion 12's budget.
2. **The rooms move but say nothing.** Answer: a figure is drawn only from evidence (criterion 21),
   the monitor's large line states the fact in words, and criterion 14's cold read can fail.
3. **The time left is wrong often enough to be ignored.** Answer: a range from this Mac's own
   whole-run history, "Slower than usual" in place of a number below zero, and criterion 23's
   seven-in-ten dogfood before the estimate ships.
4. **The hook entries reach few sessions or slow the agent** (other settings folders, untrusted
   folders, managed settings, a session already running). Answer: criterion 27's probe before any
   code, a target list with the file picker, `agentState.status` counting who reports, and
   criterion 25's cost bar, which can stop the slice.

## Later

1. Harness hook management (add, remove, turn on and off) on the agent config writer, as its own
   spec: the owner asked for it on 2026-11-22.
2. A room's changed-file list and diff; next when the owner still opens a Git client to see which
   files changed.
3. The tool an agent asks approval for, from a closed list of tool kinds; next when the owner asks
   what is being asked.
4. Agent state walked on a Windows machine; until then Windows has CI only.
5. Device flow with Atlas's GitHub App, as its own decision: change the `forbidden.md` wording
   first; disclose the App owner's standing access in the dialog; register the App under an
   organisation with a private-key policy; keep tokens in Rust only, sent through `llm/curl.rs`;
   "stop reading" deletes the token and names github.com/settings/apps/authorizations.
6. Team view by person and agent author; next when a team lead's capture exists.
7. GitLab, with the provider interface; then Bitbucket Cloud, Azure DevOps, Bitbucket Data
   Center, Gitea, Forgejo.
8. A pasted fine-grained token.

## Owner answers (2026-11-21)

1. Register the read-only GitHub App under the owner's account: yes. Deferred after review: the
   in-app sign-in conflicts with `forbidden.md:37` as written, and the App's owner would hold
   standing read access to every installing organisation's private PRs (Later 5). Slice 6 ships
   `gh` reuse only.
2. Rail label: "Work status" (ko: the owner's choice, in the PR body).
3. Stopping leftover processes in merged worktrees: one press, the list already shown above it
   (slice 9, the coordination spec).

## Owner answers (2026-11-22)

Relayed by the lead in this session; Record 3 holds only once the lead records it. (1) Rooms in one
building, the third render round; the headline goes. (2) Agent hooks by one press inside Work
status, not a pasted snippet. (3) Harness will manage hooks on the same writer, in its own spec.

**Owner question:** None. Decided here, each reversible in one place: the first target is
`~/.claude/settings.json`, with other settings folders added through the file picker; the approval
room names no tool or command (Later 3); the pill says "CI done in" unless the host says the PR
merges by itself (`eta.pill.*`).

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
config writer.**

**Why**: The owner, 2026-11-22: rooms must show what each agent is doing; thinking, waiting for
approval and a finished reply are known only to the agent's own hooks. He chose a one-press add in
Work status over a pasted snippet and asked that Harness later manage hooks the same way. That
day: 17 worktrees, four Claude Code and two Codex processes, four alternative Claude Code
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
nothing. Atlas reads that folder by file-change notice. Without the entries every room still shows
whether a command runs. Harness hook management may reuse the writer under these rules.
**Dissent**: A pasted snippet keeps Atlas out of the person's settings entirely. A user-wide entry
runs Atlas's program on every agent event in every project, chosen or not. A session that reads
another configuration folder needs one more press. Hook formats can change unannounced.
**Falsifier**: A key or entry other than Atlas's differs after Add or Remove; a write with no
press, or of a command that is neither a template nor the person's typing; tool input, a command
or a transcript path in `agent-state/`; the helper over 10 ms of CPU at the 95th percentile or
5 ms of added wait at the median; a person who cannot remove the entries from Work status; fewer
than half of this Mac's live sessions reporting a week after the add.

## Revisions

- 2026-11-21: first draft.
- 2026-11-21: folded in the owner's multi-host request: two layers, one provider interface, host
  detection from `origin`, per-host words, the provider table and the unsupported-host line.
- 2026-11-21: owner answers: GitHub App approved, rail label Work status, one-press stop.
- 2026-11-21: owner's requests for two sides, hooks, many agents, bottlenecks and coordination:
  bands On this Mac / On the server joined by a push seam; hook stage with its detection; tool →
  session → subagent model and its signals; Bottlenecks, Coordination and Automation sections;
  slices renumbered to seven; criteria 2, 3, 7, 11, 13 and 14 added; a second record.
- 2026-11-21: review B1–B10 and improvements: merged excludes zero-commit heads and the main
  checkout; stop, delete and remove rules and a Safety paragraph (generation ids, re-checks,
  `SIGTERM` only, nesting, ignored files); lock times in UTC; identity from locks, ACP pids and
  ancestry, argv reduced to a hook enum; `gh` reuse only, with the device flow and App deferred to
  their own decision; the fixed `gh` call; route `/work-status/` and one name; copy and states
  fixed; eight slices; sixteen criteria; both records reframed.
- 2026-11-21: second review C1–C5: automatic pause replaced by background priority, pause by hand
  only with a watchdog; eligibility by a process's own working folder; hook names from open files,
  no argument read; an atomic, versioned slot-folder contract; one exact session file per lock, no
  Codex or Gemini CLI reads. Rule automation (slice 8) and the local model (slice 9) split, with
  loopback, redirect and audit guards and "the address you set" copy. Conflicts by `git
  merge-tree`; fixed finding order; hold refusal text; criteria 15 to 18 tightened or added.
- 2026-11-21: design pass on slice 1 after the owner saw it with 34 worktrees. Until a host is
  connected the server ground is a narrow strip (`connect.notConnected`), so this Mac's stations
  get the width; the ground names and the ruler stay pinned under the page header. A stuck row's
  chip names its reason (`chip.missing`, `chip.lockLeft`) and its sentence sits under its own
  line, on this Mac's ground, naming the folder instead of its path. A worktree no session holds
  is a bare dot, never a Working chip. Sessions of one tool are numbered (`session.header`).
- 2026-11-22: review of slice 1. Merged needs a branch that moved after it was created, and an
  unreadable first-parent line is unknown, not merged (Flow 4); a held row stays under its
  session. Lock liveness is read on Windows and Linux too (Flow 3). Copy claims only what a lock
  proves (`headline.*`, `group.unheld`), names the base branch, and drops the ready count until
  slice 5; every shipped key is in Copy. Criteria 1 to 3 name what checks them.
- 2026-11-22: agent programs pulled forward from slice 2, because Codex leaves no lock: a process
  whose working folder is in a worktree counts for the agent above it in its parent chain (the
  Codex app runs every command under one background server), held 90 s past its last command
  while that agent runs, and joins the lock session of the same pid. Measured 1.6 ms of CPU per
  read on this Mac; the fingerprint carries it, so a change shows within a second. Record:
  `docs/records/decisions/2026-11-22-work-status-agent-processes-87d3ada9-4740-430a-8cee-a580ce7e638e.md`.
  A command shorter than the one-second sample may be missed; Codex's session files stay unread.
- 2026-11-22: the owner's direction after using slice 1. Rooms in one building replace the two
  bands, the rows and the headline (Design direction, with Cases and Motion). New sections: Live
  Git state, Time left, Agent state from the agent's own hooks. The hook-run record replaces
  `hooks/<pid>.json` of the slot folder. Thirteen slices: 2 rooms UI, 3 live Git, 4 hook runs and
  time left, 5 agent state, 6 and 7 the former 5 and 6, 8 the rest of the former 2, 9 to 13 the
  former 3, 4, 7, 8 and 9. Criteria 19 to 26; risks 4 to 6. Record 3 narrowly overturns Record 2's
  "edits no agent's configuration": on the owner's decision, relayed by the lead, Atlas adds its
  own hook entries on a press through one agent config writer that Harness will reuse. The writer
  saves a version of the affected hook set before every write (owner, same day); Remove restores
  from it.
- 2026-11-22: review of the rooms revision ("narrow, revise"). Slices 8 to 13, Record 2, their
  criteria (4 to 9, 15 to 18), sections, copy and risks moved to
  `docs/specs/2026-11-22-work-status-coordination.md`; server findings went with them to slice 10.
  The install confirm lists target settings files and adds others through the file picker only; a
  hand probe comes before slice 5 (criterion 27) and Codex waits on it (28). The helper caps its
  input, keeps an allow-list and names its file by a hash. The version store is defined here as part
  of the writer. `git status` runs on notices, not a 5 s clock (65 ms of CPU each). The hook
  estimate uses whole-run time and load at start. Polling intervals and back-off are defined, with
  the 304 probe first (31). Cases gain pre-push stopped and ready to merge, on clips named by their
  real rows. The hook-run record carries the load at its start. Criteria 20, 22, 23, 25 and 26
  restated; 27 to 32 added; risks and Later renumbered.
