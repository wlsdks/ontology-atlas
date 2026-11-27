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
  model call's token counts into session files here; 30 days (1,031 files, 6.3 GB) took a Node
  script 29 s and 359 MB.
- **What it found.** Of 19.89B context tokens in 30 days, turns above 200K context carried 68.3%
  and context loaded before any work 19.7%; 388 automatic compactions at 367K tokens on average;
  cache misses rewrote 19.7M tokens.
- **The view.** Harness › **Tokens**, beside Improve. One press draws a 30-day strip of context per
  turn, one bar split into loaded at start, work and beyond 200K, and five findings on one scale,
  each with where it happened (session, turn, tokens) and what to change, with Copy. It keeps
  numbers, times, short ids and names; no message text.
- **Did a change help?** Pick a date or a commit that changed the agent files. The average since
  is compared with the range day-to-day noise allows (here about ±10% after three days, ±7% after
  a week); inside it the view says "No detectable difference". **Money** is only Claude Code's own
  estimate, labelled so.
- **Why Atlas.** ccusage and the Anthropic Console show what was spent. Atlas shows which habit or
  setting caused it, ties it to this repository's agent files and their commits, and says honestly
  whether a fix changed anything.

**Words.** A *turn* is one model response, counted once per `message.id`; its *context* is
`input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. A *run* is one session
file, a main session's or a subagent's. A *program run* is one Claude Code process, which its
`cost-state` records share as `startTime`. The *mark* is the comparison date. A *counted day* has
500 turns or more.

## Person and moment

1. **The owner**, 2026-11-28, translated from Korean: "A feature that, in one go, sees through
   where my token efficiency is leaking. As an inspection feature, inside the Harness tab. Is it
   possible or not?" That day the repository moved every agent to Opus
   (`docs/engineering/agent-effort.md:9-13`), a change whose effect he will want to see. Nobody has
   been watched using a token view; criterion 1 captures the first look.
2. **Someone learning coding agents (not observed)** may not know that every turn re-reads the
   whole context. The split bar shows it as a shape, without the sentence.
3. **Someone who wants an ontology without agents** has no session files. The view shows `empty.*`
   and nothing else changes for them.

## Today

Read at `origin/main` `1edb4d13d8`. No running screen was looked at.

- **Harness has two built views** (`src/views/architecture/lib/harness-view-state.ts:1`); Improve
  is specified, not built (`.claude/rules/surfaces.md:167-182`), its label in
  `messages/en/harness.json:8`. No Atlas code reads session usage. The vault has no Harness
  capability; the nearest is `capabilities/agent-work-visibility`.
- **The contributor script** `scripts/harness/harness-token-report.mjs` (`pnpm harness:tokens`)
  picks folders whose name *contains* the repository name (`:51`), so colliding repositories count,
  and reads the subagent's `description` text (`:63`).
- **Settings:** `autoCompactWindow` 400000, `effortLevel` high (`.claude/settings.json:7-8`).
- **Reusable parts:** the shared background card (`src/features/work-run/model/work-run.ts:24`,
  `src/app/providers/AppShell.tsx:111`); Improve's config homes and `cwd` check
  (`docs/specs/2026-11-27-harness-self-improvement.md:155-164`, `:231-238`); the Workshop's
  subagent meta read (`.claude/rules/surfaces.md:139`); the planted-value test shape of
  `no_planted_value_leaves_any_reader_result` (`src-tauri/src/harness_scopes/tests.rs:277`).
- **Measured on the owner's Mac, 2026-11-28,** by scratchpad scripts keeping only numbers, enums,
  ids and sizes (not committed):
  - All 8,564 sampled assistant records carry `message.usage`, `model` and `effort`; one record is
    written per content block, so turns are deduplicated by `message.id`. Other records:
    `diagnostics.cache_miss_reason` with missed tokens, `compact_boundary` with `preTokens` and
    `postTokens`, `cost-state`, and `api-request-shape`, which holds the system prompt and tool list
    *as text* with a `shapeHash`.
  - Four config homes reach one `projects` folder. Of 1,031 files in folders whose name contains
    `ontology-atlas`, 611 runs (22 main, 589 subagent) have a `cwd` here: 97,060 turns, 19.89B
    context tokens (98.2% cache reads), 349M cache writes, 91.5M output. Excluded, 4.11B tokens:
    247 sessions of colliding repositories and 105 from a removed worktree outside the checkout.
  - **`cost-state` is a running total per program run, not per file.** One program run wrote into
    two files; in the main checkout's folder, the last value per file sums to $10,014, the largest
    per program run to $7,493. Its tokens do not match the file's (157M against 5.46B in one). Its
    lines carry no `cwd` and no `timestamp`.
  - Daily context per turn over 16 days: mean 204K, standard deviation 16K (8%).
  - The review counted about 90 `projects/` folders that match neither the checkout's prefix nor a
    listed worktree's; a sibling such as `ontology-atlas-web` shares the prefix.

**Unknown:** when Claude Code writes `cost-state`; the meaning of `messages_changed`,
`previous_message_not_found` and `unavailable`; on Windows, the drive letter's case in `cwd` and
in folder names (Claude Code applies one encoding on every platform); how fast a Rust reader is.

## Patterns that already worked

| Pattern | Mechanism, and why it worked | How it fails | What Atlas borrows (mechanism only) |
|---|---|---|---|
| [ccusage](https://github.com/ryoppippi/ccusage) | Reads coding agents' local usage files offline; daily, session and 5-hour block reports; prices from a LiteLLM snapshot. No account, no proxy. | Totals with no cause: shows that a day cost more, not why; prices lag the snapshot. | Reading local session files, offline; nothing else. |
| Anthropic Console usage and cost ([help](https://support.claude.com/en/articles/9534590-cost-and-usage-reporting-in-console), [API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)) | The vendor's own counts split by model, key and token type, cache reads separate. Trusted because it is the source. | No session or turn; subscription use likely absent (assumption). | Token types kept separate; the vendor's own figure as the only money. |
| [Langfuse](https://langfuse.com/docs/observability/features/token-and-cost-tracking) | Traces each call with usage in non-overlapping buckets; dashboards by model, user and time; no estimates without counts. | Needs instrumentation and a server; many charts, no verdict, invite alarm fatigue (assumption). | Disjoint buckets (every token counted once); "unknown" instead of a guess. |
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

Leaks 1–5 need only counts the files already hold and cover most of the context processed; 7–8
need tool inputs and outputs, a wider read for little gain.

**Cause, not symptom.** Tokens are spent by session habits and the harness (settings, agent files,
tool servers), which Harness holds. It is its own view because Improve proposes line edits checked
against Git, while this measures use over time. Existing Harness views do not change. Record:
`docs/records/decisions/2026-11-28-harness-token-inspector-read-d55c209e-b3dd-4889-aff4-0b4f1a84ff4e.md`.

| Option | Gives back | Costs | Verdict |
|---|---|---|---|
| Status quo: `pnpm harness:tokens` | per-type totals for contributors | counts other repositories, reads `description` text, no fix, no comparison | loses |
| Point people to ccusage | spend per day and session | no cause or fix; an outside tool | loses |
| Ask the agent to analyse its own transcripts | could explain | sends session text to a provider; spends tokens to find token waste | loses |
| A lane inside Improve | one place | Improve's run proposes edits; this needs a date axis and comparison | loses |
| **Harness › Tokens: a numbers-only reader, five findings, compare with a noise band** | the cause and a fix in one look, and an honest after | one new read, under one record | **chosen** |

## Flow

1. When the person opens Harness › **Tokens** in the app, Atlas lists this repository's session
   files of the last 30 days and shows `stage.*` with `stage.files`. No file is read yet.
2. When they press **Inspect token use**, Atlas reads files newest first: the strip grows day by
   day from the right, the split bar's parts widen, the five finding bars grow on one scale. Rows
   re-sort once, at the end.
3. When they switch tabs, the inspection continues and the shared card shows `card.running`.
4. When it ends, motion stops and the token finding with the most tokens is selected (Model and
   effort is a share, never "largest"): its fact, the 20 largest evidence rows (`evidence.row`:
   short session id and time, which the person finds again with Claude Code's `/resume`), and the
   fix with **Copy**.
5. When they pick a mark, a date or a tick for a commit that changed `.claude/settings.json`,
   `.claude/agents/`, `.claude/rules/`, `AGENTS.md` or `.mcp.json`, the strip draws the usual range,
   and each figure says `compare.lower`, `compare.higher` or `compare.same`.
6. **Evidence missing or wrong.** A record Atlas reads that lacks a key it needs makes those figures
   `unknown`, never zero (`partial.unknown`); a malformed or cut last line, which Claude Code may
   still be writing, is dropped silently. A home or file Atlas cannot open is named with one word of
   a closed list (`error.home`, `partial.files`, `reason.*`); the rest still counts. Under 7 counted
   days before the mark: `compare.tooFewBefore`; under 3 after: `compare.tooFew`.
7. When they press **Inspect again**, figures are rebuilt from the files.

## First slice: what it reads, keeps and shows

Slice 1 is the Tokens view with findings 1–5, evidence, Copy, the comparison and Claude Code's
estimate, on macOS and Windows. No model, no write, no send, no cache.

- **Which folders.** Config homes as Improve finds them; a link at the home level (an Orca
  profile's `projects`) is followed, nothing below `projects/` is. Only folders whose name begins
  with the encoded checkout or a listed worktree are opened: every UTF-16 unit outside `a-z`, `A-Z`,
  `0-9` becomes `-`, as Claude Code does on every platform, built from the path's NFC and NFD forms
  and, on Windows, both drive-letter cases. Sessions in any other folder (a removed worktree
  elsewhere, a checkout since moved) are not seen.
- **Which files.** Regular files only, opened without following a link; anything else (a FIFO
  named `*.jsonl`) is `reason.notRegular`. A file counts by its first `cwd`: the checkout, a path
  under it (a removed agent worktree in `.claude/worktrees/`), or a listed worktree. A file whose
  first `cwd` is elsewhere (a sibling `ontology-atlas-web`) is closed at that line. A subagent file
  follows its parent's verdict. Each real file is read once, up to its size when the read began.
- **Paths compare** as real paths in NFC; on Windows, without the `\\?\` prefix `fs::canonicalize`
  adds, the drive letter case-insensitively.
- **Which fields.** From assistant records: `message.id`, `message.model`, `message.usage` counts,
  `effort`, `isSidechain`, `cwd`, `timestamp`, `diagnostics.cache_miss_reason.type` and its tokens.
  From `compact_boundary`: `trigger`, `preTokens`, `postTokens`. From `cost-state`: `startTime`,
  `totalCostUSD`, `hasUnknownModelCost`. From `api-request-shape`, once per `shapeHash`: each tool's
  byte size and its group (built-in, or the MCP server in `mcp__<server>__`). Tool call names, for
  calls per server. From `agent-*.meta.json`: `agentType`, `model`.
- **Never kept, logged or sent to the page:** message, prompt, tool input or output text; a tool's
  description; a path read from a session file; a session id beyond its first 8 characters; an
  error's own text. The only paths shown are config-home folders Atlas derived itself
  (`empty.body`, `error.home`), as Improve shows its memory folder. Lines over 4 MiB are skipped
  and counted. Figures live in memory until the app closes or the next inspection; only the mark
  is stored (a preference, per repository).
- **Figures.** Long context: per turn, context above 200K. Loaded at start: a run's first-turn
  context times its turns. Compaction: the sum of `preTokens`, the context each compaction read.
  Cache misses: the missed tokens. Model and effort: share of turns.
- **Money.** A `cost-state` line takes the time of the nearest earlier timestamped line in its file
  and counts when its file counts. One program run's values, from all its files, are ordered by
  value (a running total); each increase is dated at the later value. Never summed per file.
- **Noise band.** Before the mark, at least 7 counted days: mean *m*, standard deviation *s*, *nb*
  days. After it, at least 3: average *a* over *na* days. Band: *m* ± 2·*s*·√(1/*na* + 1/*nb*);
  here about ±10% at 3 days and ±7% at 7. *a* inside it reads `compare.same`. Neighbouring days are
  not independent, so the band may be too narrow; Risk 2's probe tests it.

## States

| State | Web | macOS app |
|---|---|---|
| Any | Card `web.title`, `web.body`, Get the app (`harness.browserAction`) | as below |
| No repository connected | Out of scope — web card | Harness's `harness.noSource` stage |
| First open | Out of scope — web card | `stage.title`, `stage.body`, `stage.files`, `stage.start`, `stage.local` |
| Reading | Out of scope — web card | shapes growing; `run.reading`, `run.stop`; elsewhere `card.running` |
| Stopped | Out of scope — web card | `run.stopped`; figures so far; `run.again` |
| Empty | Out of scope — web card | `empty.title`, `empty.body` with the folders looked in |
| Failed home | Out of scope — web card | `error.home` with `reason.*` above the shapes; other homes counted |
| Partial | Out of scope — web card | `partial.files` with `reason.*`, `partial.lines`, `partial.unknown` above the list |
| Done | Out of scope — web card | `run.inspected`; strip `strip.*`; split `split.*`; five rows `kinds.*`, `row.*`; detail `detail.*`, `fix.*`, `evidence.*`, `action.copy`, `fix.copied`; `action.openImprove` on Loaded at start when Improve exists; elsewhere `card.done` |
| A finding with nothing | Out of scope — web card | its row reads `row.none`; no detail fix |
| Comparing | Out of scope — web card | `compare.pick`, `compare.pickHint`, ticks `compare.tick`, `compare.clear`; `compare.none`, `compare.tooFewBefore`, `compare.tooFew`, `compare.same`, `compare.lower`, `compare.higher`, `compare.left` |
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
| `stage.title` / `stage.body` | stage | Where your tokens go / One inspection reads this repository's Claude Code sessions from the last 30 days on this computer and shows where context tokens went, with a change for each finding. It keeps counts, times, short session ids, and model, effort, agent and tool server names, and it changes no file. |
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
| `compare.pick` / `compare.pickHint` / `compare.tick` / `compare.clear` / `compare.none` | compare | Compare from / Pick a date, or a commit that changed agent files / {date} · {subject} / Clear / Pick a date to compare the days before and after it. |
| `compare.tooFewBefore` / `compare.tooFew` | compare | Only {days} days before {date} had 500 turns or more; 7 are needed to know the usual range. / Only {days} days after {date} had 500 turns or more; 3 are needed to judge. |
| `compare.same` / `compare.lower` / `compare.higher` / `compare.left` | compare | No detectable difference: the average since {date}, {after}, is inside the usual range, {low} to {high}. / Lower since {date}: an average of {after} against {before} before, below the usual range. / Higher since {date}: an average of {after} against {before} before, above the usual range. / {days} days with under 500 turns left out. |
| `money.title` / `money.total` / `money.split` / `money.note` / `money.partial` / `money.none` | money | Claude Code's estimate / {amount} in the last 30 days / {before} before {date} · {after} since / Claude Code's own estimate from its session files, at API prices. It is not your bill. / Claude Code could not price every model, so this estimate is low. / Claude Code wrote no cost estimate in these sessions. |
| `partial.files` / `partial.lines` / `partial.unknown` / `unknown` | above list | {count} files were not read ({reason}). Their figures are not included. / {count} lines over 4 MiB were skipped. / {count} records lacked a figure Atlas needs; those figures show as unknown. / unknown |
| `reason.notFound` / `reason.denied` / `reason.notRegular` / `reason.unreadable` | in `{reason}` | not found / no permission / not a regular file / could not be read |
| `empty.title` / `empty.body` / `error.home` | stage | No Claude Code sessions for this repository in the last 30 days / Atlas looked in {paths}. Claude Code writes a session file there for each conversation. / Could not read {path}: {reason}. Nothing there was inspected. |
| `web.title` / `web.body` | web card | Inspecting token use needs the app / Claude Code keeps its session files in your home folder, which a browser cannot open. The app reads them on this computer and keeps counts, times, short session ids, and model, effort, agent and tool server names. |
| `card.running` / `card.done` / `card.open` / `action.copy` / `action.openImprove` | card, buttons | Inspecting token use · {done} of {total} / Token use inspected: {count} findings / Open / Copy / Open Improve |

Plural keys use ICU plurals in English; the table shows the `other` form.

## Edge cases

- **Zero, one, largest.** No files: Empty. One session of one turn: every shape draws one day;
  comparison reads `compare.tooFew`. Largest measured: 611 runs, 97,060 turns, one file of 603 MB.
- **First run.** No mark; the strip shows no band until one is picked.
- **Hangul and long paths.** A Hangul syllable encodes to one `-`; macOS may hold a path in NFD, so
  the prefix is built from both forms and `cwd` compares in NFC. A name Claude Code cut and hashed
  for length matches on its kept prefix.
- **Moved, renamed, unreadable.** A file that vanishes mid-read is Partial (`reason.notFound`). A
  checkout moved since the sessions ran: its old sessions sit under the old name and are not seen.
- **Two edits at once.** Claude Code appends while Atlas reads: Atlas reads up to the size it saw
  at the start, so a turn is never half counted.
- **Offline.** Works fully; nothing is sent.
- **Windows.** Slice 1 runs there: the home is `%USERPROFILE%\.claude` or `CLAUDE_CONFIG_DIR`;
  Claude Code's one encoding turns `C:\` into `C--`; paths compare without `\\?\` and with the drive
  letter in either case. The path logic is tested on every platform (criterion 2). Not testable off
  Windows: what `fs::canonicalize` and file opening really return there; that needs one
  installed-app walk on Windows before release, and the release says so if none was made.
- **Codex only.** A person with only Codex sessions sees Empty with the folders looked in.

## Out of scope

- Codex sessions: 42 files, 5.25B input tokens, 99.4% cached; another format and read (Later 1).
- Writing any fix: settings and agent files are edited by the person or, later, through Improve's
  Keep (Later 3). Slice 1 copies.
- Leaks 6–10: they need gaps, tool inputs or outputs; each is small today (Later 4, 5).
- Prices: Atlas prices nothing; only `cost-state` gives money.
- Other repositories, and any session outside this repository's `cwd`: the owner asked for this one.
- Showing the message before a turn: it reads text and needs a command that never takes a path
  from the page; it waits for its own record (Later 2).
- An on-disk cache of figures: a new store, added only if criterion 7 fails (Later 6).

## Acceptance criteria

1. **The moment and the five-second test.** Given the installed app on the owner's Mac after one
   inspection, a recording shows his first look. It passes when, within five seconds, he names the
   token finding with the most tokens and, with the mark on 2026-11-28, says the verdict the view
   shows. The pull request quotes him (installed-app walk).
2. **The right files.** Given `tests/fixtures/token-inspector-files/`: a colliding folder with
   another repository's `cwd`; a sibling `ontology-atlas-web` sharing the prefix; a removed worktree
   under the checkout; one outside it; a subagent counted by its parent; one turn in three records;
   four homes linked to one folder; a link and a FIFO below `projects/`; a folder whose name does not
   match; a name cut with a hash; a Hangul path in NFC and in NFD; Windows paths with `\\?\C:\` and
   `c:\`. Each counts as "Which folders" and "Which files" say; the sibling is closed at its first
   `cwd` line; the link is not followed, the FIFO not opened, the unmatched folder never opened (Rust
   unit tests with an open-call log, on every platform).
3. **The right numbers.** Given fixture sessions with known totals, every figure matches exactly; a
   read record missing a needed key shows `unknown`, never 0, and a cut last line counts nowhere;
   `cost-state` lines without `timestamp` take the earlier line's; two files of one program run count
   its money once, ordered by value; a `hasUnknownModelCost` run shows `money.partial` (Rust tests).
4. **Numbers only.** Given fixtures planted with a message, a tool input and output, a system
   prompt, a tool description, a `description`, a secret-shaped line, a path and a malformed value,
   `no_planted_text_leaves_any_inspector_result` serialises every result and error and captures the
   log, and finds none of them; tool names reach the page only as a group, errors only as
   `reason.*` (`src-tauri/src/harness_tokens/tests.rs`).
5. **Honest comparison.** With 8% daily noise and 16 before-days: 3 after-days 5% lower read
   `compare.same`; 3 after-days 25% lower `compare.lower`; 14 after-days 10% lower `compare.lower`;
   1 before-day `compare.tooFewBefore`; 2 after-days `compare.tooFew`; a day under 500 turns is left
   out and counted (unit test).
6. **Live, smooth, still, and the web.** With a bridge stub of 611 runs, counts only rise, no
   element jumps between two frames, leaving shows `card.running` with the same count, and no frame
   is requested for 10 s after the end (`tests/e2e/harness/harness-tokens.spec.ts`, per frame). The
   web shows `web.title` and the entry is in `DEGRADED_SURFACES`
   (`tests/e2e/web-surface-smoke.spec.ts`).
7. **Measured on the owner's Mac.** 30 days: the first bars within 5 s, done within 30 s, at most
   200 MB added to the app's peak memory (`footprint` on the app's process each second, peak during
   the inspection minus the value before it), and every total within 1% of `pnpm harness:tokens`,
   which this slice moves to the same folder and file rule, fixing its `:51` collision. The pull
   request reports time, peak memory and the totals.
8. **Recovery.** Stopping halfway, then **Inspect again**, gives figures identical to an
   uninterrupted inspection; a mark survives an app restart and **Clear** removes it; deleting a
   file mid-read ends in Partial, not an error (Rust tests, installed-app walk).

## Risks

1. **The undocumented format changes**, as `cost-state` already showed it means something other
   than it seems. Answer: an allow-list of record types and keys; anything else degrades to
   `unknown` with a count (criteria 3, 4); fixtures taken from the current Claude Code version.
2. **People see numbers and nothing changes.** Fixes are habits, and an 8% daily noise hides small
   gains. Answer: each finding names its own measure, and the comparison says when it is noise.
   Probe: three days after 2026-11-28, Model and effort marked there must read `compare.lower` for
   Fable's share; if it does not, the comparison is wrong, and it is fixed before anything else.
3. **The pass is too slow or heavy** (29 s and 359 MB in Node; the files grow). Answer: Rust
   streams with a key prefilter, newest files first, so findings appear early; criterion 7 sets the
   budget, and its failure starts Later 6.

## Later

1. **Codex sessions** (`token_count` events). Next after slice 1, as the second tool the owner uses.
2. **Show the message before a turn,** under its own record: Rust resolves an evidence id it issued
   to its file, never a path from the page. Next when the owner cannot place a turn from its id.
3. **Keep a fix through Improve** (one line in `.claude/settings.json` or `.claude/agents/*.md`),
   under a new record. Next once Improve's write ships and a Copy here is followed by a matching commit.
4. **One-hour cache lifetime** from gaps between turns. Next when 5–60 minute gaps pass 5% of turns.
5. **Re-reads, huge outputs, failed calls and polling.** Next when one passes 1% of context.
6. **A rebuildable per-file cache** of figures. Next when criterion 7's 30 s fails.
7. **Subagents started for small jobs.** Last: 599K tokens in 30 days.

## Owner question

None. "Is it possible?" is answered yes. Decided here, each with its reversal: a separate view (fold
it into Improve by moving its rows); numbers only (a wider read needs a new record); money only
from Claude Code (pricing tokens would need a price source); this repository only (the owner's
words). Reading the session files is the one-way part, under `d55c209e`; removing the view stops it.

## Revisions

- 2026-11-28: first draft, on a previous run's measurements, rechecked for the noise band and
  `cost-state`, which proved to be a running total per program run.
- 2026-11-28: tightened; named the record `d55c209e` and the tenth `surfaces.md` exception; added
  hashed long folder names, the three-day probe of the Opus move, and a "First slice" section.
- 2026-11-28: applied an independent review. The lead moved the message reveal to Later, so slice
  1 is numbers only; paths on screen are only config homes Atlas derived, and reasons a closed
  list. Folders matching no prefix are not seen; prefix-sharing files close at their first outside
  `cwd`. `cost-state` borrows the earlier line's time and orders by value. The band needs 7 days
  before and narrows with more days after. Windows keeps slice 1 with `\\?\` and drive-letter case;
  Hangul NFC and NFD; links and FIFOs below `projects/`; figures defined; criterion 4 is a Rust
  test; criterion 7 compares with a fixed `pnpm harness:tokens`.
