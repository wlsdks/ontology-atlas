---
title: "Work status: whether each agent is still working, what it is changing, and what needs you"
doc_type: spec
status: draft
area: git
date: 2026-11-21
decisions: [dac7de97-cd83-4c93-8b29-5fecd5db4389]
---

# Work status: whether each agent is still working, what it is changing, and what needs you

**The concept.** You run 20 to 40 coding agents, each in its own Git worktree, and the hard part is
no longer starting them: it is knowing which ones are still getting anywhere. Today you find out by
cycling through terminal tabs and running `git status`, `git log` and `gh pr checks` in one folder
after another. Work status (`/work-status/`, the tenth rail destination, installed app) draws one
room per worktree and answers for each, without a terminal: is it still working, has it gone quiet,
is it waiting for you, is it done, and which part of the product is it changing. From a room you
act: read what changed, grouped by the capability it belongs to; open the folder in your editor or
terminal in one press; let a waiting check go first. The work lands where the product's meaning
already lives, so the ontology map, the wiki, the plans and Git are one press from the room.

**The promise, which can fail.** To learn whether an agent is still working, what it changed, which
part of the product that is, and whether its checks passed, you open no terminal, IDE, Git client
or GitHub page. Typing to an agent stays in that agent's own terminal; Atlas opens the worktree's
folder in your terminal or editor for you. Criterion 41 counts each time this fails.

This spec holds slices 1 to 11: what each does, for whom and why. What the person sees (States,
Design direction with Cases and Motion, Copy) is in `docs/specs/2026-11-22-work-status-design.md`;
the acceptance criteria and the decision record texts are in
`docs/specs/2026-11-22-work-status-criteria.md`. Slices 12 to 17 (processes and load, fixes,
bottlenecks, the rest of coordination, automation and the local model, with Record 2) are in
`docs/specs/2026-11-22-work-status-coordination.md`. "Work status" is the one name everywhere: plain
"work" already means Atlas's own long runs (`src/features/work-run/`, `messages/en/workCard.json`).

## Why Atlas

What a person already has, from each product's public pages (read 2026-11-22; prices and anything
those pages do not say were not read):

| Alternative | What it does today | Not in the pages read |
|---|---|---|
| The agent tool's own views | Claude Code's agent view lists its background sessions as needs input, working or completed, with a one-line summary, the PR's status, and a reply without opening the session; its desktop app runs sessions in worktrees with a diff view and the PR's CI status. Codex's desktop app runs chats in worktrees with an integrated terminal and Open in IDE | another vendor's agents; what the change means for the product |
| Terminal multiplexers | tmux marks a window that had output, or stayed silent for a set time (`monitor-activity`, `monitor-silence`) | Git, files, or why a pane is silent |
| Git clients | GitKraken Desktop's Agents view: a card per worktree with uncommitted files, ahead and behind, an agent status reported by integrations it installs on request, a merged-PR mark, and allow or deny on the card for one agent; lazygit creates and switches worktrees | the machine's load; what the change means |
| IDE worktree panels | VS Code lists each worktree as a repository in Source Control and creates worktrees for agent sessions | what the change means for the product |
| Agent-orchestration apps | Vibe Kanban: issues on a board, agents run in workspaces, a diff review whose comments go back to the agent | the machine's load; what the change means |

Status, diffs, PR state and approval on a card already exist, and for one vendor's sessions that
vendor's view stays ahead: it can reply in place. Atlas does not win by repeating them. Two things
here are Atlas's alone, and a third is a standing promise:

1. **It knows what the code means.** The folder that shows the agents moving also holds the
   ontology, the decisions, the wiki and the plans, so a room names the capability its branch is
   changing, two rooms changing the same capability are marked before they collide, and a diff is
   grouped by capability with a way to the map, Library and Planning. No page read offers this.
2. **It reads the repository and the machine themselves.** So it shows every worktree and every
   agent tool together, whatever started them, tells progress from files and CPU with no
   integration installed, and can order heavy checks by the machine's load. No page read
   describes progress taken from the folder, the machine's load, or an order of checks across
   worktrees.
3. **Local-first and free.** No account; nothing leaves the machine until the person turns on the
   host connection (`.claude/rules/forbidden.md`, the six trust promises).

Every slice in Slices carries a "Why Atlas" line naming 1 or 2, or says "parity": kept only because
leaving Atlas for it breaks the promise, and built last.

## Reasons to leave Atlas

| The moment | Opens today | In Atlas | Slice |
|---|---|---|---|
| Is it still working? | the agent's terminal tab; `git status` in its folder | the room's activity line and words: changing now, quiet, no activity for 14 min | 3 |
| Did my push fail because the Mac was busy? | the terminal, to read the failed check and push again | the check waits for a slot and starts when load allows | 4 |
| What part of the product does it touch? | nothing: read the diff and work it out | the room names the capability; the panel links the map, Planning and Library | 5, 6 |
| What is it doing now? | the terminal's scrollback | files changed, commits and commands on a timeline (6); thinking or waiting (7); each step within a second (9). The agent's own words stay in its terminal: Atlas reads no conversation | 6, 7, 9 |
| What did it change? | `git diff`, an IDE, a Git client | files and line counts grouped by capability (6). Reading a patch line by line stays in the editor, one press away, until Later 2 | 6 |
| It asked me something | the terminal, or a system notification | the room rises first and says so: Claude Code from its own session list (7), Codex from hook entries (9). Answering stays in the terminal until Later 3 | 7, 9 |
| Did the tests or CI pass? | the terminal for pre-push; GitHub or `gh pr checks` for CI | pre-push lanes and time left (8); CI jobs and time left (11) | 8, 11 |
| Jump into its terminal or editor | finding the right tab or window | Open in editor, Open in terminal: a new window in that folder. Landing in the agent's own running session is not replaced: Atlas does not know which tab holds it | 6 |
| Clean up dead worktrees | `git worktree remove`, `git branch -d` | Remove merged worktrees, behind a confirm | 13 |
| Open a PR or merge | `gh pr create`, GitHub, the repository's own script | not replaced: Atlas does not write to GitHub (Out of scope). The room says "Ready to merge" and names the PR | none |

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
   its third round, rooms in one building (the lead's relay). Later that day, relayed by the lead
   and translated: "when dozens of agents work in worktrees, telling whether each is progressing
   isn't visualised well, and it's a headache. The tools' own views exist but they're dull, and in
   the end you have to open a terminal anyway. The goal is to bring that user into Atlas. We have
   Git, worktrees, agents, the ontology, the wiki, planning, so there's no need to go outside";
   "why should someone use Atlas? If we only build features without that, the value fades"; two
   `pre-push` checks failed that day on timing tests that ran several times slower under other
   worktrees' load, "this happens a lot; can't Atlas coordinate it by itself?", and the queue
   "must be visualised too". His bar: every independent design score 4 of 5 or higher; like a
   game, never machine-made. No capture of the failed pushes was read for this spec.
2. **A team lead with six people, each running agents (not observed).** The owner's words: "a team
   of six creates a huge number of PRs that get assembled and run CI; keeping track is very hard."
   No capture of a team lead exists; the first slice does not claim to serve one.
3. **A non-developer PM asking "is it done, what's stuck" (not observed).** The owner's bar: "fun
   and good-looking enough that a non-developer understands it." Acceptance criterion 14 captures
   three cold readers before slice 11 is called done.

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

- **The rooms (slice 2) are built on `feat/work-status-rooms`** (read 2026-11-22, 35 files against
  `main`): large and mini rooms, floors and the shelf from slice 1's data. A room there takes no
  press: `LargeRoom.tsx` and `MiniRoom.tsx` on that branch hold no button or click handler.
- **What Atlas may read of a process** is parent, start time, working folder and, for a name that
  looks like an agent, the executable path; "a new field, a signal or a send needs a new decision
  record" (`.claude/rules/surfaces.md:92-105`). CPU time is not in that list nor in the recorded
  fragments dac7de97 and 87d3ada9, although Record 1's text below names it.
- **Atlas watches one folder today,** the open ontology folder, gathering changes for 500 ms
  (`src-tauri/src/vault/watch.rs:181,208`). Nothing watches a worktree's files.
- **Atlas reveals and never launches:** the reveal row of `.claude/rules/surfaces.md:54`, decision
  2026-08-17 (33), the test `the_webview_gets_no_opener_permission`
  (`src-tauri/src/app_shell/mod.rs:228`); `open_external_url` passes only `http` and `https`
  (`app_shell/mod.rs:22,64`).
- **Atlas already maps files to concepts:** a concept's evidence is its own `path:` and the
  `path:` of each element it lists (`src/shared/lib/git/evidence-states.ts:116`), and Changes names
  the concepts a commit's files touch by exact path
  (`src/views/change-briefing/model/change-digest.ts:193-198`).
- **Neither Changes nor Git shows an unmerged worktree's diff:** Changes reads first-parent history
  of the current `HEAD` and excludes uncommitted work (`docs/features/change-briefing.md:96-97`);
  Git is bounded to the open folder's documents (`docs/features/git.md:83`). Changes has a patch
  reader for a granted repository (`git_source_briefing_patch`, `src-tauri/src/git/briefing.rs:639`).
- **Claude Code documents a read of its own session state:** `claude agents --json` is "the
  supported way to read session state from outside Claude Code", giving each session's `cwd`,
  `pid`, a `status` of `busy`, `waiting` or `idle`, and `waitingFor` (`permission prompt`, `input
  needed`) (code.claude.com/docs/en/agent-view, read 2026-11-22); the installed 2.1.330 lists the
  flag for "interactive and background" sessions (`claude agents --help`, this Mac). The lead
  measured one call on 2026-11-22: 0.24 s, 0.19 s of CPU, 160 MB at its peak. Not known: whether a
  call sees a session of another settings folder, and whether it opens a network connection.
- **The pushes that failed on 2026-11-22** are the owner's account through the lead; which timing
  tests failed and the load at that moment were not read.

## Problem and alternatives

**Ranked by what each gives back against its cost, and by whether only Atlas can give it.**

| Rank | Problem | Gives back | Cost | Only Atlas? | Slice |
|---|---|---|---|---|---|
| 1 | Whether each agent is still working cannot be seen | the terminal tabs stay closed | one watcher, one new field of a read Atlas already makes | yes: from files and CPU, with no integration, for any tool | 3 |
| 2 | Pushes fail on timing tests when other worktrees load the Mac | a failed push and its re-run, "a lot" (owner) | the repository's scripts ask for a slot; Atlas reads load and grants | yes: it needs every worktree and the load | 4 |
| 3 | Nothing says which part of the product a worktree changes, or that two change the same part | the reading of each diff to work that out | one Git read per changed worktree, on the map Changes already builds | yes: it needs the ontology | 5 |
| 4 | Seeing what a worktree did means a terminal or an IDE | the `git diff`, `git log` and window hunt per worktree | a panel on reads made when it opens; one launch rule | the grouping by capability, yes; the rest is parity | 6 |
| 5 | An agent waits for an answer unseen | idle agent time | the probe, then one read of Claude Code's own session list (7); hook entries for Codex and for each event (9, Record 3) | across tools with what it blocks, yes; the state itself is parity | 7, 9 |
| 6 | No time left on a local check | watching a hook run | the hook-run record and a history | yes: this Mac's own history under its load | 8 |
| 7 | PR and CI state mean a browser | the GitHub tab | the `gh` connection and its budget | parity | 10, 11 |
| 8 | Leftover processes, build folders, bottlenecks, automation | load and disk | Record 2's authority over processes and folders | yes | 12 to 17 |

Why 1 is first: every later answer is read from a room, and a room whose movement cannot be
trusted makes the rest decoration. Why 2 is next: it is a measured daily cost with a cause Atlas
can remove, and its repository half touches no file slice 3 or 5 does. Why 3 precedes 4: the room's
capability line is the one fact no other tool shows, and the panel is where it is read in full.

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
| **Reuse `gh`** | needs `gh` installed and signed in | inherits SSO and any GHES host | requests made by `gh`; Atlas never sees the token | **slice 10** |
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
5. When a file changes in a worktree, a commit lands or a command there uses CPU, the room's lamp
   pulses within 2 s and its activity line gains a mark. When nothing has for 2 minutes the room
   reads Quiet; for 10 minutes, Stalled, and it rises on the stage; for 60 minutes, Idle. When the
   evidence is missing (a volume Atlas cannot watch), the room says it is updated each minute and
   never pulses.
6. When a script asks for a slot while Atlas runs, a numbered ticket joins the line in the machine
   room and its room says where it stands and why it waits, in numbers. When the rule allows, the
   ticket moves into a bay, the bay's lamp turns on and the check starts. When the person presses a
   ticket, it goes first, with Undo. When a holder's process ends without a word, its bay goes dark
   within 2 s and the line moves up.
7. When an agent commits, switches branch, stages a file, pushes, or adds or removes a worktree, its
   room changes within 2 s, and an edit not yet staged within 15 s. The wall sign names the
   capability the branch changes; when another room changes the same one, both say so. When the
   open folder does not describe this repository, rooms show Git facts and no capability. When a
   room's state changes class it glides to its new place, and nothing else moves.
8. When the person presses a room, the panel opens beside the board with what the branch changes
   by capability, its activity and its commits. When the person presses Open in editor or Open in
   terminal, Atlas opens that application on the worktree's folder; when the folder is gone or no
   longer a listed worktree, nothing opens and the panel says why.
9. When a Claude Code session starts to wait for the person, its room takes the first place on the
   stage within 12 s and says whether it wants an approval or an answer, with the capability it is
   changing; nothing was added to any settings file. When the list cannot be read, or holds a
   value Atlas does not know, rooms keep their words from beats and the popover says why.
10. When a hook that writes its run record starts, the room shows each lane and the time left: with
    no earlier run, the elapsed time and "No estimate yet"; past its usual longest time, "Slower
    than usual". When a hook ends, its result is what changed: after `pre-push`, the remote-tracking
    ref moved to the pushed head (passed) or not (stopped); after `pre-commit` or `commit-msg`,
    `HEAD` moved or not.
11. When the person presses **Add to Claude Code** or **Add to Codex**, Atlas lists the settings
    files it would change, each with its exact entries, and writes them only on confirm; from then
    a session's room follows each event within 1 s. When the file says a session is asking but its
    process has ended, the room never reads as asking; when no event arrives, rooms keep what the
    session list and beats show.
12. When the remote is GitHub or a GHES host and nothing is connected, the dashed part of a
    conveyor offers **Show PRs and CI from {host}**; pressing it opens a dialog stating what is
    sent and received; nothing is requested before the person confirms.
13. When connected, rooms with a PR gain their PR and CI stations and the time CI has left, updated
    while the screen is visible, within the budget; hiding it stops requests. When the bucket Atlas
    spends runs low, Atlas slows, then pauses, says so beside the shelf, and CI countdowns stop.

Findings, fixes and automatic actions continue in the coordination spec's Flow.

## States

None here — the States table is in `docs/specs/2026-11-22-work-status-design.md`.

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
actions (slice 13, the coordination spec) require a lock or ACP pid; a name alone never makes a
process eligible for one.

| Signal | Gives | Tools | Status | Slice |
|---|---|---|---|---|
| Lock reason pid and UTC time; `locked` file mtime | subagent id, session pid, lock time | Claude Code | verified | 1 |
| ACP session pids and `cwd` | session, exactly | Claude Agent in Atlas | verified (`tauri-acp.ts:106`) | 1 |
| Own working folder, parent chain, executable path | which agent works in which worktree, under which session | Claude Code, Codex (macOS, Linux) | built 2026-11-22 | 1 |
| File-change notices in each listed worktree; CPU time of the commands counted for it (Progress) | whether work is moving there | any tool, named or not | Record 4; thresholds unmeasured until criterion 33 | 3 |
| A ticket and a grant in `slots/` (The check queue) | a check waiting for or holding a slot | any script that asks | contract in this spec, Record 5 | 4 |
| Changed paths on the concept map (What a room changes) | the capability a worktree changes | any tool | the map is shipped in Changes | 5 |
| The agent's own session list, `claude agents --json` | busy, waiting and what for, idle | Claude Code | documented, one call measured; coverage of other settings folders unverified until criterion 27 | 7 |
| The agent-state file Atlas's helper writes from the agent's hooks | each event within a second: thinking, waiting for approval, finished replying | Claude Code; Codex only after the probe | documentation verified by the lead; a real session unverified until criterion 27 | 9 |
| The hook-run record a hook writes (Time left) | a running hook, its lanes and their seconds | any hook that adopts it | contract in this spec | 8 |

**No arguments or environment are read.** Executable names come from the kernel's process name,
confirmed by the executable path (Claude Code's kernel name is its version, `2.1.330`);
`KERN_PROCARGS2`, which copies every argument and the environment, is never read. Lane names and
results come only from the hook-run record a hook chooses to write (Time left).

**On screen:** "Claude Agent in Atlas" for ACP sessions; Claude Code, Codex, Gemini CLI for programs
the person installed.

## Progress: is it still working

Compared on what each says about one worktree, what it misses, and what it costs:

| Signal | Says | Misses | Cost and boundary | Verdict |
|---|---|---|---|---|
| A command of the session runs in the folder (shipped) | a tool call is running | an edit made with no command, as a subagent's edits are; a hung command looks like a busy one | none | kept as an input |
| The newest file change in the worktree, from the OS's file-change notices | something writes source there, whichever tool, with nothing installed | a build or test that writes only ignored folders | one watcher; a new signal (Record 4) | **chosen: the main beat** |
| Commits | work reached Git | everything between commits | none: slice 1's digest sees `HEAD` move | kept: a commit is a beat |
| CPU time of the commands counted for the worktree | a build or test is using CPU; a hung command is not | thinking between commands | one more field of a read made each second; a new field (Record 4) | **chosen: the second beat** |
| CPU time of the agent's own process | the model is answering | which worktree: one Claude Code process serves all its subagents' worktrees; what an idle terminal UI spends is unmeasured | the same read | not used (Later 9) |
| Hook events | the exact state | nothing, where the entries are installed | Record 3's write to settings | slice 9 refines; never required |

**A beat** is a counted file change in the worktree, a commit there, or its commands (attributed
as 87d3ada9 does) using 0.5 s of CPU or more within 10 s. **A counted file change** is one whose
path is neither under `.git` nor ignored by that worktree's ignore rules; a fixed list of
dependency and build folder names is dropped before any rule is read, so a build cannot flood the
watcher. Ignored paths do not count because a server left running rewrites its cache for ever and
would keep a dead room alive; a real build shows through CPU.

**What Atlas keeps,** in memory only: per worktree the time of the last beat and, for the last 60
minutes in 10-second steps, how many file changes counted (at most 99) and whether commands used
CPU. A file name from a notice is matched against the ignore rules in Rust and dropped: no name or
path from the watcher reaches the page, a log or a file, and nothing is sent.

| State of a room a live session holds | Rule | The room shows |
|---|---|---|
| Moving | the last beat is under 2 min old | the lamp pulses once in each second that had a beat; the activity line; the `code` loop; `progress.changed` |
| Quiet | 2 to 10 min | a steady lamp, a held pose, `progress.quiet` |
| Stalled | 10 to 60 min; the stage's fourth class | the lamp at half, the monitor in warning ink, `progress.stalled` with `.stalledWhy`, or `.stalledCommand` while a command still runs |
| Idle | over 60 min | a mini room, `progress.idle` |

A session's own room is never stalled while a worktree it locked is moving
(`progress.subagents`); a room whose check waits for or holds a slot reads from the queue instead.
A worktree with beats and no session Atlas recognises stays dark, with its activity line and
`progress.noAgent`: that is how a tool Atlas cannot name still shows. Until slice 7 for Claude
Code, and slice 9 for Codex, Stalled covers an agent that waits for the person, one that finished
its reply and one that is stuck, and the room says only what was measured; from then the exact
state replaces those words.

**Thresholds.** 2 min is a guess at the pause between two tool calls. 10 min is the longest a
Claude Code command may run before it times out (the coordination spec's vendor figure, not
re-read), so a longer silence is not one command. 60 min bounds Stalled, or thirty sessions that finished
this morning would fill the stage. No measurement of real gaps exists: criterion 33 measures them
first, and the numbers change here before any code if it disagrees.

**The activity line** is drawn from the kept steps and nothing else: in a large room, the last 10
minutes as 60 marks under the monitor's large line, each mark absent, short (1 file), medium (2 to
5) or tall (6 or more), and hollow when only CPU was used; in the panel, the last 60 minutes as 60
marks of a minute each. A mini room has the lamp and the words.

**Hidden and closed.** While the app is open on another screen with a repository chosen here, the
watcher and the per-second process read go on, no Git process runs and no frame is drawn; the
rail's Work status tile carries the number of stalled rooms. After the app was closed the line
starts empty and the last change is the newer of the last commit and the modified time of the
files `git status` lists. **Budget at 40 worktrees with six builds running, measured in slice 3:**
under 2 % of one core over a minute, visible or hidden; under 40 MB of added resident memory,
reported with its peak and what holds it. A volume that cannot be watched or loses events falls
back to that one read each minute where a session is live, and the room says `progress.eachMinute`.

## The check queue

Heavy checks from many worktrees start at once, and timing tests then fail for no fault of the
code (the owner, 2026-11-22). Ways to stop that:

| Way | Gives | Costs | Verdict |
|---|---|---|---|
| Status quo: every push runs its checks at once | no waiting | failed pushes and re-runs, daily | loses |
| A fixed count the scripts keep among themselves (the former slot limit) | works with Atlas closed | blind to load from anything that asks for no slot; no order to see, no reason, nothing to move forward | loses |
| **Atlas grants each check its start by measured load** | an order, a reason in numbers, a line the person can see and reorder | scripts must ask; it works only while Atlas runs | **chosen** |
| Atlas lowers the priority of builds or pauses them | no script changes | authority over processes (Record 2) | stays in slice 15 |

**First step: the repository's own tooling.** `.githooks/pre-push` asks for a slot before its heavy
part, through one helper script; the lead's item, before any Atlas code. Which other scripts are
heavy enough to ask is not measured: `pre-push` first, others when criterion 15's run names them.

**The slot folder, a versioned file contract** (moved from the coordination spec and revised;
Record 5). `slots/` in Atlas's app data directory for `dev.jinan.ontology-atlas` (macOS
`~/Library/Application Support/dev.jinan.ontology-atlas/slots/`, Windows
`%APPDATA%\dev.jinan.ontology-atlas\slots\`), mode 0700. No folder, or a `VERSION` other than
`1`: a script runs at once, as today.

- `atlas`: Atlas's pid and the time, rewritten every 5 s while the app runs. A script takes Atlas
  as running only while this file is under 15 s old and its pid is alive.
- `tickets/<pid>.json`: written by the script with `O_CREAT|O_EXCL`: its pid, its worktree, a kind
  from a closed list (`pre-push`, `e2e`, `unit`, `rust-build`) and the time it asked.
- `grants/<pid>`: written by Atlas when that ticket may start. The script looks each second and
  deletes its ticket and grant when it ends, passed or failed.
- A script that holds a grant passes its name to its children in `ATLAS_SLOT_LEASE` (the script's
  own variable; Atlas reads no environment), so a nested job asks for nothing.
- A script waits only while Atlas runs and never over 10 minutes: past that, or within 15 s of
  Atlas stopping, it runs and prints why.

**Granting.** Atlas reads the 1-minute load average and the core count every 5 s (a new read,
Record 5) and sees tickets by file-change notice. The line is in order of asking. Its first ticket
starts when no check holds a slot, whatever the load, so one check always runs and other programs'
load starves nothing; or when fewer checks hold a slot than the limit (the cores divided by 4, at
least 1; the person may set 1 to half the cores), the load per core is under 0.75, and 20 s have
passed since the last start, so that start's load has registered. These defaults stand until
criterion 15 measures them. A holder whose pid has ended, whose start time changed or whose folder
left its worktree is released within 2 s; a ticket whose pid has ended is removed. A ticket for a
repository not open in Work status is granted at once and holds no slot, so no script waits for an
app that is not watching its repository.

**Moving one forward.** Pressing a ticket puts it first in the line; it starts at the next start
the rule allows, and Undo puts it back. One ticket at a time can be moved, and the 10-minute
ceiling bounds every wait, so no ticket starves behind others moved ahead of it.

**Estimated start.** Atlas keeps how long each of the last 20 holders of a kind held its slot
(Time left's history store). A ticket's earliest start is when enough holders are due to end, shown
as Time left shows a range; under three runs of a kind, `queue.noEstimate`. When load, not slots,
holds the line, the room says so with the numbers and gives no time.

**Safety, kept from Record 2.** Atlas writes only `atlas` and `grants/` and removes only tickets
and grants whose process has ended. It reads each file with `O_NOFOLLOW` and a 4 KiB cap, keeps
content out of errors, shows a kind only from the closed list, and counts a ticket only while its
pid's own working folder is inside the listed worktree it names. It signals, slows and stops no
process in this slice: the queue only withholds a file, and the script decides. `git push
--no-verify` skips the queue with every other check. **Windows,** which keeps no load average and
where Atlas reads no process's folder: the limit alone decides, a ticket is counted by its pid and
start time, and the gauge is absent; checked there by CI only.

## What a room changes

The line no page read under Why Atlas offers: which part of the product this worktree is changing.
It comes from the same read that gives the room's Git facts, so the former Live Git slice carries it.

**From files to capabilities.** For a worktree, the changed paths are the files that differ between
its head and where it left the base branch, plus its uncommitted files. Each path is looked up in
the map Changes already builds from the open folder: a concept's own `path:` and the `path:` of
each element it lists (Today). The room's wall sign gains a second line naming the capability with
the most changed files and how many others (`meaning.changes`); files no concept names are counted,
never hidden (`meaning.unmapped`). When two rooms change files of one capability, both carry
`meaning.shared`, and the panel names the other branch. It needs the open folder to describe this
repository (it lies inside it, or one of its projects is bound to it); otherwise rooms show Git
facts only and the panel says `meaning.noFolder` with Choose folder. A capability line is a fact
about paths, not a judgement that the change is right.

**Git facts.** A room's facts are its branch, commits beyond the base, uncommitted files, commits
not pushed or "Pushed", an operation in progress with its conflicts, and the last commit's time.
Principles from MIT-licensed clients (lazygit, VS Code, SourceGit, GitHub Desktop; the lead's
research of 2026-11-22, not re-read here; no code copied, no GPL or source-available client read):
snapshot refs cheaply, watch `.git` and gather changes, ignore lock files, take no lock a person's
command needs, fetch on a slow clock.

| Read | When, while visible | Cost and bound |
|---|---|---|
| File-change notice on the common Git folder: `HEAD`, `refs/`, `packed-refs`, and each worktree's own `HEAD`, `index`, `locked` and operation files; `*.lock` and `objects/` ignored | always; changes gathered for 250 ms, at most 1 s | no process; a commit, branch switch, stage, push or lock is on screen within 1 s |
| The shipped stat digest, extended with each index and the remote-tracking refs | every 10 s, and at once when a notice reports lost events or the volume cannot be watched | stats only, no process; catches what a notice missed |
| `git status --porcelain=v2 --branch` and the changed paths against the base, in one worktree | after a notice for that worktree's `index` or `HEAD`, and 5 s after a counted file change (slice 3's beats); at most once per 10 s per worktree and one in flight at a time | 65 ms of CPU for the status (the reviewer's measurement, 2026-11-22), the path list unmeasured; a worktree nobody works in costs nothing |
| Agent processes | each second (shipped) | 1.6 ms a read |
| `agent-state/`, `hook-runs/` and `slots/` | file-change notice, never a poll | within 1 s |
| `git fetch origin` | never, unless the person turns it on (slice 10): every 3 min, never `--prune`; skipped while a `git` process has its working folder in one of the repository's worktrees or a ref lock file exists, because a fetch takes ref locks an agent's own command needs | one request per 3 min, listed in `outbound-paths.ts` and logged |

Every read goes through `runner.rs` with `GIT_OPTIONAL_LOCKS=0`, so Atlas never refreshes an index
or holds `index.lock` against an agent's commit. A staged or committed change is exact within 2 s,
an edit not yet staged within 15 s. **Hidden:** no Git runs; returning reads everything once.
**Budget at 40 worktrees with six agents working, measured in slice 5:** under 1 % of one core over
a minute beyond slice 3's; no Git process in a minute with no notice and no beat; no read over
250 ms on a thread that draws; under 30 MB of added resident memory, reported with its peak.

## The room panel

Pressing a room opens a panel at the right, 400 px wide (360 px at 1040×720). The board keeps the
remaining width, reflows once and stays live, with the pressed room in view. It is never a
full-screen sheet and nothing in it unfolds in place: three tabs, **Changes**, **Activity** and
**Commits**, switch what is under them. Pressing another room swaps its content; Escape or Close
returns focus to the room that opened it. Alternatives that lost: no detail (the status quo: the
person opens a terminal for `git diff`); a link to Changes or Git, which cannot show an unmerged
worktree (Today); a centred popup, which covers the rooms the person is comparing.

| Part | Shows | From |
|---|---|---|
| Head | the branch as a title, the tool and session, the room's state in the same words, the 60-minute activity line | slices 2 and 3 |
| Actions | **Open in editor**, **Open in terminal**, Copy folder path | below |
| Changes (opens first) | one group per capability, most files first: its title as a link to the map, its files with lines added and removed; then `meaning.unmapped` by top folder; then `panel.documents`: the specs, plans and ontology documents this branch itself edits, each a link to Planning, Library or the map; and `meaning.shared` naming the other branches | `git diff --numstat` against the base and `git status`, read when the panel opens and after that worktree's beats; the map of What a room changes |
| Activity | newest first, at most 50 lines since the app opened: a commit with its subject, "{count} files changed" per minute, a command that ran and for how long, a check that waited for and held a slot; hook events from slice 9 | the kept steps, slice 1's process read, the queue |
| Commits | the commits beyond the base: subject, time, author; 30, then a count | `git log` |

A command is a duration and nothing else: Atlas reads no arguments. File names here come from Git,
never from the watcher. The panel reads one worktree and stops when it closes.

**Open in editor, Open in terminal** (Record 6: the one place Atlas opens another application on a
folder). On the
first press Atlas lists the editors and terminals installed on this Mac that are on a closed list
of application identifiers kept in Rust; the choice is remembered and can be changed from the
panel. A press asks the OS to open that application, by its identifier, on that worktree's folder
and nothing else: no shell, no lookup on `PATH`, no argument but the folder, nothing typed, pasted
or run in the terminal. The page sends a worktree's id; Rust resolves the folder, checks again that
it is a listed worktree and a real directory, never an application bundle or a link, and refuses
otherwise. The WebView still gets no opener permission. It opens a new window in that folder, or
the editor's existing window for it; it does not find the tab an agent already runs in. **Windows
and Linux:** Copy folder path only, until the launch is walked there.

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
adopts it in slice 8; a hook that writes none gets a room state in slice 12 (the coordination spec).

**History store.** One file per repository in the app's OS cache folder, outside every vault: at
most 20 runs per lane or job, 256 KiB; durations, loads and lane or job names, nothing a person
wrote. From slice 4 it also holds how long each kind of check held its slot. Deleting it only returns estimates to "No estimate yet"; it refills from the next runs.

## Waiting for you: the agent's own state

A process tells Atlas that a command runs, and beats that work is moving; whether an agent waits
for the person, is thinking or has finished its reply is known only to the agent. Ways to learn it:

| Way | Gives | Costs | Verdict |
|---|---|---|---|
| Beats only (the status quo after slice 3) | moving, quiet, stalled | a waiting agent looks like a stuck one | stays the base |
| Session transcripts | everything | they hold the conversation | refused in 87d3ada9 |
| **Claude Code's own session list,** `claude agents --json` | busy, waiting and what for, idle, per session | Atlas runs the person's `claude` program; Claude Code only; up to 10 s late; the schema is not promised stable | **slice 7, first** (the owner, 2026-11-22; Record 7) |
| **Atlas's hook entries, added on a press** | each event within a second; Codex, if the probe sees it fire | a write to the person's settings files | **slice 9, optional** (Record 3) |
| A snippet the person pastes | the same | a hand edit of JSON where a slip goes unseen | loses |

**Why this is not parity.** The state itself is shown by the agent's own view and by a Git
client's cards (Why Atlas). What Atlas adds is the room around it: a waiting room of any tool,
started anywhere, rises first with the capability it is changing and what stands behind it (its
commits, its check in the line), so the person can choose which agent to answer first.

### The session list (slice 7)

**The read.** Vendor documentation and one measurement, both by the lead on 2026-11-22: each entry
carries `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, and while its process lives a
`status` of `busy`, `waiting` or `idle`; `waitingFor` when it waits (`permission prompt`, `input
needed`, `sandbox request`, `worker request`, `dialog open`); for a background session also `id`
and a `state` of `working`, `blocked`, `done`, `failed` or `stopped`. The documentation calls it
"the supported way to read session state from outside Claude Code" and promises no stable schema.
One call took 0.24 s, 0.19 s of CPU and 160 MB at its peak.

**The call is fixed,** as `gh`'s is: the executable is an absolute path from a fixed list
(`~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`), never a `PATH`
lookup; the arguments are exactly `agents --json`; the working folder is in Atlas app data;
standard input is closed; the environment is cleared except `HOME`, plus `CLAUDE_CONFIG_DIR` set
to exactly one folder the person added. It is killed after 5 s and its output is read to 1 MiB.

**When.** After the per-second process read shows an agent process appear, end or change folder;
otherwise at most one call every 10 s in all while Work status is visible, taking the added
folders in turn; never while it is hidden; one run at a time. With no Claude Code process seen, it
does not run. At that pace the calls spend about 2 % of one core, and each is a short-lived
process of about 160 MB (the measurement above); criterion 43 holds the budget.

**What is kept.** The output is parsed into a struct that names only `pid`, `cwd`, `startedAt`,
`kind`, `status`, `waitingFor` and `state`, each value from the closed lists above; an unknown
value, a missing field or output that does not parse means unknown, and the room keeps its words
from beats. `name`, `sessionId` and `id` are dropped at the parse: a name can hold the person's own
title text, and a room needs none of them. An entry counts only when its `pid` and `startedAt`
match a session Atlas already shows and its `cwd` lies in a listed worktree.

| From the list | Room state |
|---|---|
| `waiting` with `permission prompt` or `sandbox request` | waiting for approval, first on the stage |
| `waiting` with `input needed`, `dialog open` or `worker request`; `state` `blocked` | waiting for an answer, first on the stage |
| `busy`, or `state` `working`, with no command seen | thinking; it counts as a beat, so the room is Moving |
| `idle`, or `state` `done` | finished replying |
| `state` `failed` | the session failed, in the stage's second class |
| anything else | unknown: the room's words from beats |

**Settings folders.** Each Claude Code settings folder is its own instance, and the owner runs
several (Today). Atlas runs the call once for the default and once for each folder the person
added with **Add another settings folder**, the same picker slice 9 uses; it searches for none.
Whether a call sees another folder's sessions without that is unknown until criterion 27.

**Limits.** A subagent waiting inside a session shows in that session's own room. Codex has no such
list, so a Codex room reads from beats until slice 9. Nothing is written anywhere. Whether a call
opens a network connection is unknown until criterion 27: if it does, the read is not built until
this spec gains a confirm that names what is sent and an `outbound-paths.ts` row; if not, it is on,
with `sessions.status` in the agent state popover and a switch that stops it. **Windows:** the same call; the join by pid and
start time is the one slice 1 makes there.

### The hook entries (slice 9, optional)

They add what the list cannot give: each event within a second in place of up to 10 s, thinking
told from running a command, events on the panel's Activity tab, Codex if criterion 27's probe
sees its hooks fire, and the footing for answering from the room (Later 3). Where both report, the
newer of the two wins.

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
file has its own diff and can be left out. Before any of slice 9 is built, a probe by hand pastes
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
a session: slice 9 shows `agentState.windows` in place of the offer, and rooms draw from locks and
Git (Later 4).

## Copy

None here — every string, with Design direction, Cases and Motion, is in
`docs/specs/2026-11-22-work-status-design.md`.

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
- **pid reuse:** a lock's pid, an agent-state file's and a ticket's is alive only if its start
  time matches.
- **A session that reads another settings folder:** silent until that folder's file is added
  through the picker; `agentState.status` counts it as not reporting. **The person adds a hook of
  their own after Atlas's:** Remove takes out only Atlas's entries.
- **Offline:** everything read on this Mac is unchanged; PRs and CI keep their read time and CI
  countdowns stop.
- **Beats, zero to many:** a worktree nobody touches draws no mark and no frame; one saved file is
  one short mark; a checkout that rewrites 5,000 files is one tall mark, counted to 99. **Two
  worktrees change at once:** each lamp pulses for its own beats only. **A person edits a file by
  hand in an agent's worktree:** it is a beat; Atlas cannot tell whose hand it was and does not
  say. **A Hangul or NFD file name:** it is matched against ignore rules and dropped like any other.
- **The Mac sleeps:** the steps slept through are empty, and the state is judged from the last
  beat's real age. **Atlas was closed:** the activity line starts empty (`panel.activity.since`).
- **Atlas is not running:** scripts start their checks at once, as today. Nothing about that is
  recorded or drawn afterwards: when Atlas opens, the machine room shows only checks that asked
  while it was running, and a check started before it shows as a room whose commands use CPU.
- **Atlas quits or is killed while checks wait:** each waiting script runs within 15 s and prints
  why; checks that held a slot go on untouched. **Atlas starts while old tickets lie in the
  folder:** a ticket whose pid has ended is removed, a live one keeps its place by its asking time.
- **Tickets, zero, one, many:** no line and `queue.empty`; one ticket that starts at once when no
  check runs; five drawn and `queue.more` for the rest (fixture: 12 waiting). **Two presses at
  once:** the second ticket moved first wins, and the first returns to its place by asking time.
  **A moved ticket's script gives up:** its ticket is removed and the line closes.
- **A symlinked, oversized or unknown-kind ticket; an unknown `VERSION`:** ignored; the script
  that wrote it reaches its ceiling and runs. **Load stays high from other programs:** one check
  at a time still runs, and each room says so in numbers.
- **A changed file no concept names; a concept whose `path:` no longer exists:** counted under
  `meaning.unmapped`; ignored. **Every room changes one capability** (a rename across the tree):
  each says so once, and the panel lists the branches. **The folder is opened, moved or renamed
  while the panel is open:** the capability groups are read again, or `meaning.noFolder`.
- **The panel's worktree is removed, or its folder becomes a link, between the list and a press of
  Open:** nothing opens and `open.refused` says why. **The remembered application was
  uninstalled:** `open.reason.appMissing`. **The largest read:** a branch that changes 2,000 files
  lists its groups with counts and 200 file rows, then a count.

## Out of scope

- Writing to GitHub; the device flow and Atlas's GitHub App (their own decision, Later 5).
- A team view across machines; writing an agent's settings by any path but the agent config
  writer; listing or searching the disk for settings folders.
- Typing to an agent, answering it, or finding the terminal tab it runs in: Atlas opens a folder
  in an application and types nothing (Later 3 and 10). Sending a message into a running session:
  no hook of today's agents carries one (Later 13).
- Starting an agent or creating a worktree: the tools that own a session do that, and Atlas
  shows whatever they start.
- Patch lines in the panel: it lists files and counts, and the editor shows the patch (Later 2).
- Slowing, pausing or stopping any process for the queue: it only withholds a start (slice 15).
- Reading a file's content or name through the watcher; watching ignored folders.
- Harness hook management: its own spec, on the same writer (Later 1).
- The tool or command an agent asks approval for: tool input can hold secrets and is text from an
  agent, so the approval room names only the session.
- New Moru art; sound.
- Process arguments and environment; transcript contents; every agent session file (the one file
  slice 12 reads is in the coordination spec).
- The web: no git, no processes, no browser token (`surfaces.md:110-114`).

## Slices

Slices 1 to 11 are here; slices 12 to 17 are in
`docs/specs/2026-11-22-work-status-coordination.md`. The order is what keeps a person inside Atlas
first and what only Atlas can give first (Problem and alternatives); parity comes last. File areas
are the planner's to settle; those named are disjoint between slices except the shared seams.

1. **Worktrees, locks and agent programs** (shipped). *Why Atlas: it reads Git and the person's own
   processes itself, so it shows every worktree and tool, whatever started them (2).*
   `src-tauri/src/work_status/worktrees/`, `src/shared/lib/work-status/`, `src/views/work-status/`,
   `app/[locale]/work-status/`, rail entry, `messages/*/workStatus.json`.
2. **Rooms** (built on `feat/work-status-rooms`, in `src/widgets/work-tracks/`; being polished),
   from slice 1's data only: the header, tiers, shelf, every motion in Design direction, the empty
   room, and the faces of the states Cases marks 2. The room model is a closed list of every state
   in Cases, so a later slice adds a face without editing it. *Why Atlas: none of its own; it is
   the frame the next slices are read in.*
3. **Progress,** after criterion 33's probe: the watcher, beats, the four states, the lamp's pulse
   and the activity line, Stalled on the stage, the rail tile's count, the read that goes on while
   another screen is open. *Why Atlas: progress read from the folder and the CPU, so it holds for
   any tool with nothing installed, including one that hangs without a word (2).*
   `src-tauri/src/work_status/progress/`, `src/shared/lib/work-status/signals/progress.ts`,
   `src/widgets/app-nav-rail/`, a third-exception edit in `.claude/rules/surfaces.md` (Record 4).
4. **The check queue.** First, the repository's own tooling: `.githooks/pre-push` asks for a slot
   through one helper (the lead's item, mergeable alone: with no Atlas running it changes
   nothing). Then the slot folder, the load read, granting, the machine room with its gauge, bays
   and line, the ticket on the room's parcel, moving one first, and the estimated start. *Why
   Atlas: only a tool that sees every worktree, every agent and the load can put their checks in
   an order; one agent or a Git client cannot (2).* `scripts/lib/slots/`, `.githooks/pre-push`,
   `src-tauri/src/work_status/{slots,load}/`, the machine room's widget (Record 5).
5. **What a room changes** (the former Live Git state, reshaped): notices on `.git`, the extended
   digest, the status read after beats, the room's Git facts, and from the same read the
   capability on the wall sign and the mark on rooms that share one. *Why Atlas: the Git facts are
   parity; the capability and the shared mark need the ontology (1).*
   `src-tauri/src/work_status/{watch,git_state}/`, `src/shared/lib/work-status/signals/{git,meaning}.ts`.
6. **The room panel:** a room becomes a button; Changes by capability with documents, Activity,
   Commits; Open in editor and Open in terminal with the chooser; Copy folder path. *Why Atlas:
   the diff is grouped by what it means and leads to the map, Planning and Library (1); opening an
   editor is parity, kept because without it every look at a patch ends outside.*
   `src/widgets/work-room-panel/`, `src-tauri/src/work_status/{detail,open_app}/` (Record 6).
7. **Waiting for you,** after criterion 27's probe: the read of Claude Code's own session list
   (Record 7), with no write to any settings file; the waiting, thinking, replied and failed
   faces, each with the room's capability; the status line and its switch; one call per settings
   folder the person added. *Why Atlas: the state is parity; one board for every session, started
   anywhere, each waiting room with what it is changing and what stands behind it, is not (1, 2).*
   `src-tauri/src/work_status/agent_sessions/`, `src/shared/lib/work-status/signals/sessions.ts`.
8. **Hook runs and time left:** the hook-run record, this repository's `pre-push` writing it, the
   history store the queue already fills, the estimate, the lanes, stopped and late faces. *Why
   Atlas: only this Mac's own history, under its own load, can say how long this check takes here
   (2).* `src-tauri/src/work_status/{hook_runs,estimate}/`, `scripts/lib/prepush/`.
9. **Hook entries, optional** (the former Agent state; Record 3), after criterion 27's probe: the
   agent config writer with its version store, the helper, the agent-state file, the offer, the
   confirm with its target list, and status. *Why Atlas: it brings Codex's waiting rooms onto the
   same board and each event within a second (2); for Claude Code alone it is parity, which is why
   it is optional and after slice 7.* `src-tauri/src/agent_config/` (shared with Harness, which
   may build the writer first), `src-tauri/src/work_status/agent_state/`, the helper's own binary
   target, `src/features/work-agent-state/`.
10. **GitHub connect and budget,** after criterion 31's probe, with the opt-in fetch. *Why Atlas:
    parity; without it "did CI pass" is a browser tab.*
    `src-tauri/src/work_status/github/{gh,budget}.rs`, `src-tauri/src/work_status/fetch/`,
    `src/features/work-host-connect/`, the outbound-paths rows.
11. **CI live and CI time left,** with the failed, ready and queued faces. *Why Atlas: the state is
    parity; the time left from the run history is not shown by the host (2).*
    `src-tauri/src/work_status/github/{poll,estimate}.rs`,
    `src/shared/lib/work-status/signals/host.ts`. Server findings are slice 14.

Slices 4 and 5 touch no file in common beyond the seams and may be built at the same time; they
merge in this order.

**Shared seams.** Every slice adds its own lines to `src-tauri/src/lib.rs:392` (command
registration), `src-tauri/src/work_status/mod.rs` (the module list and the snapshot) and
`messages/*/workStatus.json`. `.githooks/pre-push` is edited by slices 4 and 8 here and slice 15
there; `.claude/rules/surfaces.md` by slices 3, 4, 6, 7 and 9 here and slice 12 there. A slice only
appends at a seam, and slices merge one at a time through the integration branch in slice order,
so no two edit a seam at once.

## Acceptance criteria

None here — criteria 1 to 3, 10 to 15 and 19 to 44 are in
`docs/specs/2026-11-22-work-status-criteria.md`; 4 to 9 and 16 to 18 in the coordination spec.

## Risks

Assume it shipped and failed. The three likeliest reasons:

1. **A room says Stalled while its agent works, or Moving while it is stuck,** and the person
   goes back to the terminal to be sure. Answer: criterion 33 measures real gaps before any code
   and can change the thresholds; CPU counts a silent build as work; the room states only what
   was measured; criterion 41 fails the slice on one note.
2. **The queue makes pushes slower or stalls them,** and the person pushes with `--no-verify`.
   Answer: one check always runs, the 10-minute ceiling, scripts that run when Atlas is gone
   (criterion 36), and criterion 15, which can stop the slice.
3. **Atlas is one more board of statuses the agent tools already draw better,** and nobody opens
   it. Answer: the capability line and the shared mark come in slice 5, before any parity slice;
   each slice names what only Atlas gives; the falsifier is a person who uses the panel and never
   presses a capability.

Standing risks of later slices: polling competes with `pr:land` in the one REST bucket (criteria
31 and 12); the time left is wrong often enough to be ignored (criterion 23's seven in ten); the
hook entries reach few sessions or slow the agent (criteria 27 and 25); the rooms move but say
nothing (criteria 21 and 14).

## Later

Numbers are stable names. Next in order: 3, 2, 12, 10, then the rest as their conditions arrive.

1. Harness hook management (add, remove, turn on and off) on the agent config writer, as its own
   spec: the owner asked for it on 2026-11-22.
2. A file's patch inside the panel, through Changes' patch reader (Today); next when Open in editor
   is pressed mostly to read one file.
3. Answering an approval from the room, as its own decision: Claude Code's PermissionRequest hook
   can return allow or deny (the lead's check, 2026-11-22), so it is feasible, but it lets Atlas
   approve what an agent does and needs the tool and command shown from a closed list of tool
   kinds, which Out of scope withholds today. It rests on slice 9's entries. Next when slice 7
   shows rooms waiting over 5 minutes.
4. Agent state walked on a Windows machine; until then Windows has CI only.
5. Device flow with Atlas's GitHub App, as its own decision: change the `forbidden.md` wording
   first; disclose the App owner's standing access in the dialog; register the App under an
   organisation with a private-key policy; keep tokens in Rust only, sent through `llm/curl.rs`;
   "stop reading" deletes the token and names github.com/settings/apps/authorizations.
6. Team view by person and agent author; next when a team lead's capture exists.
7. GitLab, with the provider interface; then Bitbucket Cloud, Azure DevOps, Bitbucket Data
   Center, Gitea, Forgejo.
8. A pasted fine-grained token.
9. The agent's own CPU as a beat for the room it runs in; next when criterion 33's probe shows an
   idle and an answering session differ fivefold.
10. Landing in the agent's own running session instead of a new window; next when a tool documents
    a way that types nothing, and as its own decision.
11. Start a waiting check now, whatever the load; next when a person moves a ticket first and still
    pushes with the queue skipped.
12. The decisions and wiki pages that cite a capability a room changes, in the panel; next when
    the capability line is used to open the map from the panel.
13. Messages from Atlas into a running session: not possible with today's hooks (the lead's check,
    2026-11-22); reopened only when an agent documents a channel for it.

## Owner answers (2026-11-21)

1. Register the read-only GitHub App under the owner's account: yes. Deferred after review: the
   in-app sign-in conflicts with `forbidden.md:37` as written, and the App's owner would hold
   standing read access to every installing organisation's private PRs (Later 5). Slice 10 ships
   `gh` reuse only.
2. Rail label: "Work status" (ko: the owner's choice, in the PR body).
3. Stopping leftover processes in merged worktrees: one press, the list already shown above it
   (slice 13, the coordination spec).

## Owner answers (2026-11-22)

Relayed by the lead in this session; Record 3 holds only once the lead records it. (1) Rooms in one
building, the third render round; the headline goes. (2) Agent hooks by one press inside Work
status, not a pasted snippet. (3) Harness will manage hooks on the same writer, in its own spec.
(4) The feature must bring the person who runs dozens of agents into Atlas, and say why Atlas.
(5) Atlas should order heavy checks by load by itself, and the line must be drawn, not only work.
(6) Every independent design score 4 of 5 or higher; like a game, never machine-made.

(7) Claude Code's own session list carries "waiting for you" first, with no settings write; the
hook entries become the richer, optional layer (the answer to this spec's one question, relayed by
the lead the same day).

**Owner question:** None.

Decided here, each reversible in one place: the first target is `~/.claude/settings.json`, with
other settings folders added through the file picker; the approval room names no tool or command
(Later 3); the pill says "CI done in" unless the host says the PR merges by itself (`eta.pill.*`);
a pressed ticket goes first in line and does not start at once (Later 11); the panel sits at the
right and the board narrows; Stalled is 10 to 60 minutes until criterion 33 says otherwise.

## Decision record text

None here — Records 1 and 3 to 7 are in `docs/specs/2026-11-22-work-status-criteria.md`; Record 2
in the coordination spec.

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
- 2026-11-22: the owner's direction on the concept, "why Atlas", failed pushes under load and the
  drawn queue. The title and opening state the concept and a promise that can fail; new sections
  Why Atlas (from the other tools' public pages) and Reasons to leave Atlas. Slices reordered by
  what keeps a person in Atlas and by what only Atlas gives, each with a "Why Atlas" line: 3
  Progress (new), 4 The check queue (the slot folder and limit moved from the coordination spec's
  former slice 11 and changed to grants by load), 5 What a room changes (the former 3, Live Git
  state, now carrying the capability line), 6 The room panel (new), 7 Waiting for you (new: the
  session list), 8 Hook runs and time left (the former 4), 9 Hook entries (the former 5, Agent
  state), 10 and 11 the former 6 and 7, 12 to 17 the former 8 to 13. Earlier lines of this log
  keep the numbers of their day. New: Records 4 to 6, criteria 33
  to 44 with 15 moved here and restated, the machine room, its Cases, Motion and copy, the progress
  states in place of "quiet over 5 min", and the Risks rewritten around the three likeliest
  failures. Later 2 and 3 redefined (a file's patch in the panel; answering from the room, as its
  own decision), 9 to 13 added. A room's changed files left Out of scope.
- 2026-11-22: the owner's answer on agent state. Claude Code's own session list carries "waiting
  for you" first, by one fixed, read-only call (slice 7, Record 7, criteria 43 and 44, with the
  settings-folder coverage in criterion 27's probe); the hook entries are optional and move to
  slice 9, and Record 3 says so. New room states: waiting for an answer, the session failed.
- 2026-11-22: split for length, content unchanged: States, Design direction, Cases, Motion and Copy
  moved to `docs/specs/2026-11-22-work-status-design.md`; the acceptance criteria and the decision
  record texts to `docs/specs/2026-11-22-work-status-criteria.md`. Names used here ("Cases",
  "criterion 27", "Record 4") mean those files.
