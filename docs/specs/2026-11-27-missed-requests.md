---
title: Asked, not done — requests you typed to Claude Code that never reached Git
doc_type: spec
status: draft
area: git
date: 2026-11-27
decisions: [RECORD_ID]
---

# Asked, not done — requests you typed to Claude Code that never reached Git

**In one minute.**

- People ask their coding agents for many things in one conversation. Some never get done, and
  nobody notices: the agent moved on, the conversation was compacted, or the worktree was removed.
- **Asked, not done** finds them. Atlas reads only the messages the person typed to Claude Code in
  this repository, asks a model running on this computer which ones ask for a code change, and
  checks each against the commits on the base branch. One at least 2 days old with no matching
  commit is listed.
- It lives in **Workshop**, as one fact in the header beside "11 merged today" and a centred
  dialog behind it. No new tab: a tab comes only if it is opened most days.
- It runs when the person presses **Check now**, or, once they switch it on, once a night while
  Atlas is open, the computer is on power and nobody has touched it for 10 minutes. It stops at the
  next message when someone does.
- **Nothing leaves the computer.** The model must be on `localhost`; findings stay in Atlas's app
  data; nothing is written into the repository, the vault, or any agent's memory or instructions.
  The person marks each item **Done elsewhere** or **Not needed**, or copies it to ask again.
- **Measured on the owner's Mac** with the 27-billion-parameter model he already runs: it picks out
  19 of 23 hand-labelled requests with 2 false; asking Git about every request lists 8 old ones of
  which only 3 were really not done, but asking only about requests for a code change lists 4, 3
  of them right. A 4-billion model: MINIMUM_MODEL. So slice 1 asks Git only about those.
- **Why Atlas.** The agent cannot judge this itself: the request it lost is no longer in its
  context, and its own summary says it is done. Git can judge it, from outside the conversation.
  Atlas already reads this repository's sessions and Git side by side in Workshop, keeps a model
  call on this computer, and shows evidence a person can check before believing a finding.

**Words.** A *typed message* is defined in
`docs/specs/2026-11-27-harness-self-improvement.md:38-41`; this spec also drops one that starts
with `Here is a note offered by a side agent:`, text another program pastes in. A *request* is a
typed message the model calls a task; a *code request* is one that asks for a lasting change to
the product (a feature, fix, redesign or removal), as opposed to an action (merge, release, run,
check, research, plan). The *base branch* is the one Workshop counts merges on. A request is
*matched* when the model, shown the closest commits made after it, names one that does it.

## Person and moment

1. **The owner, who runs Claude Code in many worktrees** (2026-11-27, translated): "Session records
   stay on the machine, right? Then couldn't we catch the questions and conversations the user had,
   and the really important things that were missed in them? Could a local LLM analyse them
   slowly, at dawn or so, without taking much CPU?" The same day, at 14:49, he asked the lead to
   switch five agent definitions from Fable to Opus. At 14:52 the lead answered that it had changed
   them; the commit was made at 23:50 on `chore/agents-opus-default`, and `origin/main` at
   `ea6698fdb4` still has `model: fable` in all five. Only a context summary carried the item in
   between. No capture exists of him meeting a lost request in Atlas; criterion 1 takes one.
2. **Someone learning coding agents (not observed)** may never have looked inside a session file;
   the dialog names what it reads and where.
3. **Someone who wants an ontology without agents** has no sessions: the header shows nothing.

## Today

Read at `origin/main` `ea6698fdb4` and on the owner's Mac, 2026-11-27, by scratchpad scripts.

- **No Atlas code reads session text.** Workshop runs `claude agents --json` for states and names
  only (`.claude/rules/surfaces.md:127-145`). Harness Improve's session read is specified, not
  built (`.claude/rules/surfaces.md:166-182`).
- **Workshop's header** ends with "11 merged today", a link to Changes
  (`docs/features/work-status.md:473-478`). Workshop draws no Moru (`:482`).
- **Automations** keeps schedules in the vault's `.ontology-atlas/rounds.json`, which "travels with
  the folder" (`docs/features/automations.md:60`, `:153`), and runs them only while the app has the
  folder open, with no background service (`:148-149`).
- **Local models.** The app calls one OpenAI-compatible runner by address, default
  `http://localhost:11434` (`src-tauri/src/llm/local_endpoint.rs:6`), plain `http` only to loopback
  (`:42`); address and model are a preference in `localStorage`
  (`src/shared/lib/llm-connection/local-endpoint.ts:8-14`). The built-in model is bge-m3 and only
  turns text into vectors (`src-tauri/src/llm/embed/builtin.rs:1`). The app ships no model that
  writes text.
- **Storage rule.** The app may keep a derived index, "no user state, edits, approvals or drafts"
  (`.claude/rules/local-first.md:36-39`).
- **Sessions, last 30 days.** 283 Claude Code session files, 3.58 GB. Lines whose `cwd` is the main
  checkout, a path under it, or a worktree Git lists: 22 files in 19 sessions, 2.05 GB, 345,848
  lines (1.5 s to read once cached), holding 693 typed messages, 37 of them pasted side-agent notes.
  At most 84 a day, 43 on average. 182 more typed messages came from a worktree outside the
  checkout that was later removed; Git no longer lists it.
- **How many requests get lost.** Hand-labelled samples of 50 typed messages (random, at least 20
  characters) and 45 more (at least 40 characters, before 2026-11-25): 23 of the 50 are tasks, 13
  preferences, 9 questions, 5 not the person's words. Of 19 tasks whose result Git can show (2
  more dropped as unclear once commit times were read in UTC), 13 have a matching commit and 6 do
  not; 3 of those 6 were under a day old, the other 3 were 3 to 6 days old (a Git sign-in with a
  CI view, a time estimate for pull requests and CI, Moru talking in speech bubbles), all three
  code requests. Many tasks leave no commit by nature ("run it so I can see", "merge after
  review"). One labeller; the owner has not checked the labels.
- **The model on this Mac.** Ollama 0.40.17 serves `atlas-qwen3.8:27b` (27.8B parameters, nvfp4,
  MLX), 18.2 to 18.7 GB resident in unified memory while loaded; Ollama's own processes held 214
  MB besides. Other agents kept the load average at 25 to 95 throughout. Scripts and results:
  the session scratchpad, not committed.
  - *Sorting 54 messages*, runner at background priority: 434 s; median 2.4 s a message, p90
    10.4 s, slowest 129.9 s; 306 prompt and 10.6 generated tokens a second; Ollama's CPU 36% of
    one core on average, 170% at peak; GPU 32% on average. Kinds agree with the labels for 42 of
    50; 19 of 23 tasks found, 2 false.
  - *Judging done* for the 19, runner at normal priority: median 5.6 s, slowest 12.5 s; GPU 98%
    on average, so a run takes the GPU whole while it lasts. Closest commits by word match: 9
    old requests listed, 2 truly not done. By bge-m3 vectors of subject and body (2,413 commits
    in 71.4 s): 8 listed, 3 truly not done, none missed. The same, asked only of code requests: 4
    listed, 3 truly not done, none of the 3 missed.
  - *Background priority on the runner* starved it: with Ollama's server at `PRIO_DARWIN_BG`, a
    one-word vector request did not finish in 120 s, twice; back at normal priority it took 9 s.
  - *A 4-billion model* (`qwen3:4b`, pulled for this measurement): MINIMUM_DETAIL

**Unknown:** other people's rate of lost requests; how many tasks are done in a way no commit shows;
Codex's session format on this Mac (not read).

## Patterns that already worked

| Pattern | Mechanism, and why it worked | How it fails | What Atlas borrows (mechanism only) |
|---|---|---|---|
| Microsoft Viva's Briefing email and Insights add-in ([overview](https://learn.microsoft.com/en-us/viva/insights/personal/Briefing/be-overview), [follow up on tasks](https://learn.microsoft.com/en-ca/viva/insights/personal/briefing/be-tasks)) | Reads the person's own sent mail for "requests you made" and "commitments", over the last 14 days, built only from data in their own mailbox. | The daily email was paused on 2023-01-15 "to improve" it ([notice](https://learn.microsoft.com/viva/insights/personal/reference/briefing-pause)); a daily push nobody asked for. | The person's own words as the source, a 14-day window, private to them; shown where they already look, never pushed. |
| Gmail Nudges ([Google, 2018](https://workspaceupdates.googleblog.com/2018/05/gmail-remind-respond.html)) | A model marks a sent mail with no reply "Follow up?" in place; two switches turn it off. | Wrong nudges teach people to ignore them. | One quiet mark in a list the person opens anyway; one press dismisses. |
| Closing an issue from a commit ([GitHub docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)) | The item is closed by evidence in the repository, not by anyone saying so. | Work that names no issue leaves it open forever. | Git is the judge of done; the agent's summary is not. Work Git cannot show is marked by the person. |
| The weekly review in *Getting Things Done* (David Allen, 2001) | Every open loop is captured, then reviewed on a rhythm and given a decision: do, defer, or drop. | The inbox grows faster than the review; people stop reviewing. | Each item ends in one decision; a 2-day wait keeps work in flight out; the list holds only what is old and unmatched. |

New in Atlas's combination: the person's own messages to an agent as the capture, Git as the
outside judge, and a model that never leaves the computer.

## Problem and alternatives

**Ranked by value against cost.** The owner named four kinds of missed item.

1. **A request with no matching commit.** The commonest real loss (3 of 21 Git-judgeable tasks, 3
   to 6 days old), the one in his example, and judged by Git, outside the model. Reads typed
   messages only.
2. **A question the agent said it would ask and never did.** Needs the agent's text (5,228 agent
   text blocks in 30 days, 48 with "ask the owner" phrasing); the judge is the model alone.
3. **"Later" that never came back.** 206 agent text blocks say "later"; once found, Git judges it
   as in (1). Next after (2).
4. **Decided only in chat.** Needs a decision-record convention most repositories lack.

(1) comes first: highest value, an outside judge, and the narrowest read.

**Cause.** A request lives only in a conversation. Compaction, a new session or a removed worktree
drops it, and the agent that dropped it cannot know.

| Way to give it back | Value | Cost, and why it lost |
|---|---|---|
| Status quo: the person remembers, or rereads conversations | nothing new | the owner's example was saved by chance |
| Ask the agent at the end of a session "what did I ask that you didn't do?" | catches some | the agent judges itself from a compacted context; no Git check; per session only |
| Summarise every conversation each night | a digest | nobody reads it (Viva's paused daily email); hides the few items that matter |
| A new rail tab | prominence | a destination needs a record and earns its place by use; nothing shows it would be opened daily |
| Harness › Improve as a lane | shares the session reader | Improve changes what the agent reads; this is about the person's work, and Improve is unbuilt |
| An Automations schedule | the schedule list exists | `rounds.json` travels with the folder, so a clone could switch on reading someone's sessions |
| **A Workshop header fact and dialog, one kind, Git as judge, run on idle** | the lost items, checkable | a new read of session text and a local model call, under one record |

## Flow

1. When the person opens Workshop in the app on a repository with Claude Code sessions, the header
   shows `header.entry` after its other facts. Nothing is read yet.
2. When they press it, a centred dialog opens on the stage (`stage.*`): what is read, the
   model in use (`model.using`), `stage.local`, **Check now**, and the switch **Check every night**,
   off. With no runner set in Agents › Models, or one that does not answer, the stage shows
   `model.none*` instead and **Check now** is absent; an address off this computer shows
   `model.notLocal`; without search by meaning's model, `model.search*`.
3. When they press **Check now**, Atlas reads the session files in the background (`run.reading`),
   then sends each typed message, one at a time, to the model (`run.sorting`), then checks each
   code request at least 2 days old against Git (`run.checking`). Requests appear in the list as each is
   judged; Stop keeps what was found.
4. When the dialog is closed, the run continues; Workshop's header shows `run.sorting` or
   `run.checking` in place of the fact.
5. When the run ends, the header reads `header.fact` with the count, or nothing when it is 0. The
   list groups requests under `list.noMatch` and `list.onBranch`, newest first; each row is the
   first line of the message, cut to 80 characters, and `list.row`.
6. When they select a row, the detail shows the whole message (`detail.youWrote`), the model's
   reading of it in the message's language (`detail.readAs`), the closest commits it was shown
   (`detail.closest` or `detail.closestBranch`) and `detail.noneMatch`. **Copy request** copies the
   message and its date; **Copy resume command** copies `cd <folder> && claude --resume <session>`.
7. When they press **Done elsewhere** or **Not needed**, the row leaves the list and a toast offers
   **Undo** (`detail.marked`, `detail.undo`).
8. With **Check every night** on, Atlas runs step 3 itself at most once a day: the first moment
   after 01:00 local time when Atlas is open on this repository, the computer is on power, and no
   key or pointer input came for 10 minutes. It reads only session lines added since the last run,
   checks requests that came of age, and rechecks unmatched ones against new commits. On input it
   finishes the message in flight, pauses (`run.paused`), and goes on at the next idle moment the
   same night.
9. **The model or the evidence is wrong.** A reply that is not the JSON asked for leaves that
   message out and is counted (`error.reply`). A runner that stops answering ends the run at that
   message; the next run starts there (`error.model`). Git unreadable: requests are kept, unjudged
   (`error.git`). A request whose work was done without a commit shows up; **Done elsewhere**
   removes it and is counted, so the false-alarm rate is visible on this computer.

## States

| State | Web | macOS app |
|---|---|---|
| Any | `web.title`, `web.body`; nothing else; Get the app | as below |
| No repository, or no session for it | Out of scope — web card | no header entry; the dialog, opened from a link, shows `error.noSessions` |
| First run, model ready | Out of scope — web card | `stage.*` with `model.using`; Check now, the nightly switch |
| No model, or not answering | Out of scope — web card | `model.noneTitle`, `model.noneBody`, Open Models |
| Model off this computer | Out of scope — web card | `model.notLocal`, Open Models |
| Search model not prepared | Out of scope — web card | `model.searchTitle`, `model.searchBody`, Set up search by meaning |
| Reading, sorting, checking | Out of scope — web card | `run.reading` / `run.sorting` / `run.checking` in the dialog and header; Stop |
| Paused for input, or waiting for idle | Out of scope — web card | `run.paused` / `run.waiting`; Check now runs at once |
| Stopped | Out of scope — web card | `run.stopped`; the list so far |
| Results | Out of scope — web card | `header.fact`; list, detail, `run.last` |
| Nothing missing | Out of scope — web card | no header count; dialog `list.emptyTitle`, `list.emptyBody`; `list.young` when some wait |
| Model failed mid-run | Out of scope — web card | `error.model`; the list so far; Check now |
| Unreadable replies or files | Out of scope — web card | `error.reply`, `error.unreadable` under the list |
| Git unreadable | Out of scope — web card | `error.git`; requests listed without a verdict group |
| Largest measured (84 messages a day, 693 in 30 days) | Out of scope — web card | as Results; the list scrolls in the dialog's left pane |

## Copy

Keys are in `messages/<locale>/missedRequests.json` (en, ko, ja, zh). The English:

| Key | Where | English |
|---|---|---|
| `header.entry` / `header.fact` | Workshop header | Asked, not done / {count} asked, not done |
| `stage.title` / `stage.body` | dialog stage | Find what you asked for that never landed / Atlas reads the messages you typed to Claude Code in this repository, picks out the requests, and checks each one against the commits on {branch}. A request at least 2 days old with no matching commit is listed here. |
| `stage.local` / `stage.scope` | stage | Your messages go only to {model} at {address} on this computer. Nothing is sent anywhere else, and nothing is written into your repository or your agent's memory. / Reads {count} sessions from the last 14 days in {worktrees} folders of this repository. |
| `stage.start` / `stage.nightly` / `stage.nightlyNote` | stage | Check now / Check every night / Runs at most once a day, after 1:00, while Atlas is open, this computer is on power and no one has used it for 10 minutes. It stops when you touch the keyboard or mouse. |
| `model.noneTitle` / `model.noneBody` / `model.noneAction` | stage | Needs a model on this computer / Picking requests out of your messages needs a language model running on this computer, such as one in Ollama or LM Studio. Add its address in Agents › Models, then come back. / Open Models |
| `model.searchTitle` / `model.searchBody` / `model.searchAction` | stage | Needs the search-by-meaning model / Finding the commits closest to each request uses the model that search by meaning prepares on this computer. Set it up once in the Library, then come back. / Set up search by meaning |
| `model.notLocal` / `model.using` | stage | {address} is not on this computer. Only a model at localhost, 127.0.0.1 or ::1 may read your messages. / {model} at {address} |
| `run.reading` / `run.sorting` / `run.checking` | progress | Reading {done} of {total} sessions / Picking out requests: {done} of {total} messages / Checking {done} of {total} requests against Git |
| `run.paused` / `run.waiting` | progress | Paused while you use this computer. It goes on the next time the computer is idle on power. / Waiting for this computer to be idle on power |
| `run.stop` / `run.stopped` / `run.last` | progress | Stop / Stopped. Requests checked so far stay in the list. / Last checked {time} · {count} new messages |
| `list.title` / `list.noMatch` / `list.onBranch` / `list.row` | list | Asked, not done / No matching commit / On {branch}, not merged / {date} · {worktree} |
| `list.young` / `list.emptyTitle` / `list.emptyBody` | list | {count} requests are under 2 days old and are checked later. / Nothing you asked for is missing / Every request from {from} to {to} has a matching commit on {branch}, or you marked it. |
| `detail.youWrote` / `detail.readAs` | detail | You wrote on {date}, in {worktree} / Atlas read it as: {ask} |
| `detail.closest` / `detail.closestBranch` / `detail.noneMatch` | detail | Closest commits on {branch} / Matching commit on {branch}, not merged into {base} / None of these does what you asked. |
| `detail.copy` / `detail.copied` / `detail.resume` | detail | Copy request / Copied / Copy resume command |
| `detail.done` / `detail.notNeeded` / `detail.marked` / `detail.undo` | detail, toast | Done elsewhere / Not needed / Marked. It leaves the list. / Undo |
| `error.model` | dialog | {model} at {address} did not answer, so the check stopped at message {done} of {total}. Requests found so far stay in the list. Start the model, then press Check now to go on. |
| `error.reply` / `error.git` | under the list | {count} messages got an answer Atlas could not read and were left out. / Git could not read {repository}, so no request was checked. The requests found are kept and checked when Git answers. |
| `error.unreadable` / `error.noSessions` | under the list | {count} session files could not be read and were skipped. {path} / No Claude Code session for this repository was found in {paths}. |
| `web.title` / `web.body` | web card | Asked, not done runs in the app / It reads Claude Code's session files and runs a model on this computer. A browser can open neither, so this page cannot check your requests. |

## What is read, what runs, what is kept

- **Read.** Claude Code session files under the config homes the Improve spec collects
  (`docs/specs/2026-11-27-harness-self-improvement.md:155-163`), from `projects/` folders whose name
  is Claude Code's encoding of the main checkout, a path under it, or a worktree Git lists; never a
  `subagents/` file. A line is used only when its own `cwd` is one of those paths. From a used line
  Atlas holds a typed message's text (cut to 2,000 characters; the model sees the first 600), its
  time, the session file's name, the line's `uuid`, its worktree and `gitBranch`. Never the agent's
  text, a tool call, a tool result, a command or an environment value. First run: 14 days back.
  Later runs: from the byte where the last run stopped in each file; a file that shrank is reread.
- **Runs.** The runner and model chosen in Agents › Models, only when its host is loopback by the
  rule in `src-tauri/src/llm/local_endpoint.rs:47-57`; plain `http` only. One message at a time,
  quoted as data, `temperature` 0, answer as JSON: kind (code request, action, question,
  preference, other) and the work asked for in the message's language (for `detail.readAs`). For
  a code request only, the built-in bge-m3 (Search by meaning's model) finds the 15 commits whose
  subject and first 300 characters of body are closest to the message, among commits on the base
  branch in the 7 days after it; the model, shown those and the message, answers done, not done
  or unclear and a commit id. Only not done is listed. Local branches not merged into the base get
  the same check, and a match there moves the request to `list.onBranch`. Without the built-in
  model prepared, the stage offers Search by meaning's own preparing step first.
- **Gentle.** Atlas's own reading runs at background priority (macOS `PRIO_DARWIN_BG`; Windows
  background mode). Atlas never changes the runner's priority: it is another program, and at
  background priority it starved (Today). Since a run takes the GPU whole, gentleness is timing:
  Atlas checks input idle time and power before each message and runs only while both hold.
- **Kept.** In Atlas's app data, one folder per repository named by the SHA-256 of its real path,
  mode 0700: each request's message, times, ids, the model's answer, the commits shown and the
  verdict (rebuildable from session files, Git and the model), and the person's marks with their
  time (a preference; losing them shows items again). Items older than 90 days are deleted at
  start. A run log line per run: time, model, address, messages sent, bytes, result; never text.
  Nothing goes into the vault, `.ontology-atlas/llm-audit.jsonl`, the repository, any memory or
  instruction file, the clipboard unasked, or the network.

## Edge cases

- **Zero:** no session in 14 days: no header entry; opened from a link, `error.noSessions` names the
  folders looked at. **One** request: the dialog opens with it selected. **Largest measured:** 84
  typed messages in a day, 693 in 30 days; the first run sends at most 700 messages.
- **First run** on a computer whose model is loading: the first call waits up to 60 s (the local
  chat timeout, `src-tauri/src/llm/chat.rs:28`), then `error.model`.
- **Hangul and other scripts:** cuts at 80, 600 and 2,000 characters never split a Hangul syllable
  or a surrogate pair; matching uses the English ask, so a Korean message finds English commits.
- **Moved, renamed or removed folders:** a worktree Git no longer lists is not read; a renamed
  checkout is a new repository folder. A session file that cannot be opened is skipped and named
  (`error.unreadable`).
- **Two runs at once:** one run per repository; Check now during the nightly run joins it.
- **Two windows on one repository** share the app-data folder; marks are written by replacing the
  file whole, last write wins, and an Undo restores only its own mark.
- **Offline:** nothing needs the network. A runner on loopback works offline.
- **Pasted secrets:** a typed message holding a secret-shaped line (the Improve spec's list) is
  cut at that line before it is stored or sent.
- **Windows:** the same flow and copy. Session files under `%USERPROFILE%\.claude\projects`, `cwd`
  compared case-insensitively with either slash; idle from the last input time, power from the
  system power status; Atlas's thread in background mode. **Linux:** out of scope (no idle or power
  read today).

## Out of scope

- Kinds 2 to 4 (agent text, "later", chat-only decisions): each needs the agent's text; Later.
- Codex sessions: their format was not read on this Mac.
- Worktrees removed outside the checkout (182 messages here): finding them means reading every
  project's session folder; Later 1 lets the person pick one.
- Writing a finding into memory, `AGENTS.md`, rules or the vault: the research behind
  `docs/specs/2026-11-27-harness-self-improvement.md` shows unreviewed self-written context hurts.
- A model Atlas downloads to write text: a new download and runtime need their own record.
- Running while Atlas is closed: no background service (`docs/features/automations.md:148-149`).

## Acceptance criteria

1. **The moment.** Given the installed app on the owner's Mac with today's sessions, when he opens
   Workshop and the dialog, a recording shows the list. It passes when he finds the Fable-to-Opus
   request (or says why it is absent) and says in his own words what the list is and that nothing
   left the computer; the pull request quotes him (installed-app walk).
2. **The right lines.** Given `tests/fixtures/session-request-cases.json`: a line in the checkout, a
   listed worktree, a path under the checkout, an unlisted folder sharing the encoded name, a
   `subagents/` file, meta, sidechain, compact-summary, wrapper-tag and side-agent-note lines, a
   4 MiB line, a secret-shaped line, and an assistant line, only the first three typed texts are
   held and no assistant text, tool field or secret reaches app data (Rust tests).
3. **Nothing leaves.** Given a runner set to `https://example.test` or `http://192.168.1.2`, no
   request is sent and `model.notLocal` shows; given a loopback runner, a packet capture during a
   full run shows traffic only on loopback (Rust test; installed-app walk with `nettop`).
4. **Worth showing.** On this repository's hand-labelled set (`tests/fixtures/missed-requests-labels.json`,
   the 50 + 21 labels of Today), with the owner's 27B model: tasks found at least 80%, and of
   requests listed, at least 2 in 3 truly have no commit. A model below that bar shows
   `model.noneBody` instead of results (measured in the pull request; `pnpm` script reruns it).
5. **Gentle.** With the nightly switch on, on power, idle 10 minutes, a run starts; a key press
   ends it within one message (under 30 s at the measured p90) and `run.paused` shows; on battery
   nothing starts (installed-app walk, `pmset -g log` and the run log).
6. **Incremental.** A second run with no new session lines sends 0 messages; after 5 new typed
   messages it sends 5 (Rust test over a fixture folder; run log).
7. **Marks and recovery.** Done elsewhere on a row removes it and survives an app restart; Undo
   restores it; a deleted app-data folder rebuilds every request on the next run, and only the
   marks are lost (Rust test; installed-app walk).
8. **Windows.** On a Windows machine with a Claude Code session in a repository, the same dialog
   lists its requests, and moving the mouse pauses the run (installed-app walk on Windows).

## Risks

1. **It cries wolf.** Many requests are done without a commit, or the word match misses the commit.
   Answer: only "not done" is listed, the 2-day wait, criterion 4's bar, and the Done elsewhere
   count, which shows the false-alarm rate on this computer.
2. **Most people have no local model, or a small one.** Then it is empty for them. Answer: the
   stage says so in one line and links Models; MINIMUM_MODEL. If fewer than one in ten users
   connect a runner, Later 3 (a downloaded model) becomes next.
3. **The overnight window never comes.** A Mac that sleeps, or Atlas closed at night. Answer: Check
   now works any time, `run.last` shows when it last ran, and the run picks up where it stopped.

## Later

1. Read a removed worktree's sessions after the person picks its folder from Claude Code's folder
   names; next because 182 of 875 messages here were there.
2. Kind 2, questions the agent said it would ask: reads agent text; next when kind 1 holds its
   false-alarm bar for a month.
3. A model Atlas downloads for this, as it downloads bge-m3; next if most users have no runner.
4. Codex sessions, once their format is read on a real machine.
5. **Add to Planning**: write the request as `planning/<title>.md`, the person's explicit write.
6. Kind 3, "later" that never came back, judged by Git as kind 1.
7. Promote to a rail tab when the owner says he opens it most days for two weeks.

## Owner question

None. Placement in Workshop is decided above (reverse it by moving the dialog behind a rail entry
with a route record); the nightly switch is off by default so reading session text is always the
person's own choice.

## Revisions

- 2026-11-27: first draft.
