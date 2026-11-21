---
title: "Work status: who holds which worktree, what CI is doing, and what slows this Mac"
doc_type: spec
status: draft
area: git
date: 2026-11-21
decisions: []
---

# Work status: who holds which worktree, what CI is doing, and what slows this Mac

A tenth rail destination, **Work status** (`/work-status/`), in the installed app. It shows two
sides of the same work, **On this Mac** and **On the server**, names the bottleneck, and offers a
fixed catalogue of coordination actions that can run by hand, as suggestions, or automatically
within limits the person sets. This spec settles placement, sources, trust boundaries, design and
copy, and orders nine slices; each slice ships behind its own acceptance criteria. "Work status"
is the one name everywhere: plain "work" already means Atlas's own long runs
(`src/features/work-run/`, `messages/en/workCard.json`).

## Person and moment

1. **The owner, running about ten agent worktrees (observed).** His words, 2026-11-21: "a left-nav
   item that shows at a glance which agent is holding which worktree, and shows CI and PR attempts
   in real time"; "show this Mac's load and tell me what the problem is (load 104 on 12 cores,
   81 GB of duplicated Rust build folders), with a one-click fix if possible"; "not the usual
   dashboard feel"; later, "analyse where the bottleneck is and make it possible to orchestrate
   that part; if a local model can handle this level of coordination, add automation so it
   coordinates by itself". He found that load by asking an agent to diagnose a slow Mac. Next he
   wants to see it, then press one thing.
2. **A team lead with six people, each running agents (not observed).** The owner's words: "a team
   of six creates a huge number of PRs that get assembled and run CI; keeping track is very hard."
   No capture of a team lead exists; the first slice does not claim to serve one.
3. **A non-developer PM asking "is it done, what's stuck" (not observed).** The owner's bar: "fun
   and good-looking enough that a non-developer understands it." Acceptance criterion 14 captures
   three cold readers before slice 6 is called done.

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
- **Atlas reads no process or load information today.** **Local models:** the built-in model is
  bge-m3, embeddings only (decision 9e9ebc55); text generation runs only through a local runner by
  address (`outbound-paths.ts:51-56`).
- **Brand rule:** Atlas's own agent list says "Claude Agent", never "Claude Code"; a sentence naming
  a separately installed product by its real name is allowed
  (`tests/contract/brand/vendor-naming.contract.test.ts:4-8`, decision 2026-08-16 (5)).
- **Rail:** nine destinations (`src/shared/config/destinations.ts:10-24`); e7d1f38a permits ten;
  `g w` is free (`:82-97`). **Repository choice:** Changes grants source reading of a chosen
  repository without a vault (`docs/features/change-briefing.md:170-174`).

## Problem and alternatives

**Ranked by value against cost.** (1) Which agent and subagent holds which worktree, and whether it
is merged: highest value, local, needs only Git and the pids in locks. (2) Processes: sessions,
hooks, load and disk: today's pain, one new read boundary. (3) Safe fixes. (4) Naming the
bottleneck. (5) PR and CI live: this repository has 1 open PR, so it pays off at the integration
PR and for teams. (6) Coordinating by hand, then (7) automatically: highest leverage, highest trust
cost. (8) Team-wide view: unobserved. Slices follow this order.

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
| A tab in Automations | schedules and runs | it owns Atlas's own schedules | loses (rules too: see Automation) |
| **A tenth rail destination, Work status** | the owner's literal ask | the last slot under e7d1f38a | **chosen** |

**Two sides: bands, not tabs.** A branch is on both sides at once and `git push` is the crossing, so
two bands side by side, split by a seam labelled **push**, let one row run across: left, the
worktree, its agent, hooks and checks; right, its PR and CI. Tabs would hide that link; one merged
timeline would hide which side each fact is from. Below `lg` the bands become a two-segment switch.

**Host connection.** `forbidden.md:37` bans restoring authentication surfaces in Layer 1, with no
qualifier. Reusing `gh` adds none: Atlas shows no sign-in, holds no credential, and runs a program
the person already signed in; it is an outbound path under `local-first.md` "Outbound data" and
f741cf86, listed and logged. The device flow with Atlas's GitHub App is an in-app sign-in and is
deferred to its own decision (Later 1), although the owner approved registering the App: that
decision must first change the `forbidden.md` wording, and the App's owner could mint installation
tokens that read every installing organisation's private PRs and logs without any user, which the
dialog would have to disclose and an organisation-held key policy would have to bound.

| GitHub option | Non-developer | Enterprise | What leaves the machine | Now |
|---|---|---|---|---|
| **Reuse `gh`** | needs `gh` installed and signed in | inherits SSO and any GHES host | requests made by `gh`; Atlas never sees the token | **slice 5** |
| Device flow, Atlas's App | a code and a browser page | github.com only; org must install | user token in the keychain; the App owner gains standing access | own decision |
| Pasted token | token pages and expiry | works where both are blocked | same as device flow | Later |

**The `gh` call** is fixed: an absolute path from a fixed list (`/opt/homebrew/bin/gh`,
`/usr/local/bin/gh`, `/usr/bin/gh`, `%ProgramFiles%\GitHub CLI\gh.exe`); working folder in Atlas
app data; environment cleared except `HOME`, `GH_CONFIG_DIR`, `XDG_CONFIG_HOME` (and `APPDATA` on
Windows); always `--method GET`, never `-f`, `-F` or `--input`; endpoints from fixed templates with
owner and repository matching `^[A-Za-z0-9_.-]{1,100}$`; `--hostname` only for github.com or a host
`gh config` already lists. Userinfo is stripped from `origin` wherever it is read or shown. Before
the opt-in only `gh --version` and `gh config get -h <host> user` may run.

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
2. When the repository opens, Atlas draws the two bands and one row per worktree within 2 s. A
   worktree outside the chosen folder appears only when its `.git` file and the repository's
   `gitdir` record point at each other. Rows group under the session that holds them.
3. When a lock names a pid, Atlas checks that pid's liveness and start time against the reason's
   UTC time (±1 s); a match is a live holder, a mismatch a stale lock, an unparseable reason a live
   lock. A worktree with no lock says "No lock".
4. When a worktree's head is on `main`'s first-parent line, it says "No commits beyond main" and
   offers no fix; it is merged only when its head is an ancestor of `main` and not on that line.
   The main checkout and the `main` branch are never merged rows.
5. When an agent adds or removes a worktree, starts a hook or a check, or commits, the row changes
   within 5 s. When a hook ends, its result is what changed: after `pre-push`, the remote-tracking
   ref moved to the pushed head (passed) or not (stopped); after `pre-commit` or `commit-msg`,
   `HEAD` moved or not. A hook that writes the status file reports each lane instead.
6. When a finding's condition holds, the Bottlenecks panel names it with its numbers, cost and one
   action; the rows that cause it get a warm underline.
7. When the person presses a fix or an action, Atlas acts only on what it offered (Safety), logs
   it, and reports what it did and how to undo it.
8. When the remote is GitHub or a GHES host and nothing is connected, the server band offers
   **Show PRs and CI from {host}**; pressing it opens a dialog stating what is sent and received;
   nothing is requested before the person confirms.
9. When connected, rows with a PR gain PR and CI stations right of the seam that update while the
   screen is visible, within the budget; hiding it stops requests. When the bucket Atlas spends
   runs low, Atlas slows, then pauses, and says so in the band.
10. When an action is set to Automatic and its condition holds, the guard checks it, Atlas logs it,
    runs it, and shows it in the Coordination log with Undo.

**Fixes.** Each acts only on worktrees `git worktree list` reports for this repository.

| Fix | Applies to | Presses |
|---|---|---|
| Stop leftover processes | processes whose working folder is inside a merged worktree (Flow 4), with no live agent or Atlas process among their ancestors, no controlling terminal, and a listening port or a known check kind | one: the panel lists every pid, name, port and worktree |
| Delete Rust build folders | a `target/` with `Cargo.toml` beside it and a `CACHEDIR.TAG` signature, not a symlink, on the worktree's device, its canonical path under the worktree root, in a worktree with no running process | confirm with each path and size; Cancel is default |
| Remove merged worktrees | merged, clean, no live lock, and ignored files only rebuildable ones (`target/` with `CACHEDIR.TAG`, `node_modules/`, `.next/`, `out/`) per `git status --ignored`; a stale lock is unlocked first; `git worktree remove` without `--force` | confirm, naming that ignored files are deleted; branches stay |

`git worktree prune` is never a button; a missing folder's row shows it as text.

**Safety of every destructive action.** Rust keeps the targets it offered under a generation id and
the page returns only that id; a stale id does nothing. Just before acting, Rust re-checks each
target: a process by pid, start time, uid and working folder; a folder by canonical path, device and
inode, plus the build-folder rules above. Stop sends `SIGTERM` to each pid; never a group signal,
never `SIGKILL`. Paths are attributed on whole components to the deepest worktree, and every walk
stops at a directory containing `.git`. Every Git read goes through `runner.rs`.

## States

| State | Web | macOS app |
|---|---|---|
| No repository chosen | `workStatus.web.title`, `.web.body`, Get the app | `workStatus.choose.title`, `.choose.action` opens the picker |
| Loading: first read | as above | bands draw at once; rows arrive as each worktree is read, `workStatus.reading`; input never waits |
| Error: git missing or the folder unreadable | as above | git missing reuses `atlasGit.install.*`; unreadable says `workStatus.unreadable` with Choose repository folder |
| Empty: only the main checkout | as above | `workStatus.empty.title`, `.empty.body` |
| Worktree folder missing | as above | a Stuck row with `workStatus.chip.missing` and `workStatus.row.missing`, with `git worktree prune` as text |
| No lock; stale lock; zero commits | as above | `workStatus.holder.noLock`; a stale lock is a Stuck row with `workStatus.chip.lockLeft` and `workStatus.row.lockLeft`; `workStatus.row.noCommits` |
| On this Mac only (no host connected) | as above | the server ground is a narrow strip with the main rail and `workStatus.connect.notConnected`; slice 5 adds `workStatus.connect.offer` as its button |
| On the server only | as above | left half `workStatus.side.notOnMac` |
| A worktree with no PR | as above | right half `workStatus.side.notPushed` or `.side.noPr` |
| Quiet subagents | as above | `workStatus.session.quiet` folds them |
| Hook running (named or unnamed), passed, stopped, result unknown | as above | `workStatus.hook.running`, `.runningUnnamed`, `.passed`, `.stopped`, `.unknown` |
| Pushes held | as above | `workStatus.hold.active` with Release |
| Builds in background; paused by hand | as above | `workStatus.action.backgroundDone` with Undo; `workStatus.action.pausedLine` with Resume |
| `gh` not installed; signed out; no access (404) | as above | `workStatus.gh.missing`, `.signedOut`, `.noAccess`, each with Check again |
| Connecting | as above | `workStatus.connect.body`; Cancel returns to On this Mac only |
| Connected; stop reading | as above | `workStatus.connected.line`; `.stop`, `.stopNote` |
| Throttled | as above | `workStatus.throttle.slowing`, `.paused`, `.secondary`; data keeps its read time |
| Offline; no remote; host without a provider | as above | `workStatus.offline`, `.noRemote`, `.unsupportedHost` |
| No bottleneck; finding; action done, refused, undone | as above | `workStatus.finding.*`, `workStatus.action.*` |
| Automatic action ran | as above | toast `workStatus.auto.ran` with Undo |
| No local model; address not loopback; model unreachable | as above | `workStatus.model.none`, `.notLoopback`, `.unreachable`; findings stay with fixed text |
| Model explanation shown | as above | `workStatus.model.label` above its text; buttons only from the catalogue |
| Stop, delete, remove: confirm, done, refused | as above | `workStatus.fix.*`; a refusal names the target and reason |
| Largest measured: 21 worktrees, 17 nested, 1 PR, 2 sessions | as above | every row; quiet subagents and Merged fold |
| Windows app | Out of scope: same web card | "this computer" variants; `workStatus.windows.limits`: total CPU only; sessions by process, hooks, background priority, pause, stop, delete and remove absent |

The web card follows `.claude/rules/surfaces.md:116-119` and joins `DEGRADED_SURFACES`.

## Design direction

Sources (principles, not assets): GitHub Actions' run graph; GitHub's merge queue (docs.github.com);
Graphite's stacks; Buildkite's step blocks; Vercel's live status dot per row; Linear's gliding
states; 2025–26 multi-agent tools that list parallel tasks as rows. Gap: none draws local worktrees,
this Mac and remote CI as one picture. Only the two GitHub pages were fetched.

**A. Tracks in two bands (recommended).** Each worktree is a branch row whose head dot sits on its
current station; the integration branch is a collector rail its members feed. Left band On this
Mac, right band On the server, the seam `push`: a head crossing it is a push. Motion travels along
these lines only. Rows group under their session: a session header carries a segmented strip, one
segment per subagent coloured by state, so six subagents read as one line, not six dots.

```
Work status  wlsdks/ontology-atlas            3 running · 1 stuck · 1 ready to merge
┌ BOTTLENECKS ──────────────────────────────────────────────────────────────────────────┐
│ THIS MAC  3 worktrees build Rust at once. Solo build 4 min; these 9 min so far.       │
│           [Run 2 Rust builds in the background]   The oldest keeps full speed.        │
└───────────────────────────────────────────────────────────────────────────────────────┘
ON THIS MAC  load 45 on 12 cores · 82.9 GB in build folders    ║ ON THE SERVER  github.com · read 20 s ago
STUCK                                                          ║
 first-run-stage   Claude Code › subagent aed5   pre-push ✓ ●══╬══ PR #3771 ── ✕ CI 7/12 e2e › chromium
CLAUDE CODE  session in ontology-atlas  ▮▮▯▯▯▯ 6 subagents: 2 running · 4 quiet
 chooser-no-chevrons   subagent a8b8   node ×3 ●               ║   not pushed
 library-first-run     subagent aed5   pre-push 1:40 node ×5 cargo ×2 ●
 + 4 quiet subagents                                           ║
 integration/library-2026-11-21 ═●═●═●══════════════════════●══╬══ PR #3780 ── CI ▮▮▮▯
NOT ON THIS MAC                                                ║   PR #3790 by a teammate ── CI ▮▮▯
MERGED (2)  [Remove 2 merged worktrees]                        ║
```

**B. Board.** Columns On this Mac, Checks, PR, CI, Ready, Merged; cards glide between columns.
Readable to a PM, but it is the "usual dashboard feel" the owner ruled out, cannot draw the
integration rail, and puts both sides in columns that look alike.

**C. Desk floor.** Each agent a desk with a character and a small screen; load as room
temperature. Fun, but 60 PRs do not fit and idle characters invent activity
(`docs/DESIGN-SYSTEM.md:56`).

**Five-second read.** The summary line counts running, stuck and ready; the Bottlenecks panel holds
the one filled button; STUCK sits first; each row's one red station names the job and step; band
headers say which side every fact is from. Terms have help popovers. Quiet subagents, NOT ON THIS
MAC and MERGED fold to counted bundles.

**Storyboard (A).** Tokens per `docs/DESIGN-SYSTEM.md` "Motion"; motion runs only on a real state
change; no frame interval over 50 ms; all loops stop when the screen is hidden.

1. **Arrival:** the seam draws top to bottom, rows grow from their session headers
   (`useStaggerOnce`), heads set down on `--motion-ease-place`. Reduced: drawn at once.
2. **A session starts subagents:** each row grows out of its header over `--motion-base` and the
   strip gains a segment. Reduced: the row appears.
3. **A hook runs, then passes:** the hook station breathes (`.motion-run-pulse`,
   `docs/DESIGN-SYSTEM.md:260`); after a push the head crosses the seam over `--motion-slow`. A
   stopped hook takes danger ink once and the head stays left. Reduced: the head is placed.
4. **A CI step passes:** one light runs to the next step pip over `--motion-base`; `7/12` counts to
   `8/12`. Reduced: pip fills.
5. **A job fails:** the pulse stops; the pip takes danger ink over `--motion-fast`; the row glides
   into STUCK (`useRowMotion`, `--motion-settle`). No shake.
6. **A PR merges:** the head runs to the merge point, the branch curves in over `--motion-slow`, one
   light runs along it over `--motion-choreography`, the row folds into MERGED.
7. **Load spikes, a finding appears, an action clears it:** 2 s samples interpolate on
   `SPRING.surface`; the finding slides in over `--motion-base`; background priority dims the
   slowed heads to the muted ink; after 60 s under the core count the finding leaves on the exit ease. Reduced: values
   set, the finding appears.

## Agents and hooks on this Mac

**Model.** Tool → session → subagent → worktree. A session is one agent process; a subagent is work
the session started, often in its own worktree; several sessions of one tool may share a
repository; two tools may touch one worktree.

**Identity and eligibility come from evidence, never from names.** A session is established by a
lock's pid (with its start time), an Atlas ACP session's pid, or the parent chain to one of these.
The executable name only labels a session (`claude` → Claude Code, `codex` → Codex); a labelled
process with no lock and no ACP pid is shown as "a {tool} process". A process belongs to a worktree
by its **own** working folder, matched on whole path components to the deepest worktree; the parent
chain only groups it under a session for display.

| Signal | Gives | Tools | Status | Slice |
|---|---|---|---|---|
| Lock reason pid and UTC time; `locked` file mtime | subagent id, session pid, lock time | Claude Code | verified | 1 |
| ACP session pids and `cwd` | session, exactly | Claude Agent in Atlas | verified (`tauri-acp.ts:106`) | 1 |
| Own working folder, parent chain, executable name | which processes run in which worktree, under which session | all | `claude`, `codex` seen | 2 |
| Open file paths matched to `<hooksPath>/<hook name>` | a running hook and its name | Git | reviewer verified `proc_pidfdinfo` | 2 |
| `finished` in one exact Claude Code subagent meta file | subagent finished | Claude Code, `~/.claude` only | observed, undocumented | 2 |

**The session-file read.** The path is built from the lock: the session pid's own working folder,
encoded as Claude Code does (`/` → `-`), under `~/.claude/projects/`. Atlas lists only that one
folder, keeps child names that are UUIDs, and opens `<uuid>/subagents/agent-<id>.meta.json` for the
lock's agent id; it never lists `~/.claude` or `projects/`. The open uses `O_NOFOLLOW`, stops at
64 KiB, parses into a struct holding only `finished`, and keeps file content out of every error. A
subagent counts as running only while its session pid and start time are alive; `finished` only
adds "finished". Codex's and Gemini CLI's session folders are not read.

**No arguments or environment are read.** Executable names come from the kernel's process name;
`KERN_PROCARGS2`, which copies every argument and the environment, is never read. A hook is a
process whose parent is `git` and which holds open a file whose path is `<hooksPath>/<Git hook
name>` in its worktree; only that hook name is kept. A Node hook that has closed its script shows as
"hook" with no name. Hook work is shown by executable kind (`node ×5`, `cargo ×2`); lane names and
results come only from a status file the hook chooses to write.

**On screen:** "Claude Agent in Atlas" for ACP sessions; Claude Code, Codex, Gemini CLI for programs
the person installed.

**Sampler.** Filters by uid before reading any working folder or open file; samples every 2 s while
visible and stops when hidden; at load above 40 it stays under 1 % of one core and 20 MB resident
(slice 2 measures it).

## Bottlenecks

Deterministic findings come first, each computed from measured facts with its numbers. They show
without buttons until slice 7 adds the actions. A local model, in its own last slice, only explains
and ranks them; it never adds one. The table's order is the display priority; within a kind, the
larger cost shows first; at most three show, and one leaves after its condition is false for 60 s.

| Finding | Condition and numbers | Cost shown | Action (slice 7) | Side · slice |
|---|---|---|---|---|
| Red main | main's latest run failed; open PRs waiting | count | none: names the failing job | Server · 6 |
| CPU queue | 1-min load over 2 × cores; share by worktree and session | checks wait for a core | Background priority; slot limit | Mac · 4 |
| Concurrent Rust builds | ≥ 2 worktrees with `cargo`/`rustc` by own working folder | elapsed against the last solo build this app session | Background priority for all but the oldest | Mac · 4 |
| Hooks at once | ≥ 2 `pre-push` running | each elapsed | Slot limit; hold pushes | Mac · 4 |
| Conflicts | `git merge-tree --write-tree` of two unmerged heads reports conflicts; cached per pair of heads | conflicting file count | Propose an integration or order | Mac · 4 |
| Two tools in one worktree | two sessions with processes whose own working folder is in one worktree other than the main checkout | both named | none: shown in STUCK | Mac · 4 |
| Integration waits on one | all members merged into it but one, still running | its elapsed | none | Mac · 4 |
| CI queue | `run_started_at − created_at` against the run's duration | minutes waiting | none | Server · 6 |
| Waiting on review | ready PR, passing CI, no review for over 2 h | hours | none | Server · 6 |
| Build folders | total `target/` size; free disk under 10 % | GB held | Delete build folders | Mac · 4 |
| Rate budget | remaining in the bucket Atlas spends under 1,500 | requests left | Atlas slows itself | Server · 5 |

## Coordination

A fixed catalogue. Each action acts only on processes whose own working folder is inside a listed
worktree, follows Safety, logs before it acts, and reports what it did. Build kinds are `cargo` and
`rustc`, plus `cc`, `clang` and `ld` only when their parent is `rustc`.

| Action | Touches | Undo | Presses | Highest level |
|---|---|---|---|---|
| Background priority for a Rust build | `setpriority(PRIO_DARWIN_PROCESS, pid, PRIO_DARWIN_BG)` (what `taskpolicy -b` does) on build kinds; same-user, no root (reviewer verified both directions) | the same call back to normal; nothing stays stuck if Atlas crashes, no lock is held longer, no agent call times out | one | Automatic |
| Heavy-job slot limit | `limit` in the slot folder | previous number | one | Automatic |
| Pause / resume a Rust build | `SIGSTOP`/`SIGCONT` to build kinds that descend from a detected agent session, never a terminal's foreground process group | Resume; the watchdog resumes them when Atlas exits and at the deadline | one, by hand only | Suggest |
| Stop leftover processes | `SIGTERM` to listed pids | none | one | Suggest |
| Delete build folders | listed `target/` folders | the next build recreates them | confirm | Suggest |
| Remove merged worktrees | listed worktrees, through git | `git worktree add <path> <branch>` | confirm | Suggest |
| Hold / release pushes | a hold file; the repository's `pre-push` refuses at once, naming Work status and how to release; `git push --no-verify` bypasses it | Release | one | Suggest |
| Propose an integration branch or order | copies the `/integrate` request, or sends it to Claude Agent in Atlas on press | nothing | one | Suggest |
| Write to GitHub | | | | Out of scope |

**Pause is by hand only, and guarded.** A stopped `cargo` holds `.cargo-lock`, so every other build
on that target folder waits; a Claude Code Bash call times out after 2 to 10 minutes, so pausing an
agent's build can fail its tool call. Before a pause Atlas starts a detached watchdog in its own
session that waits on Atlas's exit (`EVFILT_PROC` with `NOTE_EXIT`) and on the deadline; it sends
`SIGCONT` only after re-checking each pid and start time. **Windows:** none; process actions are
absent there until Atlas can read a process's working folder; the nearest equivalent of background
priority is `IDLE_PRIORITY_CLASS` through `SetPriorityClass` (Later).

**The slot folder, a versioned file contract.** `slots/` in Atlas's app data directory for
`dev.jinan.ontology-atlas` (macOS `~/Library/Application Support/dev.jinan.ontology-atlas/slots/`,
Windows `%APPDATA%\dev.jinan.ontology-atlas\slots\`); no folder means no limit, on any OS. Mode
0700. Files:

- `VERSION`: `1`. A script that finds another number ignores the folder.
- `limit`: a number, written by Atlas atomically (write a temporary file, then rename).
- `slot-<i>` for `i` below `limit`: a lease, taken with `O_CREAT|O_EXCL`, holding pid, start time,
  worktree and a kind from a closed list. A lease whose pid and start time are gone is reclaimed by
  renaming it away, then taking it again with `O_EXCL`. A job that already holds a lease passes its
  name to its children in `ATLAS_SLOT_LEASE` (the script's own variable; Atlas reads no
  environment), so nested jobs take no second slot. Every wait has a ceiling (default 10 minutes),
  after which the job runs and prints why.
- `holds/<worktree id>` and `hooks/<pid>.json` (lane names and exit codes a hook chooses to write).

Atlas reads every file there with `O_NOFOLLOW` and a 4 KiB cap, keeps content out of errors, and
counts a lease only while its pid's own working folder is inside the worktree it names.

**Reaching an agent.** Atlas never drives a terminal or edits an agent's configuration. Claude Agent
in Atlas: on press, a prepared message (Suggest only). Claude Code, Codex, Gemini CLI: only the
repository's scripts and hooks (slots, holds) and the priority or signals of their build processes;
later, an MCP read tool they may call.

## Automation

**Rules (slice 8).** Levels per action: Off, Suggest, Automatic. Automatic exists only for
background priority and the slot limit, each turned on by the person inside limits they set (load
threshold, slot range). A rule is deterministic: for example, while load stays above the threshold
for 30 s, move the newest Rust builds to background priority; when load stays under the core count
for 60 s, restore them. An automatic action also requires a detected agent session among the
process's ancestors. Every automatic action is logged before it runs (app data, last 1,000), shown
in the Coordination log with Undo, and announced; at most one of a kind runs per 2 minutes. Rules
live in Work status, not Automations: they act on this Mac on a measured condition and must be read
beside that state; Automations runs Atlas's schedules into the vault. Rules are stored in app data
per repository, like preferences.

**Injection boundary.** A rule reads only numbers, enums and ids. PR titles, branch names, commit
messages, CI logs, hook lane names, lease kinds outside the closed list and subagent descriptions
never reach a rule or the model. Text from GitHub renders as text only, bidirectional control
characters stripped, capped at 200 characters. Before any action the guard checks: a catalogue
action; Automatic for this repository, or pressed; typed arguments valid under Safety and the
eligibility rules; the rate of one per kind per 2 minutes.

**The local model (slice 9, last).** Kept, as the owner asked. It explains findings in plain words
and ranks them; choosing catalogue actions is Later, offered only after its choices match the rules
on a recorded set of situations. Its guards:

- It uses the runner address the person set, only when every address that name resolves to is a
  loopback address, with redirects refused. Loopback is not proof that the model runs on this
  computer (an `ssh -L` tunnel or a proxy can forward it), so the copy says "the address you set",
  never "on this Mac".
- Every request is logged in the app-data audit before it is sent.
- Input is typed findings only (kind, numbers, opaque ids such as `W3`, tool enum); the screen
  substitutes names. Output is validated: ranks must be a permutation of the given ids, and an
  explanation may cite only given ids and numbers; anything else is discarded.
- Its text is labelled as the model's explanation and never shown as a fact; advice such as "W3 is
  safe to delete" gets no button. Only actions the guard verified get buttons.
- No model: findings, actions and rules work fully; explanations are fixed copy.

## Copy

ko is in the pull request body, written to the Wording rules of
`docs/specs/2026-11-21-library-words-and-first-run.md`. Namespace `workStatus` unless noted. On
Windows each string that says "this Mac" uses its `.pc` variant, which says "this computer".

| Key | Where it appears | English |
|---|---|---|
| `navRail.workStatus` | Rail | Work status |
| `title` | Page heading | Work status |
| `summary` | Under the heading | {running} running · {stuck} stuck · {ready} ready to merge |
| `repoLine` | Heading right | {repo} · {count, plural, one {# worktree} other {# worktrees}} on this Mac |
| `band.mac` / `band.server` | Band headers | On this Mac / On the server |
| `band.seam` | Seam label | push |
| `side.notOnMac` / `.notPushed` / `.noPr` | Row halves | Not on this Mac / Not pushed / Pushed, no PR |
| `group.stuck` / `.notOnMac` / `.merged` | Group labels | Stuck / Not on this Mac / Merged ({count}) |
| `session.header` | Session header | {tool} · session {number} |
| `session.counts` | Session header | {count, plural, one {# subagent} other {# subagents}}: {running} running · {quiet} quiet |
| `session.quiet` | Fold | {count, plural, one {+ # quiet subagent} other {+ # quiet subagents}} |
| `session.unlocked` | Session header | a {tool} process |
| `tool.acp` | Session header | Claude Agent in Atlas |
| `tool.claudeCode` / `.codex` / `.gemini` | Session header | Claude Code / Codex / Gemini CLI |
| `tool.unknownProcess` | Row | Process {name} |
| `holder.locked` | Row | {tool} subagent {id} · locked at {time} |
| `holder.noLock` | Row | No lock · last commit {ago} by {author} |
| `holder.staleLock` / `.ended` | Row tooltip / Row | Locked by a {tool} session that has ended / Session ended |
| `chip.missing` / `.lockLeft` | Head of a stuck row | Folder missing / Lock left behind |
| `row.lockLeft` | Under a stuck row's line | The {tool} session that locked this worktree has ended. {count, plural, =0 {It has no commits beyond main.} one {Its # commit beyond main is not merged.} other {Its # commits beyond main are not merged.}} |
| `holder.twoTools` | Row | {first} and {second} both have processes in this worktree |
| `row.noCommits` | Row | No commits beyond main |
| `row.missing` | Under a stuck row's line | The folder {folder} is missing. git worktree prune removes its record. |
| `hook.running` / `.runningUnnamed` | Station | {hook} running {elapsed} · {kinds} / Hook running {elapsed} · {kinds} |
| `hook.passed` / `.stopped` | Station | {hook} passed / {hook} stopped |
| `hook.unknown` | Station | Push did not complete. The hook wrote no result, so Atlas cannot say which check stopped it. |
| `hold.active` | Station | Pushes from {worktree} are held. Release them in Work status. |
| `hold.refusal` | Printed by the pre-push hook | Atlas Work status is holding pushes from {worktree}. Release them in Work status, then push again. (git push --no-verify skips this hold and every other pre-push check.) |
| `station.mergedInto` | Station | Merged into {branch} |
| `station.pr` / `.draftPr` | Station | PR #{number} / Draft PR #{number} |
| `station.ci` | Station | CI {done}/{total} |
| `status.ciRunning` | Row | CI running: {job} › {step} · {elapsed} |
| `status.ciFailed` | Row | CI failed at {job} › {step} |
| `status.ready` | Row | Ready to merge |
| `status.draftNoRuns` | Row | Draft PR · no CI runs |
| `status.checks` | Row | Checks running on this Mac: {kinds} |
| `integration.collects` | Collector rail | {branch} collects {count} branches |
| `mac.load` / `mac.disk` | Band header | Load {load} on {cores} cores / {size} in build folders |
| `mac.unattributed` | Load breakdown | Other programs on this Mac |
| `finding.title` / `.none` | Panel | Bottlenecks / No bottleneck: load {load} on {cores} cores, nothing waiting. |
| `finding.cpu` | Panel | This Mac is overloaded: load {load} on {cores} cores. {top} use {share} of it. Checks wait for a free core, so each finishes later. |
| `finding.rust` | Panel | {count} worktrees build Rust at once. The last solo build took {solo}; these have run {elapsed} so far. |
| `finding.rustNoBaseline` | Panel | {count} worktrees build Rust at once. No solo build has been seen in this app session to compare with. |
| `finding.disk` | Panel | Rust build folders hold {size} in {count} worktrees. |
| `finding.hooks` | Panel | {count} pre-push hooks run at once: {list}. |
| `finding.sameFiles` | Panel | Merging {first} and {second} conflicts in {count, plural, one {# file} other {# files}}. |
| `finding.twoTools` | Panel | {first} and {second} both have processes in {worktree}. |
| `finding.integrationWaits` | Panel | {branch} has every member but {member}, which has run {elapsed}. |
| `finding.ciQueue` | Panel | CI runs waited {wait} on average before starting, for runs of {run}. |
| `finding.redMain` | Panel | main's last CI run failed at {job}; {count} PRs wait on it. |
| `finding.review` | Panel | PR #{number} passed CI {ago} and has no review. |
| `action.background` / `.backgroundNote` | Button / under it | Run {count} Rust builds in the background / They keep running at lower priority, so {first} finishes first. Undo sets them back. |
| `action.backgroundDone` | Toast | {count} Rust builds run in the background. Undo |
| `action.pause` / `.pauseNote` | Button / under it | Pause {count} Rust builds / They stop until you resume them, for {limit} at most. While stopped they hold the build lock, and an agent waiting on them may time out. |
| `action.pausedLine` / `.resume` | Row / Button | Paused by you until {time} / Resume {count} Rust builds |
| `action.pauseRefusedTerminal` | Toast | {name} was not paused: it runs in a terminal you are using. |
| `action.slotWaitCeiling` | Printed by a script | Waited {limit} for a heavy-job slot in Atlas Work status; running now without one. |
| `action.slots` / `.slotsNone` | Coordination | Heavy jobs at once: {limit} / No script in {repo} has taken a slot, so the limit changes nothing. |
| `action.hold` / `.release` | Button | Hold pushes from {worktree} / Release pushes from {worktree} |
| `action.integrate` / `.integrateSend` | Button | Copy the request to integrate {count} branches / Send it to Claude Agent in Atlas |
| `action.done` / `.refused` | Toast | {action}. Undo / Nothing was changed: {reason} |
| `level.off` / `.suggest` / `.auto` | Segmented control | Off / Suggest / Automatic |
| `auto.limits` | Coordination | Runs only while load stays above {threshold} for 30 s, on Rust builds an agent session started; sets them back after load stays under {cores} for 60 s. |
| `auto.ran` | Toast and log | Automatic: {action} because {reason}. Undo |
| `model.none` | Panel foot | Explanations use fixed text. Set a model runner address in Settings to have a model explain and rank these findings. |
| `model.notLoopback` | Panel foot | {address} does not point to this computer's own network address, so Work status sends it nothing. |
| `model.unreachable` | Panel foot | The model at {address} did not answer. Findings show with fixed text. |
| `model.label` | Above model text | Explanation from the model at {address}, the address you set. Check it against the numbers. |
| `fix.stop` | Button | Stop {count} processes in merged worktrees |
| `fix.stopDone` / `.stopChanged` | Toast | Stopped {count} processes. The load number follows within a minute. / The processes changed after this list was drawn, so nothing was stopped. The list is updated. |
| `fix.deleteBuild` | Button | Delete {count} Rust build folders ({size}) |
| `fix.deleteTitle` / `.deleteBody` | Dialog | Delete these build folders? / Only these folders are deleted. The next build in each worktree recreates its folder, which takes several minutes. |
| `fix.deleteConfirm` / `common.cancel` | Dialog buttons | Delete {size} / Cancel |
| `fix.deleteDone` / `.deleteRefused` | Toast | Deleted {count} build folders and freed {size}. / {path} was not deleted: {reason} |
| `fix.remove` | Button | Remove {count} merged worktrees |
| `fix.removeTitle` / `.removeBody` | Dialog | Remove these worktrees? / Each one is merged into main and has no uncommitted changes. git worktree remove deletes each folder with its ignored files: {ignored}. The branches stay. |
| `fix.removeConfirm` / `.removeDone` | Button / Toast | Remove {count} worktrees / Removed {count} worktrees. git worktree add {path} {branch} brings one back. |
| `fix.refusedDirty` / `.refusedIgnored` / `.refusedRunning` | Toast | {worktree} was not removed: it has uncommitted changes. / {worktree} was not removed: it holds ignored files that a build cannot recreate, such as {example}. / {worktree} was not removed: {tool} still has processes in it. |
| `connect.notConnected` | Server strip, before a host is connected | {host} is not connected. Connecting shows PRs and CI. |
| `connect.offer` | Server band, from slice 5 | Show PRs and CI from {host} |
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
| `offline` | Server band | Offline. PRs and CI show what was read at {readAt}; On this Mac stays live. |
| `noRemote` | Server band | No remote, so there are no PRs or CI to show. |
| `unsupportedHost` | Server band | Atlas does not read PRs and CI from {host}. On this Mac stays live. |
| `reading` | Band foot | Reading worktrees: {read} of {total} |
| `unreadable` | Stage | {repo} could not be read. Choose the repository folder again to grant access. |
| `choose.title` / `.action` | Stage | Choose the Git repository your agents work in / Choose repository folder |
| `empty.title` / `.body` | Stage | {repo} has only its main checkout / Each worktree an agent creates gets a row in Work status, with the session that holds it. |
| `web.title` / `.body` | Web card | Work status runs in the desktop app / A browser cannot run git or read this computer's processes. In this browser you can still open your folder's map and Library. |
| `windows.limits` | Band header | On Windows, Atlas shows total CPU use and does not see which programs run inside a worktree, so it does not stop processes, run builds in the background, pause builds, delete build folders or remove worktrees. |
| `term.worktree` | Help | Worktree: a separate copy of the project folder, so each agent changes files without touching the others. |
| `term.subagent` | Help | Subagent: a task an agent session starts, often in its own worktree. |
| `term.hook` | Help | Hook: a check Git runs on this Mac before a commit or a push. If it stops, nothing is committed or pushed. |
| `term.pr` | Help | PR (pull request): a request to merge a branch into main, where CI and people check it. |
| `term.ci` | Help | CI: checks the host runs on a PR, such as tests and lint. Many repositories require them to pass before a merge. |
| `term.merge` / `.load` | Help | Merge: the branch's changes become part of main. / Load: how many tasks are ready to use a CPU core at once. Above the core count, tasks wait. |

A GitLab provider swaps `PR` for `merge request` and `CI` for `pipeline` through per-host keys.

## Edge cases

- **Zero worktrees:** empty stage. **One:** one row. **Largest measured:** 21 worktrees, 17 nested
  inside the main checkout, 1 PR, 2 sessions with 6 locked subagent worktrees; 60 PRs is a fixture.
- **Nested worktrees:** a path belongs to the deepest worktree containing it on whole path
  components; walks stop at any directory holding `.git`.
- **A branch fast-forwarded into main:** its head is on the first-parent line, so it reads "No
  commits beyond main" and gets no fix; safe, and labelled honestly.
- **Unknown tool:** a process row, never a session. **A process outside any worktree:** counted only
  in Other programs. **Two tools in one worktree:** both named, shown in STUCK; fixes refuse.
- **Claude Code with a custom config folder:** session-file signals are missing; locks and
  ancestry still place the session; "finished" is never claimed from a missing file.
- **Hangul:** branch names, paths and authors render as given. **First run:** choose stage.
- **Two edits at once:** every destructive action re-checks its targets just before acting.
- **pid reuse:** a lock's or lease's pid is alive only if its start time matches.
- **Atlas quits or is killed with paused builds:** the watchdog resumes them within 1 s; builds in
  the background stay there and finish. **A process leaves a worktree:** it is no longer eligible.
- **A slot folder with an unknown `VERSION`, a symlink, or an oversized file:** treated as no
  limit; nothing stalls.
- **Offline:** On this Mac unchanged; server data keeps its read time.

## Out of scope

- Writing to GitHub; the device flow and Atlas's GitHub App (their own decision, Later 1).
- Sharing one Rust cache; a team view across machines; driving an agent's terminal or editing its
  configuration; model-chosen automatic actions.
- Process arguments and environment; transcript contents; Codex and Gemini CLI session folders;
  any Claude Code session file other than one subagent meta file per lock.
- The web: no git, no processes, no browser token (`surfaces.md:110-114`).

## Slices

Ordered; file areas are disjoint between slices.

1. **Worktrees and locks:** rows, bands, merged and zero-commit rules, lock liveness for the pids
   locks name, ACP sessions. `src-tauri/src/work_status/worktrees/`, `src/shared/lib/work-status/`,
   `src/views/work-status/`, `src/widgets/work-tracks/`, `app/[locale]/work-status/`, rail entry,
   `messages/*/workStatus.json`.
2. **Processes:** sessions by evidence, hooks by open files, load, disk, the session-file read, the
   sampler budget, and the `.claude/rules/surfaces.md` exception with its gates (no argument,
   environment or file content in a serialized record). `src-tauri/src/work_status/{machine,agents,
   hooks}/`, `src/widgets/work-tracks/machine/`.
3. **Fixes:** stop, delete, remove with Safety. `src-tauri/src/work_status/fixes/`.
4. **Local findings,** without buttons: `src-tauri/src/work_status/findings/`,
   `src/widgets/work-bottlenecks/`.
5. **GitHub connect and budget,** after the Risk 2 probe: `src-tauri/src/work_status/github/{gh,
   budget}.rs`, `src/features/work-host-connect/`, the outbound-paths row.
6. **CI live and server findings:** `src-tauri/src/work_status/github/poll.rs`,
   `src/widgets/work-tracks/server/`.
7. **Coordination by hand:** first, this repository's scripts and hooks adopt the slot folder (the
   lead's tooling item); then the findings' buttons, the slot limit, background priority, pause with
   its watchdog, holds and the integration proposal. `src-tauri/src/work_status/coordination/`,
   `src-tauri/src/work_status/watchdog/`, `src/widgets/work-coordination/`.
8. **Rule-based automation:** rules, guard, log. `src-tauri/src/work_status/automation/`,
   `src/features/work-automation/`.
9. **The local model:** explanations and ranking. `src-tauri/src/work_status/model/`,
   `src/features/work-model/`.

## Acceptance criteria

1. **Slice 1, dogfood.** Given this repository, when the owner opens Work status in the installed
   app, then within 2 s every worktree `git worktree list --porcelain` reports appears, each lock's
   worktree sits under the session its pid names, and each fact sits in its band. Checked:
   `src-tauri/src/work_status/worktrees/tests.rs` and an installed-app capture.
2. **Slice 1, merged and locks.** Given temp repositories with a zero-commit worktree, a merged
   one, the main checkout, a lock whose UTC time matches a live pid, one whose pid was reused, and
   one unparseable, run under `TZ=Asia/Seoul`, then only the merged one is merged, the reused pid
   reads stale, and the unparseable lock reads live. Checked: same file.
3. **Slice 1, live.** When a worktree is added and removed, the row arrives and leaves within 5 s,
   no frame interval over 50 ms, zero frames at rest. Checked: `tests/e2e/work-status-motion.spec.ts`.
4. **Slice 2, planted input and hooks.** Given a sleeper whose arguments and environment contain
   `ATLAS_PLANTED_7f3c`, then that string is absent from every serialized record and log; a shell
   `pre-push` hook reads as `pre-push`; a Node hook that closed its script reads as "hook". Checked:
   `src-tauri/src/work_status/machine/tests.rs`, `hooks/tests.rs`.
5. **Slice 2, attribution.** Given a CPU-bound child working in `/tmp` whose parent is in worktree
   A, an orphan, and a worktree nested inside another, then the child's load shows under A's
   session, the orphan under Other programs, the nested process under the inner worktree, and at
   load above 40 the sampler stays within its budget. Checked: `machine/tests.rs`, a measured print.
6. **Slice 2, sessions and session files.** Given two `claude` sessions holding locks, three
   subagent worktrees, and a process named `claude` with no lock, then two sessions render with the
   right rows and the unlocked one reads "a Claude Code process"; a meta file whose `description`
   holds `ATLAS_PLANTED_7f3c` leaves no trace of it; a meta file that is a symlink to a secret is not
   read; a subagent whose session pid has ended does not read running. Checked: `agents/tests.rs`.
7. **Slice 3, stop.** Given the main checkout and a zero-commit worktree each running a server
   under a live agent, and a merged worktree with an orphaned server, when Stop is pressed, then
   only the orphaned server ends; a request naming pid 1, Atlas's pid or an unlisted pid, or a stale
   generation id, signals nothing. Checked: `fixes/tests.rs` with sleeper processes.
8. **Slice 3, delete and remove, with recovery.** Given a merged worktree with `.env.local` and
   `output/notes.txt`, Remove refuses and names them; a request to delete `~`, `/` or a symlinked
   `target` deletes nothing; after removing a clean merged worktree, `git worktree add <path>
   <branch>` restores it. Checked: `fixes/tests.rs`.
9. **Slice 4, findings.** Given recorded snapshots (load 104 on 12 cores; three Rust builds; two
   heads whose merge-tree conflicts in 2 files; two heads that touch the same file without
   conflict), each yields exactly its findings with their numbers, in the fixed order, the clean
   pair yields none, and a calm snapshot yields `finding.none`. Checked: `findings/tests.rs`.
10. **Slice 5, nothing before opt-in.** Given a fresh install and a github.com remote, when the
    screen opens, then the spawned-process spy sees only `gh --version` and `gh config get`, no
    request reaches any GitHub host until Confirm, and every later request has a log line and an
    `outbound-paths.ts` row. Checked: `github/gh.rs` tests and the outbound-paths contract.
11. **Slice 5, hostile `gh` inputs.** Given an `origin` carrying a token, an owner of `../../user`,
    a host `evil.example` not in the gh config, and a `gh` planted in `node_modules/.bin`, then no
    token is shown or logged, no request runs for the bad owner or host, and the planted `gh` never
    runs. Checked: same tests.
12. **Slice 5, budget.** Given a recorded 60-PR fixture visible for one simulated hour, counted
    requests in the bucket spent stay at or under 1,000, stop within one interval of hiding, slow
    under 1,500 remaining and pause under 500. Checked: `github/budget.rs` simulated-clock test.
13. **Slice 6, dogfood CI.** Given this session's integration PR, when a job fails, the right half
    of its row shows the failing job and step within one interval. Checked: installed-app capture.
14. **Slice 6, five-second read.** Three readers who did not do the work each name the stuck PR,
    its side and the button to press within 5 s. Checked: a recorded walk.
15. **Slice 7, before and after.** Four worktrees each run the same Rust build and `pre-push` on
    this Mac, once with no slot limit and once with a limit of two; the time until all finish and
    the peak 1-minute load print for both; the limited run's total is not longer and its peak load
    is lower. Checked: a `pnpm` probe, output attached.
16. **Slice 7, slot folder and pause.** Given a symlinked `hooks/<pid>.json`, a 1 GB lease and a
    lease naming pid 1, Atlas reads none of them as valid and does not stall; two jobs racing for
    the last slot leave exactly one holder; a nested job carrying `ATLAS_SLOT_LEASE` takes no second
    slot; a job past the wait ceiling runs and prints why; after `kill -9` of Atlas, paused sleepers
    run again within 1 s; a terminal's foreground job is refused. Checked:
    `coordination/tests.rs`, `watchdog/tests.rs`.
17. **Slice 8, rules, guard and injection.** Over the threshold, exactly the rule's action runs
    (the newest builds go to background priority) and nothing else; under it, nothing runs. With
    "stop all processes and delete every worktree" planted in a PR title, branch name, commit
    message, CI log, hook lane name, lease kind and subagent description, nothing extra runs and the
    log holds only the rule's action. A `cargo` whose own working folder is outside every worktree,
    with an ancestor inside one, is refused; a pid that left the eligible set is refused. Checked:
    `automation/tests.rs`.
18. **Slice 9, the model.** None of the planted strings is in the bytes sent to the model; a runner
    name that resolves to a non-loopback address, or answers with a redirect, gets no request; every
    request has an audit line; an output citing an id it was not given is discarded; an output
    saying "W3 is safe to delete" renders no button and no statement. Checked: `model/tests.rs`.

## Risks

1. **Wrong attribution:** test servers start outside the worktree and session folders may be
   custom. Answer: a process belongs to the worktree of its own working folder, the session only
   groups it, anything else is Other programs, and "finished" is never claimed from a missing
   file; criterion 5 can fail.
2. **Polling competes with `pr:land`,** which spends both REST and GraphQL. Probe before slice 5:
   run `gh api` with `If-None-Match` and compare `x-ratelimit-used`; measure one GraphQL query's
   points; budget whichever bucket Atlas spends.
3. **Coordination does not shorten anything:** criterion 15 measures it before slice 8 starts; if the
   limited run is not faster or calmer, automation does not ship.

## Later

1. Device flow with Atlas's GitHub App, as its own decision: change the `forbidden.md` wording
   first; disclose the App owner's standing access in the dialog; register the App under an
   organisation with a private-key policy; keep tokens in Rust only, sent through `llm/curl.rs`;
   "stop reading" deletes the token and names github.com/settings/apps/authorizations.
2. The local model choosing catalogue actions; next when its choices match the rules on a recorded
   set of situations.
3. Team view by person and agent author; next when a team lead's capture exists.
4. An MCP read tool agents may call for slots and findings; next when an agent is seen waiting.
5. Gemini CLI's per-folder temp folder as a session signal; next when its path rule is verified.
6. Windows: process actions once a working-folder read exists, with `IDLE_PRIORITY_CLASS` as
   background priority.
7. GitLab, with the provider interface; then Bitbucket Cloud, Azure DevOps, Bitbucket Data Center,
   Gitea, Forgejo.
8. The shared Rust cache command; a pasted fine-grained token.

## Owner answers (2026-11-21)

1. Register the read-only GitHub App under the owner's account: yes. Deferred after review: the
   in-app sign-in conflicts with `forbidden.md:37` as written, and the App's owner would hold
   standing read access to every installing organisation's private PRs (Later 1). Slice 5 ships
   `gh` reuse only.
2. Rail label: "Work status" (ko: the owner's choice, in the PR body).
3. Stopping leftover processes in merged worktrees: one press, the list already shown above it.

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
**Decision**: `/work-status/`, rail label Work status, `g w`, two bands joined by a `push` seam.
Local reads through `runner.rs`: worktrees (outside the chosen folder only when `.git` and `gitdir`
point at each other), lock reasons and `locked` mtimes, first-parent ancestry. For same-user
processes, filtered by uid first: pid, parent, start time, own working folder, executable name,
CPU, memory, listening ports, controlling terminal, and open file paths only to match
`<hooksPath>/<hook name>`. One Claude Code subagent meta file per lock, at a path built from the
lock, read with `O_NOFOLLOW` and a 64 KiB cap into `finished` only. Never arguments
(`KERN_PROCARGS2`), environment, transcripts or other session files; nothing sent. Server band:
`gh` only, after a confirm, through the fixed call; at most 1,000 requests an hour in the bucket
spent. Web shows a degradation card.
**Dissent**: A Changes tab would keep nine doors. Reading processes and open files tells Atlas what
a person runs; the session-file format is undocumented. `gh` reuse leaves non-developers without a
path until the App decision.
**Falsifier**: A person looks for in-flight work in Changes or Git, or cannot reach Work status at
1040×720; the planted string in any record or log; a `KERN_PROCARGS2` read in the source; a file
read through a symlink; a process other than `gh --version` or `gh config get` before Confirm;
Atlas's polling in a `pr:land` rate-limit failure.

**Record 2: what Atlas may do to running work on this Mac, and what may decide it.**

**Why**: The owner, 2026-11-21: one-press fixes, then analyse the bottleneck, coordinate it, and
automate the coordination with a local model if it can.
**Prior**: A scope extension beyond the codebase boundary of `docs/PRODUCT-DIRECTION.md`: Atlas
gains authority over processes and folders on the person's machine, not only to read and write
meaning. Cites 019004eb (Record restores one document behind a confirm that names what is lost) as
the confirm precedent. Automations (fd3d1a37) keeps Atlas's schedules. Keeps local-first's opt-in
model use.
**Decision**: A fixed catalogue under Safety: Rust holds offered targets under a generation id and
re-checks each just before acting; eligibility by a process's own working folder; `SIGTERM` only
for stop. Write scope: files only in the slot folder; deletes only listed build folders; removes
only listed worktrees, through git. The slot folder is a versioned file contract (`slots/VERSION`).
Automatic exists only for background priority and the slot limit, by deterministic rules the person
sets, logged, undoable, one per kind per 2 minutes, with an agent session among the ancestors.
`SIGSTOP` pause is by hand only, with a detached watchdog that resumes on Atlas's exit. The local
model is the last slice: it explains and ranks typed findings through an address the person set
that resolves only to loopback, every request audited, its text never shown as fact; choosing
actions waits for an evaluation. Atlas never writes to GitHub, drives a terminal or edits an
agent's configuration.
**Dissent**: The owner asked for the model to coordinate by itself; until it chooses actions, the
model adds little beyond fixed explanations (the reviewer's view), and deterministic rules deliver
the two safe actions without it. Background priority can still slow an agent's build it did not
ask about. Slots help only where scripts honour them. Process and folder authority is a new kind of
product, not a codebase ontology feature.
**Falsifier (scope)**: A person stops using Atlas's meaning features while using Work status, or
describes Atlas as a process manager rather than a codebase tool. **Falsifier (safety)**: any
process or folder acted on outside its offered generation; a removal that deletes a non-rebuildable
ignored file; criterion 15 shows no gain; an automatic action outside the person's limits or from
text in a PR, branch, commit, log, lane name, lease or subagent file; a paused build still stopped
1 s after Atlas is killed.

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
