---
title: Asked, not done — code requests you typed to Claude Code that never reached Git
doc_type: spec
status: draft
area: git
date: 2026-11-27
decisions: [19077fe5]
---

# Asked, not done — code requests you typed to Claude Code that never reached Git

**In one minute.**

- People ask their coding agents for many things in one conversation. Some never get done, and
  nobody notices: the agent moved on, the conversation was compacted, or the worktree was removed.
- **Asked, not done** finds them. Atlas reads only the messages the person typed to Claude Code in
  this repository, asks a model running on this computer which ones ask for a code change, and
  checks each against the commits on the base branch since it was typed. One at least 2 days old
  with no matching commit is listed.
- It lives in **Workshop**: one fact in the header beside "11 merged today", and a centred dialog
  behind it. No new tab; a tab comes only if it is opened most days.
- **Slice 1 runs when the person presses Check now.** A nightly run on an idle computer is slice
  2 (Later 1).
- **Nothing leaves the computer.** The model must run on this computer: a loopback address with no
  proxy, and no model the runner forwards to the internet. Results stay in Atlas's app data;
  nothing is written into the repository, the vault, or any agent's memory or instructions. The
  person marks each item **Done elsewhere** or **Not needed**, or copies it to ask again.
- **Measured on the owner's Mac** with the 27-billion-parameter model he already runs: sorted
  into five kinds, it found 10 of 17 hand-labelled code requests, including all 3 old lost ones,
  and called 1 other message a code request.
  Asking Git about every request listed 8 old ones, 3 truly not done; asking only about code
  requests listed 4, 3 truly not done. A 4-billion model found none of the 3 lost requests, so a
  model must first pass a check on examples that come with the app.
- **Why Atlas.** The agent cannot judge this itself: the request it lost is no longer in its
  context, and its own summary says it is done. Git can judge it, from outside the conversation.
  Workshop already shows this repository's sessions and Git side by side, and the evidence sits
  beside each finding for the person to check.

**Words.** A *typed message* is defined in
`docs/specs/2026-11-27-harness-self-improvement.md:38-41`; this spec also drops one that starts
with `Here is a note offered by a side agent:`, text another program pastes in. The model sorts
each into five kinds: a *code request* asks for a lasting change to the product, its code,
documents or rules (a feature, fix, redesign or removal); an *action* asks the agent to act with
no lasting change of its own (merge, release, run, check, research, plan); a *question*; a
*preference*; *other*. The *base branch* is the one Workshop counts merges on. A request is
*matched* when the model, shown the closest commits made after it, names one of them that does it.

## Person and moment

1. **The owner, who runs Claude Code in many worktrees** (2026-11-27, translated): "Session records
   stay on the machine, right? Then couldn't we catch the questions and conversations the user had,
   and the really important things that were missed in them? Could a local LLM analyse them
   slowly, at dawn or so, without taking much CPU?" The same day, at 14:49, he asked the lead to
   switch five agent definitions from Fable to Opus. At 14:52 the lead answered that it had changed
   them; Git had no such commit until 23:50, merged at 00:05 the next day (#4014). Only a context
   summary carried the item in between. No capture exists of him meeting a lost request in Atlas;
   criterion 1 takes one.
2. **Someone learning coding agents (not observed)** may never have looked inside a session file;
   the dialog names what it reads and where.
3. **Someone who wants an ontology without agents** has no sessions: the header shows nothing.

## Today

Read at `origin/main` `ea6698fdb4` (merged forward to `#4014`) and on the owner's Mac, 2026-11-27,
by scratchpad scripts that are not committed.

- **No Atlas code reads session text.** Workshop runs `claude agents --json` for states and names
  only (`.claude/rules/surfaces.md:127-146`); Harness Improve's session read is specified, not
  built (`:167-184`). Web Workshop shows its own app-only card first
  (`src/views/work-status/ui/WorkStatusPage.tsx:147`).
- **Workshop's header** ends with "11 merged today", a link to Changes
  (`docs/features/work-status.md:473-478`).
- **Automations** schedules belong to a vault folder (`.ontology-atlas/rounds.json`) and run an
  agent; a round a clone brings shows "Off on this Mac" until allowed
  (`docs/features/automations.md:151-158`).
- **Local models.** The app calls one OpenAI-compatible runner by address, default
  `http://localhost:11434` (`src-tauri/src/llm/local_endpoint.rs:6`), whose host check is
  `is_loopback_authority` (`:47-57`); address and model are a preference in `localStorage`
  (`src/shared/lib/llm-connection/local-endpoint.ts:8-14`). A runner on loopback can still serve
  a cloud model: embedding refuses one by name (`is_cloud_name`, `src-tauri/src/llm/embed/ollama.rs:69`)
  and by the runner's remote marker (`refuse_remote_model`, `:96`), chat does not. Embedding pins
  curl to the resolved loopback address with `noproxy` (`src-tauri/src/llm/embed/loopback.rs:1-3`,
  `src-tauri/src/llm/embed/transport.rs:66-69`); local construction removes proxy variables
  (`src-tauri/src/llm/chat.rs:93-104`). The built-in model, bge-m3, only turns text into vectors
  (`src-tauri/src/llm/embed/builtin.rs:1`); the app ships no model that writes text. A curl call
  can be cancelled mid-flight (`run_curl_until`, `src-tauri/src/llm/curl.rs:78-84`).
- **Sessions, last 30 days.** 283 Claude Code session files, 3.58 GB. Lines whose `cwd` is the main
  checkout, a path under it, or a worktree Git lists: 22 files in 19 sessions, 2.05 GB, 345,848
  lines (1.5 s to read once cached), holding 693 typed messages: 555 in the checkout, 73 under it
  (removed agent worktrees), 65 in listed worktrees; 37 are pasted side-agent notes. At most 84 a
  day, 43 on average. 182 more came from a worktree outside the checkout that was later removed.
  The review counted 30 typed-message `uuid`s that appear in more than one file (resumed
  sessions). The config homes' `projects` folders are links to one folder.
- **How many requests get lost.** Hand-labelled samples of 50 typed messages (random, at least 20
  characters) and 45 more (at least 40 characters, before 2026-11-25): 23 of the 50 are tasks, 13
  preferences, 9 questions, 5 not the person's words. Of 19 tasks Git can judge (2 more dropped as
  unclear once commit times were read in UTC), 13 have a matching commit and 6 do not; 3 of the 6
  were under a day old, the other 3 were 3 to 6 days old (a Git sign-in with a CI view, a time
  estimate for pull requests and CI, Moru talking in speech bubbles), all code requests. One
  labeller; the owner has not checked the labels.
- **The model on this Mac.** Ollama 0.40.17 serves `atlas-qwen3.8:27b` (27.8B parameters, nvfp4,
  MLX), 18.2 to 18.7 GB of unified memory while loaded, plus 214 MB for Ollama's processes. Other
  agents kept the load average at 11 to 95 throughout.
  - *Sorting into five kinds*, runner at background priority, 2026-11-28, load
    average 11 to 16: 54 messages in 330 s, median 2.8 s, p90 14.3 s, slowest 45.9 s; Ollama's CPU
    21% of a core, 81% at peak; GPU 56%. 45 of 58 kinds right (4 pasted notes dropped by rule).
    Code requests: 10 of 17 found, 1 false, all 3 old lost requests found. The 7 missed hold a
    request inside a question, a taste or an action ("could we make one... is that possible").
    Sorting the four-kind tasks again into build or operate found 11, 2 false, and missed 2 of the
    3 lost requests, so the one-step sort stays.
  - *Sorting into four kinds* (code requests and actions together as tasks), earlier, same
    priority: 54 messages in 434 s, median 2.4 s, p90 10.4 s, slowest 129.9 s; 306 prompt and
    10.6 generated tokens a second; Ollama's CPU 36% of a core, 170% at peak; GPU 32%. 42 of 50
    kinds right; 19 of 23 tasks found, 2 false.
  - *Judging done* for the 19, runner at normal priority: median 5.6 s, slowest 12.5 s, GPU 98%.
    Closest commits by word match: 9 old requests listed, 2 truly not done. By bge-m3 vectors of
    subject and body (2,413 commits in 71.4 s), commits of the 7 days after: 8 listed, 3 truly not
    done, none missed. The same, only for code requests: 4 listed, 3 truly not done.
  - *Background priority on the runner* starved it: with Ollama's server at `PRIO_DARWIN_BG`, a
    one-word vector request did not finish in 120 s, twice; at normal priority it took 9 s.
  - *A 4-billion model* (`qwen3:4b`, pulled for this and removed): 0.69 s a message, 4.9 GB; 33 of
    50 kinds right, 22 of 23 tasks found with 15 false; as judge "unclear" for 11 of 19 and none
    of the 3 old lost requests found. Models between 4 and 27 billion were not measured.

**Unknown:** other people's rate of lost requests; how many code requests are done with no commit;
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

1. **A code request with no matching commit.** The commonest real loss (3 of 19 Git-judgeable
   tasks, 3 to 6 days old), the one in his example, and judged by Git, outside the model. Reads
   typed messages only.
2. **A question the agent said it would ask and never did.** Needs the agent's text (5,228 agent
   text blocks in 30 days, 48 with "ask the owner" phrasing); the judge is the model alone.
3. **"Later" that never came back.** 206 agent text blocks say "later"; once found, Git judges it
   as in (1).
4. **Decided only in chat.** Needs a decision-record convention most repositories lack.

(1) comes first: highest value, an outside judge, and the narrowest read. Actions are left out
because they leave no commit by nature: asked about every task, Git listed 5 done ones as missing.

**Cause.** A request lives only in a conversation. Compaction, a new session or a removed worktree
drops it, and the agent that dropped it cannot know.

| Way to give it back | Value | Cost, and why it lost |
|---|---|---|
| Status quo: the person remembers, or rereads conversations | nothing new | the owner's example was saved by chance |
| Ask the agent at the end of a session "what did I ask that you didn't do?" | catches some | the agent judges itself from a compacted context; no Git check; per session only |
| Summarise every conversation each night | a digest | nobody reads it (Viva's paused daily email); hides the few items that matter |
| A new rail tab | prominence | a destination needs a record and earns its place by use; nothing shows it would be opened daily |
| Harness › Improve as a lane | shares the session reader | Improve changes what the agent reads; this is about the person's work, and Improve is unbuilt |
| An Automations round | the schedule list exists | rounds belong to a vault folder and run an agent; this check belongs to a repository and a computer, runs a loopback model, and in slice 2 waits for idle and power |
| **A Workshop header fact and dialog, code requests only, Git as judge, on Check now** | the lost items, checkable | a new read of session text and a local model call, under one record |

## Flow

1. When the person opens Workshop in the app on a repository with Claude Code sessions, the header
   shows `header.entry` after its other facts. Nothing is read yet.
2. When they press it, a centred dialog opens on the stage (`stage.*`): what is read, the model in
   use (`model.using`), `stage.local` and **Check now**. With no runner set in Agents › Models, or
   one that does not answer, the stage shows `model.none*` and no **Check now**; an address off
   this computer, `model.notLocal`; a cloud model, `model.remote`; no search-by-meaning model,
   `model.search*`. A model not checked before gets the bundled check first (What runs); one that
   fails shows `model.weak*`.
3. When they press **Check now**, Atlas reads the session files (`run.reading`), sends each typed
   message, one at a time, to the model (`run.sorting`), then checks each code request at least 2
   days old against Git (`run.checking`). Requests appear in the list as each is judged.
4. When they press **Stop**, Atlas cancels the request in flight within a second and keeps what was
   judged (`run.stopped`, `run.loaded`); the next Check now resends that message.
5. When the dialog is closed, the run continues; the header shows `run.sorting` or `run.checking`
   in place of the fact.
6. When the run ends, the header reads `header.fact` with the count of `list.noMatch` and
   `list.onBranch` rows, or nothing when it is 0. The list shows those two groups and
   `list.unclear`, newest first; each row is the message's first line, cut to 80 characters, and
   `list.row`.
7. When they select a row, the detail shows the whole message (`detail.youWrote`), the model's
   reading in the message's language (`detail.readAs`), the commits it was shown
   (`detail.closest` or `detail.closestBranch`) and `detail.noneMatch` or `detail.unclearNote`.
   Message, reading and commit text render as plain text. **Copy request** copies the message and
   its date; **Copy resume command** copies `cd "<folder>"; claude --resume <session>`, which
   runs in zsh, bash and PowerShell 5.
8. When they press **Done elsewhere** or **Not needed**, the row leaves the list and a toast offers
   **Undo** (`detail.marked`, `detail.undo`).
9. **The model or the evidence is wrong.** A reply that is not the JSON asked for, or names a commit
   it was not shown, leaves that message out and is counted (`error.reply`). A runner that stops
   answering ends the run at that message; the next run starts there (`error.model`). Git
   unreadable: requests are kept, unjudged (`error.git`). A code request done with no commit shows
   up; **Done elsewhere** removes it and is counted, so the false-alarm rate is visible here.

## States

| State | Web | macOS app |
|---|---|---|
| Any | Out of scope — web Workshop shows `workStatus.web.*` before any of this | as below |
| No repository, or no session for it | Out of scope — web card | no header entry; the dialog, opened from a link, shows `error.noSessions` |
| First run, model ready | Out of scope — web card | `stage.*` with `model.using`; Check now |
| No model, or not answering | Out of scope — web card | `model.noneTitle`, `model.noneBody`, Open Models |
| Model off this computer | Out of scope — web card | `model.notLocal`, Open Models |
| Cloud model behind a loopback runner | Out of scope — web card | `model.remote`, Open Models |
| Model fails the bundled check | Out of scope — web card | `model.weakTitle`, `model.weakBody`, Open Models |
| Search model not prepared | Out of scope — web card | `model.searchTitle`, `model.searchBody`, Set up search by meaning |
| Reading, sorting, checking | Out of scope — web card | `run.reading` / `run.sorting` / `run.checking` in the dialog and header; Stop |
| Stopped | Out of scope — web card | `run.stopped`, `run.loaded`; the list so far; Check now |
| Results | Out of scope — web card | `header.fact`; three groups, detail, `run.last` |
| Nothing missing | Out of scope — web card | no header count; `list.emptyTitle`, `list.emptyBody`; `list.unclear` rows and `list.young` when there are any |
| Model failed mid-run | Out of scope — web card | `error.model`; the list so far; Check now |
| Unreadable replies or files | Out of scope — web card | `error.reply`, `error.unreadable` under the list |
| Git unreadable | Out of scope — web card | `error.git`; requests listed without a verdict group |
| Largest measured (84 messages a day, 693 in 30 days) | Out of scope — web card | as Results; the list scrolls in the dialog's left pane |

## Copy

Keys are in `messages/<locale>/missedRequests.json` (en, ko, ja, zh). The English:

| Key | Where | English |
|---|---|---|
| `header.entry` / `header.fact` | Workshop header | Asked, not done / {count} asked, not done |
| `stage.title` / `stage.body` | dialog stage | Find what you asked for that never landed / Atlas reads the messages you typed to Claude Code in this repository, picks out the requests for a code change, and checks each one against the commits on {branch}. One at least 2 days old with no matching commit is listed here. |
| `stage.local` / `stage.scope` / `stage.start` | stage | Your messages go only to {model} at {address} on this computer. A model your server runs on the internet is refused. Nothing is sent anywhere else, and nothing is written into your repository or your agent's memory. / Reads {count} sessions from the last 14 days in {worktrees} folders of this repository. / Check now |
| `model.noneTitle` / `model.noneBody` / `model.noneAction` | stage | Needs a model on this computer / Picking requests out of your messages needs a language model running on this computer, such as one in Ollama or LM Studio. In Atlas's test the smallest that worked had 27 billion parameters and used about 19 GB of memory, so a computer with 32 GB or more. Add its address in Agents › Models, then come back. / Open Models |
| `model.weakTitle` / `model.weakBody` | stage | {model} is too small for this check / Atlas gave {model} {total} example messages and {cases} example commit checks that come with the app. It found {found} of {requests} code requests, called {wrong} other messages code requests, and judged {judged} of {cases} checks right. This check needs {neededFound} found, at most {neededWrong} wrong and {neededJudged} judged right. Choose a larger model in Agents › Models. None of your own messages were read. |
| `model.searchTitle` / `model.searchBody` / `model.searchAction` | stage | Needs the search-by-meaning model / Finding the commits closest to each request uses the model that search by meaning prepares on this computer. Set it up once in the Library, then come back. / Set up search by meaning |
| `model.notLocal` / `model.remote` / `model.using` | stage | {address} is not on this computer. Only a model at localhost, 127.0.0.1 or ::1 may read your messages. / {model} runs on the internet through {address}. Only a model that runs on this computer may read your messages. / {model} at {address} |
| `run.reading` / `run.sorting` / `run.checking` | progress | Reading {done} of {total} sessions / Picking out requests: {done} of {total} messages / Checking {done} of {total} requests against Git |
| `run.stop` / `run.stopped` / `run.loaded` / `run.last` | progress | Stop / Stopped. Requests checked so far stay in the list. / {model} may stay loaded in memory for a while after the check; your model server decides when to unload it. / Last checked {time} · {count} new messages |
| `list.title` / `list.noMatch` / `list.onBranch` / `list.unclear` / `list.row` | list | Asked, not done / No matching commit / On {branch}, not merged / Could not tell / {date} · {worktree} |
| `list.young` / `list.emptyTitle` / `list.emptyBody` | list | {count} requests are under 2 days old and are checked later. / Nothing you asked for is missing / Every code request from {from} to {to} that the model could judge has a matching commit on {branch}, or you marked it. |
| `detail.youWrote` / `detail.readAs` | detail | You wrote on {date}, in {worktree} / Atlas read it as: {ask} |
| `detail.closest` / `detail.closestBranch` / `detail.noneMatch` / `detail.unclearNote` | detail | Closest commits on {branch} / Matching commit on {branch}, not merged into {base} / None of these does what you asked. / A commit looks related, but the model could not tell whether it does what you asked. |
| `detail.copy` / `detail.copied` / `detail.resume` | detail | Copy request / Copied / Copy resume command |
| `detail.done` / `detail.notNeeded` / `detail.marked` / `detail.undo` | detail, toast | Done elsewhere / Not needed / Marked. It leaves the list. / Undo |
| `error.model` | dialog | {model} at {address} did not answer, so the check stopped at message {done} of {total}. Requests found so far stay in the list. Start the model, then press Check now to go on. |
| `error.reply` / `error.git` | under the list | {count} messages got an answer Atlas could not read, or one naming a commit it was not shown, and were left out. / Git could not read {repository}, so no request was checked. The requests found are kept and checked when Git answers. |
| `error.unreadable` / `error.noSessions` | under the list | {count} session files could not be read and were skipped. {path} / No Claude Code session for this repository was found in {paths}. |

## What is read, what runs, what is kept

- **Read.** Claude Code session files under the config homes the Improve spec collects
  (`docs/specs/2026-11-27-harness-self-improvement.md:155-163`), each `projects/` folder resolved to
  its real path and read once. Only folders whose name is Claude Code's encoding of the main
  checkout, a path under it, or a worktree Git lists; never a `subagents/` file. A line is used
  only when its own `cwd` is one of those paths, compared by whole path parts (`/x/atlas` does not
  cover `/x/atlas-old`); a removed worktree under the checkout still counts, one outside it does
  not. A `user` line holding only tool results is not a typed message. From a used line Atlas
  holds the text (cut to 2,000 characters; the model sees the first 600), time, the session
  file's name, the line's `uuid`, its worktree and `gitBranch`; one `uuid` is held once, however
  many files repeat it. Never the agent's text, a tool call or result, a command or an environment
  value. First run: 14 days back. Later runs start after the last newline read in each file, so a
  partly written last line is read whole next time; a file that shrank is reread.
- **Runs.** The runner and model chosen in Agents › Models, only when all hold: its host passes
  `is_loopback_authority`; a model whose name `is_cloud_name` flags, or that `refuse_remote_model`
  finds marked remote, is refused before anything else is sent; and the transport is embedding's:
  `localhost` resolved to loopback only and pinned, `noproxy = "*"`, `proto = "=http,https"`, and
  proxy variables removed. One message at a time, quoted as data, `temperature` 0, answer as JSON:
  one of the five kinds and the work asked for in the message's language (`detail.readAs`). For a
  code request only, the built-in bge-m3 finds the 15 commits whose subject and first 300
  characters of body are closest to the message, among commits on the base branch from the
  message's time to now (vectors of new commits are added each run and kept); the model, shown
  those and the message, answers done, not done or unclear and a commit id. A commit id it was
  not shown counts as `error.reply`. Local branches not merged into the base get the same check;
  a match there moves the request to `list.onBranch`.
- **The bundled check.** Before a model's first use, Atlas gives it 40 example messages in en, ko,
  ja and zh (15 code requests, 25 others) and 10 example requests, each with 15 commits and a known
  verdict. It passes with at least 9 of 15 code requests found, at most 3 of 25 others called code
  requests, and at least 8 of 10 verdicts right. Measured on the labels, the 27B would pass (59%
  found, 1 false) and the 4B would not (15 false). Passing is remembered per model name and address.
- **Stop.** The request in flight is cancelled through `run_curl_until`'s cancel flag; the runner may
  keep the model in memory afterwards, and `run.loaded` says so.
- **Kept.** In Atlas's app data, one folder per repository named by the SHA-256 of its real path,
  mode 0700: each request's message, times, ids, the model's answer, the commits shown and the
  verdict, and the commit vectors (all rebuildable for the last 14 days from session files, Git and
  the model), and the person's marks with their time (a preference; losing them shows items
  again). Items older than 90 days are deleted at start. A run log: a start line written before
  the first send (time, model, address, run id) and a closing line after the last (messages sent,
  bytes, result), never text, as `chat_with` reserves its line before sending
  (`src-tauri/src/llm/chat.rs:142-145`); a start line with no closing line names an interrupted
  run. Nothing goes into the vault, `.ontology-atlas/llm-audit.jsonl`, the repository, any memory
  or instruction file, the clipboard unasked, or the network.

## Edge cases

- **Zero:** no session in 14 days: no header entry; opened from a link, `error.noSessions` names the
  folders looked at. **One** request: the dialog opens with it selected. **Largest measured:** 84
  typed messages in a day, 693 in 30 days; the first run sends at most 700 messages.
- **First run** on a computer whose model is loading: the first call waits up to 60 s (the local
  chat timeout, `src-tauri/src/llm/chat.rs:28`), then `error.model`.
- **Hangul and other scripts:** cuts at 80, 600 and 2,000 characters never split a Hangul syllable
  or a surrogate pair; bge-m3 places a Korean message near the English commit that did it.
- **Moved, renamed or removed folders:** a renamed checkout is a new repository folder; a removed
  worktree outside the checkout is not read. A session file that cannot be opened is skipped and
  named (`error.unreadable`).
- **Two runs at once:** one run per repository; a second Check now joins the first.
- **Two windows on one repository** share the app-data folder; marks are written by replacing the
  file whole, last write wins, and an Undo restores only its own mark.
- **Offline:** nothing needs the network. A runner on loopback works offline.
- **Pasted secrets:** a typed message holding a secret-shaped line (the Improve spec's list) is
  cut at that line before it is stored or sent.
- **Windows:** the same flow and copy; session files under `%USERPROFILE%\.claude\projects`, `cwd`
  compared case-insensitively with either slash; the resume command uses `;`, not `&&`.
  **Linux:** the same reading and model call; not walked in slice 1.

## Out of scope

- The nightly run: slice 2 (Later 1). Slice 1 reads no idle time, power state or priority.
- Kinds 2 to 4 (agent text, "later", chat-only decisions): each needs the agent's text; Later.
- Codex sessions: their format was not read on this Mac.
- Worktrees removed outside the checkout (182 messages here): finding them means reading every
  project's session folder; Later 3 lets the person pick one.
- Writing a finding into memory, `AGENTS.md`, rules or the vault: the research behind
  `docs/specs/2026-11-27-harness-self-improvement.md` shows unreviewed self-written context hurts.
- A model Atlas downloads to write text: a new download and runtime need their own record.

## Acceptance criteria

1. **The moment.** Given the installed app on the owner's Mac with his sessions, when he opens
   Workshop and presses Check now, a recording shows the list. It passes when at least one of the
   three labelled lost requests (the Git sign-in with a CI view, the time estimate for pull
   requests and CI, Moru's speech bubbles) appears under `list.noMatch`, the Fable-to-Opus request
   does not (#4014 did it), and he says in his own words what the list is and that nothing left
   the computer; the pull request quotes him (installed-app walk).
2. **The right lines.** Given `tests/fixtures/session-request-cases.json`: a line in the checkout,
   one in a listed worktree, one under the checkout whose folder was removed, an unlisted folder
   sharing the encoded name, `/x/atlas-old` beside `/x/atlas`, two config homes linking to one
   `projects` folder, a resumed session repeating a `uuid` in two files, a `subagents/` file, meta,
   sidechain, compact-summary, wrapper-tag and side-agent-note lines, a `user` line of tool results
   only, a 4 MiB line, a partly written last line, a secret-shaped line and an assistant line: only
   the first three typed texts are held, each once; the partial line is held after it is finished;
   no assistant text, tool field or secret reaches app data (Rust tests).
3. **Nothing leaves.** Given a runner at `https://example.test` or `http://192.168.1.2`, no request
   is sent and `model.notLocal` shows. Given a loopback runner listing `gpt-oss:120b-cloud`, or a
   model its show answer marks with `remote_host`, nothing but that model check is sent and
   `model.remote` shows. Given `http_proxy` and `ALL_PROXY` set to a listening test proxy, the
   proxy receives nothing. A packet capture during a full run shows traffic only on loopback
   (Rust tests; installed-app walk with `nettop`).
4. **Worth showing, and a small model refused.** On this repository's labels (Today, rechecked by
   the owner in five minutes), the owner's 27B model finds at least 10 of the 17 labelled code
   requests, including the 3 old lost ones, and of old requests listed at least 2 in 3 truly have no commit. The bundled check, run once against
   that 27B and once against a 4B model, passes the first and refuses the second with
   `model.weakTitle` before any session is read (a `pnpm` script over a scratchpad copy of the
   labels; Rust test of the thresholds).
5. **Stop.** During a request the model takes over 10 s to answer, Stop closes it within 1 s, the
   run log holds a closing line, and the next Check now resends that message (Rust test with a
   slow loopback server; installed-app walk).
6. **Incremental.** A second Check now with no new session lines sends 0 messages; after 5 new
   typed messages it sends 5; a request judged not done on day 2 moves out of the list when a
   matching commit lands on day 9 (Rust test over a fixture folder and repository; run log).
7. **Marks and recovery.** Done elsewhere removes a row and survives an app restart; Undo restores
   it; a deleted app-data folder rebuilds the requests of the last 14 days on the next Check now,
   and only the marks are lost (Rust test; installed-app walk).
8. **Windows.** On a Windows machine with a Claude Code session in a repository, the dialog lists
   its requests, Stop closes the request in flight within 1 s, and the copied resume command runs
   in PowerShell 5 (installed-app walk on Windows).

## Risks

1. **It cries wolf.** A code request done with no commit, or a commit the search misses. Answer:
   code requests only, only "not done" counted, the 2-day wait, criterion 4's bar, and the Done
   elsewhere count, which shows the false-alarm rate on this computer.
2. **Most people have no model this large.** The measured minimum is about 19 GB of memory. Answer:
   `model.noneBody` names it, the bundled check refuses a small model before any message is read,
   and if fewer than one in ten users pass the check, Later 5 (a downloaded model) becomes next.
3. **It misses what matters.** The sort found 10 of 17 code requests; the 7 it missed were asked
   inside a question, a taste or an action. Answer: the bundled check holds such mixed messages,
   criterion 4 requires the 3 old lost ones, `stage.body` claims only the requests it picks, and
   Later 2 (a second pass over questions) comes first if the owner names a missed request.

## Later

1. **Slice 2: the nightly run.** A switch, off by default; once a day after 01:00 with Atlas open,
   on power and 10 minutes without input; input cancels the request in flight within 1 s and the
   run resumes at the next idle moment; Atlas's reading at background priority, the runner's
   priority never changed. Accepted by: with the switch on, on power, idle 10 minutes, a run
   starts; a key press closes the request within 1 s; on battery nothing starts (installed-app
   walk on macOS and Windows, the run log). Needs its own record for the idle and power reads.
2. A second pass over messages sorted as a question, preference or action, asking only whether
   one also asks for a code change; next if the owner names a request the list missed, since 7
   of 17 code requests were sorted that way.
3. Read a removed worktree's sessions after the person picks its folder from Claude Code's folder
   names; next because 182 of 875 messages here were there.
4. Kind 2, questions the agent said it would ask: reads agent text; next when kind 1 holds its
   false-alarm bar for a month.
5. A model Atlas downloads for this, as it downloads bge-m3; next if most users have no model.
6. Codex sessions, once their format is read on a real machine.
7. **Add to Planning**: write the request as `planning/<title>.md`, the person's explicit write.
8. Kind 3, "later" that never came back, judged by Git as kind 1.
9. Promote to a rail tab when the owner says he opens it most days for two weeks.

## Owner question

None. Placement in Workshop is decided above; reversing it means a rail entry with a route record.

## Revisions

- 2026-11-27: first draft.
- 2026-11-28: after measuring, Git is asked only about code requests, commits are found with
  bge-m3 instead of word match, and a model must pass a bundled check; merged `origin/main`.
- 2026-11-28: applied the independent review. Slice 1 is Check now only, and the nightly run is
  Later 1. Cloud models and proxies are refused, Stop cancels within a second, unclear verdicts
  are shown, commits are searched up to now, the read boundary and run log are tightened, the
  bundled check has thresholds, and the web keys are gone. The sort was rerun with five kinds.
