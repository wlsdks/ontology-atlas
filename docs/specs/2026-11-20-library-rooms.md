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
