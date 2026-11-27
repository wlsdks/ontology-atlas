---
title: Harness › Tokens — one inspection that shows where Claude Code's tokens leak
doc_type: spec
status: draft
area: harness
date: 2026-11-28
decisions: []
---

# Harness › Tokens — one inspection that shows where Claude Code's tokens leak

**In one minute.**

- **Verdict: possible, with no model and nothing leaving the computer.** Claude Code writes every
  model call's token counts into its session files on this computer. A pass over 30 days of them
  (1,031 files, 6.3 GB) took 29 s and peaked at 359 MB in a Node script.
- **What it found here.** Of 19.89B context tokens processed in 30 days, turns above 200K context
  carried 68.3%, and context loaded before any work carried 19.7%. Claude Code compacted 388 times,
  at 367K tokens on average. Cache misses rewrote 19.7M tokens.
- **The view.** Harness gets a view, **Tokens**, beside Improve. One press reads the files and
  shows three shapes: a 30-day strip of context per turn, one bar split into "loaded at start",
  "work" and "beyond 200K", and five findings sized on one scale. Each finding names where it
  happened (session, turn, tokens) and what to change, with Copy.
- **Did a change help?** Pick a date, or a commit that changed the agent files. Each figure is
  compared before and after it against the usual day-to-day range, and inside that range the view
  says "No detectable difference". Today that range is ±16%.
- **Money** appears only as Claude Code's own estimate, labelled so, never as a bill.
- **Why Atlas.** ccusage and the Anthropic Console show what was spent. Atlas shows which habit
  or setting caused it, links it to this repository's agent files and their Git history, and says
  honestly whether a fix changed anything.

**Words.** A *turn* is one model response, counted once per `message.id`. A turn's *context* is
`input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. A *run* is one session
file: a main session, or a subagent's under `<session>/subagents/`. A *program run* is one Claude
Code process, which its `cost-state` records share as `startTime`. A *typed message* is defined as
in `docs/specs/2026-11-27-harness-self-improvement.md:37-42`. The *mark* is the date chosen for
comparing before and after.

## Person and moment

1. **The owner**, 2026-11-28, translated from Korean: "A feature that, in one go, sees through
   where my token efficiency is leaking. As an inspection feature, inside the Harness tab. Is it
   possible or not?" That day the repository moved every agent to Opus
   (`docs/engineering/agent-effort.md:9-14`), a change whose effect he will want to see. Today he
   measures with `pnpm harness:tokens`, a contributor script (Today). Nobody has been watched using
   a token view; criterion 1 captures the first look.
2. **Someone learning coding agents (not observed)** may not know that every turn re-reads the
   whole context. The split bar shows it as a shape, without the sentence.
3. **Someone who wants an ontology without agents** has no session files. The view shows `empty.*`
   and nothing else changes for them.

## Today

Read at `origin/main` `1edb4d13d8`. No running screen was looked at.

- **Harness has two built views** (`src/views/architecture/lib/harness-view-state.ts:1`); Improve
  is specified, not built (`.claude/rules/surfaces.md:167-183`), and its view label exists
  (`messages/en/harness.json:8`). No Atlas code reads session usage. The vault has no Harness
  capability; the nearest is `capabilities/agent-work-visibility`.
- **The contributor script** `scripts/harness/harness-token-report.mjs` sums turns per agent type
  over 14 days (`:9`). It picks folders whose name *contains* the repository name (`:51`), so other
  repositories' scratchpad sessions count, and it reads the subagent's `description` text (`:63`).
- **Settings in play:** `autoCompactWindow` 400000 and `effortLevel` high
  (`.claude/settings.json:7-8`); every agent file now says `model: opus`.
- **Reusable parts:** the shared background card (`src/features/work-run/model/work-run.ts:24`,
  `src/app/providers/AppShell.tsx:111`); Improve's config-home discovery, `cwd` check and
  secret-shaped line filter (`docs/specs/2026-11-27-harness-self-improvement.md:155-164`, `:199-202`,
  `:231-238`); the Workshop's subagent meta reading (`.claude/rules/surfaces.md:139`).
- **Measured on the owner's Mac, 2026-11-28,** by scratchpad scripts that kept only numbers, enums,
  ids and sizes (not committed):
  - Every sampled assistant record (8,564) carries `message.usage`, with `model` and `effort` beside
    it. Claude Code writes one record per content block, so turns are deduplicated by `message.id`.
  - Claude Code also records `diagnostics.cache_miss_reason` with missed tokens,
    `compact_boundary` with `preTokens` and `postTokens`, `api-request-shape` (the system prompt
    and tool list *as text*, with a `shapeHash`), and `cost-state`.
  - All four config homes reach one `projects` folder (as Improve found). Of 1,031 files in folders
    whose name contains `ontology-atlas`, 611 runs (22 main, 589 subagent) have a `cwd` in this
    repository. Excluded: 247 sessions of other repositories whose folder names collide, and 105
    from a removed worktree outside the checkout; the 420 excluded hold 4.11B tokens.
  - The 611 runs: 97,060 turns, 19.89B context tokens, 98.2% of them cache reads; 349M cache
    writes; 91.5M output.
  - **`cost-state` is a running total per program run, not per file.** One program run wrote it
    into two session files. In the main checkout's folder, summing the last value per file gives
    $10,014; the largest value per program run gives $7,493. Its `modelUsage` tokens do not match
    the file's own turns (one file: 157M tokens with subagents, its `cost-state` 5.46B).
  - Daily context per turn over 16 days: mean 204K, standard deviation 16K (8%).

**Unknown:** when Claude Code writes `cost-state`; the meaning of `messages_changed`,
`previous_message_not_found` and `unavailable`; the session folder layout on Windows; how fast a
Rust reader is on the same files.

## Patterns that already worked

| Pattern | Mechanism, and why it worked | How it fails | What Atlas borrows (mechanism only) |
|---|---|---|---|
| [ccusage](https://github.com/ryoppippi/ccusage) | Reads coding agents' local usage files offline; daily, session and 5-hour block reports; prices from a LiteLLM snapshot. No account, no proxy. | Totals with no cause: shows that a day cost more, not why; prices lag the snapshot. | Reading local session files, offline; nothing else. |
| Anthropic Console usage and cost ([help](https://support.claude.com/en/articles/9534590-cost-and-usage-reporting-in-console), [API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)) | The vendor's own counts split by model, key and token type, cache reads separate. Trusted because it is the source. | API keys only, not subscription sessions; no session or turn. | Token types kept separate; the vendor's own figure as the only money. |
| [Langfuse](https://langfuse.com/docs/observability/features/token-and-cost-tracking) | Traces each call with usage in non-overlapping buckets; dashboards by model, user and time; no estimates without counts. | Needs instrumentation and a server; dashboards drift into alarm fatigue. | Disjoint buckets (every token counted once); "unknown" instead of a guess. |
| [Helicone](https://docs.helicone.ai/features/advanced-usage/custom-properties) | A proxy tags requests with session and properties, so cost groups by workflow. | Sees only traffic routed through it; a proxy is a send. | Grouping by session and agent type, from ids already in the file. |
| Lighthouse opportunities and [variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md) | Each finding carries its evidence and fix, sorted by size; "beware of variability before drawing conclusions" about a change. | Estimated savings read as promises. | Finding, evidence and fix together; a noise band before any verdict; no savings promise. |

New in Atlas's combination: the cause is tied to this repository's own agent files and their Git
commits, and the comparison declines to call noise a change.

## Problem and alternatives

**Ranked by value against cost**, from the measured leaks:

| # | Leak | Size here | Fix is clear? | Slice |
|---|---|---|---|---|
| 1 | Long context × many turns | 50.6% of turns above 200K carry 68.3% of context | habit plus one setting | 1 |
| 2 | Loaded at start | 19.7% of context; median start 69K; tool list 129 KB per request | which servers to turn off | 1 |
| 3 | Automatic compaction | 388 in 167 runs at 367K on average | habit | 1 |
| 4 | Cache misses | 19.7M tokens rewritten, six reasons | for three reasons | 1 |
| 5 | Model and effort | main sessions 55% Fable, reviewers 88%; effort xhigh on 18,109 turns | one line per agent | 1 |
| 6 | One-hour cache lifetime | 63.6M written; 976 gaps of 5–60 min where it helped | not a leak today | Later |
| 7–10 | Re-reads, huge outputs, failed calls and polling, tiny subagents | 8.5 MB; 37.1 MB; 2,166 errors; 599K tokens | small | Later |

Leaks 1–5 need only counts the files already hold; together they explain most of the context
processed. Leaks 7–8 need tool inputs and outputs, a wider read for little gain.

**Cause, not symptom.** The tokens are spent by session habits and by the harness: settings, agent
files, tool servers. Harness is where those live, so the inspector belongs there, as its own view:
Improve proposes line edits checked against Git; this measures use over time. Existing Harness
views do not change.

| Option | Gives back | Costs | Verdict |
|---|---|---|---|
| Status quo: `pnpm harness:tokens` | per-type totals for contributors | counts other repositories, reads `description` text, no fix, no comparison | loses |
| Point people to ccusage | spend per day and session | no cause or fix; an outside tool | loses |
| Ask the agent to analyse its own transcripts | could explain | sends session text to a provider; spends tokens to find token waste | loses |
| A lane inside Improve | one place | Improve's run proposes edits; this needs a date axis and comparison | loses |
| **Harness › Tokens: a numbers-only reader, five findings, compare with a noise band** | the cause and a fix in one look, and an honest after | one new read, under one record | **chosen** |

## Flow

1. When the person opens Harness › **Tokens** in the app, Atlas lists session files changed in
   the last 30 days in folders whose name begins with the encoded checkout or a listed worktree,
   and shows `stage.*` with `stage.files`. Nothing inside a file is read yet.
2. When they press **Inspect token use**, Atlas reads files newest first. The strip grows day by
   day from the right, the split bar's parts widen, and the five finding bars grow on one scale.
   Rows re-sort once, at the end.
3. When they switch tabs, the inspection continues and the shared card shows `card.running`.
4. When it ends, motion stops and the largest finding is selected. Its detail shows the fact, the
   evidence rows (`evidence.row`, the 20 largest) and the fix with **Copy**.
5. When they open an evidence row and press **Show the message before this turn**, Atlas reads
   that one file again and shows the typed message before that turn as plain text, at most 280
   characters, until the panel closes.
6. When they pick a mark, from a date or a tick for a commit that changed `.claude/settings.json`,
   `.claude/agents/`, `.claude/rules/`, `AGENTS.md` or `.mcp.json`, the strip draws the usual range
   from the days before it. Each figure says lower, higher or `compare.same`.
7. **Evidence missing or wrong.** A record type or key Atlas does not know makes the figures that
   need it `unknown`, never zero (`partial.unknown`). A file that changed after the inspection
   refuses to show text (`evidence.changed`). A config home it cannot read is named
   (`error.home`); the others still count. A run whose `cwd` was a removed worktree outside the
   checkout is counted only in `partial.elsewhere`.
8. When they press **Inspect again**, figures are rebuilt from the files; nothing was stored but
   the mark.

## What is read, and what is never kept

- **Which files.** Config homes as Improve finds them. Inside `projects/`, only folders whose name
  begins with the encoded checkout path or a listed worktree's (every character outside `a-z`,
  `A-Z`, `0-9` becomes `-`). A line counts when its `cwd` is the checkout, a path under it, or a
  listed worktree; a subagent file counts by its parent session's `cwd`. Each real file is read once.
- **Which fields.** From assistant records: `message.id`, `message.model`, `message.usage` counts,
  `effort`, `isSidechain`, `cwd`, `timestamp`, `diagnostics.cache_miss_reason.type` and its tokens.
  From `compact_boundary`: `trigger`, `preTokens`, `postTokens`. From `cost-state`: `startTime`,
  `totalCostUSD`, `hasUnknownModelCost`. From `api-request-shape`, once per `shapeHash`: each tool's
  byte size and its group (built-in, or the MCP server in `mcp__<server>__`). Tool call names, for
  calls per server. From `agent-*.meta.json`: `agentType`, `model`.
- **Never kept, logged or sent to the page:** message, prompt, tool input or output text; a tool's
  description; a path; a session id beyond its first 8 characters. Lines over 4 MiB are skipped
  and counted. Held in memory until the app closes or the next inspection; nothing on disk but the
  mark (a preference, per repository).
- **Money.** Per program run, the increase between consecutive `cost-state` values, dated at the
  later one; never summed per file.
- **Noise band.** The before window's days with 500 turns or more; band = mean ± 2 standard
  deviations of the daily values. The after window needs at least 3 such days.

## States

| State | Web | macOS app |
|---|---|---|
| Any | Card `web.title`, `web.body`, Get the app (`harness.browserAction`) | as below |
| No repository connected | Out of scope — web card | Harness's `harness.noSource` stage |
| First open | Out of scope — web card | `stage.title`, `stage.body`, `stage.files`, `stage.start`, `stage.local` |
| Reading | Out of scope — web card | shapes growing; `run.reading`, `run.stop`; elsewhere `card.running` |
| Stopped | Out of scope — web card | `run.stopped`; figures so far; `run.again` |
| Empty | Out of scope — web card | `empty.title`, `empty.body` with the folders looked in |
| Failed home | Out of scope — web card | `error.home` above the shapes; other homes counted |
| Partial | Out of scope — web card | `partial.files`, `partial.lines`, `partial.unknown`, `partial.elsewhere` above the list |
| Done | Out of scope — web card | `run.inspected`; strip `strip.*`; split `split.*`; five rows `kinds.*`, `row.*`; detail `detail.*`, `fix.*`, `evidence.*`, `action.copy`, `fix.copied`; `action.openImprove` on Loaded at start when Improve exists; elsewhere `card.done` |
| A finding with nothing | Out of scope — web card | its row reads `row.none`; no detail fix |
| Message opened | Out of scope — web card | the text, `evidence.message`; or `evidence.noMessage`, `evidence.hidden`, `evidence.changed` |
| Comparing | Out of scope — web card | `compare.pick`, `compare.pickHint`, ticks `compare.tick`, `compare.clear`; `compare.none`, `compare.tooFew`, `compare.same`, `compare.lower`, `compare.higher`, `compare.left` |
| Money | Out of scope — web card | `money.title` with `money.total` or `money.split`, `money.note`; `money.partial`; `money.none` |
| Largest measured | Out of scope — web card | 611 runs, 97,060 turns, a 603 MB file: same as Done; evidence lists scroll in their pane |

## Shape and motion

Five-second read: shape and position carry the meaning; words are names only. Across the top, the
strip: 30 columns of context per turn, the band a shaded range behind them, the mark a vertical
line. Below it, one bar of all context processed, split in three. Below that, findings on the left
as bars on one token scale (model and effort as share bars), the selected finding on the right.
Each movement carries one event and ends: a column grows when its day's files are read; a finding
bar widens as its tokens arrive; rows re-sort once at the end, eased, with no overshoot; nothing
moves at rest and no frame is requested after the end. Reduced motion: a crossfade in place.

## Copy

Keys are in `messages/<locale>/harnessTokens.json` (en, ko, ja, zh); `harness.views.tokens` is in
`harness.json`. Figures arrive formatted (`1.63B`, `367K`). The English:

| Key | Where | English |
|---|---|---|
| `harness.views.tokens` | view bar | Tokens |
| `stage.title` / `stage.body` | stage | Where your tokens go / One inspection reads this repository's Claude Code sessions from the last 30 days on this computer and shows where context tokens went, with a change for each finding. It reads counts, model names and times. It shows a message only when you open one turn, and it changes no file. |
| `stage.files` / `stage.start` / `stage.local` | stage | {files} session files, {size}, in the last 30 days / Inspect token use / Nothing is sent anywhere. |
| `run.reading` / `run.stop` / `run.stopped` / `run.again` / `run.inspected` | progress | Reading {done} of {total} session files / Stop / Stopped. The figures cover {done} of {total} session files. / Inspect again / Last 30 days · inspected at {time} |
| `strip.title` / `strip.usual` / `strip.dayTip` / `strip.fewTurns` | strip | Context per turn, by day / Usual range before {date} / {date}: {perTurn} per turn · {turns} turns / Under 500 turns: not compared |
| `split.total` / `split.start` / `split.work` / `split.long` | split bar | {tokens} context tokens in {turns} turns / Loaded at start / Work / Beyond 200K per turn |
| `kinds.longContext` / `kinds.start` / `kinds.compaction` / `kinds.cacheMiss` / `kinds.model` | rows | Long context / Loaded at start / Automatic compaction / Cache misses / Model and effort |
| `row.tokens` / `row.share` / `row.none` | rows | {tokens} tokens / {model}: {share} of turns / None in 30 days |
| `detail.longContext` | detail | {turns} turns ({share} of all) ran with more than 200K tokens of context. Every turn reads the whole context again, so these turns processed {tokens} tokens beyond the first 200K each. |
| `detail.start` / `detail.toolGroup` / `detail.builtIn` / `detail.estimated` | detail | Sessions began with {median} tokens of context before the first answer, and every later turn carried them. The tool list alone was about {toolTokens} tokens per request. / {name}: about {tokens} tokens · never called, called once, or called {calls} times in 30 days / Built-in tools / Estimated from the size of the tool list |
| `detail.compaction` | detail | Claude Code compacted {count} times in {runs} sessions, at {before} tokens on average, leaving {after} after each. |
| `detail.cacheMiss` / `detail.cacheReason` | detail | Claude Code reported {count} cache misses, and {tokens} tokens were written to the cache again. / {reason}: {count} turns · {tokens} tokens |
| `detail.model` / `detail.mainSession` | detail | {agent} · {model} · {effort} effort · {turns} turns · {tokens} tokens / Main session |
| `fix.title` / `fix.longContext` | detail | What to change / Start a new session for a new task, or run /clear. autoCompactWindow in .claude/settings.json is {window}; a lower value compacts sooner and keeps less of the conversation. |
| `fix.start` / `fix.compaction` | detail | Turn off a tool server you rarely call here with /mcp in Claude Code. Improve checks the memory index Claude Code loads at start. / At the end of a task, start a new session or run /compact yourself, so the summary falls between tasks. |
| `fix.systemChanged` / `fix.toolsChanged` / `fix.modelChanged` / `fix.otherReason` | detail | The system prompt changed during a session, for example after an instruction or memory file was edited. Edit them between sessions. / The tool list changed during a session, for example when a tool server connected late or was switched. Set tool servers before you start. / The model changed during a session, which starts a new cache. Switch models between tasks. / Claude Code says no more about this reason, so Atlas proposes no change. |
| `fix.model` / `fix.copied` | detail | Each agent's model and effort are the model: and effort: lines in .claude/agents/{agent}.md. The main session uses /model and /effort. / Copied |
| `evidence.title` / `evidence.row` / `evidence.session` / `evidence.subagent` | evidence | Where it happened / {session} · turn {turn} · {time} · {tokens} tokens / Session {id} / {agent} in session {id} |
| `evidence.showMessage` / `evidence.message` / `evidence.noMessage` / `evidence.hidden` / `evidence.changed` | evidence | Show the message before this turn / Read from {file} just now. Atlas keeps it only while this panel is open. / No message you typed comes before this turn; an agent started it. / This message looks like it holds a key or token, so Atlas does not show it. / This session file changed or moved after the inspection. Inspect again to open this turn. |
| `compare.pick` / `compare.pickHint` / `compare.tick` / `compare.clear` / `compare.none` | compare | Compare from / Pick a date, or a commit that changed agent files / {date} · {subject} / Clear / Pick a date to compare the days before and after it. |
| `compare.tooFew` / `compare.same` | compare | Only {days} days after {date} had 500 turns or more; 3 are needed to judge. / No detectable difference: since {date} the daily figure stayed inside the usual range, {low} to {high}. |
| `compare.lower` / `compare.higher` / `compare.left` | compare | Lower since {date}: {after} against {before} before, below the usual range. / Higher since {date}: {after} against {before} before, above the usual range. / {days} days with under 500 turns left out. |
| `money.title` / `money.total` / `money.split` / `money.note` / `money.partial` / `money.none` | money | Claude Code's estimate / {amount} in the last 30 days / {before} before {date} · {after} since / Claude Code's own estimate from its session files, at API prices. It is not your bill. / Claude Code could not price every model, so this estimate is low. / Claude Code wrote no cost estimate in these sessions. |
| `partial.files` / `partial.lines` / `partial.unknown` / `partial.elsewhere` / `unknown` | above list | {count} files were not read: {reason}. Their figures are not included. / {count} lines over 4 MiB were skipped. / {count} records had a shape Atlas does not know; figures that need them show as unknown. / {count} session files ran in a folder that is no longer this repository, so they are not counted. / unknown |
| `empty.title` / `empty.body` / `error.home` | stage | No Claude Code sessions for this repository in the last 30 days / Atlas looked in {paths}. Claude Code writes a session file there for each conversation. / Could not read {path}: {reason}. Nothing there was inspected. |
| `web.title` / `web.body` | web card | Inspecting token use needs the app / Claude Code keeps its session files in your home folder, which a browser cannot open. The app reads their counts on this computer. |
| `card.running` / `card.done` / `card.open` / `action.copy` / `action.openImprove` | card, buttons | Inspecting token use · {done} of {total} / Token use inspected: {count} findings / Open / Copy / Open Improve |

Plural keys use ICU plurals in English; the table shows the `other` form.

## Edge cases

- **Zero, one, largest.** No files: Empty. One session of one turn: every shape draws one day;
  comparison reads `compare.tooFew`. Largest measured: 611 runs, 97,060 turns, one file of 603 MB.
- **First run.** No mark; the strip shows no band until one is picked.
- **Hangul.** A folder or worktree path with Hangul encodes to `-` per character as Claude Code
  does, and `cwd` comparison uses the real path; an opened message is cut on a character boundary.
- **Moved, renamed, unreadable.** A file that vanishes mid-read is Partial. A checkout moved since
  the sessions ran: its old `cwd` counts only in `partial.elsewhere`.
- **Two edits at once.** Claude Code appends while Atlas reads: Atlas reads up to the size it saw
  at the start, so a turn is never half counted.
- **Offline.** Works fully; nothing is sent.
- **Windows.** Slice 1 runs there too: the config home is `%USERPROFILE%\.claude` or
  `CLAUDE_CONFIG_DIR`; paths compare case-insensitively with either separator. The folder encoding
  on Windows is unknown; criterion 2 covers both readings. Orca profile homes are macOS only.
- **Codex only.** A person with only Codex sessions sees Empty with the folders looked in.

## Out of scope

- Codex sessions: 42 files, 5.25B input tokens, 99.4% cached; another format and read (Later 1).
- Writing any fix: settings and agent files are edited by the person or, later, through Improve's
  Keep (Later 2). Slice 1 copies.
- Leaks 6–10: they need gaps, tool inputs or outputs; each is small today (Later 3, 4).
- Prices: Atlas prices nothing; only `cost-state` gives money.
- Other repositories, and any session outside this repository's `cwd`: the owner asked for this one.
- An on-disk cache of figures: a new store, added only if criterion 7 fails (Later 5).

## Acceptance criteria

1. **The moment and the five-second test.** Given the installed app on the owner's Mac after one
   inspection, a recording shows his first look. It passes when, within five seconds, he names the
   largest finding and, with the mark on 2026-11-28, says whether anything changed. The pull request
   quotes him (installed-app walk).
2. **The right files.** Given `tests/fixtures/token-inspector-files/`: a colliding folder with
   another repository's `cwd`; a removed worktree under the checkout; a removed one outside it; a
   subagent counted by its parent; one turn in three records; four homes linked to one folder; a
   folder whose name does not match; Windows-shaped paths in both encodings. Each counts as the
   section above says, and the unmatched folder is never opened (Rust tests with an open-call log).
3. **The right numbers.** Given fixture sessions with known totals, every figure matches exactly;
   an unknown key shows `unknown`, never 0; two files of one program run count its money once; a
   `hasUnknownModelCost` run shows `money.partial` (Rust tests).
4. **Numbers only.** Given fixtures planted with a message, a tool input and output, a system
   prompt, a tool description, a `description`, a secret-shaped line and a path, none appears in any
   payload to the page, log or error; tool names reach the page only as a group. An opened message
   appears only in that answer and not in the next payload
   (`tests/contract/desktop/token-inspector-read.contract.test.ts`).
5. **Honest comparison.** Given a synthetic series with 8% daily noise: a 10% drop reads
   `compare.same`, a 25% drop `compare.lower`, two after-days `compare.tooFew`, a day under 500 turns
   is left out and counted (unit test).
6. **Live, smooth, still, and the web.** With a bridge stub of 611 runs, counts only rise, no
   element jumps between two frames, leaving shows `card.running` with the same count, and no frame
   is requested for 10 s after the end (`tests/e2e/harness/harness-tokens.spec.ts`, per frame). The
   web shows `web.title` and the entry is in `DEGRADED_SURFACES`
   (`tests/e2e/web-surface-smoke.spec.ts`).
7. **Measured on the owner's Mac.** 30 days: the first bars within 5 s, done within 30 s, at most
   200 MB added to the app's peak memory, and every total within 1% of the scratchpad script run
   with the same file rule. The pull request reports time, peak memory and the totals.
8. **Recovery.** Stopping halfway, then **Inspect again**, gives figures identical to an
   uninterrupted inspection; a mark survives an app restart and **Clear** removes it; deleting a
   file mid-read ends in Partial, not an error (Rust tests, installed-app walk).

## Risks

1. **The undocumented format changes**, as `cost-state` already showed it means something other
   than it seems. Answer: an allow-list of record types and keys; anything else degrades to
   `unknown` with a count (criteria 3, 4); fixtures taken from the current Claude Code version.
2. **People see numbers and nothing changes.** Fixes are habits, and an 8% daily noise hides small
   gains. Answer: each finding names its own measure, and the comparison says when it is noise. The
   2026-11-28 move to Opus is a certain change the first comparison must show (criterion 1); if it
   does not, the comparison is wrong.
3. **The pass is too slow or heavy** (29 s and 359 MB in Node; the files grow). Answer: Rust
   streams with a key prefilter, newest files first, so findings appear early; criterion 7 sets the
   budget, and its failure starts Later 5.

## Later

1. **Codex sessions** (`token_count` events). Next after slice 1, as the second tool the owner uses.
2. **Keep a fix through Improve** (one line in `.claude/settings.json` or `.claude/agents/*.md`),
   under a new record. Next once Improve's write ships and a Copy here is followed by a matching commit.
3. **One-hour cache lifetime** from gaps between turns. Next when 5–60 minute gaps pass 5% of turns.
4. **Re-reads, huge outputs, failed calls and polling.** Next when one passes 1% of context.
5. **A rebuildable per-file cache** of figures. Next when criterion 7's 30 s fails.
6. **Subagents started for small jobs.** Last: 599K tokens in 30 days.

## Owner question

None. "Is it possible?" is answered yes. The lead decided the rest: a separate view, numbers only,
money only from Claude Code, this repository only. Reversing any of them changes this spec, not a
one-way door: nothing is written and the read can be switched off by removing the view.

## Revisions

- 2026-11-28: first draft, on a previous run's measurements, rechecked for the noise band and
  `cost-state`, which proved to be a running total per program run.
