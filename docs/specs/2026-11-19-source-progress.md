---
title: Source progress on the Library's Sources home
doc_type: spec
status: draft
date: 2026-11-19
decisions: []
area: library
---

# Source progress on the Library's Sources home

The product planner wrote this spec on 2026-11-19. The lead saved it here, keeping the substance and trimming the prose.

## The ask

The owner said on 2026-11-19, translated: "For documents, there's a count, and each analysed one can be checked off, right? Then could we show a progress rate, by date? ... Based on my documents' analysis rate I can see what isn't analysed yet, it becomes easy to continue analysing, making the request is fun, and there'd be a visual effect too."

The person runs a coding agent and is turning a folder of their own documents (`sources/`: PDF, DOCX, XLSX, Markdown) into a wiki that cites them. The owner's target is thousands to tens of thousands of documents. The moment is opening Library › Sources after an agent run.

## Facts in the code today

- **The definition already exists.** A source is `compiled` when a wiki page lists it in `sources:` with a `source_hash` equal to the file's sha256, and the page did not read the file only in part (`src/entities/docs-vault/lib/library/vault-library.ts:127-139`).
  - The other states are `not-compiled`, `partial`, `stale` and `checking` (`:21`).
  - Hashing is lazy, covers cited files only, and is cached in memory by path and mtime (`src/features/library/model/use-library-model.ts:93-160`).
- **An unreadable file never leaves "checking".** It returns `sha256: None` (`src-tauri/src/library.rs:168-191`). The client drops that result, so the row stays `checking` forever (`use-library-model.ts:137-152`).
- **Labels.** "has wiki page", "no wiki page", "needs review", "read in part", "checking", in all four locales (`messages/*/library.json`, `sources.state`). 
- **The rate is hidden.** "{compiled} of {total} sources have a wiki page" (`messages/en/library.json:557`) prints only as a caption in the guide popover (`src/views/library/lib/compile/stage-steps.ts:124-140`, `src/views/library/ui/library-page/LibraryHomePopovers.tsx:56-87`).
- **Rows.** A `compiled` row draws a check. A state line above the list counts rows per state, but it is plain text, not a filter (`src/views/library/ui/parts/index-column/LibrarySection.tsx:414-426, 641-670, 727-740`). The list is windowed (`:427`).
- **The Sources home.** With nothing selected, it shows the Library graph (`src/views/library/ui/LibraryPage.tsx:552-597`, `src/widgets/library-graph/ui/LibraryGraph.tsx:359-386`). The decision of 2026-09-12 makes the graph the home (`docs/DECISIONS.md:194`).
  - `docs/ARCHITECTURE.md:540-543` says the graph mounts only inside a dialog. That is wrong: the code is the fact, so fix the document.
- **The Continue press is unbounded.** The strip reads "Write wiki page: {source}" (`messages/en/library.json:456`), naming one file, but the press sends every waiting source (`LibraryPage.tsx:246-268` passes `model.sources`; `compile-brief.ts:34-38, 247`).
  - The brief also lists every wiki page (`compile-brief.ts:114-123`).
  - The local model caps a turn at 3 (`src/features/vault-agent/model/compile/compile-tool-catalog.ts:13`). The coding-agent route has no cap.
- **Defect, rule g.** It tells the agent to write nothing for a source that adds nothing new (`compile-brief.ts:50`), so that source stays "no wiki page" forever.
- **Defect, Hangul citations.** Folder paths are NFC-normalised (`src/entities/docs-vault/lib/local-manifest/walk-vault.ts:88`), but citation paths are not (`vault-library.ts:50-56`). An NFD Hangul citation therefore never matches its file.
- **Dates.** Every wiki page must carry `compiled_at` (`docs/ONTOLOGY-ATLAS-SPEC.md:796`). The brief fills it with the request's start time (`compile-brief.ts` rule b). Nothing draws these dates over time.
- **Scale data is missing.** `scripts/perf/gen-scale-vault.mjs` makes no `sources/`, so there is no Library figure at 10k or 50k.

## Decisions

- **What counts.** A source counts only when it is `compiled`: cited with a matching hash and read whole. On screen it says "has a wiki page" and never "analysed", because that is all the evidence proves.
  - Checking, needs-review, read-in-part and can't-read never count.
- **Where.** A band at most 112 px tall on top of the Sources home, above the graph. There is no new tab.
  - The state line becomes filters.
  - This narrows the 2026-09-12 "graph at full height" decision by 112 px. That decision's falsifier is about width, which this does not touch.
- **Which date.** The `compiled_at` written in each page. It is already loaded, needs no Git, and works on the web.
  - The chart states its date basis.
  - A date after now or before 2000 counts as "no date".
- **Batch size.** Continue sends the next 10 waiting sources in list order. The local model sends 3. The batch size is one constant.
  - "Waiting" means no wiki page, needs review, or read in part.

## Flow

1. When the person opens Library › Sources in a folder that has at least one source, the band shows:
   - the percent;
   - "{compiled} of {total} sources have a wiki page";
   - the state bar;
   - the date chart;
   - "+N today", when today has any;
   - the Continue press.
2. While hashing, cited files are hashed in chunks of 256 per native call, and the checking segment shrinks after each chunk. A checking source is never counted.
3. When the person presses "no wiki page 760" in the state line, the list is filtered to those rows and the press shows as pressed. "Show all 2,000" restores the full list. The filter combines with the search text.
4. When the person presses "Write wiki pages for the next 10":
   - One request goes to the current agent, naming exactly the first 10 waiting sources in list order.
   - Those rows show the running glyph.
   - "{rest} more wait after these" appears.
   - There is no confirmation step (the 2026-11-18 direction). The agent dock's Stop still works.
5. As pages land, the folder watch reports them in 0.45–0.61 s.
   - Each row's check draws.
   - The percent and the bar move on from their last drawn values.
   - The chart's last step rises, and "+N today" counts up.
6. When the turn ends with 2 of the 10 still without a page:
   - "2 sources from the last request still have no wiki page and moved to the end of the list."
   - For this session those 2 go last.
   - The next press takes the next 10.
7. When a page has no valid `compiled_at`, its source still counts in the percent but is left out of the chart, and "{n} have no date" shows.
   - A file that cannot be opened shows "can't read". It stays in the total and never counts.
8. At 100%, the bar turns success green and one light passes along it once. The press is replaced by "Every source has a wiki page".

## Visual

The band is not a set of cards. At 1040 px and wider it is three cells in one row, at most 112 px tall.

- **Number cell**
  - The percent at `text-display`, `display-tight`, counted up with `useCountUp`.
  - Under it, the sentence at `text-label`.
  - Under that, the state bar: 6 px tall, its segments in list order, with 1 px seams ("Bars are neutral plus one indigo", `docs/DESIGN-SYSTEM.md`).
    - "Has wiki page" is the one accent.
    - Needs review and read in part use the warning amber the rows already use.
    - Checking and can't read use a neutral overlay.
    - No wiki page is the track.
  - The percent is rounded down. A value above 0 and below 1 reads "under 1%". It reads 100% only when every source has a page.
- **Chart cell**
  - A cumulative step line over a soft fill, against a dashed ceiling at today's total, 52 px tall and at most 26rem wide.
  - The y-axis is the share of today's sources.
  - The x-axis is local days from the first dated page to today. It switches to weeks past 90 days and to months past 120 weeks, and never shows more than 120 points.
  - A dot marks today when today has any.
  - The chart is one focusable element. Left and Right move between points and show `progress.point`.
  - Under the chart at `text-caption`, the first point's date at the left and `progress.axisToday` at the right; the date basis is the caption's title and screen-reader text.
- **Action cell.** The Continue press as a filled primary button, with the rest line or the returned line under it. It takes the width the chart leaves, so its lines wrap less.
- **State line.** Each state count in the index carries a 6 px swatch in its bar colour.
- **Narrower widths**
  - From 768 to 1039 px, the chart narrows to no less than 200 px.
  - Below 768 px, the chart is hidden, and the percent, bar and press share one row. The press may wrap.
- **Motion**
  - On first open, per folder per session:
    - the count-up and the bar's `scaleX` run over `--motion-expressive`;
    - the line draws left to right by `clip-path` over `--motion-choreography`.
  - Later changes retarget from the drawn value on `SPRING.surface` and never restart from zero. No frame interval may exceed 50 ms.
  - At 100%, the bar goes green and one light passes once.
  - Under reduced motion, final values appear at once and there is no light.
  - The owner's standing rules: all motion very smooth, no chevron or disclosure UI, no decorative trailing arrows, no coined terms.

## What is sent

- The band sends nothing.
- Continue sends the existing Compile brief, narrowed to:
  - the 10 source paths and their sha256;
  - at most 200 existing pages: those citing the 10 first, then the newest by `compiled_at`, with a count of the ones left out.
- The brief stays at or under 64 KB at 50k pages.
- **Rule g changes.** A source that adds nothing new is added to the `sources:`/`source_hash:` of the page that already holds its facts, and is cited on one of those facts. It is no longer skipped.
- **Rule i changes.** A page may link to any page the agent finds under `wiki/`.
- **Coding-agent route.** The brief goes to the agent on this Mac, and the provider traffic is not recorded by Atlas (`wiki.transfer`, already shown).
- **Local route.** Batches of 3, logged in `.ontology-atlas/llm-audit.jsonl`.

## States

| State | Web | App |
|---|---|---|
| No sources and no pages | existing `emptyTitle` stage, no band | same |
| Wiki pages but no sources | no band | same |
| Checking | checking segment + `stage.read.coveredChecking`; hashed with `crypto.subtle` | native hashing in chunks of 256 |
| 0% | `progress.first`; `progress.webLine` + Get the app button | `progress.first` + `progress.continue` |
| Partial | percent, bar, chart, filters; `progress.webLine` + Get the app button | all of it, plus Continue |
| No agent on this Mac | not applicable | Continue disabled with `stage.blockedNoAgent` and the agent door |
| Batch running | not applicable | running glyph + `progress.batchRest`; Stop in the dock |
| Batch returned short | not applicable | `progress.batchReturned`; those rows go last |
| 100% | `stage.statusReady`, green bar | the same, plus one light pass |
| No Git | identical; nothing reads Git | identical |
| Pages without a date | `progress.undated` | same |
| Unreadable file | `sources.state.unreadable.label` row; kept in the total, never counted | same |
| Brief fails to build | not applicable | existing `wiki.compileFailed` toast |
| 50,000 sources | sequential browser hashing; the checking segment shows until done | criterion 4 |

## Copy

The ko, ja and zh strings live in `messages/<locale>/` once the building slice adds them; this spec keeps the English source.

All keys go in `messages/{en,ko,ja,zh}/library.json`. Keys already in the catalogue are reused, not repeated: `stage.read.covered*`, `stage.statusReady`, `stage.blockedNoAgent`, `wiki.compileWebLimit`, `wiki.transfer`, `wiki.compileFailed`, `sources.state.*.label`.

| Key | en |
|---|---|
| `progress.aria` | Wiki page progress for sources |
| `progress.percent` | {percent, number}% |
| `progress.underOne` | under 1% |
| `progress.first` | No source has a wiki page yet |
| `progress.today` | +{count, number} today |
| `progress.chartAria` | Sources with a wiki page, by the date each page records |
| `progress.point` | {date}: {count, number} of today's {total, number} ({percent, number}%) |
| `progress.dateBasis` | Each point uses the date its wiki page records. |
| `progress.undated` | {count, plural, one {# has no date} other {# have no date}} |
| `progress.axisToday` | Today |
| `progress.continue` | {count, plural, =1 {Write a wiki page for the last source} other {Write wiki pages for the next #}} |
| `progress.batchRest` | {count, number} more wait after these. |
| `progress.batchReturned` | {count, plural, one {# source from the last request still has no wiki page and moved to the end of the list.} other {# sources from the last request still have no wiki page and moved to the end of the list.}} |
| `progress.allDone` | Every source has a wiki page |
| `progress.webLine` | Only the app writes wiki pages. Reading works here. |
| `sources.filterShow` | Show only sources marked "{label}" |
| `sources.filterAll` | Show all {count, number} |
| `sources.state.unreadable.label` | can't read |
| `sources.state.unreadable.hint` | Atlas could not open this file to check it, so it is not counted. Reconnect its disk or check the file's permissions. |

`home.compileNext` is removed from the Sources home strip, because the band's press replaces it. It stays in the reader's status strip.

## Acceptance criteria

1. **Capture.** On a fresh build installed outside `/Applications`, with a real folder of at least 200 sources, some of them with pages, press Continue twice. The recording shows the 10 named rows check off, and the percent, bar and chart move after each batch without a reload.
2. **Count honesty.** Use a fixture with every state, a page without `compiled_at`, and an NFD Hangul citation.
   - The count equals the number of `compiled` rows exactly.
   - The NFD citation counts.
   - A can't-read file does not count.
   - 99.6% reads 99%.
   - Tests: `source-progress.test.ts`, `vault-library.test.ts`.
3. **Dates.** Use pages dated on 3 local days, plus one future-dated page and one undated page.
   - The chart shows 3 cumulative steps and "2 have no date".
   - A 200-day span buckets by week.
   - No series has more than 120 points.
4. **Scale.** Use 50,000 sources and 50,000 pages.
   - Deriving the band takes at most 50 ms (median of 5).
   - Retained heap grows by at most 4 MB.
   - The narrowed brief is at most 64 KB.
   - In the installed app, the band's first frame comes within 1 s of the list's first rows, and the checking count updates at least every 2 s.
   - Report the app's steady and peak footprint.
5. **Bounded request.** Use 37 waiting sources.
   - The brief names exactly the first 10, and "27 more wait after these" shows.
   - When 2 come back without a page, the next press names 10 others and those 2 go last.
   - The local route sends 3.
   - Tests: `compile-brief.test.ts`, `use-compile-batch.test.ts`.
6. **Filter.** Pressing "no wiki page 27" shows exactly those 27 rows, and "Show all 37" restores the list. This works with Hangul search text (`tests/e2e/library/library-source-progress.spec.ts`).
7. **Web.** The same numbers show. In place of Continue, one `text-label` line (`progress.webLine`) and a Get the app button to `/download/`; no disabled press is drawn.
8. **Motion.** In a per-frame recording, no frame interval exceeds 50 ms and no value jumps or restarts. Under reduced motion, only final values appear (`/ui-proof`).

## Risks

1. **10 may be too many for one agent turn.** Run a field trial on 30 mixed sources. If fewer than 8 of 10 land, use 5.
2. **Hashing may dominate at 50k.** Hashes are re-taken on every launch. Time it at 10k and 50k; if 10k takes over 30 s, persist hashes in the derived index next.
3. **"Has a wiki page" may be read as "understood".** The words are checked in the owner's walk.

## Slices (Opus)

- **A: model, scale and copy.**
  - `src/entities/docs-vault/lib/library/source-progress.ts`: new, O(S + C), with tests and a perf test.
  - `vault-library.ts`: NFC citation keys, the `unreadable` state, `compiledAt` per citation.
  - `src/features/library/model/use-library-model.ts`: keep unreadable results for the session; hash in chunks of 256.
  - `scripts/perf/gen-scale-vault.mjs`: a `library` shape.
  - Every new `messages/*/library.json` key.
  - Reviewer required: date bucketing is algorithmic code.
- **B: bounded request.**
  - `src/features/library/lib/wiki/compile-brief.ts`: `selectCompileBatch`, the 200-page list, rules g and i.
  - `src/views/library/lib/compile/use-compile-batch.ts`: new; holds the session-only returned set.
  - `LibraryHomePopovers.tsx`: the compile popover lists the batch.
  - Reviewer required, because this changes what the agent writes.
  - Run `/ontology-field-trial` on 30 sources; this is the risk 1 probe.
- **C: band and filters.**
  - `src/views/library/ui/parts/progress/`: new band and chart.
  - `LibraryPage.tsx`: mount the band and wire `use-compile-batch`.
  - `library-home-strip.ts`: drop the compile clause from the Sources home.
  - `LibrarySection.tsx`: state-line filters and the `unreadable` badge.
  - Any `app/styles/motion-*.css`, with its line in `docs/DESIGN-SYSTEM.md`.
  - `docs/features/library/workspace.md`, and the correction to `docs/ARCHITECTURE.md:540-543`.
  - The e2e spec.
  - Use `/ui-build`, then `/ui-proof` for criterion 8, plus a reviewer design verdict.

Order: A first; then B and C in parallel on A's model API; C merges last.

## Revisions

- 2026-11-19: first draft. "Has a wiki page" is the counted state; reaching the map is left for the wiki–ontology link spec.
- 2026-11-20: design review of #3649. Criterion 7 revised: on the web the band shows one `progress.webLine` line and a Get the app button instead of a disabled Continue that can never run. The chart is capped near 26rem and 52 px and captions its first date and today; state counts carry their bar colour. On a first open the sentence's count moves with the percent, and neither is drawn until the count starts, so "0%" never stands beside "26 of 60".
