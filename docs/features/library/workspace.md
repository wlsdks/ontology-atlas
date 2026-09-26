---
title: Library
doc_type: feature
status: current
area: library
routes: [/library]
---

# Library

### `/library` — Library (2026-09-06, its own destination)

A vault holds three kinds of file and **only one is the graph**. Library keeps their distinct
meaning and adds a fourth presentation tab: Ontology draws the explicitly typed graph nodes,
Sources and Wiki draw the other two file kinds, and Work scopes lists saved Galaxy constellations.

The Library supports general knowledge as well as documents associated with code.
Sources remain original files; write-ups and filed answers remain wiki pages.
Documents-only folders need no code nodes or separate mode switch. The ontology
retains its codebase scope.

**Retained questions and explicit revisions.** The Library landing lists saved
questions and the tips of their answer histories. It distinguishes source-byte
changes, missing or new originals and unmeasured evidence; observations never
become source-read proof. A deliberate agent request produces a structured draft
for comparison. Saving creates a new file, checks concurrent edits, preserves
the previous page and exposes competing branches. Narrow comparisons switch
between old and new text. The [record and boundaries](../../contracts/retained-answers.md) describe
the Markdown metadata and the limits of those checks.

Library validation follows the current folder membership. Removing or restoring a
cited source or a linked wiki page updates the affected verdicts even when the
citing page is unchanged. Cached bytes avoid rereading unchanged pages; deleted
pages and old revisions are withdrawn from the text supplied to page-write review.

The MCP source reader preserves valid quoted CSV/TSV records across embedded
newlines. Row addresses keep their physical starting lines, while pagination
advances by record. Repeated normalized DOCX headings receive distinct anchors;
existing unique heading addresses stay unchanged. Reader notes identify ambiguous
legacy addresses and malformed quoted remainders. Original bytes and existing
wiki citations are not rewritten, and a matching source hash does not prove that
an old ambiguous citation identifies the intended passage.

Sources and Wiki shipped inside the Docs sidebar on 2026-09-05 and moved to Library the
next day after five capped lists competed inside one 280px column. On 2026-09-14 the owner
unified navigation without recombining those lists: Library now has Sources, Wiki, Ontology,
and Collections tabs, and each tab keeps its own reader and file meaning. The mobile Library tab
inherits the former Docs slot; `/docs/?slug=…` remains a compatible exact-file link, using the
general Document reader only when the target is outside Ontology. The Ontology tree and all of
its displayed and restored working sets show only the five explicit schema kinds, and its name-and-path filter
matches both localized display names and canonical paths. New Wiki pages begin in a centered dialog that previews the live Markdown path,
draft state, and five required section headings before creation. The current local-work
receipt remains primary while earlier receipts are available from History; an app write's
matching folder-watch event is consumed instead of producing a second notification.

**Saved constellation task scope (2026-09-15).** Work scopes (named Collections until
2026-09-25, when the English name followed the Korean one) lists each saved
constellation's name, purpose, and ontology concept count. Expanding a row resolves
members by immutable UID against the current manifest; resolved names open the actual
Ontology document, unresolved members stay visible, and the whole set opens in Galaxy.
The Galaxy candidate keeps a separate `mapId` for map focus; the compatible `v1`
sidecar stores immutable UID identity and the manifest's exact `document.path` as
display-only `lastKnownPath`. Source and Wiki attachments stay
distinguishable from ontology members. Empty, loading, corrupt, and read-only states remain
explicit, and creation routes to Galaxy instead of writing a second Library collection.

**Two panes.** The index on the left carries the active Sources or Wiki tab with that
list's own doors. The right
pane branches on the kind of file selected — a wiki page opens in the reading pane every
Markdown surface here shares (`src/widgets/doc-reading-pane/`), headed by its title, its
author and status, and a chip per source it was built from; a source opens as the six
facts the folder holds about a file Atlas has never opened (path, format, size, state and
sha256 or "not measured") plus one door that reveals it in Finder or hands over the bytes.
With no folder open the whole screen is one centred stage naming the two kinds of file and
offering the picker, and a folder that is open but holds nothing gets the same grammar with
the two doors instead. **With a folder open and nothing selected, the right pane *is* the folder's graph**
(2026-09-12, restoring 2026-09-06). Above it sits one `text-label` row — the canvas's own
counts caption, then the step facts as pressable clauses (`Compile next: <source>` opens
Compile and its brain picker; `N sources changed` lights that citation and its two ends
without moving a mark; `N off-template` presses into the check report, whose one door with
live state — a count, *running*, *unseen* — is the index's own row) — and then the doors
`How to use`, the saved questions, and the existing `Conversation`. `How to
use` holds the three source-to-wiki steps in an anchored popup and raises itself once per
machine; at exactly one saved answer the questions door is that question, so reopening it
is one press. Selecting a document replaces the canvas and gives it back on close. Below
`lg` there is one column — the graph above the index — the strip keeps its lead clause, and
the rest of the doors fold into one. A folder that holds wiki
pages and no `kind:` node opens here rather than on the map: it is a wiki on its own, and
an empty canvas had nothing to say to the person who chose it (ledger, 2026-09-06). A
folder with even one node still opens on the map.

**What to do next, one press from the graph's header** (2026-09-06, third and fourth
pass). The owner opened the new destination and said they did not know what to do on it;
the pane at that moment was either "Nothing gathered yet" or the first wiki page, opened
on the reader's behalf. The answer was three steps in the order the work happens — and
later the same day, reading the installed app, the owner moved them off the pane
(*"shouldn't the Library tab's default be the graph? … the area underneath should be a
popup"*) and then read the popup itself as broken: *"why does this design look like this?
It looks broken … the sizes inside the right panel are no good … and it overlaps this
text."*

Measured on that frame at 1512×982, on a folder with nothing in it: the panel was 560px of
a 1168px pane and its lower half lay across the canvas's own legend; its first card carried
about 130px of empty space between its numbers and its buttons, bought by stretching three
cards to one height; each card held a paragraph, a four-row label/value table, buttons and
a footnote; and it raised itself over a folder whose header, strip, canvas sentence and
both index lists were already saying the same emptiness.

So there are now two shapes and neither is that one.

**An empty folder is an empty state.** With no sources *and* no pages — exactly the
condition that makes the canvas draw nothing — the whole screen is one centred stage in the
repository's own empty-state grammar (`PAGE_COLUMN_STAGE`, 640px, dashed edge, first
overlay): eyebrow, one title, one sentence, the two doors **Add files** and **Find
documents**, and one quiet line naming the folder a drop goes into. No index, no canvas, no
caption, no status strip, no popup. Page hairlines at 1512 fell 63 → 12.

**With content, guidance is a compact stepper.** **What to do next** in the graph's header
opens a 360px `transientSurface("anchored")` panel of three rows, each one head line
(number, title, and the step's own word), one caption line, and one action row of reserved
height: **① Gather** with the formats the folder holds and both doors, **② Compile** with
what is waiting or behind, the Compile button, **Check the wiki** beside it once two pages
exist, the brain picker when this computer offers two, and — directly under that button —
the one sentence about what leaves this computer or the exact reason it cannot run,
**③ Read** with how many sources are covered and a row that opens the newest page. Writing
and reading back are one step, not two: a fourth row would make the sequence longer than
the work. The heights match because the anatomy does rather than because a
grid stretched them (measured 110 / 158 / 110 at every width, the middle row taller only
when the folder gives step two something to say; the fixed core is equal within 2px). The
panel is positioned from the chip's measured rect, published as `--library-shelf-top` and
`--library-shelf-right`, because at 390 the header wraps and a class-pinned panel covered
the very strip it was opened from. It stands clear of the caption and the legend at 1512,
1280, 1040, 768 and 390 in both locales, proven with `elementsFromPoint`; below `lg` the
legend yields to `sr-only` while it is open rather than being covered. Panel hairlines fell
48 → 33. It never raises itself, and Escape or an outside press closes it with focus
returned to its chip.

The header keeps **one** verdict rather than three turns: *Compile next · 5 waiting · 2
off-template*, or nothing at all when there is nothing to report. Both it and the stepper
read `libraryStepStates`, so they cannot disagree. Two steps can honestly be next at once,
so the one indigo edge — and the one indigo word — goes to the earliest of them while every
other word stays true. Compile is drawn in every state and disabled with the exact reason
rather than hidden, because a missing step two would leave a hole in the middle of the
sequence. Selecting swaps the right pane and moves focus to it, the back control stands at
every width, and Escape does the same thing.

**The index is a switch, and it draws one list** (2026-09-07, fifth pass). One day after the
column became a single scroller with sticky heads, the owner read the same folder in the
installed app and rejected the shape itself: *"I hate this structure: sources on top, wiki
underneath, one long scroll. A switch at the top is better."* The scroller had fixed the
cut rows and not the reading — seven sources and seven pages is still 14 rows, two heads,
five chips and three captions in 280px, so reaching the wiki meant scrolling past
everything about sources, and Compile was off screen from the rows it acts on.

One `SegmentedControl` at the top of the column now names both lists with their counts —
*Sources 7 | Wiki 7*, 32px, equal 125px halves at 280px in both locales — and the column
draws **one** of them. The inactive list is not in the document: `hidden` would keep its
rows in the tab order and its doors reachable from a keyboard while nothing on screen named
them. The doors travel with the list — Add files, Find documents and Bring from a service
on Sources; Check the wiki, Compile and the brain picker on Wiki — and the section eyebrow
is gone, because a head repeating *SOURCES · 7* under a segment reading *Sources 7* is the
same fact twice. The choice is remembered per machine
(`atlas.library.index-segment`), and opening a file from the graph, from the guide or from a
reader's own crossing moves the switch to that file's list, so the index can never name one
thing while the reader shows another.

**The description is a glyph** (owner, same reading: *"put one icon beside the title and
show the explanation in a tooltip on hover"*). The three-line lede was 60px of a sentence
read once and re-read on every visit after; it is now one lucide `Info` beside the `h1`,
carrying that sentence as its accessible name and its panel, so a keyboard and a screen
reader reach it as a pointer does. Since 2026-09-12 the panel carries a second paragraph on
the agent route — what a coding agent's provider traffic is, and that Atlas is not in its
path and does not log it — which is the one place that sentence appears; it used to print
as a paragraph on up to three cards of one journey. The panel opens `bottom`/`start`, under
the row it explains, and is `pointer-events-none`, so it never holds a press underneath it.

**The head is one row, and it has no eyebrow** (owner, 2026-09-12: *"a label like 'in this
folder' is not even needed"*, and of the fold glyph: *"centred the same as the text beside
it, and bigger"*). `IN THIS FOLDER` named the scope of a column that was already showing
it, so it is gone from the head — `LibraryStartStage` keeps it, where naming the scope is
the card's only job. The fold moved onto the title's own line at the column's box edge (331
at 1512), and both head glyphs take the ramp's `lg` step, whose 12.0px of ink is its closest
value to the title's own 13.1px; the fold's glyph had been 9.0px of ink with its centre
29.5px above the title's.

**And the column folds** (*"the left panel must be closable, I may want only the graph"*).
A `‹` at the right end of the title row folds it to the map's own 26px rail tab — vertical
label, `›`, `--topology-index-tab-width` — at `lg` and above, remembered in
`atlas.library.index-collapsed`, with focus following the control that vanished. Below `lg`
the index is the bottom half of one column and has nowhere to fold to.

Rows stay 36px with the name truncated at its end, format and size in mono `text-caption`,
and none crosses the column's side edge at 1512, 1040, 768 or 390. **`compiled` lost its
chip** on 2026-09-06: on the owner's folder all seven rows wore the same green pill, which
is a texture rather than a state, so success is a quiet check in the row's own ink and a
chip is spent only where a person can act. The one local-first disclosure follows the
Compile press it describes — the connect-by-address runner's sentence, under the press, in
the Compile popover or an open source's pane. The agent route's sentence is not that: it
says Atlas is **not** in the path, so since 2026-09-12 it is the index head's glyph panel
and nothing inline, in the guide's step two least of all.

**A toast stands in the corner of the pane it is about** (owner, 2026-09-12: *"the toast at
the top — its position is odd too, right?"*). This surface claims `bottom-right` where the
rest of the app keeps the bottom centre of its free lane (2026-09-24), and the two walls it stops a 16px gutter short of are
the pane's rather than the window's: the conversation's left edge from `xl` up, and the
bottom tab bar's top below `lg`. While the answer comparison stands — the one
`size="viewport"` dialog this view has left since the graph became the home — both gutters
grow to that dialog's inset plus its padding, so the box lands inside the dialog instead of
across its edge; a dialog that asks a question clears toasts instead, which is what Find
documents does.

The Wiki half carries what the wiki's own work needs, in this shape (merged from the LLM
Wiki round, 2026-09-07): the count on the switch above, then **Check the wiki** and
**Compile** on one unwrapping line so reading stands to the left of writing, then the brain
picker on the line beneath when this computer offers two, and beneath that the single
compile disclosure — only while Compile can be pressed; a reason it cannot is the status
strip's to say. **The column is an index and nothing else** (owner, 2026-09-07, direction
B of three): the switch, the search field, the door row — Check the wiki and Compile — one
row that says where the check's answer is (*Check results N*, above the list, present once
the wiki was ever checked), and the list, whose last row is *New page*. The design council
(2026-09-07) moved the report's door from the canvas header, which is hidden the moment a
page is open, into the column, and New page from an icon chip beside the two agent doors
into the list it acts on, with its own glyph. The app's own record of the last check, the check's findings and the names
without a page moved out of it to a page in the reading pane (*Check results*, below); the
write setting moved to Settings; filing an answer moved beside the answer. **The folder's
findings are not a pill.** A page that misses the
wiki template still wears the amber `off-template` pill, because the fix is in that page's
own bytes; a folder finding — `dangling-wikilink`, `orphan-page`,
`shared-source-unlinked` — is about where the page sits, is true of nearly every row on a
young wiki, and shows as one quiet word on the row with the count carried once in the
header strip. It is the same reasoning that took the green chip off every compiled source.
**Names without a page** keeps its list and its **Propose as node** chips on the *Check
results* page in the pane, five at a time with the map kinds first.

**The two cards above a page speak the reader's language** (owner, 2026-09-12: the cards
read as alien script — a finding code glued to a line number, a citation grammar in
backticks, and the names of a CLI command and an MCP tool, above the page's own Summary).
One `describeWikiProblem` now serves the page's cards, the *Check results* rows and the
revision dialog, so one folder is never described two ways. A finding is one sentence plus
one action — *"No original backs up what is written at line 19 under Facts, line 20. Point
it at one place in one original, or move it into the Not in sources section at the end of
the page if you cannot."* — with every page and original named by its title and pressable
(a page nobody wrote, and a file the finding itself says is missing, are named but never
pressable), the place pressable where the page has a section to scroll to, and two findings
that read the same folded into one row carrying both places. The card's title counts in
words ("2 to fix · page template", "2 connections to check"). The codes, their line
anchors, the validator's English verbatim, the page's own `wiki/<slug>.md` path and the
sentence that `ontology-atlas wiki-validate` and `validate_wiki` report the same codes all
stay whole behind one closed disclosure per card, for whoever is holding a terminal. The
own-shape card carries exactly one action, top right: with a coding agent connected it
starts one turn scoped to that page's shape findings (`buildWikiShapeFixBrief` — restore
the five sections, cite a real place, and **never** invent a citation: an unverifiable
claim moves under `## Not in sources`), and without one it reveals the file in Finder. Its
wording names the checkpoint the person's own write mode actually runs. On the web there is
neither an absolute path nor a local agent, so there is no control rather than a dead one.
The folder card has no action at all: its findings are repaired by editing another page,
and that page's title inside the sentence is the press.

**Below `lg` the whole pane reaches a phone** (2026-09-06, third pass). None of it used to
be drawn there: the pane was hidden whenever nothing was chosen, which is the state it
exists for, so a phone and any window under 1024px opened a folder and got two lists, no
overview and no guidance — a measured zero rect at both 390×844 and 768×1024. The row is
now a column below `lg`: the graph takes the top of it (390: 350×296 of canvas; 768:
648×406), the two lists take the bottom under a hairline, the popup still hangs from the
row so it keeps the column's whole height, and choosing a file swaps the whole column with
the same way back. The index's one scroller was first forced here — two list scrollers sharing half
a phone left the source list 30px and the wiki list zero — and on 2026-09-06 the same
answer replaced the `lg` split; the switch that replaced the stacking on 2026-09-07 is the
same answer again, so the column behaves one way at every width. What does not reach a
phone is the fold: below `lg` the index is the bottom half of one column and there is no
second pane to give its width to. Cases: `the Library pane` and `the graph takes the top of
the column at …` in `tests/e2e/library.spec.ts`.

**The graph is a live force simulation** (2026-09-07). The owner opened the installed
app on the real folder — 7 sources, 6 pages, every page citing 4–7 of them — and read the
picture as a static hairball: near-identical thin grey straight lines from nearly every
page to nearly every source, two mark sizes, and nothing that answered a hand. The
one-shot ForceAtlas2 pass that drew it is gone. `library-force-simulation.ts` steps a
velocity-Verlet model on `requestAnimationFrame`: springs whose rest length is the
relation (a citation 52 world units, a mention 96, so concepts ring the outside of a page's
own sources), many-body repulsion, collision so no mark sits on another, and an
**aspect-aware gravity** — the one non-standard force here, weaker along the canvas's long
axis, which *grows* the cloud into the box instead of fitting it into a corner of one.
Measured at 1512 on that folder shape: the picture fills **93.9% of the canvas width and
90.5% of its height**, against 33.5% before, and the width cap that used to cut the box
down to the picture is gone with it. Above 720 nodes the many-body force switches to a
hand-written Barnes–Hut quadtree — the crossover is measured, not assumed (1.97 ms exact
against 1.73 ms approximated at 800; one whole tick is 0.10 / 0.40 / 1.73 ms at 100 / 300 /
800 nodes). Nothing new is installed: Graphology is no longer imported by this widget at
all.

**The picture is columns** (2026-09-17). The owner opened the home on his own folder —
two pages, a few files — and read the live cloud as half-made: dots floating in a black
field at positions that changed with every visit. `library-flow-layout.ts` replaces the
force picture at rest with a pure, deterministic layout: files in a column on the left,
the pages written from them in the middle, the concepts those pages name on the right,
each column ordered by the barycentre of its neighbours so a page sits level with the
files it cites, and every edge an S-curve from column to column. The layout is laid in a
world box seen through the zoom ceiling, so a folder of thirty marks or fewer fits with
its widest mark at 36px on every window; a longer folder lays out taller than the box and
the camera fits it, down to an 18px row, past which a column of pages folds into
sub-columns with room for every name and a band of hundreds of files folds into a grid of
squares that names a file on hover or once zoomed open. A file's name stands left of its
square and a page's or concept's right of its disc, where no edge runs. Measured on the
four fixtures at 1040, 1512 and 1920: every page of a 60-page folder is named at 1512 and
1920, no name crosses another, and the same folder draws the same picture on every visit.
The simulation below remains as the engine's position store; its forces are not stepped
under this layout. Decision: `docs/records/decisions/2026-09-17-library-graph-flow-columns-*.md`.

**Past four hundred marks the picture is a map of islands** (2026-09-18). The owner:
*"a wiki piles up thousands of files in no time; plan for tens of thousands. Find the
picture that makes a person go 'wow' and is still calm and good to look at."* Columns name
everything up to a few hundred marks; past `ISLANDS_MIN_MARKS` (400) no picture can name
things, and the home shows shape and state instead. The reference is the data map (Nomic
Atlas's information cartography: points as texture, a few topic labels at rest, detail as
the camera closes in); Atlas's version uses what the wiki already knows instead of an
embedding. `library-islands-layout.ts` makes **an island per concept**: the pages that name
it as small discs at the centre, the files those pages were written from as smaller squares
packed around them on a sunflower spiral, so an island reads as a body with a shore. Pages
naming no concept gather on *Unsorted* (or on an island per wiki sub-folder). Files no page
has read are not a topic, so they are not an island: they are the **shore**, a staggered band
of dots under the archipelago, as wide as it stands and rows deep in proportion to how much
is unread (2026-09-18: packed as a disc it was the largest thing on a freshly filled folder
and took the middle with the topics ringed around it). Named islands pack largest-first
about the centre on a spiral stretched to the box's aspect, Unsorted after them; every
island carries its name and count on a ground plate; a stale page is
an amber dot; no line is drawn at rest, and a pointed-at or held mark still answers with its
own. The layout is pure and deterministic, like the flow. **A press on an island opens it
as columns** — its own pages, files and rows, few enough for the flow to name every one —
with a chip at the picture's top-left back to the islands and Escape as the same way out;
**zooming the wheel into an island opens it too** once it spans 45% of the view or the camera
reaches its ceiling (the aim is the island under the pointer at the first wheel step), and
zooming out of an opened island past 60% of its fit returns the map; **the marks travel**
between the two pictures over one `--motion-settle` while the rest fade and the camera
eases, never a cut (sampled: a page 480px in 230 ms on the motion curve); **the islands are
bodies** (`library-islands-physics.ts`, owner question 2026-09-18 "doesn't it move like a
force graph?"): a folder's islands start near the middle of the map and are pushed out to
their places, largest first, in about half a second — the picture assembling rather than
appearing — and dragging an island carries it while the islands it runs into are shoved
aside and settle back once it has passed; a map laid again while showing keeps each island
where it stands. At rest nothing moves, which keeps the 2026-09-08 rule; the physics is a
spring home, a separation that leaves no two bodies overlapping, and heavy damping at a
fixed step, deterministic and bounded;
a dot on the overview takes a press only from an 8px radius, a real target. Inside an
opened island, and on any folder whose page column folds, **folded pages stand in stacks**:
each sub-column of pages keeps the files its pages read as a small grid directly to its
left, rows aligned, so no citation crosses another stack's names. Measured in Chrome:
3,424 marks in 26 islands at a 2.5 ms frame; 11,240 marks in 42 islands at 4.8 ms, every
island named — the quiet overview paints in four fills, one per ink. The layout itself
takes 36 ms at 10,000 files and 107 ms at 30,000 (`library-islands-layout.perf.test.ts`).
What the measurement had to raise locally is the folder walk's own cap,
`VAULT_WALK_MAX_ENTRIES` (50,000 since 2026-09-18, mirrored in Rust; 4,000 before): past it the walk truncates and says so,
so a folder of ten thousand files is not yet a folder the Library sees whole. Gates:
`tests/e2e/library-graph-islands.spec.ts`. Decision:
`docs/records/decisions/2026-09-18-library-islands-map-*.md`.

**Four gestures, and a picture that is still until a hand moves it.** A drag on a mark
moves the whole picture, the same pan a drag on the background makes — a mark has a place
in its column, not a position a hand may improve (under the earlier force picture a drag
pinned the mark and the springs pulled its neighbours after it). The wheel zooms
about the pointer between half and four times the fit; dragging empty canvas pans;
double-click and a `ChromeTile` in the canvas's corner fit the whole picture; a coarse
pointer gets one-finger drag and pinch. Which gesture a press *is* is decided once, at
pointerdown, past a 7px threshold. Hovering holds the mark, its neighbours and their edges
at full ink and dims everything else to 35% over `--motion-fast`. Marks are graded by
degree inside a band that follows the canvas (below), edges are quadratic bows deeper the
longer they run, and every mark clears a halo of the canvas ground one line width wide. Under `prefers-reduced-motion` there is no settle: the
simulation is run to rest synchronously and drawn once, and
`tests/e2e/library-graph-alive.spec.ts` proves the canvas is byte-identical frame to frame.

**Hover changes ink, never position, and a settled picture stops the loop** (2026-09-08).
The canvas used to keep a 0.28px / 7.2s **ambient drift** after it settled, repainted one
frame in four so it would never read as a frozen image. The owner looked at it in the
installed app — *"why does it wriggle whenever the mouse is on the graph? … get rid of that
effect"* — and it is gone: no phase, no clock, no per-frame offset. Measured at 1400×860 on
the seeded folder, three idle seconds went from **362 `requestAnimationFrame` callbacks and
0.74px of travel to 0 callbacks and a byte-identical bitmap**, and a slow hover across the
canvas from 0.58px of mark movement to **0px**. What is left wakes the loop only for what a
person did: hover, focus and selection for their dim ramp; drag, release, resize and a
changed folder for the physics.

**The caption row was the larger half of that**, and it was invisible at the width it was
built at. The line under the canvas swaps the legend sentence for a description of the
pointed-at mark, and the two are different lengths: measured on 2026-09-08, at 1040×720,
768 and 390 the legend wraps to two lines and the description does not, so the row lost
20px and the `flex-1` canvas above it **grew by a whole line-height the instant a pointer
touched a dot**, re-fitted, and moved every mark — fifty times the ambient drift, on every
hover, at every width except the one the picture was last measured at. Both sentences now
lie in one grid cell, so the taller sets the row's height and the visible one never changes
it; the canvas height delta across a hover is 0px at 1400, 1040, 768 and 390.
`docs/DECISIONS.md` (2026-09-08) carries the reversal and what the 2026-09-07 record staked
on the other answer; `tests/e2e/library-graph-alive.spec.ts` owns the standing gate — a
settled canvas that asks for a frame, or a mark that moves under a hovering pointer, fails
it.

**Three composition fixes came with it**, each measured on the same folder. An unattached
mark's ring now starts on the **vertical**, where the fit has slack — the connected mass
settles wider than its canvas, so one loose page at three o'clock used to stretch the
picture to aspect 1.79 in a 1.25 box and leave a third of the height empty; vertical fill
went 0.65 → 0.91 at 1400×860 and 0.49 → 0.89 at 1040×720, and the closest pair of marks
gained 61 → 72px and 30 → 44px of clearance. The ring stands off the mass's **bounding
box** rather than its centre of gravity, so the standoff is the distance the code states
instead of the mass's longest half-span. And a standing name is now legible where the mesh
is densest: it takes **its own mark's ink** (a source's name was set in the edge ink, 1.17:1
from every line crossing it), it is stroked in a **2px** ground halo — wider than the 1.5px
citation line that used to run through the glyphs — and it is shortened **in the middle**,
so `volunteer-email-2026-09-02.txt` and `…-05.txt` no longer render as one identical
`volunteer-email-2026-0…` on two different squares.

**Each group of the folder gets a place, and the ink is sized to the canvas**
(2026-09-12). The graph became the Library's home the same day, and the owner read the first
frame of it as *"an ugly popup, very poor"*. A folder is usually not one graph — the owner's
is four groups: two clusters, one page with its single source, and the files nobody has
written up — and held in one field with one centre the only force with an opinion about where
two *unconnected* groups go is mutual repulsion, whose answer is always the walls. Measured
at 1512×901 on a 1088×819 canvas: three clusters at three walls, a **167px** horizontal band
holding nothing, and **54%** of a fixed 6×4 grid occupied. (The 99.8% bounding-box fill
reported at the same time is the number that cannot see it: four marks in four corners fill a
box perfectly.)

So the groups are **composed**. Each connected component is settled on its own by the same
forces, its measured footprint is packed into a column of an arrangement shaped like the
canvas, and its gravity is re-aimed at that place with cross-group repulsion removed;
collision stays, so no mark ever sits on another, and every distance *inside* a group is
still the springs', drawn at one uniform scale. Unattached files become one more group with a
place of their own — a folder that is one connected mass keeps the ring around that mass, and
that case measured better that way. The arrangement is searched for: every assignment of six
groups or fewer to columns is placed, fitted to the canvas and scored on the grid it leaves
empty, because four earlier forms of the search each optimised something other than what a
person sees and each traded one folder's hole for another's. Measured after, on the same two
fixtures and a sixty-mark folder at 1512×901 and 1040×720: occupancy **0.54 → 0.83**,
**0.50 → 0.63**, **0.58 → 0.88**, **0.54 → 0.67**, and the tallest band **167 → 58px**,
**226 → 80px**, **121 → 38px**, **139 → 58px**. Width filled on the sparsest folder went
**0.62 → 1.00**. The sixty-mark folder is one component and is unchanged.

The ink then follows the canvas rather than the 320px strip this graph was born in. The mark
band grades from the room each mark has — the side of the square it would get if the canvas
were split evenly between them — floored at the 10px top 2026-09-06 measured and capped at
17px, where two marks citing one file would start to touch: twelve marks on 891,000 square
pixels now wear **34px** where they wore 20. The two relation widths, the mark halo, the
name's ground outline and the fit's own padding all scale with that band and never below the
values they were measured at, so a dense folder keeps exactly the lines that shipped. A
page's name takes the ramp step above a file's (`--text-body` against `--text-label`), read
from CSS rather than copied, because the page is what somebody wrote and what this screen is
for. And the canvas stands on the **map's own blueprint grid** (`--map-grid-minor` /
`--map-grid-major`, 24px minor and 120px major in screen space, never moving), so the two
canvases in this product share one floor. Every mark still clears the 3:1 non-text floor over
the worst of that ground — page 12.77:1, source 5.74:1, concept and edge 4.90:1, the selected
node 3.97:1 over a major grid line — and the grid is 1.07:1 from the canvas it rules.
`tests/e2e/library-graph-picture.spec.ts` holds the occupancy, the band, both fills and the
name placement at both windows on all three folders.

**A press opens a card beside the mark, and the picture shows where knowledge flows**
(2026-09-12). A press used to leave for the page, which is the one thing a person cannot
undo by looking: the owner, on this screen — *"when I click it just navigates straight to
the page; I want a press to raise a popup that shows me something, and for the motion to
show something like knowledge flowing."* A press now holds the neighbourhood's ink and hangs
a ≤320px card off the mark, one gap clear of it and clamped inside the canvas — so it can
reach neither the mark it belongs to nor the clauses above the picture, and it flips to the
mark's other side, or below it, rather than spilling off an edge. The card says, in this
order: the mark's own glyph, its name and its kind; one sentence (a page's `## Summary`
opening sentence, a file's format · size · state, a concept's place); one facts line, amber
the moment a citation cannot be vouched for; the marks at the other end of its relations with
each one's state, five of them and a door to the rest; then the doors — `Open`, which is the
commit the press used to be, `Ask for a redraft` where a stale page has something that could
write one (the folder's existing Compile brief, not a second write path) and the sentence
saying why where it has not, and `See it on the map` for a concept. Escape, a second press on
the same mark, a press on the empty canvas and the card's own `✕` each close it and give the
canvas its keyboard back; a double press is still the shortcut straight to the page.

Three motions carry the direction, all bounded: while a card is open its **citations drift**
from each original toward the write-up — one 9px dash period per 900ms canvas settle budget,
measured at 10px/s, stalls 0 and cv 0.33 on a real 60fps recording sampled at 66ms; the
**amber midpoint** of a citation the folder cannot vouch for breathes once per 1.8s while its
card is open, and once for every standing dot as the home arrives; and a page Compile has
just written **brightens** while its own citations drift once toward it. Under
`prefers-reduced-motion` each becomes a still equivalent — a chevron on the line and a
full-size amber dot — and the canvas is byte-identical frame to frame with a card open.
Nothing else moves: at rest, and with a concept's card open, the loop asks for zero frames.
The added frame cost is +0.05ms at 372 marks and +0.53ms at 992 (`< 2ms`, gated in
`library-force-simulation.perf.test.ts`); in a browser a frame with a card open averages
1.29–1.74ms at 372 marks. `tests/e2e/library-graph-card.spec.ts` holds the geometry, the
three ways out, both commits, which lines flow, the bounded arrival breath and the frame
budget; `library-graph-card.test.ts` sweeps 1,638 mark positions for the two rules a
screenshot cannot check — the card never covers its mark, and never leaves the canvas.

**A stale citation is visible on a small folder and calm on a large one** (2026-09-13). Every
unverified citation carries its amber dot at rest, at every window, up to **64 standing dots**;
past that the picture stops repeating the fact and the strip's `N sources changed` clause says
the number instead. The dots are still drawn for the citations a reader has in hand — the open
card's own, the pointed-at mark's neighbourhood, and every one of them while that clause is
held, which lights both ends and prints both counts — and it is all or nothing above the cap,
never a sample, so an undotted citation cannot be read as a fresh one. The budget is the
canvas's own ink: the standing amber holds no more than **4%** of it at rest. Measured on the
four picture fixtures at 1512x901, 1040x720 and 1920x1080: the three folders under the cap are
unchanged pixel for pixel (the six-document folder keeps its 97 strict-amber pixels at 1512),
and the three-hundred-source folder with 480 unverified citations goes from 5,202 amber pixels
and 15.57% of its ink at the narrowest window to 0, with total graph ink down 9.5-22.4%.
`tests/e2e/library-graph-picture.spec.ts` holds both arms and the three routes back.

**The original and the write-up cross both ways** (2026-09-06). A wiki page's header names
the action: one cited source is a single **View original** button carrying the file name;
several keep a list under the same words; a citation naming a file that is not in the
folder is drawn as plain text, because a door that leads nowhere is worse than a stated
fact. Both crossings are drawn as list rows at the index's own 36px step rather than as
32px chips, because opening a document is one job and it was carrying two heights
depending on which pane a person pressed from; the source pane's label column moved 132 →
148px for the same reason, matching the shelf's. A source's pane answers the other direction with **View write-up** — every page
citing it, each marked `current`, `part of the file`, `behind`, or `not checked` from the
sha256 it recorded and its own truncation record
— and, when no page cites it, the Compile button in that row's place. `not checked` is its
own word because hashing is lazy: reporting an unmeasured file as `behind` made this pane
contradict its own state row, which reads `checking` in exactly that window. Both directions are derived in
`buildLibraryPairing` (`src/entities/docs-vault/lib/vault-library.ts`) from the same
`sources:` and `source_hash:` frontmatter the state machine already reads, so no second
store can drift from it.

**A citation shows the passage it names** (2026-09-11). Pressing
`[[src:sources/settlement-policy.md#l14]]` opens the source's pane as before, and the pane
now reads that one file and renders the unit the anchor names under a **Cited passage**
section (`library.source.passage.*`) — verbatim, at `text-body-lg` on a soft card, with up
to two units either side at `text-caption`, because a hard-wrapped line ends mid-sentence.
The label is the extractor's own precision and no finer: `line 14` for a line, `record 3`
for a CSV record, `heading: Records` for a Word heading, `sheet Quarterly · row 3` for a
workbook row. A heading address names the heading **and** the paragraphs beneath it, so a
DOCX section arrives whole. An address the file no longer holds says exactly that and
shows **no** text — the paragraph beside a renamed heading is not the cited one — and
names alternatives only where the extractor itself reported that heading occurring twice.
A PDF keeps its page number and the Finder door. The bytes come from the handle the folder
walk already granted (`read_vault_binary_file` in the app, the File System Access handle in
a browser, one ability on both surfaces), the text is stored nowhere and dropped when the
pane closes, and nothing leaves the computer; the pane therefore stops saying Atlas has
never opened the file, and its sha256 row says it was measured on this read. The splitter
is `src/shared/lib/source-passage.ts`, the MCP `read_source` reader's twin, pinned unit for
unit by `tests/contract/source-passage-parity.contract.test.ts`; it carries its own
raw-DEFLATE decoder (a Word or Excel file is a zip, and the app's macOS floor does not
guarantee `DecompressionStream`) and verifies each zip entry's CRC-32, because what it
renders is offered as the document's own words. Measured on a six-source folder: 70 units
across Markdown, CSV, HTML, DOCX and XLSX, byte-identical between the two readers, and 26
of 31 citations resolving — the other five are two pointing at a file the folder does not
hold and three addresses their files no longer have, all of which a reader could only
discover before by opening the documents themselves.

- **Sources** — every non-`.md` file under `sources/**`, listed by name, format, size and
  one state. Listing one opens nothing; the walk records what a directory listing already
  holds, which is why a folder of PDFs adds nothing to the map. The one read is a
  **citation's press** (below), and it is that file only.
  - `not compiled` — no wiki page cites it.
  - `compiled` — a page cites it and the sha256 it recorded still matches the file.
  - `read in part` (2026-09-07) — the hash still matches and every page citing it says,
    through `sources_truncated:` frontmatter, that it read only the first part of the
    file, so the row counts as waiting for Compile and the stepper says in one sentence
    that a second run picks up the rest; a file that then changes becomes `stale` instead.
    It wears the amber `stale` wears, because the shelf counts both as rows to act on and
    a neutral chip on a counted row reads as nothing to do (owner, 2026-09-07); the word,
    not the colour, is what tells the two apart.
  - `stale` — the hashes disagree, or a page cites it without recording one.
  - `checking` — cited with a hash, not yet measured. Hashing is lazy and only ever asked
    for on cited files; the app hashes natively, a browser with `crypto.subtle`.
  - A row opens the file: the app reveals it in Finder (reveal, never launch), the browser
    hands over the bytes it was already granted.
- **Wiki** — Markdown under `wiki/**` with no `kind:`. Each row shows `created_by` and,
  when the page does not fit the contract, the first problem code `wiki-validate` prints
  (`section-order`, `uncited-fact`, …), the folder's own findings included
  (`orphan-page`, `dangling-wikilink`, `shared-source-unlinked`). Only the page's own
  problems and a broken link make a row **off-template**; an orphan or an unlinked
  shared source is named on the row and in the Check-the-wiki brief but not counted,
  because in a two-page wiki with no links yet every page is an orphan. The shape is
  `docs/ONTOLOGY-ATLAS-SPEC.md` §11,
  and `wiki/_template.md` is written into every new vault by `ontology-atlas init`.
  Files under `wiki/` that start with `_` are the wiki's furniture, never pages: the
  template, and `wiki/_log.md`, which the app appends to after each Compile (the sources
  handed over, the pages the folder shows new or revised) and each Check-the-wiki run
  (the counts the report ended with). A person who does not commit their folder still
  has the wiki's own memory; a person who does has a commit body ready. The *Check
  results* page reads the last check back at its head, with its time.

Tour one-click doors: hree one-click doors, plus one that reaches outside this computer:

- **Add files** — app: a native panel, and Rust copies the bytes into `<vault>/sources/`
  so the WebView never holds a document. Web: `showOpenFilePicker`, written through the
  vault handle. A second copy of the same bytes is refused by sha256 and the refusal names
  the file that already holds them. Under the button: the folder is the interface — drop
  files into `<vault>/sources/` in Finder and the list updates by itself.
- **Find documents** — proposes candidates from the open folder and from each bound
  project root, **metadata only**, nothing copied until a person ticks a box in a blocking
  dialog with every box unticked. Document formats only (`pdf docx doc xlsx xls csv pptx
  ppt txt rtf odt ods odp epub`), dotfiles, dependency and build directories, and
  credential-shaped names excluded. Refusals are remembered in `localStorage` per folder —
  a per-machine convenience, never a second store in the vault. Project roots are app-only
  (a binding is an absolute path); the dialog says so and links to `/download/`.
- **Bring from a service** (new 2026-09-07) — the door for documents that are not on
  this computer at all. Owner: *"connecting a service is mostly for the Library anyway —
  people want the things they already wrote somewhere else."* Tiles name services, not
  protocols — Notion, GitHub, and last, a way out to the technical dialog on `/mcp` for
  anything else. **This path never says MCP, stdio, npx or environment variable**; a
  component test asserts that. Three steps: ① the person pastes the one value the service
  issues, with a link to where; Atlas puts it in the keychain, writes the connection into
  the folder with the name only, and switches it on — saying that the **coding agent**, not
  Atlas, is what reaches the service with it; ② the person says what to bring, in their own
  words; ③ a bounded brief opens the Library's existing agent turn, which searches, lists
  at most twenty documents, waits to be told which, and writes each one under
  `sources/<service>/` with `source_url` and `fetched_at` in the frontmatter — **through
  the permission card that already exists**, one card per file, and forbidden from
  touching anything outside that
  folder. **Confluence and Jira left the tiles on 2026-09-07**: both rode Atlassian's hosted
  address, which signs in with OAuth, and the in-app session cannot open that window (the
  measurement is in the decision record); a tile onto a connection the agent can never use
  is the dead end this door exists to remove, so they return with an adapter that can sign
  in. **Google Drive is deliberately absent**: no entry in the committed catalogue has
  verified facts for it yet, and a tile onto a guess is a door that opens onto nothing.
  **What is not proven**: the picking happens inside the agent turn, not on this screen,
  because Atlas is not the MCP client and cannot call a service's tools or receive their
  result as data. Nothing here has been observed against a live Notion or Atlassian
  account; the screen says where the choosing happens rather than promising a list it
  would draw.
- **Compile** — starts one in-app ACP turn whose brief embeds `wiki/_template.md`
  verbatim and names `wiki-validate` as the acceptance test. Enabled only while some
  source is not compiled or stale. Beside it: the coding agent's provider traffic is not
  in `.ontology-atlas/llm-audit.jsonl`. A page under `wiki/` that fits the contract is
  written without a card and the conversation says so in one line (2026-09-07, owner
  direction: agents act, people can step in); Settings › *When the agent writes a wiki
  page* — "Write at once" / "Ask each time" — brings the card back for every page, a
  setting rather than a door because it governs every Compile, Fix and proposal (owner,
  2026-09-07: two chips beside the doors read as scattered). A page that does not fit,
  and for a page under `wiki/` the card shows the verdict first: the page as the write
  would leave it (a whole file, or an edit applied to the page on disk), judged against
  the contract, one quiet line when it fits and the codes with the first message when it
  does not. Allow and Don't stay where they are; the gate is the person.
  The dock opens on this screen, above `AcpDockHeader` a lucide `Library` glyph and the
  destination's name: Compile is a job, not a place, and the job runs beside the shelf it
  is compiling. The brief lists the pages that already exist and asks the
  writer for one page per source, named after it and never folded into another (a page
  is what one document said), to link the pages it touches both ways, to record a
  disagreement on both pages with both citations, and to write nothing for a source
  that adds nothing. Updating the same source reuses its own page. The brief compares
  claim scope, source dates, source approval/draft status and policy/observation roles
  before leaving a difference unresolved: an explicit approved replacement is recorded
  as such, while recency alone or an observed configuration does not change policy.
  It also asks the writer to revisit existing gaps on updated pages, resolve only the
  parts new evidence answers, qualify obsolete absence wording and keep unanswered
  source-specific limits. Personal notes remain attributed and verbatim; retained
  answers still require their separate refresh/revision action. These are instructions
  to the agent, not a semantic validator or a filesystem protection guarantee.
  The ACP brief supplies the measured Compile click time for `compiled_at`, so the
  agent receives a concrete value to copy without querying a shell or inferring a
  date. This is request-time guidance, not an app-attested completion receipt.
- **Check the wiki** — starts one report-only ACP turn over `wiki/` for what
  `wiki-validate` cannot decide: two pages disagreeing, a claim a later page replaced,
  two pages that share a topic or a source without linking, and a name on three or
  more pages with no page of its own, which the brief labels an ontology node
  candidate. It modifies nothing; enabled from two pages up, since one page has
  nothing to disagree with. The report ends with one block a program reads — the
  count per category and those names — and the Library opens the *Check results* page in
  the pane, whose **Names without a page** section lists them five at a time, the map kinds
  first, the rest behind a count a person can open; the counts go to `wiki/_log.md` in one
  shape in every language. The
  report sorts each name: something the code builds (a domain, capability or element),
  a person, an organisation, or other. Only the first sort gets a **Propose as node**
  chip, and only in a folder that already holds an ontology — a folder of documents
  with no `kind:` node is a wiki on its own, and nobody who opened it asked for a map.
  The chip starts one agent turn that reads the pages carrying the name and the vault's
  own kinds and domains, then calls `add_concept` once, citing those pages as
  `[[wiki/…]]` links in the node's body. The write reaches the ontology-write card like
  any other; nothing touches the wiki pages, and `describes:` stays the person's to add
  after review. People and organisations stay names in the wiki, linked by the pages
  that mention them: the map is the code's ontology, and this is the one place the
  wiki flows into it, through the person. The brief carries what the script already found (the page
  and folder codes the Wiki list shows) and asks the agent not to repeat them, so the
  model's reading goes to judgement.
- **The local-model route** — when Agents → Models holds a verified
  connect-by-address runner (any OpenAI-compatible `/v1` server: Ollama, LM Studio,
  llama.cpp, vLLM), the shelf names that model and its host as the brain. It says nothing
  leaves this computer only when the saved host really is this computer; a runner reached
  over `https://` at another address is named as one, because `normalize_base_url` in
  `src-tauri/src/llm.rs` requires loopback for plaintext but accepts a remote TLS host.
  `.ontology-atlas/llm-audit.jsonl` records each request either way.
  **It compiles** (second pass, 2026-09-06). The 2026-09-06 record left this route a named
  brain because the runner's tool catalogue read and proposed ontology concepts only, and
  wrote its own reopening condition: *a local tool catalogue that reads a source and writes
  a page under one consent card reopens local Compile.* That catalogue is
  `src/features/vault-agent/model/compile-tool-catalog.ts`. Its three Compile-only tools
  stay outside the MCP-mirrored `AGENT_TOOLS`. `read_source_text` opens one
  file this folder's own walk found under `sources/` and this bundle can decode — Markdown,
  plain text, CSV, TSV, JSON and HTML with its tags stripped — and returns it with every
  paragraph numbered `[p1]`, `[p2]`, capped at 8,000 characters with `truncated` stated
  rather than hidden. A PDF, Word, PowerPoint or Excel file comes back **unread and named**:
  reading those needs a parser Atlas does not ship, and shipping one is deferred rather
  than guessed at. Any other path — absolute, `..`, a backslash, or simply not in this
  folder — is refused before the disk is touched. `read_wiki_page` returns an existing
  write-up as untrusted context in sequential 4,000-character chunks. A replacement
  requires the receipt returned after the complete current page has been read; skipped
  chunks, unreadable pages, changed text or timestamps and stale receipts block it.
  The Wiki context counts against the same 40,000-character turn budget, and does not
  establish raw-source citation support. Human notes remain attributed prior context;
  the model is instructed to resolve answered questions while preserving the remainder.
  That instruction is not a guarantee of semantic preservation.
  Local source reads also return up to three related wiki suggestions: an exact shared
  source takes priority, followed by rare lexical terms in titles and cached bodies,
  including a Korean bigram fallback. The index is built only when Compile starts,
  reusing the Library read cache. Results report searched pages, body-cache coverage
  and omitted matches. Cached bodies are isolated by folder session and page version,
  so switching to a same-named page in another folder cannot reuse its predecessor.
  Suggestions carry no truth, currentness or complete-read authority;
  a match still requires `read_wiki_page`, and no match does not prove absence.
  Existing inventoried nested Wiki pages keep their exact paths. Retained answers
  under `wiki/answers/` use the explicit answer-refresh/revision workflow instead
  of ordinary Compile replacement. `propose_wiki_page` takes fields, never
  Markdown: Atlas assembles the five sections itself and mints `created_by: model:<name>`,
  `compiled_at`, `sources:` and `source_hash:` from the bytes it actually handed over, so a
  page cannot claim a document the model never opened. **It writes nothing.** The turn ends
  at one card that names, per page, the path it would take, what each of its five sections
  carries, the full current and proposed text, how many citations it holds, which sources it was written from, which were read
  only in part, and which could not be opened at all; only Allow once writes, through the
  same `applyProposal` a concept change takes. The card displays the exact proposed
  Markdown and lets the person switch to the complete previous page; a new page has
  only its proposed preview. Local work owns the reader pane while running or awaiting
  review, including folders with retained questions and an already selected document.
  On narrow screens it uses the whole pane instead of competing with the index;
  closing the work view returns to the previous selection. Before applying, local Compile compares
  every selected replacement's exact prior text and timestamp with a fresh file read;
  a detected correction refuses the write before any selected page is saved. Writes
  remain sequential, with no claim of transactional rollback after an I/O failure.
  Source hashes are computed from the complete buffer read, not a later reopening
  of the source path. A page that fails the contract produces no
  proposal at all, so the card has nothing to offer and shows the exact problem codes
  instead. Beyond the shared `validateWikiPage` rules the proposal adds two: every
  `## Decisions` bullet cites, and **every citation anchor resolves inside the bytes read
  this turn** — the shared validator captures an anchor and never opens a file, so
  `#p47` in a three-paragraph document would otherwise pass and land as a citation a reader
  cannot follow. Three pages per turn, ten rounds. A folder with existing pages targets
  one waiting source per turn to leave room for reading and revising its affected pages.
  A source can have a current write-up while another citing page still needs review:
  changed and unmeasured hashes on any citing page keep that source in the Compile queue,
  and both the ACP brief and local prompt name the exact pages to recheck. Hashes pending
  measurement do not create speculative revision work. Unfinished pages stay queued;
  arrival order alone never establishes which conflicting claim is current.
  The button goes live only for a loopback
  runner, because whole documents now leave the process and "on this computer" has to be
  true rather than named; a remote saved address and a folder whose waiting files all need
  a parser each get their own sentence naming what is missing rather than blaming the
  route. Measured on this machine 2026-09-06 against Ollama: `qwen3:8b` (65s) and
  `gemma4:12b` (82s) each read both sources and proposed both pages with every bullet cited
  and every anchor resolvable; `qwen3.6:35b-a3b` proposed pages with no citations at all,
  which the card refused with `uncited-fact` and no write action.
- **Which brain runs is chosen, not ranked** (owner, 2026-09-06, second pass).
  The Compile request names the selected runner as writer. Local requests use their
  bounded readable target list and three-tool proposal workflow, with paragraph
  citations and metadata supplied by Atlas. ACP requests retain their source
  readers and Markdown template, while saving follows the selected write mode
  and runtime permissions. Chronology, unresolved gaps, personal notes and
  retained-answer rules are shared across both paths.
  A verified coding agent still opens formats the runner cannot, so it stays the **default** — but it
  no longer outranks the runner, because the reason a local runner is set up at all is to
  be pointed at a folder whose documents should not leave the machine, and a precedence
  rule takes exactly that choice away. When this computer offers both, step two's
  **Runs on** row and the index's wiki header each draw one select naming them as the
  shelf already does (`Claude Agent` and `gemma4:12b on localhost:11434`); the answer is
  stored per machine in `localStorage` beside the chat width, both surfaces read and write
  that one value, and the sentence about what leaves this computer switches with it. With
  one brain available nothing is drawn — a select that cannot change anything is not a
  choice — and a stored answer naming a brain the machine no longer offers falls back to
  the one that is there **and stops being stored**, so a preference never outlives what it
  points at. `resolveCompileBrain` is that table, tested as one.

**Graph** (2026-09-06) — **the pane itself** whenever nothing is chosen, drawing the same
two file kinds the lists carry, plus the third thing they reach: a raw
source is a square, a wiki page a filled circle, and an ontology concept a page names with
`[[slug]]` is a ring. A solid line is a citation from the page's `sources:` frontmatter; a
dashed line is a mention from its body — and, since 2026-09-07, the other way too: a map
node whose body cites `[[wiki/…]]` pages is drawn as a ring with a dashed line to each,
so the node the wiki proposed shows its evidence on the Library's own picture. A link
that resolves to nothing is not drawn, and a
source nobody has written up simply has no line, which is the same fact the `not compiled`
word carries in the list. The caption counts what is on the canvas: sources, pages,
concepts, links; beside it stand the status strip and the door to the shelf. A citation is
drawn 1.5px against a mention's 1px, so the two relations read apart without the legend.
**Up to 60 nodes every mark carries its own name** — the page's title, the file's name, the
concept's title — standing under it in `text-label`, secondary ink for a page and
quaternary for the two things it stands on; a screen-space pass claims the marks first and
then each name in turn, sliding one back inside the frame rather than dropping it at the
edge and hiding only a genuine collision, so no two names ever cross. Above 60 the picture
is an overview and a name is something you ask a dot for: hover keeps its box. Pointing at
a dot names it either way; clicking a page or a source selects it here, in
the index and in the reader at once, while clicking a concept opens it on the map, because a
concept is not a file in this folder. Selection is the only place indigo appears: the node,
its ring, and the edges that touch it.

It is **not the map, and separate on purpose** (`docs/DECISIONS.md`, 2026-09-06). The map
draws the ontology, whose nodes all carry `kind:`; neither a PDF nor a wiki page ever
becomes one. This picture answers the other question, what was read to write that down.
Layout is ForceAtlas2 (Graphology, already installed for the map's force pass) run to a
stop before the first frame, rotated so its longest direction lies along the canvas, then
fitted at one scale for both axes so distance means the same thing in x and y. It settles
once, over the 420ms canvas-travel duration, and then nothing moves; under
`prefers-reduced-motion` the settled frame is drawn at once. 500 nodes lay out in 95ms.

**The canvas is the pane, and is cut to the picture** (2026-09-06). It used to be a band
of at most 320px or `34dvh` above the reader, and one scale for both axes meant the height
decided how big the picture was: measured on the seeded five-source, three-page folder at
1512, a 1144px canvas carried a 462px picture — 40.4% of its width, with a 341px gutter
each side — while its height was already 86.6% used. Both premises went. The canvas takes
the pane's height, and it is never wider than the picture plus the fit's own label
allowance, so a cloud squarer than a tall pane leaves its slack split evenly rather than
gathered on one side. Measured after, both locales: **1046×623 of a 1088×900 canvas at
1512 — 96.1% of its width, against 40.4% — and 93.2% at 1040, 93.5% at 768, 88.0% at 390**,
with 21px gutters at every band. The picture itself is 2.26× wider than it was, and its marks are one step larger with it
(a page's circle r5 → 6, a concept's ring r4 → 6, a source's square 7.2 → 10px), because
marks sized for a 320px strip read across that field as specks. A hovered
name is truncated to fit rather than allowed past either edge. The settle also stopped
cancelling itself: its animation frame is held across effect runs, because the width the
canvas takes from the picture arrives after the first measurement and used to kill the
arrival 0.85 of the way in.

**What left `/docs` on 2026-09-06**: Sources, Wiki, the doors, and the agent dock.
What stayed: the review queue, recently changed, the tree, and the editor.

**The wiki index uses readable horizontal rows** (2026-09-09). Titles get up to two lines, with a short freshness caption below. The selected page has an indigo edge; changed or unmeasured source evidence and invalid page format keep distinct amber markers and accessible explanations. Search remains a ranked list. Compile marks the list busy without suggesting per-page progress. The graph opens through a labelled action above the reader instead of compressing the document into a third column.
