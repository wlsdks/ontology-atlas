---
title: The Sources home shows where the pile stands, not a picture
doc_type: spec
status: draft
area: library
date: 2026-11-21
decisions: []
---

# The Sources home shows where the pile stands, not a picture

## Person and moment

Three people open the Library's Sources tab in the installed app, in this order of priority:

| Person | What they are trying to do | What they need from the pane |
|---|---|---|
| Uses a coding agent daily; has let it write wiki pages from a pile of 2,000 to 50,000 files | "Which parts of my pile are done, what did the agent just write, and what goes next?" | Where the waiting files are, by the folders they made; the pages written last; the names of the next files the write button sends |
| Has never used a coding agent; dropped 54 files in | "What happens to these files, and what do I press?" | The same answers in words already on screen: source, wiki page, has a wiki page, needs review |
| Wants an ontology without agents | Reads what exists | The same pane; the web says once that only the app writes pages |

The moment is the return visit. The person opens Sources and reads the pane for five seconds.
Then they press the band's write button, pick a folder to see what waits there, or open a page
or a file.

## Today

- **Observed (the owner, installed app in Korean, 2026-11-21, a generated folder of 20,000
  sources).** Quoted through the English catalogue keys: a disc of white dots labelled
  `graph.islandUnsorted` ("Unsorted") · 20,000, a grey ring, and a strip `graph.islandUnread`
  ("Unread") · 1,000. The key reads `graph.key.island` ("One group is one concept") · Wiki page
  20,000 · Source 20,000 · `graph.key.stale` ("Changed since written"). Pressing the disc shows
  `graph.islandBack` ("All groups") · Unsorted · 20,000 pages · 19,000 sources over about 30
  identical grey lines. The owner, translated: "I can't even tell what this shows, from a
  user's point of view"; of the opened group, "this won't help at all; redo the design from
  scratch, together with the planning"; and later, "is there no different way to represent it?
  It's hard to see, and hard to tell what it stands for."
- **Captured for a fair comparison (web dev server in the app's state through the desktop
  bridge stub, 1920×1080, Korean; captures attached to the pull request).**
  - *A real-looking folder with concepts* (the inspection fixture: 66 sources in 8 folders,
    60 pages, 45 concepts): the flow of columns. 69 citation and 53 mention lines cross between
    page discs and concept rings in two stacks; source squares carry no names; the key reads
    Source 66 · Wiki page 60 · Concept 45 · Citation 69 · Mention 53. Nothing on it says where
    the 19 waiting files are.
  - *No concepts* (generated, 2,000 sources): the owner's picture. One Unsorted disc of 2,000
    dots and an Unread strip of 100.
  - *The picture's best case* (generated `linked`, 2,000 sources and 200 concepts): about 140
    identical islands of ten dots; about 25 carry a name, and a 600-page Unsorted disc sits
    beside them. No island differs from another except by name.
- **Why.** Past 400 marks the home is the islands map
  (`src/widgets/library-graph/model/library-islands-layout.ts:17`), grouping by concept, else
  wiki sub-folder, else Unsorted (`:236`, `:265`); below 400 it is the flow of columns
  (`docs/records/decisions/2026-09-17-library-graph-flow-columns-83bd13ea-c14e-4312-b73e-d00a90d80e76.md`).
  The islands record foresaw the owner's case in its own dissent: "a wiki with no concepts and
  one flat folder is two islands, Unsorted and Unread, which is honest and dull"
  (`docs/records/decisions/2026-09-18-library-islands-map-03d7fbd7-e813-4374-9a3e-2e66ddef6f5b.md`).
- **What the picture ignored.** The generator puts sources in 40 folders of 500
  (`scripts/perf/gen-scale-vault.mjs:166`), and the fixture in 8 named folders. Every source
  row already carries its path, format, size, state, citing pages and the day its page was
  written (`src/entities/docs-vault/lib/library/vault-library.ts:254-265`); every page carries
  its title, sources and `compiled_at` (`:46-62`).
- **The band works.** `SourceProgressBand`
  (`src/views/library/ui/parts/progress/SourceProgressBand.tsx:108`), built by the rooms spec's
  H1, shows the share with a page, a state bar whose presses filter the list, the write button
  and the work line. The home is the band plus `LibraryGraph`
  (`src/views/library/ui/LibraryPage.tsx:722-763`). The write button sends every source that
  needs writing, in list order: no page, changed, or read in part (`sourceNeedsCompile`,
  `vault-library.ts:268`). While it runs the button stays, disabled (`SourceProgressBand.tsx:467`).
- **Colours and numbers today.** The bar has three inks: a page in indigo, "needs review" and
  "read in part" in one amber, checking and unreadable in a 20% white; a source with no page is
  the empty track (`src/views/library/ui/parts/progress/progress-inks.ts:6-13`). The band's
  number is a fraction under ten sources and a percent above (`SourceProgressBand.tsx:76`,
  `:167-174`). The index list shows each unfinished file's state as a word badge
  (`src/views/library/ui/parts/index-column/LibrarySection.tsx:736-762`).
- **Unknown.** How real piles are foldered beyond the fixture; no installed-app capture of the
  50,000-source home.

## What others do

Search engines refused automated queries, so these are the pages fetched directly on
2026-11-21, plus two products described from use and marked so. Ideas only; nothing is copied.

| Reference | What it shows | What works | What fails | What this spec takes |
|---|---|---|---|---|
| Istanbul / nyc HTML coverage report (BSD-3) | A table per directory: name, a bar, the percent, counts | Developers read it in one glance; the bar compares rows on one scale; a row opens the next level | Percent alone hides how many files remain | The breakdown table, with the waiting count beside the share |
| Codecov sunburst (docs.codecov.com/docs/graphs) | Slice size is lines tracked, colour is coverage; click enters a folder | Shows where the bulk is | Area and angle are hard to compare; names need hover | Treemap is the alternative (C), not the choice |
| Linear project graph (linear.app/docs/project-graph) | Scope line, started and completed lines over time | Progress against scope in one chart | Says nothing about which items | The band's chart already does this; the pane adds the items |
| NotebookLM sources (Google help, "Add or discover new sources") | A list of sources with types and limits | A plain list is how people pick what an answer uses | No sense of which sources are covered | Sources stay a list; coverage is the table's job |
| Readwise Reader (from use) | Inbox, Later, Archive: a queue with an order | The next item is always named | No overview of the whole pile | The panel's "Next to write" queue |
| Obsidian graph view (from use) | Every note a dot, every link a line | Delight; local clusters | Past a few hundred notes it is texture; it rarely answers a task | Lines only for recorded facts, and only where few |
| NN/g, "Dashboards: Making Charts and Graphs Easier to Understand" (Laubheimer, 2017) | Length and 2D position carry quantity pre-attentively | | "Circular and area-based graphs are difficult to interpret quickly or accurately" | Bars of one length scale, never area |
| NN/g, "Data Tables: Four Major User Tasks" (Laubheimer, 2022) | Find, compare, view a row, act on rows | Adjacent rows compare without memory load; tables scale in rows | | Rows the person can compare and press |
| Kong, Heer, Agrawala, "Perceptual Guidelines for Creating Rectangular Treemaps" (InfoVis 2010) | Treemaps against bar charts by data density | Treemaps are faster at high density | "At lower data densities bar charts can be easier to read" | A pile has 1 to 100 folders: low density, so bars |

## Problem and alternatives

The picture answers a question the person did not ask, how pages cluster by concept, with
marks they cannot read. It also cannot answer the question they did ask, because **the work
has no concept**: a source with no page names no concept, so any concept grouping puts all the
waiting files in one Unsorted heap. Folders and file types exist from the first file; concepts
exist only after the work. The person's question is the band's one level down: where is the
work, what was just done, which files come next. Directions, judged on the fixture and on the
zero-concept folder:

| Direction | Fixture (66, concepts) | Zero concepts (2,000 / 20,000) | Feasibility | Verdict |
|---|---|---|---|---|
| **A. Breakdown table, recently written pages, and a panel for the picked row** (recommended) | Passes the 5-second test in the mockup: "eight folders, decks is mostly unwritten, the next ten are named" | Same form: 4 or 40 rows at 85% each, which is the true and readable answer | One O(sources) pass over held facts; windowed rows | Chosen |
| B. One ranked queue filling the pane (Readwise-like) | Names the next ten | Ten names say nothing about the other 19,990 | Small | Lost: no "where"; its queue lives on as A's panel |
| C. Coverage treemap (Codecov-like; mocked) | Reads at 8 folders; fill levels sit in boxes of different heights, so they cannot be compared | 40 equal boxes; a flat folder is one box; small folders lose their names | New canvas layout | Lost on the research above and on the flat pile |
| Status quo: flow and islands | Hairball of 122 lines | One disc | Built | Lost; no fix of labels makes concepts the axis of the work |

**From `2026-11-20-library-rooms.md`** this keeps the Sources person-and-moment row, all of H1,
and decisions 3, 4, 6, 7 and 8. It overturns decision 5 (no picture, no key), P1 and P2; the
search-by-meaning lead moves to the Next queue's order, under Later. It overturns 2026-09-12
"The Library's home is the folder's graph" on that record's own falsifier ("cold walkers who
cannot name the next press within 10s of the home") and retires 2026-09-17 flow columns,
2026-09-18 islands map and 2026-09-18 islands bodies. Dissent kept: a picture shows the
source-to-page-to-concept chain at a glance. This spec is wrong if a person who needs "which
page came from this source" finds it neither in Recently written nor in the source reader.
The lead writes the decision record.

## Flow

1. When the person opens Sources on a folder with sources, Atlas shows the band (unchanged);
   under it the left column holds the table and Recently written, the right column the panel.
2. When the sources sit in two or more first-level folders under `sources/`, the table has one
   row per folder; otherwise one per file type. "By folder" and "By file type" switch it.
3. Each row reads: name; Sources; Has a wiki page (a bar with one segment per state, then the
   share); Waiting (what the write button acts on); Latest wiki page. Rows are ordered by
   Waiting, most first, then Sources, then name. Every header is a button that sorts by its
   column, a second press reverses it, and the sorted header shows ↓ or ↑ with `aria-sort`. The
   header row stays put while the rows scroll; rows are 48 px with a rule between them; numbers
   are tabular and right-aligned. Hovering a bar names the split by state.
   - **One share rule, everywhere** (band, rows, panel): a percent, floored, 100% only when every
     source has a page, `progress.underOne` above zero and under 1%. Counts live in their own
     columns, so no cell mixes a fraction with a percent; the band's fraction under ten leaves.
   - **Alike folders share a row.** Five or more folders with the same count in every state, none
     being written, become one row, `alike.row` with `alike.range`; the toolbar says so with
     `alike.meta`. Pressing it picks all of them. The owner's generated folder reads as four rows.
   - **More below.** When rows overflow the table's region, its last line is `more`, never a row
     cut in half.
4. Under the table, Recently written lists the five pages with the latest `compiled_at`, each
   with the source it came from; pressing a row opens that page in the Wiki reader.
5. With nothing picked, the panel is "Next to write". Its first line says what the band's
   button does, in the button's own words (`panel.lead`); then the files it sends next, in its
   order (`ContinueBatch.next`), each with its state as a word; then how many wait after them.
   The panel carries the state words; the index list carries only a dot in the state's colour
   for each waiting file (named in its accessible name and `title`) and nothing for a file with
   a page, with `listKey` beside the list's count.
6. When the person presses a row, Atlas tints it; the panel shows that folder's or type's
   counts, its bar, its first ten waiting files in list order, and how many cannot be read; the
   index list narrows to it with a "Folder: name" chip. A file name opens the source reader.
7. "Show all sources", the chip's ×, the same row again, or Escape clears the pick.
8. When the agent writes a page, the band's work line names the file; the row holding it moves
   one source into Has a wiki page and its bar fills; the file leaves Next to write, the next
   joins at the bottom, and the panel's first line is `panel.leadRunning`; the new page arrives
   at the top of Recently written. Rows keep their order while a batch runs and re-sort, with
   motion, when it ends or when the person presses a header.
9. While the folder is still being read, rows arrive as their files are counted, with a line
   under the table saying how many sources have been counted so far.
10. When a picked folder disappears from disk, Atlas clears the pick and says so once in the
    panel, naming the folder; the band filter stays. When the agent's evidence is missing (a
    page whose source file is gone), the page still lists under Recently written, and its
    source name reads as missing, as the Wiki reader's foot does.

### State colours

One colour per state, the same in the band's bar, the row bars, the legend, the index-list dots
and the panel's words. Ratios are against `--color-canvas` / `--color-panel`; the non-text floor
is 3:1.

| State | Token | Value | Ratio | Fact it carries |
|---|---|---|---|---|
| Has a wiki page | `--color-source-page` → `--color-indigo-accent` | #8fb0ea | 8.97 / 8.54 | Done |
| Read in part | `--color-source-partial` (new hue) | #c4a7f5, hatched | 9.56 / 9.10 | A page covers only the start; hatching tells it from indigo without colour |
| Needs review | `--color-source-review` → `--color-status-warning` | #f4b731 | 10.94 / 10.41 | The file changed since its page |
| Checking | `--color-source-checking` → `--color-status-paused` | #8a8f98 | 6.06 / 5.77 | Not known yet |
| Can't read | `--color-source-unreadable` → `--color-status-danger` | #e5484d | 5.03 / 4.79 | Needs the person (disk, permission) |
| No wiki page | `--color-source-none` (new) | #6e6c66 | 3.75 / 3.57 | Waiting; a drawn segment, no longer the empty track |
| Every source done | `--color-status-success` | #32b97d | 7.85 / 7.47 | The whole bar, once |

Text never wears `--color-source-none`; its word uses `--color-text-tertiary` on a hairline.

## States

| State | Web | macOS app |
|---|---|---|
| No source yet | `LibraryEmptyFolderStage`, unchanged | Same |
| 1 source | One row; the panel lists it under Next, or `panel.nextEmpty`; band "0%" with `progress.first` | Same; the button reads `progress.continue` (=1) and `panel.lead` repeats it |
| Small (66 sources, 8 folders) | Eight rows, five recent pages, ten names; `panel.webNote` | `panel.nextNote` names the button |
| Large (20,000 to 50,000) | Table scrolls in its own region under a fixed header, windowed; `more` when rows are below; alike folders share a row; Recently written keeps five rows | Same |
| One folder, one file type | One row; the switch stays; recent pages and the panel carry the names | Same |
| No concepts yet | Identical to any other state | Same |
| No page yet | Recently written shows `recent.none` | Same |
| Pages, none dated | Recently written shows `recent.empty` | Same |
| Folder still being read | Rows arrive; `reading` under the table | Same |
| Files being checked | Grey checking segment in bars; counts settle in place | Same |
| Agent writing | Out of scope: the web writes no pages (`progress.webLine`) | Writing dot on the row (`writing`) and on the file in Next; `panel.leadRunning`; the band button disabled as today; rows hold their order; new page on top of Recently written |
| A row picked | Tinted row; panel for it; chip `listFolder` in the index list | Same |
| Picked folder gone | `pickGone` once, then All sources | Same |
| Every source has a page | Bars in the success ink once; `panel.nextEmpty` | Same |
| Reduced motion | End values at once; swaps and re-sorts instant; the writing dot has no halo | Same |

## Copy

Keys go in `messages/<locale>/library.json` under `sourcesHome`. The Korean, Japanese and
Chinese strings, in the register of `sources.state.*`, are a ready patch attached to the pull
request; slice S-1 applies it (spec prose stays English, `pnpm docs:language`). Each column
word repeats a word the band or the index list already shows. Reused: `progress.percent`,
`progress.underOne`, `progress.batchRest`, `sources.noFormat`, `sources.state.*.label`.
`progress.fraction` leaves with the band's fraction rule.

| Key | Where | English |
|---|---|---|
| `groupBy.folder` / `.type` | Switch above the table | By folder / By file type |
| `column.folder` / `.type` / `.sources` | Headers | Folder / File type / Sources |
| `column.withPage` / `.waiting` / `.latest` | Headers | Has a wiki page / Waiting / Latest wiki page |
| `topLevel` | Row for files directly in `sources/` | Directly in sources/ |
| `day.today` / `.ago` / `.none` / `.undated` | Latest cell | Today / {count} days ago / None yet / No date |
| `writing` | Title of a row's writing glyph | A wiki page is being written for a source here |
| `recent.title` / `.order` | Heading under the table | Recently written / By the date each wiki page records |
| `recent.from` | Recent row | from {source} / from {source} and {more} more |
| `recent.empty` | Recent body, pages but none dated | No wiki page records a date yet. |
| `recent.none` | Recent body, no page yet | When a wiki page is written, it appears here with the sources it came from. A wiki page sums up sources in Markdown and notes, for each fact, where in a source it came from. |
| `sortBy` | Header button title | Sort by {column} |
| `meta` / `metaType` | Toolbar, right | {folders} folders · {sources} sources / {groups} file types · {sources} sources |
| `alike.row` / `.range` / `.meta` | Alike row; toolbar | {count} folders alike / {first} – {last} / {folders} folders · the {count} with the same counts in every state share one row |
| `more` | Last line of the table | {count} more folders below · scroll to see them |
| `listKey` | Beside the index list's count | Waiting sources |
| `progress.chartLabel` / `.chartNow` | Above the band's chart | Sources with a wiki page · since {date} / Today {count} |
| `progress.continue` (=1, changed) | Band button | Write a wiki page from 1 source (was "for the last source", wrong on a first day) |
| `panel.nextTitle` | Panel label, nothing picked | Next to write |
| `panel.lead` | Panel's first line, app | Press “{action}” and the agent reads the sources below, top first, and writes their wiki pages. |
| `panel.leadRunning` | Same, while a batch runs | The agent is writing wiki pages from the top. A source leaves this list once its page is written. |
| `panel.webNote` | Same, web | Only the app writes wiki pages. In the app, these go first. |
| `panel.waitingTitle` | Panel, a row picked | Waiting here |
| `panel.nextEmpty` | Panel when none wait | Every source here has a wiki page that matches it. |
| `panel.unreadable` | Panel line | {count} sources here can't be read |
| `panel.showInList` / `.clear` | Panel | Show all {count} in the list / Show all sources |
| `listFolder` | Chip in the index list | Folder: {folder} |
| `reading` | Under the table | Still reading the folder: {count} sources so far |
| `pickGone` | Panel, once | {folder} is no longer in sources/. Showing all sources. |

`aria` and `rowAria` name the table and rows for a screen reader. `{action}` is the band
button's rendered label (`progress.continue`); in Korean it always ends in a syllable with no
final consonant, so `nextNote`'s particle is fixed. `graph.*` keys leave in S-3.

## Edge cases

- **Zero, one, largest.** 0 sources keeps the empty stage; 1 is one row. The walk stops at
  50,000 entries (`docs/records/decisions/2026-09-18-vault-walk-ceiling-50k-5f741fdb-5ccf-46e7-8fde-e0cd86cae21a.md`),
  so the worst table is 50,000 one-file folders, windowed.
- **Nested folders.** A row is a first-level folder and counts everything beneath it.
- **Hangul.** Names group by NFC, so an NFD name on disk joins its twin (the generator writes
  some, `gen-scale-vault.mjs:174`). No cell wraps at 1440 or 1920 in Korean; long names cut at
  the end with the full name in `title`.
- **No extension.** Groups under `sources.noFormat`.
- **Dates.** A `compiled_at` after today is not believed, as in the band; undated pages never
  enter Recently written.
- **Moved, renamed or unreadable folder.** Picked: flow 10. Not picked: the row leaves with its
  exit motion. The whole vault folder gone: the existing vault-session state.
- **Two edits at once.** Counts retarget from what is drawn; the pick and scroll hold; row order
  changes only on a header press or when a batch ends, so rows never move under the pointer.
- **A search in the index list.** The table counts the folder, not the search, as the band does.
- **Offline.** Nothing leaves the machine; every number comes from the folder's files.

## Motion

| Transition | Motion | Reduced motion |
|---|---|---|
| First arrival in a session | Visible rows rise 4 px and fade over `--motion-base`, 35 ms stagger; bars and counts count up on the band's clock | End state |
| Progressive arrival | New rows rise in; rows below glide by transform over `--motion-settle`; re-orders at most once per 500 ms, never while a batch runs | Instant |
| A page is written: the row's bar | The page segment grows over the waiting one and the share counts up over `--motion-slow`, retargeting from the drawn width when the next page lands mid-way; at 100% the bar turns the success ink once | End state at once |
| Writing dot | The halo breathes 1.0 → 1.8 → 1.0 over 1,600 ms only while the agent writes; listed in `tests/contract/motion/infinite-motion.contract.test.ts` | Dot, no halo |
| Re-sort (a header press, or a batch ends) | Rows glide to their new places by transform over `--motion-settle` (FLIP); a moving row is opaque and the one moving up draws on top | New order at once |
| A page is written | Its Next row fades and collapses on the exit ease over `--motion-settle`; the new last row fades in; the page enters Recently written from 4 px above with a one-time accent wash that fades over `--motion-choreography` | Instant, no wash |
| Pick or clear | Tint over `--motion-fast`; panel content swaps with `useSurfaceSwap` and its height follows with `useSwapHeight` over `--motion-settle` | Instant |
| Group switch | Table body cross-fades over `--motion-base`; scroll returns to the top | Instant |

## Out of scope

- **A concept view.** The work has no concept; a concept view belongs to the Ontology tab
  (Later 2).
- **Writing one folder next.** It changes what the write button sends (Later 1).
- **Search by meaning here.** Vectors may only order the queue, after W1 proves the gain.
- **The index list's design and the band.** Rooms slices I1 and H1.
- **What an agent may write.** Unchanged.

## Acceptance criteria

1. **Five-second test.** Given the app's state at 1920×1080 dark on the fixture (66 sources)
   and on a generated 20,000-source folder (`node scripts/perf/gen-scale-vault.mjs <dir> 20000
   library`), three cold readers (one who has never used a coding agent) each name, within five
   seconds, what the pane shows and what they would press; the same readers on today's build
   are the control. Transcripts and captures in the pull request.
2. **Grouping is exact.** Rows in nested folders with NFD and NFC Hangul names group one row
   per first-level folder; state counts sum to `deriveSourceProgress`'s `byState`; 50,000 rows
   group in under 30 ms of CPU time (`process.cpuUsage`)
   (`src/widgets/library-sources-overview/model/group-sources.test.ts`).
3. **The queue and the recent list are true.** Next to write equals `ContinueBatch.next` in
   order and advances by one when a file gets its page; rows sort by Waiting, then Sources, then
   name, and five alike folders share one row; Recently written lists the five latest
   believed `compiled_at` pages, newest first, and no undated page
   (`src/widgets/library-sources-overview/ui/SourcesOverview.test.tsx`).
4. **Pick and recover.** Given 54 sources in five folders, a row press shows its files and the
   list chip; Escape restores both; renaming the folder on disk shows `pickGone` once and no
   stale count (`tests/e2e/library/sources-home.spec.ts`).
5. **O(visible).** Given 50,000 one-file folders, at most 60 row elements exist while scrolled
   end to end, and `pnpm perf:app-open -- --files=50000 --shape=library --walk=library` shows no
   frame gap over 50 ms on the Sources home.
6. **Smooth.** Recorded in the app's state: arrival, a page written, a pick; no frame interval
   over 50 ms, no value jump; reduced motion draws end states (`pnpm ui:look` frames attached).
7. **No picture, no overflow, one colour per state.** No `canvas` on the Sources home and no
   element with `scrollWidth > clientWidth`, English and Korean, 1440×900 and 1920×1080, web and
   app; each state's segment, dot and word share one token, and every `--color-source-*` ink
   reaches 3:1 on canvas and panel (`sources-home.spec.ts`, `tests/contract/design-tokens/contrast.contract.test.ts`).
8. **The web says it once.** The web shows the table, `panel.webNote` and the band's web line,
   and no write control (`tests/e2e/web-surface-smoke.spec.ts`).

## Slices

| Slice | What | Files | Order |
|---|---|---|---|
| S-1 | The widget: grouping and sorting model, table, Recently written, panel, copy in four locales; the state tokens and the band's inks, share rule and chart label; criteria 2, 3 | New `src/widgets/library-sources-overview/**`; `messages/*/library.json` (`sourcesHome`, `progress`); `app/styles/tokens.css`, `docs/DESIGN-SYSTEM.md`, `cn.ts`; `parts/progress/progress-inks.ts`, `SourceProgressBand.tsx` | Now, parallel with S3: none of its files |
| S-2 | Mount it in place of `LibraryGraph`, the list chip and the index list's state dots, drop `cardFacts`; criteria 1, 4-8 | `LibraryPage.tsx:722-763`, `use-library-graph-cards.ts`, `use-source-filter.ts`, `parts/index-column/LibrarySection.tsx` | After S3 (it owns `LibraryPage.tsx` and `use-library-graph-cards.ts`) |
| S-3 | Retire `src/widgets/library-graph/**`, `tests/e2e/library/graph/**`, `graph.*` keys and the Library graph ink tokens; update `docs/features/library/workspace.md`; decision record | Those paths | After S-2 |

S-1 reads source rows, `LibraryWikiPage` (title, sources, `compiled_at`) and `ContinueBatch`.
S3's plan keeps these as facts and drops only page text (performance strategy, "Library page
text").

## Risks

1. **It reads as a spreadsheet and the owner calls it dull.** Answer: the mockups go to the owner
   before S-1; the craft is in the bar motion, the type, and Recently written arriving live; a
   picture returns only where it passes criterion 1 (Later 2).
2. **Real piles are flat, so the table is one row.** Answer: file type is the fallback, and
   Recently written and the panel carry names. Probe before S-2: count first-level folders and
   types in three real piles the owner names.
3. **Live counts at 50,000 cost a frame.** Answer: one O(n) pass behind the band's memo, held to
   criterion 2's budget; re-orders at most once per 500 ms.

## Later

1. **Write this folder next.** The picked row's panel offers the write button for that folder;
   next once criterion 1 shows people pick folders to set priorities.
2. **Concept coverage in the Ontology tab.** Per concept, the pages that describe it and the
   sources behind them, drawn as lines only where `describes:` records them; next when most
   folders have concepts.
3. **Next by meaning.** The queue ordered by similarity to what is already written, labelled;
   next after W1 proves search by meaning helps.
4. **Nested folders.** A picked folder's panel breaks into its sub-folders; next when real piles
   nest deeper than one level.

## Owner question

None. The table is chosen over the treemap on the research and the flat pile; both mockups go
with the pull request, so the owner can reverse this by choosing the treemap.

## Revisions

- 2026-11-21: first draft, after the owner rejected the islands picture and the opened group.
- 2026-11-21: after the owner asked for a different form and for research: a "What others do"
  section; captures of today's picture on a folder with concepts, on zero concepts and at its
  best case; one Waiting column instead of two, because the write button acts on three states;
  "Next to write" instead of "Next to get a wiki page", for the same reason; Recently written
  added, so the return visit sees what was just written and a small pile does not leave the
  pane empty; the panel takes its content's height.
- 2026-11-21: the owner asked for the lead's recommendation and further design improvement; v2 mockups
- 2026-11-21: v2 of A: one colour per state (read in part leaves amber for a hatched lilac; no
  page becomes a drawn grey segment); one share rule, a floored percent; rows sorted by Waiting
  with sortable headers, a fixed header, a `more` line and alike folders in one row; the
  panel's first line says what the button does; the chart gets a label; the panel carries
  state words and the index list a dot; a 1-source first day; motion for the bar fill, the
  writing dot and the re-sort; rows hold their order while a batch runs.
- 2026-11-21: the owner reviewed the v2 mockups and asked for this direction to be built ("이대로 만들어줘"). Two fixes go into S-1: the first-day row names the real folder instead of "sources/ 바로 안", and the first-day empty space explains what a wiki page is.
