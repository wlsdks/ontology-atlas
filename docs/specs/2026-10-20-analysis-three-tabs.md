---
title: Analysis Three Tabs
doc_type: spec
status: draft
area: analysis
date: 2026-10-20
decisions: []
---

# Analysis Three Tabs

## Person and moment

The owner, a solo developer running Claude Code and Codex on this repository daily, walked Analysis
in the installed app on 2026-10-20 and said, in Korean, of Review summary: "not pretty at all; I
don't know what I'm supposed to review; only lots of scrolling"; of Guidance: "looks hastily made";
of Written explanations: "seems an unnecessary feature". He chose three tabs and a summary with
three numbered to-dos, one button each, then "show the other 9 lines (4 at 0)". His screenshot
(relayed, no file) showed `brief.sinceSeen` (28 days), `brief.headline` (79, 99), `brief.markSeen`
and about 14 equal rows: moved code 29/97, two agent trees 50/120, agent-written unreviewed 97/97,
agent calls 50, zero rows, `brief.empty.wiki`. Back from delegating, they want what changed, what
needs them and where to fix it. No capture exists; criterion 4 makes one before Slice B is built.

## Today

Source `905d7cff9` (main); the cited files match `bf6e044a6` except `AnalysisWorkspace.tsx:82`.

- **Tabs.** `INSIGHTS_SECTIONS` is `connections, brief, library, harness, flow`
  (`src/views/ontology-insights/lib/insights-tab-state.ts:18`, labels `OntologyInsightsPage.tsx:66`).
  An unknown `tab` opens `connections` with `analysis.legacy` (`insights-tab-state.ts:82-86`,
  `OntologyInsightsPage.tsx:75`).
- **Review summary** (`src/views/ontology-insights/ui/tabs/BriefTab.tsx:166-226`): eyebrow
  `brief.sinceSeen` (ko spaces the day counter, `messages/ko/ontologyPages.json:20`), hero sums
  `brief.headline` beside `brief.markSeen` (`:174`, `:199-210`), a gloss (`:213`), one list of every
  row (`:215-221`), a changed-since card of up to 12 rows (`:223-225`, `since-list.ts:50`). Rows sort
  stale, unknown, happened, zero; a core that cannot count adds one status row: no-source, no-data
  (`brief.empty.*`), unreadable, quiet (`brief.quiet`) or app-only (`lib/brief/brief-rows.ts:9-20`,
  `:98-121`). 28 line ids: ontology 8 (`ontology-brief.ts:106-117`), wiki 8 (`wiki-brief.ts:95-104`),
  harness 6 (`harness-brief.ts:46`, `:53-59`), agent 6 (`agent-brief.ts:41-48`).
- **Doors that do not list what they count** (`BriefTab.tsx:26-55`). Moved code opens the
  relationship board (`:27`), which marks moved cards for capabilities only (`AnalysisWorkspace.tsx:50`,
  `:57`); unmatched names open the evidence question (`BriefTab.tsx:35`), which no longer lists them
  (`capabilities/ontology-insights` Excludes); agent-written concepts open the whole map (`BriefTab.tsx:32`).
  Missing, moved and folder-only carry named rows (`evidence-details.ts:34-36`) that expand in place
  to five concepts with file and dates, moved adding an agent request (`BriefTab.tsx:516-585`).
  Harness gap lines open `/architecture/?view=coverage` (`:44-46`). The guided tour's
  `insights-headline` step anchors on the hero sum and describes it
  (`src/features/guided-tour/model/tour-steps.ts:166-171`, `messages/en/guidedTour.json:56-59`).
- **A count mixing copies with errors.** `harness-mirror-drift` is `stale` (`harness-brief.ts:57`),
  "where the two agent trees disagree" (`messages/en/ontologyPages.json:95`). It counts every
  finding of seven checks (`src/entities/agent-files/model/agent-files.ts:695-706`, total `:740`):
  skill and agent-brief copies (`:325-341`), the CLAUDE.md import of AGENTS.md (`:280`, `:291`),
  `at-ref-missing` (`:472`), `non-english-agent-text` (`:509`), `mcp-config-unparseable` (`:581`),
  `undeclared-mcp-server` (`:601`), `agents-md-over-codex-cap` (`:653`); the brief reads that total
  (`use-insights-brief.ts:352`). Harness calls a copy difference "not an error"
  (`messages/en/harness.json:42`, after e47518a9). The owner's 50 were all copy findings
  (independent review relayed by the lead).
- **Guidance.** `HarnessTab.tsx:36-41` renders `HarnessCoverageOverview.tsx`, imported nowhere else
  and reading `harnessTab.visual.*` (`:69`); `harnessTab.preview.*` is also read by
  `src/widgets/relationship-preview/ui/GuidanceRelationshipPreview.tsx:10`, which Harness renders
  (`src/views/architecture/ui/HarnessPage.tsx:349`, `:374`). The At a glance spec makes
  `?view=overview` the address and rewrites `structure`, `coverage`, `sensors` to it
  (`docs/specs/2026-10-20-harness-at-a-glance.md:126-127`); it is in build, not merged.
- **Written explanations.** Flow lists runs with `origin.surface === 'analysis'` from
  `.ontology-atlas/analyses/` (`flow-history.ts:79`, `analysis-store.ts:30`). Other readers: the agent
  panel's Findings & history, by mode and project (`src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx:134-136`),
  present with an agent runtime and folder root (`AnalysisRecords.tsx:125`); MCP `analysis_history`
  and `analysis_record` (`mcp/src/tools/graph.mjs:286-293`); the CLI
  (`cli/src/commands/repo-analysis/analysis.mjs:108-109`); two app hooks
  (`src/features/gray-area/model/investigation/use-investigation-history.ts:18`,
  `src/views/architecture/model/use-architecture-record.ts:61`). `flow.request` is read by
  `src/views/home/model/use-topology-preferences.tsx:16`. Unknown: how many runs their folder holds.
- **Inbound addresses.** Nothing outside the view links `?tab=harness` or `?tab=flow`; the Map's
  return chip rebuilds `?tab=<via>` (`ontology-node-href.ts:77-84`); claim returns carry `review=`
  (`OntologyInsightsPage.tsx:45-47`); relaunch restores the last address (`route-memory.tsx:33-48`).
  The installed-app check expects five sections (`scripts/lib/verify-macos/payload-contract.mjs:219`).

## Problem and alternatives

By value against cost: (1) Review summary, built for the thesis moment, does not say what to do
first: most value, medium cost. (2) Written explanations is an entry the owner calls unnecessary
whose files four other readers serve: small cost. (3) Guidance is a second picture of Harness
coverage: small cost. **Slice A** (2, 3) ships first: small, no new judgement, waiting only on the
At a glance merge. **Slice B** (1) ships after criterion 4 captures the owner's real rows, because
its rule was tuned on a relayed screenshot. The scrolling is a symptom; the cause is a list treating
every line alike: sums nobody acts on, doors to screens that do not list what was counted, a
reference difference called stale, zero rows. Restyling keeps all of it on top.

| Option | Value and usability | Cost and fit | Result |
|---|---|---|---|
| Status quo | Every line visible | None; the owner cannot tell what to review | Lost |
| Restyle: larger type, fold zeros | Less scroll | Small; 12 or more equal rows, same doors | Lost |
| **At most three rows by a fixed rule, rest folded** | Says what first and where | Medium; deterministic, offline | **Chosen** |
| The agent picks the three | Could weigh meaning | Needs an agent; browser and offline get nothing; varies by run | Lost: local-first |
| Hide removed tabs behind a setting | Reversible | Unused code; the owner called them unneeded | Lost |

**Slice A: removals.** The tab bar holds `connections, brief, library`. `?tab=harness` replaces itself
with `/architecture/?view=overview`, keeping other flags and adding no history entry; the harness gap
lines (`BriefTab.tsx:44-46`) point there too. `?tab=flow` opens System relationships with
`analysis.flowRetired` instead of `analysis.legacy`, `history=available` when the agent panel is
present. Other aliases and `review=` behave as today. Nothing under `.ontology-atlas/` is written,
moved or deleted. The installed-app check expects three sections.

**Slice A: tests.** Delete with their code `FlowTab.test.tsx`, `HarnessTab.test.tsx`,
`HarnessCoverageOverview.test.tsx`, `flow-history.test.ts`, and in `tests/e2e/` the Guidance tests in
`harness/harness-tab.spec.ts` (`:47`, `:93`, `:135`, `:171`, `:212`, `:246`, `:730`),
`harness/harness-tab-layout.spec.ts` (`:11`, `:168`, `:321`), `harness/harness-auto-insights-layout.spec.ts:130`,
`insights/insights-flow-scroll.spec.ts`, `insights/analysis-explanation-empty.spec.ts`, the Flow tests
in `insights/analysis-evidence-quality.spec.ts` (`:260-270`, `:272-282`), `design-audits/overflow-sweep.spec.ts:38`
and the Flow row of `vault-session/open-vault-cta.spec.ts:173`. Rewrite `overflow-sweep.spec.ts:40` to
`/en/architecture/?view=overview&guides=off`; `insights-agent-retention.spec.ts` to open
`/en/ontology/insights/` with `analysis-inspect-selected` (`AnalysisWorkspace.tsx:145`), leaving by
`insights-core-brief` and returning by `insights-core-ontology`; `insights-motion-feedback.spec.ts:15`
onto `analysis-copy-selected` (`AnalysisWorkspace.tsx:146`); `open-vault-cta.spec.ts:255` onto `project-detail-open-vault`;
`insights-app-contract.spec.ts:60-71` to three tabs, removing `insights-core-library`;
`verify-macos-app-launch.payload-contract.test.mjs:119-126`; `insights-tab-state.test.ts`; and the
Flow markers in `scripts/design/check-ontology-design-surface.mjs:112-115` to `analysis-inspect-selected`.

**Slice B: urgency rule.** A line is a candidate when its count is above 0 and its id is listed.

| Tier | Line ids | Destination and button |
|---|---|---|
| 1 Wrong now | `ontology-evidence-missing`, `ontology-evidence-moved` | Concept list in place, `top.seeWhich` |
| | `wiki-stale-pages`, `wiki-disagreements`, `wiki-dangling-links` | `/library/`, `top.open.library` |
| 2 A gap you can close | `ontology-evidence-folder-only` | Concept list in place, `top.seeWhich` |
| | `wiki-sources-unwritten`, `wiki-orphan-pages` | `/library/`, `top.open.library` |
| | `ontology-repair` | `?tab=do-next` in place, `top.open.insights` |
| | `harness-untold-areas`, `harness-ungated-areas`, `harness-unwatched-areas` | `/architecture/?view=overview`, `top.open.harness` |

Sort candidates by tier, then smaller count (a job one sitting can finish), then core order
(concepts, wiki, guidance, agents), then builder order. Walk the list and draw a candidate only if
no drawn row shares its destination; stop at three. The rows thus open different places, and fewer
qualifying destinations draw fewer rows. With none, `top.nothing` shows with `count` from
`ontology-agent-unreviewed`, which frontmatter alone decides (`ontology-brief.ts:89-90`). Never a
top row: `ontology-evidence-unchecked` (domains and the project never cite a file), `ontology-agent-unreviewed` and `ontology-unmatched`
(no screen lists them), `agent-writes-failed` and `agent-writes-waiting` (no screen lists receipts),
`harness-mirror-drift` (copies today, e47518a9; errors wait for Later 2), and every "since" line.

**Slice B: fold.** The example shows `top.exampleLimit` with the open-folder button; in a folder the
no-source, unreadable and app-only rows sit between the top rows and the toggle. The fold holds
every other line row, zero lines included, the no-data and quiet rows, then the changed-since card,
in today's order; a top row is not repeated. `rest` counts fold rows except the card; `zeros`
counts those reporting nothing: lines at 0, no-data and quiet rows. `mix` is `none` at 0 zeros,
`all` when `zeros` equals `rest`, else `some`. The moved row loses its `?tab=growth` door everywhere.
The tour's `insights-headline` step anchors on the top rows with the changed copy;
`insights-brief.spec.ts:101` and `:136-138` move off `brief-headline`.

**Records to overturn** (the lead files one fragment): 2026-09-04 Flow (`docs/DECISIONS.md:5549`),
entry removed, runs kept (A); 2026-09-22 e26f2d5b, Guidance leaves Analysis (A); 2026-10-10
488f9b25, supporting records narrow to two (A); 2026-09-19 683f0641, heading sums removed (B);
2026-09-23 7a5e5264, one list becomes top rows and a fold (B); 2026-09-19 3030afde is narrowed:
moved code still ranks and names five concepts, but the remainder loses its door (B).
`docs/DESIGN-SYSTEM.md:215` and `docs/features/analysis.md:115-123`, `:145-151` name three sections.

## Flow

1. (A) When the person opens Analysis, Atlas shows System relationships, Review summary and Wiki,
   with System relationships selected.
2. When they open Review summary while a core still reads, Atlas shows `top.since` and
   `brief.reading`, no rows; once every core reports, at most three numbered rows (each its
   `brief.line.*` sentence and one button), any limit row, then `top.more`.
3. When they press `top.seeWhich`, the row opens in place: up to five concepts linked to the map,
   each with file and both dates, then `brief.detailHidden`; on the moved row `brief.askAgent` (app,
   agent ready) seats one request without sending and `brief.copyRequest` copies it.
4. When they press another button, Atlas opens its destination; `top.open.insights` switches to the
   evidence question in place, keeping the address and Back.
5. When the agent judges wrongly, say calling a meaning current that the code changed, nothing is
   written: the request asks for a proposal, every vault write waits for their allow or reject, and
   the row keeps counting the concept until its document or file changes.
6. When evidence is missing (no repository, unreadable guide files, a browser), the limit row says
   so with its one action, and no row calls those concepts fine.
7. When they press `top.more`, the fold opens and the toggle reads `top.less`; pressing again folds
   it, focus staying on the toggle.
8. When they press `brief.markSeen`, the heading reads `top.since` for today in the same frame beside
   `brief.markSeenDone` and `brief.markSeenUndo`; the rows stay, since seeing is not fixing.
9. (A) When an old `?tab=harness` or `?tab=flow` opens, Atlas lands as Slice A says.

## States

| State | Web | macOS app |
|---|---|---|
| (A) Any folder or the example | Tabs System relationships, Review summary, Wiki | Same |
| (A) `?tab=flow` | System relationships, `analysis.flowRetired` with `history=other`; next: any tab | Same, `history=available` when the agent panel is present; also after relaunch to a remembered `?tab=flow` |
| (A) `?tab=harness` | Harness At a glance in its browser state (sibling spec `:133`); next: `harness.browserAction` | At a glance, measured; next: a cell |
| Bundled example | `top.since` (`window=default`), rows such as `ontology-repair`, `top.exampleLimit` with `openVaultCta.label`, `top.more` | Same, while no folder is open |
| Own folder, candidates | At most two rows (Library, System relationships; code and guides count in the app only), `brief.appOnly` with `brief.getApp`, `top.more` | Up to three rows, `top.more`; no app-only row |
| No candidate | `top.nothing` with the unreviewed count; `top.more`, `mix` from the fold | Same |
| Every count 0 | `top.nothing` with count 0; `top.more` with `mix=all` | Same |
| First look ever | `top.since` with `window=default`; `brief.markSeen` sets the first mark | Same |
| Just marked seen | `top.since` for today, `brief.markSeenDone`, `brief.markSeenUndo`; rows unchanged | Same |
| Counting | `top.since`, `brief.reading`; no rows, no toggle | Same; the harness scan lands seconds later |
| Recount after a write | Last settled rows in working ink, one swap when settled | Same |
| No repository | Out of scope — a browser cannot read code; `brief.appOnly` covers it | `brief.noSourceShared` with `brief.emptyAction.ontology`, above the toggle |
| Unreadable | Out of scope — a browser never reads guide files | `brief.unreadable` or `brief.evidenceUnreadable`; reopening the folder retries |
| Row opened in place | Five concepts, `brief.detailHidden`, `brief.copyRequest`; next: `top.hideWhich` | Same, plus `brief.askAgent` when an agent is ready |
| Fold open | Other rows in today's order, changed-since card; next: `top.less` | Same |
| Folder without concepts | `analysis.empty` with `openVaultCta.label`, unchanged (`OntologyInsightsPage.tsx:72`) | Same |
| Largest measured | Fold of at most 27 line rows and 12 card rows; this repository: 97 concepts, 120 guides (e35a25fe) | Same; the top stays at three |

## Copy

New keys under `ontologyPages.insights` unless named, ICU; ko, ja and zh are in the lead's copy
file, not this English document. Korean counters come from each line's own key.

| Key | Where it appears | English |
|---|---|---|
| `analysis.flowRetired` (A) | Notice on `?tab=flow` | `{history, select, available {Written explanations is no longer a section here. Explanations saved earlier stay as files in .ontology-atlas/analyses/. Open the agent panel's Findings & history to read them, or ask your coding agent through MCP.} other {Written explanations is no longer a section here. Explanations saved earlier stay as files in .ontology-atlas/analyses/. Ask your coding agent to read them through MCP.}}` |
| `brief.top.since` | Heading | `{window, select, default {The last 7 days} other {{days, plural, =0 {Since you looked today} one {# day since you last looked} other {# days since you last looked}}}}` |
| `brief.top.listLabel` | Accessible name of the rows | Needs you now |
| `brief.top.nothing` | In place of rows | `{count, plural, =0 {No fix is waiting here.} one {No fix is waiting here. # concept an agent wrote still has no reviewer.} other {No fix is waiting here. # concepts an agent wrote still have no reviewer.}}` |
| `brief.top.more` | Fold toggle | `{mix, select, none {Show {rest, plural, one {# more line} other {# more lines}}} some {Show {rest, plural, one {# more line} other {# more lines}} ({zeros} at 0)} other {Show {rest, plural, one {# more line} other {# more lines}} (all at 0)}}` |
| `brief.top.less` | Fold toggle when open | Hide the other lines |
| `brief.top.seeWhich`, `brief.top.hideWhich` | Concept-list rows, closed and open | See which concepts; Hide |
| `brief.top.open.insights` | Repair row | Open in System relationships |
| `brief.top.open.library` | Wiki rows | Open in Library |
| `brief.top.open.harness` | Harness gap rows | Open in Harness |
| `brief.top.exampleLimit` | Example limit row | This is the bundled example, so code and guidance were not counted. Open your own folder and they are counted here. |
| `guidedTour.steps.insightsHeadline` (changed) | Tour step on the top rows | Title: The numbered rows come first. Body: They are the fixes waiting now, at most three, each with one button that opens where you fix it. The other lines stay folded below. |

Kept, with their readers: `flow.request` and `harnessTab.preview.*` (Today). Removed in four locales
once a search of `src/` finds no reader: Slice A, `analysis.guidance`, `analysis.explanations`, the
rest of `flow.*` and `harnessTab.*`, `tab.flow`, `tab.harness`; Slice B, `brief.headline`,
`brief.headlineCounting`, `brief.sinceGloss`, `brief.sinceSeen`, `brief.sinceDefault`.

## Edge cases

- **Counts.** No destination qualifies: `top.nothing`; one: one row; largest: 27 line ids in the
  app (28 less `harness-app-only`) over four destinations, so the top never passes three.
- **First run.** No mark gives the 7-day window. **Hangul input.** Nothing is typed; the ko heading
  puts no space before the day counter, unlike today's `brief.sinceSeen`.
- **Moved, renamed or unreadable folder.** The mark follows the folder name
  (`use-vault-identity-scope.ts:30-34`), so a rename restarts at 7 days; unreadable guide files give
  the unreadable limit row, and reopening retries. Saved runs move with their folder.
- **Two edits at once.** An agent write triggers a recount; rows hold until it settles, then a
  cleared row leaves and the next moves up in one step. A mark made in another window updates this
  one (`brief-anchor.ts:91-103`).
- **Offline.** Counts come from the folder, Git and browser storage; only `brief.getApp` needs the
  network.

## Out of scope

- The System relationships board, and Harness's At a glance view
  (`docs/specs/2026-10-20-harness-at-a-glance.md`), which Slice A waits for.
- Changing any line's count or wording, including the never-top lines: Later.
- The Wiki tab, the changed-since card's design, routes, and `.ontology-atlas/analyses/` itself.
- The vault write: `capabilities/ontology-insights` says "five sections"; `/ontology-sync` at merge.

## Acceptance criteria

Slice A:

1. **Given** any folder or the example, **when** Analysis opens on web or app, **then** the tab bar
   holds exactly System relationships, Review summary, Wiki, in that order, with no
   `insights-core-harness` or `insights-core-flow`, and the installed-app check passes with three.
   Check: `insights-tab-state.test.ts`, `tests/e2e/insights/insights-app-contract.spec.ts`.
2. **Given** `/ko/ontology/insights/?tab=harness&guides=off` after the At a glance merge, **when** it
   opens, **then** the address is `/ko/architecture/?view=overview&guides=off` with At a glance
   selected, `history.length` is unchanged and Back leaves; `?tab=flow` draws System relationships
   with `analysis.flowRetired` and no `analysis.legacy`; `?tab=do-next&review=analysis:<id>`
   reselects that claim; a return chip with `via=insights:harness` lands on At a glance. Check: new
   `tests/e2e/insights/analysis-retired-sections.spec.ts`, `insights-tab-state.test.ts`.
3. **Given** a picker-stub folder with an agent runtime and three runs under
   `.ontology-atlas/analyses/`, **when** the person visits every tab and `?tab=flow`, **then** each
   file's hash is unchanged, no read error shows, the agent panel's Findings & history lists the
   runs, and reopening the panel from `analysis-inspect-selected` keeps an unsent draft. Check:
   `analysis-retired-sections.spec.ts`, `insights-agent-retention.spec.ts`; the unchanged
   `mcp/src/analysis-history/analysis-records.test.mjs`.

Slice B:

4. **Given** the owner's folder in the installed app at 1040x720 and the example in the web export
   at 1512x900, ko and en, **when** Review summary opens before any Slice B code, **then** captures
   and their per-line counts, drift codes included, are recorded; after the slice the heading, top
   rows and `top.more` show without scrolling. Check: `/ui-proof` captures; installed-app walk.
5. **Given** an invented fixture (moved 29/97, missing 0, unchecked 6/97, agent-unreviewed 97/97,
   unmatched 2, repair 12, ungated 1, mirror drift 50, waiting 2, failed 1, calls since 50),
   **when** the rule runs, **then** the top is moved, ungated, repair; adding orphan pages 1 gives
   moved, orphan, ungated; adding missing 3 puts missing, not moved, on top; waiting and failed
   alone give `top.nothing`; all 0 gives `mix=all`. Criterion 4's counts replace this fixture.
   Check: `src/views/ontology-insights/lib/brief/brief-rows.test.ts`.
6. **Given** the settled tab, **when** it renders and each top button is pressed, **then** each top
   row is one sentence and one button with no `N / M`; the table's destination opens
   (`?tab=do-next` without leaving the page); the moved row lists five named concepts with map links
   and no `?tab=growth` link; fold rows stay out of the accessibility tree until `top.more`; `rest`
   and `zeros` match the fold rule. Check: `BriefTab.test.tsx`.
7. **Given** a settled brief, **when** the person presses `brief.markSeen`, then `brief.markSeenUndo`,
   then an agent clears the moved concepts, **then** today's heading shows in the same frame and
   reverts on undo, the cleared row leaves as the next moves up in one step, and under a delayed
   harness scan the first rows drawn equal the settled ones. Check:
   `tests/e2e/insights/insights-brief.spec.ts`, `brief-anchor.test.ts`.
8. **Given** the installed app on the owner's folder after Slice B, **when** they open Review summary
   and, before pressing anything, say what they would do first, **then** they name the first top row,
   and the three rows' buttons open three different destinations. Check: installed-app walk.

## Risks

1. **The top rows are noise.** A refactor marks many concepts moved with no meaning changed
   (3030afde's falsifier). Probe: in criterion 8's walk, judge the five named concepts; if three or
   more still hold, record it and reopen 3030afde before moved code may lead.
2. **An error hides in the fold.** A broken `@` reference or a truncated AGENTS.md counts only in
   `harness-mirror-drift`, which never ranks. Design: criterion 4 records the drift codes; any error
   code there makes Later 2 next.
3. **A removal costs something used.** The owner read explanations only through Written
   explanations and never finds Findings & history, or At a glance is not merged. Probe: count
   `origin.surface: analysis` runs in their folder before merge and open one from Findings & history in
   the walk; criterion 2 fails if `?view=overview` does not resolve.

## Later

1. List agent-written concepts no person reviewed, so `ontology-agent-unreviewed` gets a door and
   can rank; next when it is the largest fold line (97/97 today).
2. Split `harness-mirror-drift`: the error checks (AGENTS.md import, `at-ref-missing`,
   `non-english-agent-text`, `mcp-config-unparseable`, `undeclared-mcp-server`,
   `agents-md-over-codex-cap`) become a tier 1 line opening Harness Guides, and copy differences lose
   the stale mark; next when a folder shows an error finding.
3. Let `agent-writes-failed` and `agent-writes-waiting` rank; next when a screen lists receipts.
4. Count only capabilities and elements as unchecked; next when that line outnumbers repair.
5. List unmatched names somewhere; next when the owner's count is above 0.

## Owner question

None. Dropping "two agent trees" from the top follows e47518a9 and Harness's own wording; the lead
tells the owner of the error-check exclusion. Reverse it by adding `harness-mirror-drift` to tier 1.
