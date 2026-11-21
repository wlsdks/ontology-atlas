---
title: The Library rebuild, in order, and the paper and motion layer
doc_type: spec
status: draft
area: library
date: 2026-11-21
decisions: []
---

# The Library rebuild, in order, and the paper and motion layer

## Person and moment

The owner asked on 2026-11-21 that the Library work be written down so no part is lost between
sessions. Four specs each own a part of it, and one part, the paper and motion layer, had no
spec. This file holds the single order across all of them, and specifies that missing layer.

Each slice keeps its owning spec; this file does not repeat their flows or criteria. A slice is
done when it is merged to `main`, the installed app is rebuilt from that `main`, and the Library
is looked at in it.

## Owning specs

| Spec | Owns |
|---|---|
| `2026-11-20-performance-strategy.md` | S3 and the Library's memory and frame budgets |
| `2026-11-21-library-sources-redesign.md` | S-1, S-2, S-3: the Sources overview replaces the Library graph |
| `2026-11-21-library-words-and-first-run.md` | F1-F4: plain words, the drop-first empty Library, the find dialog |
| `2026-11-21-library-index-column.md` | I-1 to I-5: the left column as the wiki's index |
| This file | P-1 to P-7: paper sheets and the motion that carries meaning |

## Order and state

State is as of the latest Revisions line. Update the row in the same pull request that changes
it.

| # | Slice | Owning spec | State | Waits for |
|---|---|---|---|---|
| 1 | S3: progressive read of large folders | performance-strategy | Merged (#3737) | None |
| 2 | S-1: Sources overview widget | sources-redesign | Merged (#3742) | None |
| 3 | I-1: wiki index model and parts | index-column | Merged (#3744) | None |
| 4 | Words and first-run spec | words-and-first-run | Merged (#3750) | None |
| 5 | F1: document filter rules | words-and-first-run | Merged (#3752) | None |
| 6 | S-2 and S-3: mount the overview, retire the graph | sources-redesign | Merged (#3753) | None |
| 7 | P-1: paper tokens and `Sheet` | this file | Merged (#3754) | 6 |
| 8 | Installed-app check after 6 and 7 | this file | Not started | 7 |
| 9 | F3: word sweep and `sourceWord` row | words-and-first-run | Not started | 6 |
| 10 | I-2: mount the wiki index | index-column | Not started | 6 |
| 11 | F2: drop-first stage | words-and-first-run | Not started | 9 |
| 12 | F4: plain find dialog | words-and-first-run | Not started | 11 |
| 13 | I-3: log view | index-column | Not started | 10 |
| 14 | I-4: Sources half on `IndexRow` | index-column | Not started | 10 |
| 15 | I-5: Ontology column metrics | index-column | Not started | None |
| 16 | P-2 to P-7 | this file | Not started | 7, 9 |
| 17 | Re-measure Library memory and frames | performance-strategy | Not started | 6, 10 |
| 18 | S-4: Sources home clarity (below) | this file | Not started | 9 |

Row 8 ran on 2026-11-21 (installed app, 40 sources and 24 pages); row 18 is what it found.

Rows 9 and 10 may run in parallel when their files do not overlap; `library.json` conflicts keep
both sides.

### Installed-app check (row 8, and after every later merge that changes the app)

1. Check `pgrep -fl "Ontology Atlas.app/Contents/MacOS"` and the app log; when another session's
   app holds a folder, wait.
2. Build from the new `main` and deploy with `pnpm -s desktop:deploy:app -- --skip-build
   --no-leave-running`.
3. In the installed app, open a test folder and look at the Sources home at rest, mid-batch,
   with a folder picked, and empty; capture only the app's own window.
4. Run the criteria S-2 moved here: three cold readers name what the pane shows within five
   seconds, and `perf:app-open` at 50,000 sources.

## The paper and motion layer

### Why

The owner rejected the dot pictures ("you can't tell what it represents"; dense dots read as
trypophobic) and found the table version dull. They asked for documents that look like
documents and for smooth motion that carries meaning instead of decorating numbers. The
prototype (`sources-expressive-v2`, kept in the session scratchpad and on the S-1 follow-up pull
request) was chosen.

### Rules every slice keeps

- Sheets are drawn only for the few items in focus (the next batch, recently written, the
  first-day demo), never one per source at scale.
- Motion shows cause and effect: a source is read, a page is written, it settles in the list,
  the bar fills, the number rolls.
- No frame interval over 50 ms, no single-frame jump, a retargeted motion continues from the
  drawn value, transform and opacity only, and a reduced-motion equivalent.
- The pane passes a five-second "what is this" reading.

### Slices

| # | Slice | Core of the change |
|---|---|---|
| P-1 | Paper sheets | Paper tokens, `Sheet` (source, page, stack); sheets in the next panel with the reading scan, and in Recently written |
| P-2 | Emerge and settle | When a page is written, its sheet rises from the source's sheet and settles at the top of Recently written; the path never crosses the table |
| P-3 | Folder stacks | The table's folder rows carry a `Sheet` stack whose height follows the folder's size and whose edge fills with its written share |
| P-4 | Band as a sentence | The band leads with one sentence of what changed, with the bar and number under it in a clear hierarchy |
| P-5 | Rolling numbers | A shared primitive that rolls a count or percentage from its drawn value to the new one |
| P-6 | First-day demo | The empty Sources home plays one short loop: a sheet is read and a page comes out, with Moru beside it; it stops under reduced motion |
| P-7 | Name lists | The prototype showed three lists of names; keep one per moment so the pane does not read as three tables |

## S-4: Sources home clarity

### Why

The installed-app check on 2026-11-21 (row 8) and a five-second reading of its capture by three
fresh agent readers (an office worker, a graduate student, a developer; agent readers, not the
three cold people the S-2 falsifier names, which stays open) agreed on what the pane is and what
to press, at 3.3 of 5 confidence, and stumbled on the same places.

### Changes

| # | Finding | Change |
|---|---|---|
| 1 | All three: who is "the agent", and does my file leave the computer | Name the connected agent beside the write button, and say the true privacy line from the words-and-first-run spec under it |
| 2 | All three: what "needs review" asks of them | Name the event ("Source changed since its page"), and its press shows those sources |
| 3 | Two of three, and the capture: the band chart's title cuts at 1512 and reads too small | No cut title at 1040, 1512 and 1920; the chart's label reads at the band's label step |
| 4 | Capture: source and wiki-page sheets look alike since chrome turned achromatic | The page sheet reads as written paper (lighter paper, darker title line) without a hue |
| 5 | Two of three: "wiki page" and "waiting" are unclear | Handled in F3's words; S-4 checks them on the pane |

The Ontology tab's name confused all three; it spans more than the Library and is decided
separately.

## Revisions

- 2026-11-21: first draft at the owner's request, so the Library work is not lost between
  sessions: the order across four specs and the paper and motion layer.
- 2026-11-21: S-2 and S-3 merged (#3753) and P-1 merged (#3754); the installed-app check (row 8)
  is next.
- 2026-11-21: row 8 ran on the installed app; S-4 added from its five-second reading.
