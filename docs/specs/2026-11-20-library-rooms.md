---
title: The Library's three rooms, and where search by meaning shows
doc_type: spec
status: draft
date: 2026-11-20
decisions: []
area: library
---

# The Library's three rooms, and where search by meaning shows

The lead wrote this spec on 2026-11-20 from the owner's request of the same day: redesign the
inside of the Library until it reads well and feels good, plan each tab for its own job, show
search by meaning so that it helps, and build what is still missing. It is built in slices; each
slice adds its detail here through the Revisions log before it is built.

## Person and moment

The person has put a pile of documents into one folder (meeting notes, contracts, exports) and
lets a coding agent turn them into wiki pages and concepts. They open the Library in the
installed app. The web build is a playground and is not a design target.

They come back for three different reasons, and each is one tab:

| Tab | The moment | The one fact or action that owns the screen |
|---|---|---|
| Sources | "How much of my pile has been read, and what do I press next?" | How many sources have a wiki page, what state the rest are in, and the press that continues |
| Wiki | "What do my documents say about X, and where does it say so?" | The question field, and answers that show their passages |
| Ontology | "Which concept documents need my judgment?" | The list of documents waiting for a decision, and the document being judged |

The Library earns a return visit by getting more useful with use, never by holding data: every
file stays plain Markdown in the person's folder. What accumulates is visible on screen: sources
read, questions kept, pages linked to concepts, and passages prepared for search by meaning.

## Today (installed-app state, captured 2026-11-20)

Captured in the app's state on three folders: 1 source, 54 sources and 2,000 sources.

- **Sources.** Five strips share the pane in equal grey text: the work lane ("LATEST
  OBSERVATION", with a chevron), the progress band, a counts-and-doors row, the canvas and a
  two-line legend paragraph. With one source the band shows "100%" and a flat one-day chart, and
  its last cell clips. At 54 sources the flow columns wrap into two source columns whose lines
  cross, file names are cut in the middle, and the concept column has no names. At 2,000 sources
  the islands picture reads well.
- **A source that is opened** shows its path, size and SHA-256, a link to its wiki page and its
  headings. It does not show the source's text.
- **Wiki.** The question field floats mid-pane above three arbitrary sources; kept questions hide
  behind a chip. Index rows are bordered boxes of three different heights. An opened page reads
  well, but the row above it reports the whole folder's problems, and links show raw slugs.
- **Ontology.** A worklist grouped by what needs a decision, and a reading pane whose properties
  open with a chevron.
- **Search by meaning.** The loopback client (#3610), the labelled set (#3611) and the decision
  records exist. The built-in model, the vector store and every screen do not.

## Decisions

1. **Each tab is composed for its own job.** The three need not look alike. They share the page
   header, the type ramp, the surfaces and the motion ramp, nothing else.
2. **Library-wide doors live once, in the page header.** How to use, Questions and Conversation
   are the same on every state of Sources and Wiki, so they sit at the header's right, before the
   info glyph, and nowhere else. This narrows the 2026-09-12 record ("the guide and the questions
   are doors on one `text-label` row" above the graph): the doors keep their popovers and their
   order and move up one bar. Dissent kept: a door beside the canvas is closer to the hand.
   Falsifier: a person on the Sources home who cannot find Questions within 10 s.
3. **Agent work is one line inside the surface it concerns, not a lane of its own.** The work lane
   above the pane goes. The Sources home shows it in the band's action cell, the reader in its top
   row, and the question desk keeps its compact line.
4. **The band's bar is the state filter.** The state line leaves the index column and becomes the
   bar's own key: one press filters the list and lights the same marks in the picture. This
   narrows `2026-11-19-source-progress.md` ("the state line becomes filters" in the column).
   Falsifier: a person who filters and does not see the list change because the column is folded;
   then the press unfolds the column.
5. **A legend is a key, not a paragraph.** Glyph, word and count on one line under the canvas;
   gesture hints follow in quieter ink. The prose legends leave the screen.
6. **Recorded facts are lines; similarity is nearness, order and a labelled lead.** A citation or
   a `describes:` link is in a file, so it is drawn as a line. What the vectors find is a guess,
   so it never draws a line: it orders a list, places a mark near a group, or appears as a lead
   labelled "Similar meaning" with its passage. Accepting a lead writes the fact, and then the
   line appears.
7. **No chevron disclosure.** Detail opens beside or in the centre; a count opens a popover.
8. **All motion is smooth by measurement.** No frame interval above 50 ms, a moving value
   continues from the value last drawn, the next input retargets, and reduced motion shows the
   end state. Each slice is recorded in the app's state and read frame by frame before it merges.

## Where search by meaning shows

The contract for vectors is `2026-11-19-search-by-meaning.md`. This spec adds where they appear.

| Place | What the person gets | Slice |
|---|---|---|
| Wiki, question field | Passages that say the same thing in other words or another language, labelled "Same words" or "Similar meaning" | W1 with S6 |
| Every tab, while preparing | How many files are prepared, which one is being read, about how long is left; search already uses what is prepared | S6 |
| Wiki, an opened page | Related pages and source passages no page cites yet, each a labelled lead | W2 |
| Sources, the picture | Unread sources and unsorted pages sit beside the concept they resemble; a group offers "Read these next" | P2, after W1 proves the gain |

Nothing here is drawn before the store holds vectors; an unprepared folder shows the word-only
screen and one setup press.

## Slices

Each slice is one branch and one draft pull request, built by an implementer, looked at by the
lead in the app's state at 1512 and 1920 in English and Korean, and merged before the next starts
on the same files.

| # | Slice | Core of the change |
|---|---|---|
| H1 | Sources header | Band recomposed, bar as filter, work line, doors to the page header, legend key |
| P1 | Sources picture | One readable picture from 20 to 400 marks: each stack carries its own concepts, and a kind is named only from 96 px of room (pages, then concepts, then files) |
| R1 | Source reader | The source's text with cited passages marked; facts fold to the foot |
| I1 | Index column | One door row, rows of one height in both lists |
| W1 | Wiki home | Field at the top, kept questions and newly written pages under it, meaning status (with S6) |
| W2 | Wiki reader | Page-own top row, links by title, citation chips, related leads |
| O1 | Ontology tab | Properties without a chevron; worklist rhythm |
| S3b–S8 | Search by meaning | Built-in model, store, wiring, desk, settings, acceptance (`search-by-meaning` spec) |

## H1: Sources header

### Flow

1. The person opens Library. Under the page header the Sources home has three parts: the band,
   the picture, the key.
2. **Band, left cell.** The number is the share of sources with a wiki page. With fewer than ten
   sources it is a fraction ("1 / 1", "3 / 7"); from ten up it is the percentage. Beside it
   "+N today" when N > 0. Under it the sentence in primary ink.
3. **Band, bar.** The 6 px bar keeps its segments. Under it each present state is one press:
   swatch, word, count. A press filters the index list to that state and lights its marks in the
   picture; the same press again, Show all, or Escape restores both. When the index column is
   folded, the press unfolds it. The changed-since-written clause that sat in the row below is
   this press on its state.
4. **Band, chart.** Drawn only when the wiki pages record three or more different days. Otherwise
   the cell is absent and the bar takes its width.
5. **Band, action cell.** The Continue button and its one status line stay. Under them, when the
   agent has done something in this folder during this session, one line: the kind of work, the
   file, and a "Recent N" press that opens the list of the last three in a popover. The line's
   slot is part of the cell's height from the start, so the band never changes height.
6. **Page header.** How to use, Questions and Conversation sit at the right of the header on
   every Sources and Wiki state. Below `lg` they fold into More.
7. **Key.** One line under the picture: square "Source N", filled circle "Wiki page N", ring
   "Concept N", solid line "Citation N", dashed line "Mention N", then the gesture hint. In the
   islands picture: ring "Concept island", filled circle, square, amber dot "Changed since
   written".

### States

| State | Sources home shows |
|---|---|
| No source yet | Unchanged (empty stage) |
| 1 to 9 sources | Fraction, sentence, bar, state presses; no chart |
| 10 or more sources, under three recorded days | Percentage; no chart |
| Three or more recorded days | Percentage and chart |
| Every source has a page | Bar turns green once; action cell says so; state presses show only what exists |
| Agent missing or blocked | Action cell: the reason once and its door, as today |
| A batch is running | Button shows the running glyph; work line names the file being written |
| A filter is pressed | Pressed state has `aria-pressed`; list filtered; marks lit; Show all N beside the presses |
| Index column folded | State press unfolds it |
| Reduced motion | Final values without count-up; no light sweep; swaps are instant |
| Web playground | The band's web line and Get the app, as today; no work line |

### Copy

New keys in `messages/<locale>/library.json`. This spec keeps the English source; the ko, ja and
zh strings are written into the catalogues by the building slice in the same register.

| Key | en |
|---|---|
| `progress.fraction` | {compiled, number} / {total, number} |
| `graph.key.source` | Source {count, number} |
| `graph.key.page` | Wiki page {count, number} |
| `graph.key.concept` | Concept {count, number} |
| `graph.key.cite` | Citation {count, number} |
| `graph.key.mention` | Mention {count, number} |
| `graph.key.island` | One island is one concept |
| `graph.key.stale` | Changed since written |
| `graph.key.gestures` | Press for a card · press twice to open · scroll to zoom |
| `workActivity.recentCount` | Recent {count, number} |

Existing state words, the sentence, Continue and the blocked lines keep their keys. The eyebrows
"HAPPENING NOW" and "LATEST OBSERVATION" and the prose legends leave the screen; their keys are
deleted when nothing reads them.

### Edge cases

- **One source.** "1 / 1", no chart, nothing clipped at 1040 px.
- **2,000 sources.** State presses stay on one line; counts use grouping separators.
- **Long file name in the work line.** Truncates in the middle of the path, keeps the file name.
- **A filter whose last source changes state.** The filter clears itself and says Show all is in
  effect by restoring the list.
- **Hangul.** Fraction and counts use the locale's digits; no label wraps at 1040 px in Korean.
- **Folder switched while a filter is pressed.** The filter does not carry over.

### Acceptance criteria

1. Given the app's state at 1512×901 with 54 sources, the Sources home has exactly the band (at
   most 112 px), the picture and the key (one line); the picture is at least 0.75 of the pane's
   height; no work lane and no doors row exist.
2. Given 1 source and 1 page, the band shows "1 / 1", no chart element and no element whose
   `scrollWidth` exceeds its `clientWidth`, at 1040, 1280, 1512 and 1920 px, in English and Korean.
3. Given a first agent event arrives on the home, the band's height and the picture's top edge do
   not change by one pixel.
4. Given a state press, the index list holds only that state's rows, those marks are lit, and
   Escape restores both; with the column folded the press unfolds it.
5. On the Sources home, an opened source, an opened wiki page and the question desk, the document
   holds exactly one Conversation control and one Questions control, both in the page header.
6. No chevron glyph exists inside the Sources home or the work line.
7. Recorded in the app's state: band arrival, a state press, a work-line swap. No frame interval
   above 50 ms; reduced motion renders the end state.
8. Continue still sends ten sources, a blocked reason prints once, and the web playground still
   shows its line (`tests/e2e/web-surface-smoke.spec.ts`).

## W1: Wiki home (the question desk)

### Today (installed-app state, 54 sources, one question asked)

- The field stands in the middle of the pane and travels to the top when results open.
- With an agent connected, pressing Find evidence leaves a coverage line and two closed rows.
  No passage is on screen until another press. Of thirteen leads the first is about delivery
  days; the sentence that answers the question is third.
- Each lead card prints a raw path with its anchor and repeats the same freshness sentence.
- Before a question, the desk lists the three alphabetically first sources.

### Decisions

1. **The outcome before a report is the best passages themselves.** This narrows
   `2026-09-27-wiki-question-answer-first-motion-9385eee9` ("show one search outcome ... place
   raw leads one expansion away"): the outcome is up to three passages, and the rest follow
   one `Show N more` press. Dissent kept: three rows can be read as the answer, so the head
   calls them passages found and the report action stays the primary control beside it.
   Falsifier: a person takes the three rows for a checked answer, or any lead needs more than
   one press.
2. **The entry's material is the person's own trail.** This narrows
   `2026-09-27-wiki-inquiry-document-grid-20477108` ("up to three inventoried original-file
   rows"): saved questions come first, then the pages written most recently; the three originals
   show only in a folder that has neither. Falsifier: a person with saved questions who still
   opens the Questions door to find the one they saved yesterday.
3. **The field keeps one place.** Its top edge is the same before a question, with results and
   with a report.
4. **One list, best first.** Wiki claims and source passages share a list; a glyph says which
   a row is. Until search by meaning lands (S6) the order is the reciprocal-rank fusion of the
   two word lists; S6 adds the meaning list to the same fusion and a reason label to each row.
5. **A row says where, not how it was checked.** Page title or file name and the line; a state
   badge only when the source changed, is missing, or the claim cites nothing. The freshness
   caveat is said once, behind the head's info glyph.

### Flow

1. The person opens Wiki with no page chosen. One column of `--measure-doc-column`, top
   aligned: the title line, the field, then **Saved questions** (up to three rows: the question,
   a state badge when its evidence changed, the day it was saved; the head is the existing
   `answers.title`) and **Written recently** (up to
   five rows: page title, the day the page records, how many sources it cites). A row opens its
   answer or its page.
2. They type and press Enter or Find evidence. The entry material leaves, the results rise in
   its place, and the field does not move.
3. **Head.** The count of passages found, an info glyph that opens coverage, limits and the
   caveat in a popover, and Make report at the right.
4. **Rows.** The best three. Line one is the sentence in primary ink, at most two lines, with
   the question's words in strong weight. Line two, in label ink: the kind glyph, the page title
   or file name, the line, and a badge only when attention is needed. Pressing a row opens
   where the sentence lives: the page for a wiki claim, the source at its anchor for a passage.
   A wiki claim's cited files follow on line two as presses that open the source at the cited
   line. Check claim with Jev sits at the row's right, shown on hover and on focus inside the
   row, always in the tab order.
5. **Show N more** appends the remaining rows in place.
6. **Make report** behaves as today. The report takes the place above the rows, which stay
   under the head "Passages the search found".
7. **No match**: the present title, body and investigation action.

### States

| State | The desk shows |
|---|---|
| No saved question, no wiki page | Field, then the three originals as today |
| Saved questions or pages exist | Field, Saved questions, Written recently |
| Searching | The field's button shows the running state; entry material stays until results exist |
| One to three leads | Those rows; no Show more |
| More than three leads | Three rows and Show N more |
| No match | Present no-match block |
| Agent not connected | Rows as above; the present line that reports need an agent |
| Report running, done, failed | As today, above the rows |
| Folder changed since the search | Present outdated line above the head |
| Reduced motion | Results and appended rows appear at their end state |
| Web playground | Same desk; no Jev press, no report action |

### Copy

New keys under `questionDesk` in `messages/<locale>/library.json` (English source here; the
building slice writes ko, ja and zh in the same register).

| Key | en |
|---|---|
| `recentTitle` | Written recently |
| `recentMeta` | {date} · {count, plural, one {# source} other {# sources}} |
| `resultsHead` | {count, plural, one {# passage found} other {# passages found}} |
| `showMore` | Show {count, number} more |
| `lineAt` | line {line, number} |
| `passagesUnderReport` | Passages the search found |

`coverageDetails` becomes the info glyph's name. `leadsSummary`, `wikiTitle`, `sourceTitle`,
`originalsTitle` and `otherOriginals` are deleted when nothing reads them.

### Edge cases

- **A sentence longer than two lines** is cut at the second line; the full sentence is in the
  row's accessible name and in the place the press opens.
- **A claim with four cited files** shows two file presses and "+2", which opens the page.
- **A file name of 80 characters** is cut in the middle, keeping the extension.
- **Korean question over English sources** with no word match: the no-match block and its
  cross-language sentence, unchanged.
- **Asking again while results show**: the old rows leave and the new rise; the field keeps
  focus and its place.
- **2,000 pages**: Written recently reads only the five newest; it never sorts on render
  without memoising on the listing version.

### Acceptance criteria

1. Given the app's state at 1512×901 and 1920×1080, the field's top edge is the same pixel row
   before a question, with results, after Show more and with a report.
2. Given a question with thirteen leads, exactly three lead rows are visible without a press and
   one press on Show 10 more shows all thirteen.
3. The desk holds no plus, minus or chevron disclosure; coverage opens from the info glyph as
   a popover that Escape closes, returning focus to the glyph.
4. No lead row shows a path with `#`; the freshness sentence appears at most once on screen.
5. Given one saved question, Saved questions lists it and no "Start with a source" list exists;
   given none and no page, the three originals show.
6. Tab reaches, in order, the field, Find evidence, the info glyph, Make report, then each row
   and its Jev press.
7. Recorded in the app's state: asking, Show more, asking again. No frame interval above 50 ms;
   reduced motion shows the end state.
8. Print and Markdown export of a report are unchanged.

## W2: Wiki reader

### Today (installed-app state, 60 pages, one page open)

- The row above the page is the folder's: Close page, "Write a wiki page: {file}", and five
  folder-wide counts. Nothing in it is about the page being read.
- Under the title, one faint row names the source ("View original: {file}").
- In the body, a link to another page prints its path (`wiki/settlement-reconciliation-check`)
  and a link to a concept prints its slug (`capabilities/background-job-runtime`).
- A citation is the line number in 10 px accent type after the sentence ("line 13"). It names
  no file, and pressing it leaves the page for the source.
- The page ends where its text ends: nothing says what cites it or what it sits beside.

### Decisions

1. **The row above a page belongs to that page.** Close, the page's state (draft, checked,
   source changed), who wrote it and when, and the page's actions. The folder-wide counts
   leave this row; they stay where H1 put them and in Check results. Falsifier: a person
   looking for "what is wrong in this folder" while a page is open cannot find it in one press.
2. **A link says the name of what it opens.** A page link shows the page's title, a concept
   link the concept's title with its kind glyph. A link whose target is missing shows the
   written path in danger ink and says so on focus and hover. The file's text is not changed.
3. **A citation shows its passage in place.** Pressing a citation opens a popover anchored to
   it: the file's name, the line, the cited unit with one unit either side, and **Open the
   source**. This narrows `docs/DECISIONS.md` 2026-09-11 "The Library reads a source only when a
   person names it": a citation press already names the file, and the popover reads no more
   than that press reads today. Dissent kept: reaching the full source takes a second press.
   Falsifier: people press through to the source nearly every time, so the popover is a toll.
4. **A page with more than one source names the file on each citation**; a page with one
   source shows only the line.
5. **The page ends with where it sits.** Three short groups under the text, each by title:
   sources this page cites (with how many citations each), pages that link here, concepts it
   touches. A group with nothing is absent. Nearness by meaning joins this foot only after
   search by meaning has proved its gain on the desk (P2).

6. **A result row opens the page at its claim.** On the Wiki desk a row that is a wiki claim
   opens its page scrolled to that claim, and the claim's line carries a mark that fades over
   the standard slow duration (present at once and without the fade under reduced motion; the
   mark leaves the DOM or turns inert after it ends). Back returns to the desk with its results
   and scroll position as they were. A claim on the page's first screen does not scroll.

### Flow

1. The person opens a page from the index or from a result row. The top row shows Close, the
   state badge, "{author} · {date}", and at the right the page's actions and the conversation
   door. The title leads the column; under it one line lists the sources cited as presses.
2. Reading, they meet a link: it reads as a title. Pressing a page link opens that page in
   place and Back returns to the same scroll position; a concept link opens the concept in the
   Ontology tab.
3. They press a citation. The popover rises from the citation with the passage; the cited unit
   is marked. Escape or a press outside closes it and focus returns to the citation. **Open the
   source** opens the Sources reader at that unit.
4. At the foot they see what the page cites, what links here and which concepts it touches.

### States

| State | The reader shows |
|---|---|
| Page with one source | Citations show the line only |
| Page with several sources | Each citation shows a short file name and the line |
| Citation whose source changed | The popover says the source changed after the page was written and shows the present text |
| Citation whose source is missing | The popover says the file is missing; no text |
| Citation into a format the reader cannot read | The popover names the file and offers Show in Finder |
| Link to a missing page or concept | Written path in danger ink; focus and hover say it is missing |
| No backlinks, no concepts | Those groups are absent; "Sources cited" always shows for a page that cites any |
| Long page | The outline at the right from `xl` up, as today |
| Reduced motion | The popover appears at its end state |
| Web playground | Same reader; reading a source needs the folder permission as today |

### Copy

New keys under `wikiReader` in `messages/<locale>/library.json` (English source).

| Key | en |
|---|---|
| `citedSources` | Sources cited |
| `linkedFrom` | Pages that link here |
| `concepts` | Concepts this page touches |
| `citationCount` | {count, plural, one {# citation} other {# citations}} |
| `citationAt` | {file} · line {line, number} |
| `openSource` | Open the source |
| `sourceChanged` | This file changed after the page was written. This is its text now. |
| `sourceMissing` | This file is no longer in the folder. |
| `linkMissing` | Nothing in this folder has this name. |

### Edge cases

- **A citation on the last line of the column**: the popover opens above it.
- **A cited unit of 40 lines**: the popover shows its first twelve lines and "Open the source".
- **Two citations after one sentence**: two presses, each with its own popover; never merged.
- **A title of 90 characters in a link**: it wraps with the text; it is never cut.
- **A page that links to itself**: shown as plain text.
- **2,000 pages**: titles for links come from the listing already in memory; opening a page
  reads no other page.

### Acceptance criteria

1. With a page open, the row above it holds no folder-wide count and names the page's state.
2. Given a page whose body links `wiki/settlement-reconciliation-check`, the link's text is
   that page's title; given a link to a path that does not exist, the text is the path and its
   accessible description says it is missing.
3. Pressing a citation opens a popover that contains the cited unit's text, equal to what the
   Sources reader marks for the same citation; Escape closes it and focus is on the citation.
4. Opening a page reads no source file (read count zero) until a citation is pressed.
5. A page citing two files shows the file's name on every citation; a page citing one shows
   none.
6. The foot lists every cited source with its citation count, and the groups with nothing are
   absent.
7. Recorded in the app's state: open a page, press a citation, close it, press a link, go
   Back. No frame interval above 50 ms; the scroll position after Back equals the position
   before the press.
8. Pressing the first row for "반품은 며칠 안에 할 수 있나요" on the capture folder opens the page
   with that sentence inside the viewport and marked; a claim on the page's first screen does
   not scroll. Back shows the desk with its results and scroll position as they were.

## Out of scope

- A new renderer for the picture; P1 changes layout choice and labels only.
- Embedding sources that are not Markdown.
- Any change to what an agent may write or approve.

## Risks

1. **The doors are missed in the header.** Probe: the falsifier in decision 2 on the first build;
   if it fails, Questions returns beside the field on the Wiki home only.
2. **The filter press far from the list reads as doing nothing.** Probe: acceptance 4 with the
   column folded; the lit marks and the unfolding column are the visible answer.
3. **Vectors arrive later than the screens that name them.** The table above draws nothing
   before vectors exist, so no slice ships an empty promise.

## Revisions

- 2026-11-20: first draft. Three rooms, eight decisions, the slice list, and H1 in full.
- 2026-11-20: P1 built. Looking at 1280x800 showed that names sharing the width equally cut every title to five characters, so a kind is named only from 96 px on screen, pages first; the picture's margin above and below fell from 64 px to 24 px so a 60-page folder stands in two stacks at 1512x901.
- 2026-11-20: W1 detailed: the question desk shows the best passages before a report and the person's own trail at entry.
- 2026-11-20: H1 as built departs in nine places.
  - Below a 60rem pane the number and the bar stack, so the band stays inside 112px at 1040 with
    the index open; from 60rem the four cells share one row.
  - The key's line still gives way to a pointed-at mark's or island's sentence, as the legend
    did, so hovering keeps its description.
  - The question desk keeps the compact work widget, whose own eyebrow and chevron remain; it
    lives in `src/widgets/library-work-activity/`, outside this slice.
  - The off-template clause leaves the home; the Check results row and the reader's status line
    still say it.
  - A press on the picture no longer clears a state filter; the press itself, Show all, or
    Escape does. The filter persists while a document is open, and Escape clears it only on the
    home.
  - Under a search the presses and Show all count the folder, not the search's rows.
  - With three or more states in a pane under 50rem the presses show swatch and count only;
    the word stays in `title` and for a screen reader, so the band never clips Continue with
    the conversation open.
  - Show all is an × at the end of the legend, its slot held from the first paint, so a press
    resizes no cell of the band; a folder with one state draws no legend and keeps its row empty.
  - The work line names the file, not the path, and cuts a long name in the middle keeping its
    ending; Continue carries no ring while work runs.
- 2026-11-20: W2 detailed: the Wiki reader's top row belongs to the page, links say names,
  a citation opens its passage in a popover, the page ends with where it sits, and a desk row
  opens the page at its claim.
