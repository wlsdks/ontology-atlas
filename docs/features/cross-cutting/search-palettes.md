---
title: Search palettes
doc_type: feature
status: current
area: design-system
routes: []
---

# Search palettes

### Search palettes (separate by design — R5 skip merge)
- **`⌘K` `SearchPalette`** — a project page's own palette: projects-focused fuzzy search + top vault docs match (3) + recent (5) + Layer filter (All / Hub / Node)
- **`⌘K` `MountedGlobalSearch`** — ontology nodes + projects unified (`cmdk`-based, kind/project filter chips, virtualized). The map mounts its own (a pick selects on the canvas); every other screen with the rail gets the shell's (`ShellKeyboardSurfaces`, 2026-09-26), mounted on the first ⌘K. Only the map's mount (`onMap`) calls itself "Search this map"; elsewhere the dialog is named for what it searches ("Search concepts"; a project is one), and its empty state and footer name the loaded project, or "this folder" when there are several. Shift is accepted and changes nothing, so the shortcut sheet lists ⌘K once. The ontology documents workspace keeps ⌘K for its unified palette.
- Both palettes share keyboard: `↑↓` navigate · `↵` select · `Esc` close

**The palette reads a Korean keyboard** (2026-09-19). Matching used to be normalised
substrings only, so the two things a Korean typist does first found nothing on the
bundled Online Store sample: initials alone (the four consonants of a four-syllable
capability), and any name mid-syllable — which every Korean word passes through,
because the IME emits one jamo at a time, so the list blinked empty on most
keystrokes. `shared/lib/hangul-match` adds exactly two rules, no general fuzziness:
consonant initials matched in order with spaces ignored on both sides, and a trailing
partial syllable whose jamo must prefix the syllable it lands on, with compound
medials and final clusters split into the keys that type them. These rank **below**
every literal name tier and above a description match, so a name that really contains
what was typed still wins. The match is marked in the row, including when it spans a
space, and a description match now opens at the match with a leading ellipsis rather
than highlighting past the truncation — measured live: rows whose mark rendered
outside its own box went from 1-2 per English query to 0. The per-node name index is
built once and kept (`WeakMap`), which also took a plain query over 12,000 nodes from
243 ms to 29.8 ms; `node-name-match.perf.test.ts` holds the ratio.

**Every result row says what it matched** (2026-09-19). Matching deliberately looks
wider than the row draws — every one of a concept's names (the canonical `title` and
each `display_<locale>`), the summary, and the id — but the row drew only the
localised name and the summary, so a match on anything else arrived with nothing to
see. Measured on the bundled sample over thirty English queries: **97 of 317 rows
(30.6%) carried no highlight at all.** Two changes close it. The id now matches on its
slug and not its `kind:` prefix, because typing "element" returned twenty rows that
were all just the kind — which the filter chips already select, properly; a query
containing a colon is someone pasting a real id, and for that the whole id still
answers. And the trailing column became the row's evidence: the summary when the name
on screen carried the match, that other name when a name the screen is not showing
did, the summary opened at the match when the description did, and the id's slug in
mono when the id did. A mark therefore means exactly one thing — *this is what you
typed* — which is why the context summary is drawn plain. Project rows use the same
seat for the same job. Re-measured over the same thirty queries plus three Hangul
ones: **0 of 276 rows unexplained, 0 marks clipped**, and the column has one text
start line (`w-[14rem]`, after four rows of "policy" began at four different x).

**One answer to the same typing, in every box** (2026-09-19). The map draws INDEX
and the `⌘K` palette on the same screen, and the docs tree has a third field; each
kept its own match rule. Measured on the bundled sample: INDEX answered "no matching
concept" to a chosung query and to a half-typed syllable that the palette resolved
against the same vault, and it pulled every element for the word "element" because it
compared the whole `kind:slug`. All three now call `findNameMatch` and `idSearchText`
in `shared/lib/node-name-match`, which is the single contract; the palette's ranking
stays its own, because only it ranks. `nameIncludes` retired with its last caller.

**INDEX marks where the query landed** (2026-09-19). The panel's own search field
filtered 125 concepts down to two and marked nothing in either, on an 11px label,
while the palette on the same screen had been marking its rows for months — the
filter said which rows survived, nothing said where. Both index panels now hand their
trimmed query to `TopologyIndexTreeRow`, which draws the name through
`HighlightedText`, so a chosung query marks there too (`shared/lib/highlight-match`
already reads a Hangul keyboard). Measured on the map panel's own surface: the mark's
ink clears **8.59:1** against its composited background. Rows kept only as the path to
a match stay unmarked, which is what they are; telling a match apart from the path it
sits on is a separate open question.

**The palette says how many it found, not how many fitted** (2026-09-19). Each group
draws at most 20 rows, and both the group heading and the footer counted the drawn
array — so the limit stood in for the answer. The footer is the one place that names
the scope it searched ("N matches · Online Store"), which makes its number read as a
fact about that folder. Measured on the bundled sample: typing `the` showed "match ·
20" and "21 matches" where 120 actually matched, and one common Hangul initial showed
20 where 52 did. The
matchers now return the page **and** the size of what was found, the heading uses the
"shown / found" shape the empty state already used ("20 / 119"), and the footer
carries the real total. Below the limit nothing changes — a query with 11 matches
still reads "11".

**Enter belongs to whichever control has focus** (2026-09-19). cmdk's root listens
for Enter across the whole palette and turns it into "open the highlighted row",
`preventDefault` included, so it also swallowed Enter pressed on a control. Measured
live: tabbing to a kind filter chip and pressing Enter left the chip
`aria-pressed="false"` and instead closed the palette and flew the map to whichever
concept happened to be highlighted; the close button did the same, navigating instead
of closing. Space was unaffected, so the two keys disagreed about what the focused
control does. Enter now stops at the control's own row in the bubble phase — the
button still receives it — leaving cmdk's root only the Enter that comes from the
search field, which is the one place "open the highlighted row" is what a person
means.

**The reason survives a phone** (2026-09-19). The reason column was `md:`-only, so
below that breakpoint the class that hid it took the whole answer with it — measured
at 390x844 on the bundled sample: `policy` showed 4 rows with **0** marks, `order` and
`shopper` 20 rows with 0, while the desktop layout explained every one of them. A
reason that **carries a mark** now drops to a line of its own under the name there
(rows grow 44 → 58px, and only those rows do); a reason with no mark is the summary
standing in as context, and giving that a second line would double every phone row to
repeat something the row is not there for, so it stays a `md`-and-up column. From `md`
up nothing moved: one fixed-width column, one text start line. The same pass fixed the
project chip's scroller, a hardcoded `height: 24` around a chip that the touch floor
makes 44px tall — `overflow-x: auto` clips the other axis too, so the finger got 24.
The box now reads `--control-h-sm`, and the gate for it asks the document what is at
the chip's top and bottom edge, because a clipped control still measures full size.
