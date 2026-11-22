---
title: The Library's left column is the wiki's index, and one design on every tab
doc_type: spec
status: draft
area: library
date: 2026-11-21
decisions: []
---

# The Library's left column is the wiki's index, and one design on every tab

## Person and moment

The owner asked for the Library to fit the LLM wiki pattern
([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), April 2026), and
delegated the design and its order of building. In that pattern a person adds sources, an agent
writes and maintains the wiki, and the person reads it and asks questions. The left column is
where they find their way, in this order of priority:

| Person | Moment | What the column must answer in five seconds |
|---|---|---|
| Uses a coding agent daily; the agent has written 60 to 20,000 pages | Opens Wiki after a batch: "what is in my wiki now, what needs me, what just changed?" | The groups of pages and their sizes; the pages that need a look and why; where the log is |
| Never used a coding agent; 12 sources, no page yet | "What will appear here, and what do I press?" | What the column will hold, and the one press that starts it |
| Wants an ontology without agents | Reads and writes pages by hand | The same index; New page in the same place |

## Today

- **The owner, on the Wiki tab** (translated): "Personally, I'm not happy with this left panel's
  design either." From top to bottom they saw the search field `search.placeholder`, two
  full-width outlined buttons `wiki.lint` and `wiki.compile`, the row `report.open` ("Check
  results 28"), the line `shelf.commonState` reading "14 · `shelf.state.stale` ·
  `wiki.offTemplate`" ("off-template"), then one outlined card per page.
- **Captured** (web dev server in the app's state through the desktop-bridge stub, 1920×1080,
  Korean, the inspection fixture of 66 sources and 60 pages; PNGs on the pull request). The
  stub found no agent, so `AgentMissingNotice` stood in place of the two buttons, the row read
  "Check results 3" and the line "49 · `shelf.state.fresh`". The 22 rendered cards came in four
  heights, 42, 60, 62 and 80 px, which the forbidden rule `content-decided-card-height` bans
  (`.claude/rules/forbidden.md:24`). The cause is `line-clamp-2` titles plus an optional caption
  (`src/views/library/ui/parts/index-column/LibraryShelf.tsx:237`, `:251`).
- **Where the parts come from.** The buttons are the `SectionActions` grid
  (`LibrarySection.tsx:134`, `:995`, `:1008`); the report row is at `:1068`; the shelf at
  `:1201`; the folded line folds the majority caption past 12 pages (`LibraryShelf.tsx:24`,
  `:77`, `:128`). The ingest button already sits in the Sources band (`progress.continue`,
  "Write wiki pages for the next #").
- **The three columns share nothing.** Sources: a two-column grid of three outlined buttons over
  a list with word badges. Wiki: two buttons, a row, a line and cards. Ontology
  (`src/views/docs-vault/ui/parts/sidebar/DocsSidebarBody.tsx`): an icon tool row, group labels such as
  "Needs a decision · 10" (`ReviewQueueSection.tsx`), and borderless two-line rows whose reasons
  wrap to a third line.
- **The fixture's summaries.** All 60 `summary:` values follow one of three fixed sentences
  ("What X commits to, in numbers and conditions.", its Korean twin, "An answer filed from the
  conversation…"). The fixture's generator wrote them; agent-written summaries in real folders
  are unknown.

## How Atlas already models the pattern

| Pattern | Atlas today | Gap |
|---|---|---|
| Raw sources, immutable | `sources/**`, never read as a page (`docs/ONTOLOGY-ATLAS-SPEC.md` §11) | None |
| Wiki pages | `wiki/**.md` with no `kind:`; `title`, `summary`, `sources`, `compiled_at`, `status`, `created_by`, `describes` (§11.1, lines 795-810) | No page type field |
| Entity and concept pages | `kind:` nodes in the Ontology tab, linked by `describes:`; people and organisations stay in the wiki (`wiki.candidateKind`) | Ingest never writes them: the compile brief says "Write ONE page for this source" (`src/features/library/lib/wiki/compile/compile-brief-rules.ts:29`) |
| Comparisons, syntheses | Pages citing several sources: 5 of 60 in the fixture (`carrier-terms-compared`, `money-timelines`, …) | Written only when a person or a later batch does |
| Filed-back answers | `wiki/answers/**`, which ingest must not touch (`src/features/library/lib/wiki/compile/compile-brief-rules.ts:32`); 3 in the fixture | None |
| `index.md` | No file; the app derives the index from frontmatter | The column is the index |
| `log.md` | `wiki/_log.md`, gist's own line shape `## [date] op \| …`; kinds `compile`, `lint`, `fix` (`src/features/library/lib/wiki/wiki-log.ts:12`, `:33`). Spec §11.4 line 921 still names only compile and lint | Queries are not logged; the model keeps only the last compile and lint (`src/features/library/model/use-library-model.ts:45`) |
| Ingest | Band button `progress.continue` on Sources | None |
| Query | The question desk (rooms W1) and Save to wiki (`wiki.fileAnswer`) | None |
| Lint | Check wiki (agent: disagreement, superseded, missing link, name without a page) plus app checks (`report.rule.*`, orphan page among them) | Data gaps and suggested questions (Later) |

**Page type without a schema change.** Groups come from facts that exist: the folder, the count
of `sources:`, and the `wiki/answers/` convention. A `type:` key would be a public vault
contract change and is not proposed here (Later 3). **The Sources table spec needs no change**
for the pattern: its rows are ingest coverage and Recently written is the log's ingest slice.
One link is added, Recently written's heading opens the Log (slice I-3).

## What others do

Described from use, not fetched today; the gist was fetched on 2026-11-21. Ideas only.

| Reference | What it does | What this spec takes |
|---|---|---|
| The gist's `index.md` | One catalogue entry per page: link, one-line summary, optional date and source count, grouped by category; replaced by search past ~100 sources or hundreds of pages | Groups by what a page is; date and source count on every row; caps above 200 pages, where search leads |
| The gist's `log.md` | Append-only timeline of ingests, queries and lint passes | A Log view, read from `wiki/_log.md` and `wiki/answers/` |
| Linear sidebar | Fixed views above the lists, counts right-aligned and quiet, no boxes, one row height | View rows above the groups; counts on the right |
| Notion sidebar | One-line page rows, "+" to add | "+" in the tool row. Refused: nested toggles |
| Obsidian file explorer | Folder tree; a small icon toolbar above | The tool row. Refused: the folder as the only axis (57 of 60 fixture pages sit in one folder) |
| Readwise Reader | Views on the left; two-line rows, title over where it came from and when | Two-line rows: title, then provenance and date |
| GitHub file tree | Filter field on top, one height, cut names with the full name on hover | Same |
| VS Code explorer | A coloured mark on a file with a problem; the words live in the Problems panel | A dot on the row, the words in Check results, the rule the Sources spec already set |

## Problem and alternatives

The column mixes three jobs (actions, a status line, a catalogue) and does none well: the two
buttons duplicate the band and the page header's job (rooms decision 2,
`docs/specs/2026-11-20-library-rooms.md:59`); the status line speaks coined words about 14 of 60
pages without naming them; the cards are a list of identical shapes that tell neither what a
page is nor where it came from. The person's question is the gist's `index.md`: what is here,
by kind, and what needs me.

| Direction | 60 pages | 20,000 pages | Verdict |
|---|---|---|---|
| **A. The index** (recommended): a tool row, two view rows (Log, Check results), then groups by what a page is with "Needs a look" first; rows of one height; actions leave | Reads as a catalogue: 9 to look at, 3 answers, 5 syntheses, 52 summaries (mockup) | Every group shows its five newest and a count; search leads | Chosen |
| B. A worklist: only pages needing a look and the latest, everything else through search | Short | Short | Lost: no catalogue, so "what is in my wiki" has no answer; the Ontology tab is already the worklist |
| C. The folder tree (Obsidian, VS Code) | One flat folder of 57 and `answers/` | One folder of 19,800 | Lost: the wiki's folders carry no meaning today |
| Status quo: buttons, line, shelf | Four card heights, coined words | Same, windowed | Lost |

## Flow

One anatomy on every tab, 280 px wide (`--docs-list-width`): a **tool row** (the filter field
and a "+" button, both 32 px), **view rows** where a tab has views, a hairline, then **groups**:
a heading with its label left and its count right, rows of one height, and a "Show all" line
when capped. No borders around rows, no toggles. A row carries a 6 px dot only when it needs a
person; the words for why live in the row's second line inside "Needs a look" and in the right
pane.

1. When the person opens Wiki, Atlas shows the tool row ("+" is `wiki.newPage`, opening today's
   centred dialog), the view rows `wikiIndex.views.log` and `report.title`, then the groups.
2. **Groups, in order:** `group.attention` (pages with a finding); `group.answers`
   (`wiki/answers/**`); one group per other first-level folder under `wiki/`, named
   `<folder>/`, A to Z; then, for pages at the top of `wiki/`, `group.several` (2 or more
   `sources:`), `group.one` (exactly 1) and `group.none` (0). A page outside "Needs a look"
   appears in exactly one group; a page with a finding also stays in its own group with its
   dot. Empty groups are not drawn.
3. **A row is 44 px, two lines.** Line 1: the title, cut at the end. Line 2: where it came from
   (the one source's file name, `row.sources`, or `row.noSource`) and, on the right, the date
   from `compiled_at` (`day.now` under 5 minutes, `day.today`, `day.yesterday`, `day.ago` under
   7 days, else a short date; nothing when undated or in the future). In "Needs a look", line 2
   is the first reason, `row.moreReasons` when there are more. The row's `title` and accessible
   name carry the title, the summary, the provenance and the date.
4. **Reasons, most serious first:** `reason.disagreement`, `reason.superseded` (from the latest
   Check wiki), `reason.stale` (a hash the page recorded differs from the file) or else
   `reason.unhashed` (the page recorded no hash, so no cause is claimed), neither for a saved
   answer under `wiki/answers/`, then the page's own app-check
   codes in `report.rule.*` wording (`uncited-fact` first, then the format codes, the citation
   codes and `dangling-wikilink`), then `reason.missingLink`. Advisory codes (`orphan-page`,
   `shared-source-unlinked`) stay in Check results only.
5. **Order inside a group:** newest `compiled_at` first, then title (NFC, locale order).
6. **Caps.** With 200 pages or fewer every row is listed, windowed. Above 200, each group shows
   its five first rows. "Needs a look" ends with `attentionAll`, which opens Check results;
   every other group ends with `showAll`. That press shows the group alone under a chip
   (label and count) whose × reads `groupClear`; the chip's ×, Escape or the same press
   restores the index at the scroll it had.
7. **A press on a row** opens the page in the reader, as today. **Log** opens the Log view in the
   right pane (slice I-3). **Check results** opens the report, whose head now holds the Check
   wiki button (`wiki.lint`), its disabled reasons and `AgentMissingNotice`.
8. **Typing in the filter** replaces the groups with today's ranked list of matches, drawn with
   the same rows; clearing the field restores the groups and the scroll.
9. **While the agent writes**, a new page enters the top of its group; rows already on screen
   keep their places and the group count counts up. The Log row's date reads `day.now`.
10. **When the evidence is missing or wrong**: a page whose source file is gone keeps its row,
    and its reason reads `report.rule.citation-target-missing`. When the open page's file
    disappears, Atlas clears the selection and a toast says `pageGone` once. A finding
    from a Check that is no longer held after reopening (`report.gone`) is simply absent; the
    app checks come back by themselves.
11. **Sources (I-4)** uses the same anatomy: the tool row's "+" is `sourcesIndex.add`, opening a
    centred dialog of the three ways in (`sources.add`, `sources.find`, `sources.import`, each
    with its existing tooltip as its description, over `sourcesIndex.addBody`); the approved
    `listKey` line; groups by first-level folder in path order (files directly in `sources/`
    under `sources/`); 32 px one-line rows with the state dot only for waiting files. Above 200
    sources a group lists its waiting files first and caps at five.
12. **Ontology (I-5)** keeps its tools and tree and takes the shared heading (label left, count
    right), 32 px tool controls and 44 px two-line rows whose reason is cut to one line.

## States

| State | Web | macOS app |
|---|---|---|
| No page, sources exist (first day) | `empty.title`, `empty.body`, `empty.toSources` (switches to Sources); views read `views.logNone` and `views.checkNever` | Same |
| No page, no source | `empty.title` and `empty.body`; the press reads `sources.add` and opens the add dialog | Same |
| 1 page | One group, one row | Same |
| 60 pages (fixture) | Every group in full, windowed | Same |
| 20,000 pages | Five rows a group, `showAll` / `attentionAll`; at most 60 row elements | Same |
| A group shown alone | Chip with count and ×; Escape restores | Same |
| Pages still being read | Groups fill as facts arrive; `reading` under the last group | Same |
| Filter typed | Ranked list as today, same rows | Same |
| Agent writing | Out of scope: the web writes no pages | New page enters its group's top with the arrival wash; Log row `day.now` |
| Check running / new results | `report.running` glyph on the Check results row; then the unseen dot | Same |
| No agent | Check wiki in the report head is disabled with `stage.blockedWeb` | `AgentMissingNotice` in the report head |
| Open page deleted | `pageGone` once; selection cleared | Same |
| Reduced motion | End state at once; no wash | Same |

## Copy

New keys sit in `messages/<locale>/library.json` under `wikiIndex`, `wikiLog` and
`sourcesIndex`. The Korean, Japanese and Chinese strings are a ready patch on the pull request
(`library-index-column-catalogue.patch`); slice I-1 applies it. Reused unchanged: `wiki.newPage`,
`report.title`, `report.running`, `report.unseen`, `report.rule.*`, `sources.add`,
`sources.find`, `sources.import` and their tooltips, `search.placeholder`.

| Key | Where | English |
|---|---|---|
| `wikiIndex.views.log` / `.logNone` / `.checkNever` | View rows | Log / Nothing yet / Not run yet |
| `wikiIndex.group.attention` / `.answers` | Group headings | Needs a look / Saved answers |
| `wikiIndex.group.several` / `.one` / `.none` | Group headings | From several sources / From one source / Lists no source |
| `wikiIndex.row.sources` / `.noSource` / `.moreReasons` | Row line 2 | {count} sources / No source / {reason} +{count} more |
| `wikiIndex.reason.disagreement` / `.superseded` | Row line 2 | Disagrees with another page / A newer source says otherwise |
| `wikiIndex.reason.stale` / `.unhashed` / `.missingLink` | Row line 2 | The source changed after this was written / Can't tell whether the source changed / Should link to a related page |
| `wikiIndex.day.now` / `.today` / `.yesterday` / `.ago` | Row date | Just now / Today / Yesterday / {count} days ago |
| `wikiIndex.showAll` / `.attentionAll` / `.groupClear` | Cap line; chip × | Show all {count} / All {count} in Check results / Show the whole index |
| `wikiIndex.empty.title` / `.body` | First day | No wiki pages yet / When the agent writes wiki pages from your sources, they gather here: one page per source, pages that bring several sources together, and the answers you save. |
| `wikiIndex.empty.toSources` | First day press | Write wiki pages from Sources |
| `wikiIndex.reading` / `.pageGone` | Under the groups; right pane | Reading wiki pages · {count} so far / {title} is no longer in wiki/. Showing the index. |
| `wikiLog.title` / `.lede` / `.meta` | Log head | Log / What happened to this wiki, newest first: pages written from sources, checks, fixes and saved answers. / Read from wiki/_log.md and wiki/answers/ · {count} entries |
| `wikiLog.kind.compile` / `.lint` / `.fix` / `.answer` | Log row | Wrote pages / Checked / Fixed / Saved an answer |
| `wikiLog.compiled` / `.noChange` / `.answer` | Log row body | {sources} sources read · {created} new · {revised} revised / {sources} sources read · no page changed / Saved to the wiki: {title} |
| `wikiLog.byRound` / `.pageGone` | Log row | Scheduled check “{name}” / {name} (no longer in wiki/) |
| `wikiLog.empty` / `.unreadable` | Log body | Nothing has happened in this wiki yet. Writing pages from sources, checking the wiki and saving an answer each add a line here. / wiki/_log.md could not be read, so only saved answers are listed. Check the file's permissions; this list updates when it can be read. |
| `sourcesIndex.add` / `.addBody` | "+" on Sources; dialog | Add sources / Sources stay as they are. Atlas reads them, and the agent writes wiki pages from them. |
| `wiki.findingKind.superseded`, `wiki.logCount.superseded` (changed in I-2) | Report, log | newer source differs; newer source differs {count} (was "superseded claim") |
| `report.structuralHead` (changed in I-2) | Report head | … · {offTemplate} not following the template · … (was "off-template") |

The changed keys alter copy the mounted report already shows, so they change with the mount in
I-2; until then "off-template" still ships. `wiki.offTemplate`, `shelf.*` and `wiki.folderMark`
leave once nothing reads them (I-2).

## Edge cases

- **Zero, one, largest.** 0 pages is the first-day state; 1 page is one row. The walk stops at
  50,000 entries, so the worst index is about 50,000 pages, windowed under the caps.
- **Hangul.** Titles group and sort by NFC; a long Korean title cuts at one line in 1440 and
  1920 with no overflow; reasons are written to fit 236 px of line 2.
- **Folders.** A page deeper than `wiki/<folder>/` belongs to its first-level folder. Files whose
  name starts with `_` are furniture and never listed (§11.4).
- **Dates.** A `compiled_at` in the future or unparsable shows no date and sorts after dated pages.
- **Moved, renamed or unreadable.** A renamed page moves group on the next walk; an unreadable
  page lists by title with `report.rule.missing-field` when its frontmatter cannot be parsed.
- **Two edits at once.** Counts retarget from what is drawn; rows on screen never reorder under
  the pointer; a group shown alone keeps its scroll.
- **Offline.** Every fact comes from files in the folder; nothing leaves the machine.

## Motion

| Transition | Motion | Reduced motion |
|---|---|---|
| First arrival | Groups rise 4 px and fade over `--motion-base`, 35 ms stagger | End state |
| A page written | Enters its group's top from 4 px above with an accent wash fading over `--motion-choreography`; rows below glide by transform over `--motion-settle`; the count counts up | Instant, no wash |
| Show all / restore | List cross-fades: in over `--motion-base`, out on the exit curve within one exit window, the leaving list inert; the chip rises from the heading's place | Instant |
| Check results arrive late | The first draw waits for the first check results; rows that later move glide over `--motion-settle` from where they were drawn, rows new to the data fade in where they land, and a focused row pushed out of a group's five hands focus to its page elsewhere or to its group's line | Instant moves; focus kept |
| Row pick | Tint over `--motion-fast` | Instant |
| Filter typed | Groups cross-fade to the ranked list over `--motion-fast` | Instant |

## Out of scope

- **Writing entity and concept pages on ingest.** It changes what an agent may write (Later 1).
- **A page type in frontmatter.** A public vault contract (Later 3).
- **Logging queries in `wiki/_log.md`.** It changes the furniture contract in §11.4 (Later 2).
- **The reader, the question desk and the Sources table.** Rooms W1, W2 and the Sources spec.
- **The Ontology tab's tree and tools.** I-5 aligns metrics only.

## Acceptance criteria

1. **Groups are exact.** Given pages under `wiki/answers/`, `wiki/meetings/` and the top of
   `wiki/` with 0, 1 and 3 sources, and NFD and NFC Hangul titles, the groups, their order, the
   rows' order and the reasons' order match flow 2-5 (`src/views/library/lib/wiki/wiki-index.test.ts`);
   50,000 pages, all citing one shared source, group in under 100 ms of CPU time
   (`process.cpuUsage`), five times the measured cost, and a re-sweep of rebuilt but unchanged
   facts costs under half of that (`src/views/library/lib/wiki/wiki-index.perf.test.ts`).
2. **One height, no overflow, no coined words.** Every row in the Wiki column is 44 px and every
   Sources row 32 px, in English and Korean at 1440×900 and 1920×1080, web and app state; no
   element has `scrollWidth > clientWidth`; the column renders no `wiki.offTemplate` or
   `shelf.*` string (`tests/e2e/library/wiki/wiki-index.spec.ts`).
3. **Actions left the column.** No `library-lint` or `library-compile` control inside
   `library-index`; Check wiki is in the report head; the ingest button exists only in the band
   (`wiki-index.spec.ts`).
4. **Caps and recovery.** Given 20,000 pages, at most 60 row elements exist while scrolled end
   to end; each group shows five rows; `showAll` shows one group under a chip, and Escape
   returns to the index at the same scroll; deleting the open page's file shows `pageGone` once
   and clears the selection (`wiki-index.spec.ts`).
5. **The Log is true.** Entries from a `wiki/_log.md` with compile, lint and fix lines and one
   malformed line, plus three answers, list newest first; the malformed line is skipped; an
   unreadable log shows `wikiLog.unreadable` and the answers
   (`src/views/library/lib/wiki/wiki-log-view.test.ts`).
6. **Five-second test.** On the fixture at 1920×1080 dark in the app's state, three cold readers
   (one has never used a coding agent) each say within five seconds what the column holds and
   where the pages needing a look are; today's build is the control. Transcripts and captures
   on the pull request.
7. **Smooth.** Recorded in the app's state: arrival, a page written during a batch, Show all and
   back; no frame interval over 50 ms, no row moving under the pointer; reduced motion draws end
   states (`pnpm ui:look` frames on the pull request).
8. **One design.** The three columns' tool rows, headings and rows share `IndexRow` and
   `IndexGroup`, measured equal in height, inset and type at 1920 in the DOM through
   `pnpm ui:look` (I-1 measures the parts alone; each later slice adds its tab's capture).

## Slices

| Slice | What | Files | Order |
|---|---|---|---|
| I-1 | Grouping model with reasons and caps; `IndexRow`, `IndexGroup`, `WikiIndex` (reads `LibraryUiModel`, takes agent findings as a prop); catalogue patch; criteria 1, 8 (part) | New `src/views/library/lib/wiki/wiki-index.ts`, new files in `src/views/library/ui/parts/index-column/`; `messages/*/library.json` (`wikiIndex`, `wikiLog`, `sourcesIndex`) | Now, parallel with S3 and S-1: new files; the catalogue edits are distinct keys |
| I-2 | Mount `WikiIndex` in the Wiki half; remove its `SectionActions`, the report row and `LibraryShelf`; view rows; Check wiki and `AgentMissingNotice` into the report head; New page into "+"; the changed copy keys; criteria 2-4, 6, 7 | `LibrarySection.tsx` (Wiki half), `LibraryShelf.tsx` (delete), `LibraryIndexColumn.tsx`, `check-report/LibraryCheckReport.tsx`, `messages/*/library.json` (the changed keys) | After S-2, which edits `LibrarySection.tsx` |
| I-3 | Log view: the model keeps every log entry; selection kind `log`; Recently written's heading opens it; criterion 5 | `src/features/library/model/use-library-model.ts`, `library-selection.ts`, `LibraryPage.tsx`, `LibraryDocumentColumn.tsx`, new `parts/wiki/LibraryWikiLog.tsx`, `src/widgets/library-sources-overview/**` (heading link) | After S3 (owns the model and `LibraryPage.tsx`) and S-1 |
| I-4 | Sources half on `IndexRow`: tool row, add dialog, folder groups | `LibrarySection.tsx` (Sources half), new `parts/index-column/AddSourcesDialog.tsx` | After I-2 |
| I-5 | Ontology column on the shared metrics; headings split label and count | `src/views/docs-vault/ui/parts/sidebar/DocsSidebarBody.tsx`, `ReviewQueueSection.tsx`, `messages/*/vaultWidgets.json` (`review.*Header`) | After I-1; parallel with I-2 |

## Risks

1. **Grouping by source count reads as arbitrary.** Answer: criterion 6 names it; the person's own
   sub-folders become groups first, so a wiki the agent files into `entities/` and `concepts/`
   gets the gist's categories without a schema change; probe three real folders for sub-folders
   before I-2.
2. **Provenance on line 2 is less useful than a real summary.** It was chosen because all 60
   fixture summaries are boilerplate. Probe before I-2: in three folders an agent wrote, count
   summaries that only restate the title; if fewer than half do, line 2 becomes the summary and
   the provenance moves to the hover.
3. **Check wiki out of the column makes the lint hard to find.** Answer: the Check results row
   stays with its running glyph and unseen dot, and "Needs a look" names findings; criterion 6
   asks the readers where to start a check, and a failure puts the button back on the row's right.

## Later

1. **Ingest updates entity and concept pages** (the gist's "10-15 pages per source"): a change of
   what an agent may write; next when "Mentioned but has no page" findings exceed one per ten
   pages in real folders.
2. **Queries in the log**: a `query` line kind in `wiki/_log.md`; next when people ask for
   unsaved questions in the Log.
3. **A `type:` key** (summary, entity, concept, comparison, overview, answer): next if sub-folders
   do not carry the categories (Risk 1).
4. **Data gaps and suggested questions in Check results**: next after the Log ships.
5. **Better summaries**: the compile brief asks for the page's main finding; then line 2 shows it.

## Owner question

None. The owner delegated the call; the reversal is to restore the shelf, which I-2 deletes in
one commit.

## Revisions

- 2026-11-21: first draft, after the owner's comment on the Wiki tab's left panel and the
  request to fit the LLM wiki pattern.
- 2026-11-21: I-1 landed ahead of its mount. Until I-2 mounts the column in `LibrarySection.tsx`, nothing at runtime imports `src/views/library/ui/parts/index-column/WikiIndex.tsx`, `src/views/library/ui/parts/index-column/IndexGroup.tsx` or `src/views/library/ui/parts/index-column/IndexRow.tsx`; their dead-code exceptions name this spec and go with I-2.
- 2026-11-21: I-1 after review. Staleness no longer counts a missing hash or a saved answer as a
  changed source (`reason.unhashed` names the first, answers get neither); `group.none` reads
  "Lists no source". Criterion 1 takes the 100 ms bound the repository's five-times headroom rule
  gives the measured cost and names the perf test; criterion 8 names the DOM measurement, as no
  `IndexRow.test.tsx` exists. The changed copy keys move to I-2, which mounts the report they
  change. Motion gains the late check-results row, drawn by the new
  `src/views/library/ui/parts/index-column/index-motion.ts`, which joins the unmounted files and
  their dead-code exceptions until I-2.
- 2026-11-21: I-2 mounts the index. Decisions the flow left open: view rows are 32 px and page
  rows 44 px; the tool row is 32 px on both halves, so the Sources search field grows from 28 px;
  the Log row shows its date but opens nothing until I-3, as `wiki/_log.md` read as a page drew
  each line as a heading; `pageGone` is a toast, since the right pane has nothing open to say it
  in; on the web the report head keeps the reason it already gave (`stage.blockedWeb`), and
  `wiki.compileWebLimit` leaves with `shelf.*`, `wiki.offTemplate*`, `wiki.folderMark` and the
  other keys only the old column read. With every source written, the band says all done and the
  guide's Compile step is the one press that rechecks an outdated page.
- 2026-11-22: source cites follow the files into the subfolders that now own them (structure cleanup); no plan changed.
- 2026-11-22: source line cites follow the code into the files and lines that hold it after the structure cleanup; a cite whose code changed keeps its file and drops the line; no plan changed.
