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
meaning across Sources, Wiki and Ontology. Ontology contains
Concept documents (the explicitly typed graph nodes) and Bookmarks (saved map
selections); their switch stands beside the tabs and takes a row of its own only when the
tabs would no longer fit beside it. Sources and Wiki draw the other two file kinds.

The Library supports general knowledge as well as documents associated with code.
Sources remain original files; write-ups and filed answers remain wiki pages.
Documents-only folders need no code nodes or separate mode switch. The ontology
retains its codebase scope.

During a browser import, the renderer withholds only the new paths belonging to
that copy batch and its newly created Chromium swap files until the batch settles.
Existing originals and unrelated folder changes remain live. This is transient
read coordination, not a persistent index or a filesystem transaction: a failed
browser copy can still leave a newly created empty target, and failures remain
explicit. The first completed collection enters with a finite opacity transition;
reduced motion skips it.

The Add files control keeps its label and icon seat while showing actual work.
The file picker remains neutral; a work ring starts after files are selected and
lasts through importing and refreshing the listing. A transient check marks new
files that landed without a failure; a failed result shows failure instead.
Cancelled selection and duplicate-only results stay neutral. Existing notices
retain the added, duplicate and failed counts. Reduced motion keeps the same
states readable without spinning, and results from an earlier folder or attempt
cannot animate the current control.

**Question desk (2026-09-27, recomposed 2026-11-20).** With nothing selected in Wiki, the reader pane
asks a question and searches locally only after a press. One document-width column
is top aligned: the title line, the field, the folder's search scope, then the
person's own trail or the results. The field keeps the same place before a question,
with results, after Show more and under a report. Before a question the desk lists up
to three saved questions (newest first, a state badge only when cited sources changed
or are missing) and up to five wiki pages by the day the folder lists for them, with
how many sources each cites; a folder with neither shows its first three originals.
Results are one list, best first: wiki claims and source passages fused by reciprocal
rank (`lead-fusion.ts`). A source passage at the exact place a listed claim cites
that says the same sentence (compared after NFC, case, spacing and trailing
punctuation) is folded into that claim, which keeps both ranks, so one sentence
stands once; a cited passage that says something else keeps its own row beside the
claim. The
best three show; Show N more appends the rest and moves focus to the first new row.
A row is the sentence (a sentence over 320 characters shows a window around its
first matched term, cut between graphemes with an ellipsis at each cut), question
terms in a stronger weight, then where it lives in
one label size: the page title or file name and its line, a badge only when a cited
source changed, is missing or nothing is cited, and up to two cited files that open
the source at the line, then "+N" for the rest. The head counts the rows; with no
match the no-match title is the head. An info glyph opens read coverage (omitted
leads named only when there are some), only the limits that are not zero, the
search method and the freshness caveat once in a popover. Asking again keeps the old rows until the new ones arrive and swaps them in
place.

**Search by meaning (2026-11-20).** In the installed app the desk can also find
passages that say the same thing in other words or in another language. It is
off until the person sets it up for a folder: a line under the field's scope
sentence says "Searching by words" with **Set up search by meaning**, which opens
the model dialog. Once a folder has a model, a **Model: <name>** chip at the end of
that line opens the same dialog, so the model is always named where it is used.
The dialog lists on the left every model the folder can use: the built-in bge-m3
(BAAI, MIT licence) and, where Ollama answers on this computer, its embedding
models that the spec does not rule out, each tagged In use, On this computer,
Download to use, Download not finished or In Ollama. A folder with no model yet opens on
Ollama's bge-m3, marked Recommended, while the built-in model is not downloaded,
since it needs no download; the built-in download stays one press away. The right side states the
chosen model's facts: before a download, its size from the hosts the app
downloads it from (huggingface.co, hf.co) and what stays on this computer, that
nothing from the folder is sent, the memory used, and that it can be deleted
here in one press or in Settings › Privacy · data; once downloaded, its size on
this computer and the folder that holds it, with **Open its folder**. **Delete
the model** works in one press under a sentence naming the space freed and that
every folder using it searches by words until it is downloaded again; the
dialog stays open and says what it freed. Choosing another model says the
folder's files are prepared again before its press; an Ollama model says each
question is recorded in the folder's audit log and that Ollama removes it. While
the folder prepares, the dialog says so and offers Stop instead of a switch or a
delete. A switch the app refuses keeps the earlier model. Only the dialog's Download and prepare downloads the model: Resume on a folder whose model is gone says so and offers Download again. The work runs in the background. While it runs and no
results stand under the field, a stage opens below the line: Moru at the work,
the steps Download the model, Fit it to this computer and Record each passage's
meaning (only the last for an Ollama model) with the running one lit, a bar for
that step, the line's sentence and Stop, then the download speed and minutes left
(or that the kept part is being checked) or the last three files read beside the
passages recorded so far. The stage keeps one height
through every step; with results on screen the job stays one line with its ring.
On a person's first visit in the app, while the folder searches by words and
nothing runs, a guide stands where the stage will: what search by meaning does,
a sample that plays by itself (made-up files: the model downloading, fitted,
files read into passages, then a question in other words finding an English
passage marked Similar meaning), **Not now** and **Set it up together**. The
sample takes no input, pauses off screen and while the dialog covers it, and
holds still on the answered question under reduced motion. **Set it up
together** opens the dialog as a walk of three steps: what happens, with this
computer's download size, free space and this folder's file count; then the
model; then the run, which is the stage on the desk. Only that step's primary
press prepares, as from Set up. Not now, or a preparation started from the walk,
retires the guide on this machine; closing the walk keeps it.
A first preparation that finishes in view says how many passages in how many
files carry their meaning, with **Ask a question**, which puts focus in the
field; a folder found ready and a finished update say nothing more. A download a
quit cut off says how much it kept and offers **Continue the download**, and the
dialog then recommends the built-in model over Ollama. An update of ten or more
changed files is followed the same way; a smaller one is one quiet sentence. Away from the desk,
the long-work card on every tab carries the same work after a press in this launch:
the download in GB, files prepared of the total with the file being read and the
minutes left, Stop and Hide, then the result with **Ask a question** or a failure
with **Open Library**. A preparation that continues by itself after a restart, or an
update of ten or more files, draws only the ring on the Library rail tile; the card
stands down while the desk's line is on screen. Once a folder
holds prepared files (ready, still preparing, or stopped after at least one),
Find evidence asks the app for the 24 nearest passages in the top folders the desk searches, beside the word search,
and the list waits for both. A passage in a file the desk does not search is
left out; one that holds a word lead is that lead; otherwise its row is the
passage's first sentence, the first non-heading line of a source or the first
claim of a wiki page in its range, read from what the desk already read. These
are a third list in the same rank fusion, and each row's second line ends with
why it is there: Same words, Similar meaning, or both. A report's brief carries
the rows of that list in its order, whatever their reason. Once prepared, the line
says only "Searching by words and by meaning"; the coverage popover adds how many
files are prepared only while that is partial and, when some were, how many
passages were left out because their file changed. Such a search starts those
files' update at once; a list with nothing found says how many passages it left
out and, while that update runs, asks the question again when it ends. When meaning cannot answer,
the word rows stand with one sentence saying so, and the line says the same and carries the one press: a missing model is read back from the folder's status, and a runner that did not answer is held until a search answers or the app's next status event; its Download again
opens the setup dialog, which states the size and the free room before anything
downloads. The limits sentence, saved with a report and sent in its brief, says
the search matched words and meaning when meaning took part, and how many files meaning covered when that was partial. With nothing set up, a search that finds nothing offers setup before the
investigation action. The field's first focus in a visit loads the model so the
first answer does not wait. The web playground has no search by meaning and says
so in the line.
A matching hash
means the cited source bytes agree with the page's receipt; it does not verify
the sentence. Results from an older folder listing stay under a line saying the
folder changed, and the report action waits for a new search. The source units are cached only in memory for the current folder and
inventoried file version. An ACP Ask passes these as untrusted leads and asks
the agent to re-read originals and cite its answer; that turn disables automatic
Wiki approval, while the existing permission path still governs unexpected
writes. Jev remains optional in the installed app: a current cited claim opens
an exact-transfer consent dialog, and its result is advice on that pair only.
Neither a key nor an agent is needed to search or open the originals; on the web
there is no Jev press and no report action. The existing
Conversation control remains available on the inquiry and report surfaces, so a
person can choose a runtime or return to the transcript before starting another
report request. Saved questions retain their direct entry there too. Opening a
conversation does not submit a question or change permissions; only an explicit
Ask brief suppresses the folder's ordinary automatic-write policy.
Exact Ask retries retain that authority and their original report context across
runtime changes. A changed question, vault, or report version cannot turn a stale
report reply into an ordinary fileable answer.

**Report and document (2026-09-27).** One explicit ACP action turns the current
question into a report request: answer, cited originals, disagreements or
changed claims, and unknowns. The report stands under the field and above the
leads, which keep their place under the head "Passages the search found", with an
unreviewed draft label.
Zero local word matches do not assert that a differently worded original lacks
the answer; ACP can re-read the folder on request. Only citations to inventoried originals open
inside Library; on screen each shows the file name and its line (the shortest
trailing path that no other listed original shares when names repeat), with the
full address as its description and tooltip. Any anchor other than a plain line
number of at most seven digits shows the address as written, and a citation with
a second `#` stays inert, as the export treats it. The draft follows the current query and file listing:
editing the question keeps it, and it leaves when a new search's rows arrive or the
folder changes. Filing remains an explicit Wiki
review/write action. One editorial document template preserves the question,
response, cited addresses, search coverage and omissions in a local Markdown
download or the app's Print/Save as PDF flow; both keep the full addresses. Jev judgment is not exported as
accepted meaning. External links and images stay inert in Markdown exports;
unusual syntax that cannot be safely rewritten is preserved as a literal text
document. A failed agent action stays visible beside the question with a path
back to the conversation. The entry material leaving and the results rising are
one motion, appended rows rise in order, and an interrupted motion continues from
the value last drawn; reduced-motion settings show the end state.

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

Library has three tabs — Sources, Wiki and Ontology
(`LibraryTab` in `src/app/library-workspace/panel-arrival.ts`; labels in
`messages/en/library.json` `workspace.*`) — and each tab keeps its own reader and
file meaning. The run history of document schedules lives in Automations' Documents lane
([Automations](../automations.md)); the retired `?tab=rounds` address goes there. The mobile Library tab
inherits the former Docs slot; `/docs/?slug=…` remains a compatible exact-file link, using the
general Document reader only when the target is outside Ontology. The Ontology tree and all of
its displayed and restored working sets show only the five explicit schema kinds, and its name-and-path filter
matches both localized display names and canonical paths. New Wiki pages begin in a centered dialog that previews the live Markdown path,
draft state, and five required section headings before creation. The current local-work
receipt remains primary while earlier receipts are available from History; an app write's
matching folder-watch event is consumed instead of producing a second notification.

**Bookmarks (2026-09-28, renamed from Concept sets 2026-10-02; stored as saved constellations since 2026-09-15).**
Ontology → Bookmarks lists each saved selection's name, purpose, and ontology
concept count. The earlier Work scopes tab is a compatible URL alias:
`tab=collections` becomes `tab=ontology&ontologyView=sets`, preserving all other
parameters and the fragment. `ontologyView` is independent of the document
reader's legacy `view` parameter; drafts survive switching between documents and sets.
The set view stays available even when the folder currently has no ontology nodes. Expanding a row resolves
members by immutable UID against the current manifest; resolved names open the actual
Ontology document, unresolved members stay visible, and the whole set opens in Map.
The Map candidate keeps a separate `mapId` for map focus; the compatible `v1`
sidecar stores immutable UID identity and the manifest's exact `document.path` as
display-only `lastKnownPath`. Source and Wiki attachments stay
distinguishable from ontology members. Empty, loading, corrupt, and read-only states remain
explicit. With concepts available, creation routes to Map. With none, the primary
action opens the existing Ontology document starter, since a documents-only folder
redirects Map back to Library. Neither navigation writes a second collection.
The empty state centers its complete explanation and next action inside the available
pane; saved lists retain a top origin for scanning.

**Two panes.** The index on the left carries the active Sources or Wiki tab with that
list's own doors. The right
pane branches on the kind of file selected — a wiki page opens in the reading pane every
Markdown surface here shares (`src/widgets/doc-reading-pane/`), headed by its title and one
line naming the sources it was built from (the Wiki reader, below); a source opens as the six
facts the folder holds about a file Atlas has never opened (path, format, size, state and
sha256 or "not measured") plus one door that reveals it in Finder or hands over the bytes.
With no folder open the whole screen is one centred stage naming the two kinds of file and
offering the picker, and a folder that is open but holds nothing gets the same grammar with
the two doors instead. **With a folder open and nothing selected in Sources,
the right pane is the progress band over the Sources overview** (2026-11-21,
`docs/specs/2026-11-21-library-sources-redesign.md`; decision `docs/records/decisions/2026-11-21-library-sources-home-replaces-graph-ae902a78-d4ff-4e23-b6f9-9e34382bff9a.md`);
in Wiki it is the question desk. A folder with wiki pages and no source shows the empty
folder's start stage there. When the folder has a source, the **progress band**
(`docs/specs/2026-11-19-source-progress.md`) stands on top of the overview, at most 112px tall from `md` up, in four cells whose tops share one line (the number, the bar's middle, the chart's title and the button). The number: the percent of sources that
have a wiki page, rounded down (a share above 0 and under 1% reads `under 1%`), with today's additions on
its baseline, and under it the sentence in primary ink on one line; it carries a `title` only
when the line is cut. The bar: a 6px state bar, each state in its own `SOURCE_STATE_INK` (has a
page in the page ink, read in part hatched, changed after its wiki page in amber, checking and can't read in
their own inks, no page grey), 280–560px wide, and under it one row of state presses in bar order, each a
swatch, its word and a count, ending in a clear press (an × named `Show all N`) whose slot is held
from the first paint, so a press resizes nothing in the band. With one state the row stays empty.
A press shows only that state's rows in the index, combined with
the search; pressing it again, the clear press, or Escape clears it, and a press while the
column is folded unfolds it. The chart: a cumulative step chart by the `compiled_at` each page
records, at most 26rem wide, titled with what it counts and captioned with its first date and today's count, whose Left and Right keys
read each point, drawn only from three recorded days; without it the bar takes the room. The
action: the press that writes the next 10 waiting sources (3 on the local model), with how many
came back without a page or, otherwise, one line naming the connected agent that writes them (how
many wait after the press is the overview panel's foot), and in the app one work line under it
whose slot is held from the first paint: a running mark only while work happens, the kind of
work, the file's name (its path is the title) as a press that opens it, and `Recent N`, which opens the last three in an
anchored list. On the web, where nothing can write, one line says only the app writes pages and
a Get the app button stands in for the press. Below a 60rem pane the number and bar stack, so
the band stays inside 112px at 1040. The percent and the sentence's count rise together on a
folder's first visit in a session, drawn only once the count starts, and later move on from what
is drawn; at 100% the bar turns green and one light passes along it. Below `md` the chart steps
aside. A door that names its own sources (a source's Write wiki page, a stale page's refresh)
sends exactly those. **Under the band is the Sources overview**
(`src/widgets/library-sources-overview/`), drawn from the facts the folder already holds and
no canvas: on the left a table with one row per first-level folder under `sources/` (per file
type when there are fewer than two folders; a switch picks either), each row its name, its
source count, a state bar in the band's inks with its share, how many wait, and the day of its
latest wiki page; under the table the five pages written last, each a light written sheet with the source it came
from and its date on one line; on the right the files the band's write button sends next, in its
order, each marked only when its state is not the panel's usual no-page, under the press's
explanation and, in the app, what leaves the computer: Atlas sends sources nowhere, and an agent
given a page to write or a question reads the sources it needs, which may reach that agent's
service. A short window scrolls the list, never that text or the foot. Rows arrive as
the folder is read, sort by a header press and hold their order while a batch runs. Pressing a
row tints it, gives the panel that folder's waiting files, and narrows the index list with a
`Folder: name` chip; the chip's ×, the row again or Escape clears it. The index list marks each
waiting file with one dot in its state's ink (the word in its title and for a screen reader),
a file with a page with nothing; the band's legend names the dots. **The Library's doors are in the page
header**, its only controls at the end, as 36px chrome pills: `How to use`, the saved questions,
`Conversation`, and `Review updated answer` while a proposal waits; below `lg` they fold into
More. A door stays in its place while its surface is open, wearing the raised surface the tab
strip gives its current tab, and a second press closes it: `Conversation` too, beside the open
dock, whose own close and Escape still work. A running turn behind a shut dock shows as a dot in
the Conversation door's icon seat, with the phase in its tooltip and accessible name, so no door
changes width. Every Sources and Wiki state carries exactly one Conversation control and one Questions
control; the reader's top row carries the work line at its right, and the question desk keeps its
compact one. `How to use` holds the three source-to-wiki steps in an anchored popup and raises
itself once per machine; at exactly one saved answer the questions door is that question, so
reopening it is one press. Selecting a document replaces the overview or question desk. The
index's first row gives it back — `Find evidence` on Wiki, `Overview` on Sources, selected
while that home shows — as do a press on the tab already shown and Escape; focus then lands on
that row. The row above an open document starts with the document's own facts and is one
height for every kind. Below `lg`, Sources keeps the overview above the index;
Wiki gives the question desk the available height and opens its page index with
an explicit Browse action and return focus. A folder that holds wiki
pages and no `kind:` node opens here rather than on the map: it is a wiki on its own, and
an empty canvas had nothing to say to the person who chose it (ledger, 2026-09-06). A
folder with even one node still opens on the map.

**The Wiki reader speaks about the page in front of you** (2026-11-20, W2 in
`docs/specs/2026-11-20-library-rooms.md`). The row above an open page holds Close, a Back
press while links have been followed, the page's state, a changed-source badge when a cited
file's sha256 differs from the one the page recorded, and who wrote it when; the folder's counts stay on
the Wiki home and in Check results, one Close away. A link reads as its target's title from
the listing already in memory (no other page is read): a concept carries its kind glyph and
opens in the Ontology tab, a page opens in place and Back returns to the scroll it was left
at, a page's link to itself is plain text, and a link to nothing keeps its written path in
danger ink and says, on hover, focus and to a screen reader, that nothing in the folder has
that name. A citation is a quiet chip after its sentence; pressing it reads that one file
exactly as opening the source would and opens a popover beside the chip (above it when there
is no room below, never over it) with the cited unit and one unit either side, the file and
line, the changed or missing state, and Open the source; a file listed above 5 MB is not read
and the popover says it is too large to show; Escape or a second press closes it and focus
returns to the chip. The page ends with three short lists by title — the sources it
cites with their citation counts, the pages that link here, and the concepts it names — each
row the same height and wrapped rather than cut. A desk row opens its page at the block that shows its claim
(at the top, unmarked, when none does): one scroll when the claim is off screen, none when it is already visible, and a mark behind it
that holds for 1.2s and fades over the slow duration (at once and without a fade under reduced
motion); Close returns to the desk with its results and scroll as they were.

**What to do next, one press from the page header** (2026-09-06, third and fourth
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

**An empty folder is one drop-first stage** (2026-11-21, F2 in
`docs/specs/2026-11-21-library-words-and-first-run.md`). With no sources the screen is one
640px column anchored at the top, so a block that arrives later moves nothing above it: one
title, one sentence naming the connected agent (or the folder-only sentence when wiki pages
exist without sources), the drop area with **Add files**, a line naming the sources folder
inside the open folder (with **Show in Finder** or **Show in File Explorer** in the app and
**Find documents**), the line that copying leaves the original files where they are, the
sentence about what leaves the computer, and **Bring from Notion, Jira and more**. Without a
connected agent the app adds one line and a link to the agents page; the web says writing
wiki pages needs the app. No index, canvas, status strip or popup.

**Documents already in the folder lead.** On arrival the stage runs the metadata-only walk
**Find documents** runs. Files inside the open folder but outside the sources folder sit
above the drop area: the count, a chip per first-level folder with its count, **Copy all N
into the sources folder** and **Choose files to copy** (the find dialog, filled). Markdown is
offered only from the open folder, never a file the ontology knows as a concept (`kind:`),
never under `sources/`, `wiki/` or `.ontology-atlas/`, and never a repository guide; Rust and
the browser apply the same rules (`source-discovery-rules.contract.test.ts`). Files only a
connected code folder holds stay a quiet suggestion below the folder line: up to four sheets,
**Add N**, and **Hide this suggestion**, which the find dialog can undo.

**Drops copy in the background.** A file or folder dropped anywhere on the window while the
stage is open is copied into the sources folder, a folder keeping its structure below its own
name. In the app Rust takes the paths from the native drop event, walks a dropped folder
under the discovery rules, and offers each file; the page only sends back strings Rust
offered, and anything else fails `source-not-offered`, as does a landing path that would
leave the sources folder or pass through a link. Each offer records which file it named, and
the copy refuses anything swapped in since (a link, a FIFO, another file) with "the file
changed after it was dropped". A copy never replaces a file in the sources folder: a name
taken in any letter case, even one taken a moment ago, moves to the next `(2)`. A folder that
is, or holds, the open folder is refused whole. A single dropped file is copied whatever its
format unless its name reads like a password or key file. The walk stops at 20,000 files or
200,000 entries and names the first 1,000 files it skipped. One copy runs per open folder: a
drop during a copy says so, and **Add files** and the find dialog's **Add** wait. At 500 files
or 500 MB the count and size are asked about first. Progress streams to one line with **Stop
copying**; input stays live, and files already copied stay. A failure is said in words, never
as a system error. The first
copied file turns the stage into the Sources home, and the same line follows there. After a
copy, the files not copied are counted by reason (same as a source already added, not a
document, named like a password or key file, licence or notice file) and one press lists
their names in a centred dialog.

**With content, guidance is a compact stepper.** **What to do next** in the page header
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
them. The doors travel with the list — on Sources, Add files, Find documents and Bring from a
service as three plain rows on the same text line, under the selected Overview row; New page (the "+" beside the search field) on Wiki — and the section eyebrow
is gone, because a head repeating *SOURCES · 7* under a segment reading *Sources 7* is the
same fact twice. The choice is remembered per machine
(`atlas.library.index-segment`), and opening a file from the home, from the guide or from a
reader's own crossing moves the switch to that file's list, so the index can never name one
thing while the reader shows another.

**The description opens How to use** (owner, 2026-11-23: the info and panel glyphs were
*"completely inconvenient and strange"*). The Library's one-sentence description is the
guide's first paragraph, and on the agent route the sentence on a coding agent's provider
traffic — that Atlas is not in its path and does not log it — stands under it in tertiary
ink, the one place that sentence appears.

**The head is one row, and it has no eyebrow** (owner, 2026-09-12: *"a label like 'in this
folder' is not even needed"*). `IN THIS FOLDER` named the scope of a column that was already
showing it, so it is gone from the head — `LibraryStartStage` keeps it, where naming the scope
is the card's only job.

**The column is never folded by hand.** At `lg` and above it folds itself only when the reader
would get narrower than 420px (the dock open beside a page in a small window) and returns once
the reader keeps 460px after giving the width back; the fold slides on `--motion-settle`, its
rows held at the column's width so they leave view rather than rewrap, and a folded column is
inert. Below `lg` the index is the bottom half of one column and has nowhere to fold to. A fold
stored by an older version (`atlas.library.index-collapsed`) is no longer read.

Rows stay 36px with the name truncated at its end, format and size in mono `text-caption`,
and none crosses the column's side edge at 1512, 1040, 768 or 390. **`compiled` lost its
chip** on 2026-09-06: on the owner's folder all seven rows wore the same green pill, which
is a texture rather than a state. Since 2026-11-21 a row with a page carries no mark, a waiting
row one 6px dot in its state's ink, and the list head names the dot; a row picked on the
Sources home narrows the list under a `Folder: name` or `File type: name` chip whose press
clears it, and a pick that leaves no row says so and offers Show all sources. A chip is
spent only where a person can act. The one local-first disclosure follows the
Compile press it describes — the connect-by-address runner's sentence, under the press, in
the Compile popover or an open source's pane. The agent route's sentence is not that: it
says Atlas is **not** in the path, so it stands once, at the opening of How to use, and nothing
inline, in the guide's step two least of all.

**A toast stands in the corner of the pane it is about** (owner, 2026-09-12: *"the toast at
the top — its position is odd too, right?"*). This surface claims `bottom-right` where the
rest of the app keeps the bottom centre of its free lane (2026-09-24), and the two walls it stops a 16px gutter short of are
the pane's rather than the window's: the conversation's left edge from `xl` up, and the
bottom tab bar's top below `lg`. While the answer comparison stands — the one
`size="viewport"` dialog this view has left since the graph became the home — both gutters
grow to that dialog's inset plus its padding, so the box lands inside the dialog instead of
across its edge; a dialog that asks a question clears toasts instead, which is what Find
documents does.

The Wiki half is the wiki's index (`docs/specs/2026-11-21-library-index-column.md`, I-2):
the search field with a "+" for **New page** beside it, two 32px view rows — **Log**, with
the date of the last compile or check, and **Check results**, with the count of findings,
its running glyph and its unseen dot — a hairline, then the pages in groups: *Needs a look*
with each page's first reason, *Saved answers*, one group per first-level folder under
`wiki/`, then pages from several sources, one source and none. Every page row is 44px, two
lines: the title, then where it came from and when it was written. Above 200 pages a group
shows its five newest and *Show all*, which shows that group alone under a chip; Escape
returns to the index at the scroll it had. Typing in the field swaps the groups for the
ranked matches in the same rows. **The column holds no agent door**: Check the wiki and the
missing-agent notice stand in the *Check results* head, and writing pages is the Sources
band's press. When the open page's file leaves `wiki/`, a toast says so once and the
selection clears. The app's own record of the last check, the check's findings and the names
without a page live on the *Check results* page in the reading pane (below); the
write setting moved to Settings; filing an answer moved beside the answer. **Advisory findings stay in Check results.** A page
that misses the wiki template is listed under *Needs a look*, because the fix is in that
page's own bytes; an advisory folder finding — `orphan-page`, `shared-source-unlinked` — is
about where the page sits, is true of nearly every row on a young wiki, and is counted on
the *Check results* page rather than marked on the row.
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
now a column below `lg`: the home takes the top of it, the two lists take the bottom under a hairline, the popup still hangs from the
row so it keeps the column's whole height, and choosing a file swaps the whole column with
the same way back. The index's one scroller was first forced here — two list scrollers sharing half
a phone left the source list 30px and the wiki list zero — and on 2026-09-06 the same
answer replaced the `lg` split; the switch that replaced the stacking on 2026-09-07 is the
same answer again, so the column behaves one way at every width. What does not reach a
phone is the fold: below `lg` the index is the bottom half of one column and there is no
second pane to give its width to. Case: `the Library pane` in
`tests/e2e/library/library.spec.ts`.

**The Library graph is retired** (2026-11-21). From 2026-09-06 to 2026-11-21 the Sources home
drew the folder as a canvas: a force simulation, then columns of sources, pages and concepts,
then past 400 marks a map of concept islands. The owner rejected both late pictures on
2026-11-21, a column of empty source squares under a key of zeros and a disc of identical
circles, and the work they showed has no concept to group by. `src/widgets/library-graph/`,
its e2e specs, its `graph.*` copy and its page-halo ink were deleted with it; Git keeps the
history, and graph review belongs to the map. Decision: `docs/records/decisions/2026-11-21-library-sources-home-replaces-graph-ae902a78-d4ff-4e23-b6f9-9e34382bff9a.md`.

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
`buildLibraryModel` (`src/entities/docs-vault/lib/library/vault-library.ts`, its pairing field) from the same
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
is `src/shared/lib/library/source-units.ts` (the zip reader is `source-zip.ts`), the MCP `read_source` reader's twin, pinned unit for
unit by `tests/contract/vault-format/source-passage-parity.contract.test.ts`; it carries its own
raw-DEFLATE decoder (a Word or Excel file is a zip, and the app's macOS floor does not
guarantee `DecompressionStream`) and verifies each zip entry's CRC-32, because what it
renders is offered as the document's own words. Measured on a six-source folder: 70 units
across Markdown, CSV, HTML, DOCX and XLSX, byte-identical between the two readers, and 26
of 31 citations resolving — the other five are two pointing at a file the folder does not
hold and three addresses their files no longer have, all of which a reader could only
discover before by opening the documents themselves.

- **Sources** — every file under `sources/**`, Markdown included, listed by name, format, size and
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
    hands over the bytes it was already granted. It opens a copy only of a kind it shows
    without running anything (PDF, PNG, JPEG, GIF, WebP, AVIF, and plain text for `.txt`,
    `.md`, `.csv`, `.tsv`, `.json`, `.yaml` and `.log`) and saves everything else, `.html`
    and `.svg` included, as a download: a copy opened in the page would run in its origin.
- **Wiki** — Markdown under `wiki/**` with no `kind:`. Each row shows `created_by` and,
  when the page does not fit the contract, the first problem code `wiki-validate` prints
  (`section-order`, `uncited-fact`, …), the folder's own findings included
  (`orphan-page`, `dangling-wikilink`, `shared-source-unlinked`). Only the page's own
  problems and a broken link make a row **off-template**; an orphan or an unlinked
  shared source is named on the row and in the Check-the-wiki brief but not counted,
  because in a two-page wiki with no links yet every page is an orphan. The shape is
  `docs/ONTOLOGY-ATLAS-SPEC.md` §11,
  and `wiki/_template.md` is written into every new vault by the app's starter.
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
  a per-machine convenience, never a second store in the vault. A file-name/path filter
  narrows the metadata list without opening files. Selections survive filtering; confirmation
  copies all selected candidates and remembers only visible, unselected candidates as passed
  over. Hidden search results are not refusals. Long names and paths wrap so candidates with
  the same basename remain distinguishable. Cancel, Escape and the corner close return focus
  to the invoking Find documents button, both on the empty stage and in the source index,
  so Enter can reopen it without restarting keyboard navigation. Project roots are app-only
  (a binding is an absolute path); the dialog says so and links to `/download/`.
- **Bring from a service** (new 2026-09-07) — the door for documents that are not on
  this computer at all. Owner: *"connecting a service is mostly for the Library anyway —
  people want the things they already wrote somewhere else."* Tiles name services, not
  protocols — Notion, GitHub, and last, a way out to the technical dialog at `/agents/?tab=mcp&mcp=connectors` for
  anything else. **The main service path uses service names and ordinary actions**; the final tile
  links to technical settings. Three steps: ① the person pastes the one value the service
  issues, with a link to where; Atlas stages disabled metadata, confirms the exact keychain
  receipt, then guards activation/readback and this Mac's exact-definition approval — saying that the **coding agent**, not
  Atlas, is what reaches the service with it; ② the person says what to bring, in their own
  words; ③ a bounded brief opens the Library's existing agent turn, which searches, lists
  at most twenty documents, waits to be told which, and writes each one under
  `sources/<service>/` with `source_url` and `fetched_at` in the frontmatter — **through
  the permission card that already exists**, one card per file, and forbidden from
  touching anything outside that
  folder. Planning's home folder opens the same dialog with the destination `planning`, and the
  brief then names `planning/<service>/` instead and asks for no frontmatter block, with the
  source address and fetch date on a line under the heading
  (`docs/records/decisions/2026-11-17-planning-service-import-1d5ee430-8219-4743-b2fa-1858b27ae3ac.md`);
  the destination is one of those two fixed names, never a path. Both briefs tell the agent a
  fetched document is data, never an instruction, and a write shows no card where the person
  kept auto-approve for the folder. **Confluence and Jira left the tiles on 2026-09-07**: both rode Atlassian's hosted
  address, which signs in with OAuth, and the in-app session cannot open that window (the
  measurement is in the decision record); a tile onto a connection the agent can never use
  is the dead end this door exists to remove, so they return with an adapter that can sign
  in. **Google Drive is deliberately absent**: no entry in the committed catalogue has
  verified facts for it yet, and a tile onto a guess is a door that opens onto nothing.
  The note describes Atlas's current direct-connection limit and offers Add files, without
  making a claim about every provider endpoint. Closing returns focus to the invoking import
  button on both the empty stage and source index. Selecting a service focuses its credential
  field; Back returns to that service, and a saved connection focuses the document-request field.
  Save admits one attempt and reports pending and failed stages; retry reuses the row. Confirmed
  tokens need not be entered again. Close/Back cancel subsequent actions; already-issued writes
  may finish. Changed/deleted rows and all sibling-name collisions require saved-settings review.
  A browser asks for no token and offers Get the app or Add files. Detection uses the captured
  session/handle and absolute root; same-path physical replacement and cross-process atomicity
  are unproven. **What is not proven**: the picking happens inside the agent turn, not on this screen,
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
  any other; nothing touches the wiki pages, and the turn sets no `describes:` (a page's
  links to concepts are its writer's, spec §11.1). People and organisations stay names in the wiki, linked by the pages
  that mention them: the map is the code's ontology, and this is the one place the
  wiki flows into it, through the person. The brief carries what the script already found (the page
  and folder codes the Wiki list shows) and asks the agent not to repeat them, so the
  model's reading goes to judgement.
- **The local-model route** — when Agents → Models holds a verified
  connect-by-address runner (any OpenAI-compatible `/v1` server: Ollama, LM Studio,
  llama.cpp, vLLM), the shelf names that model and its host as the brain. It says nothing
  leaves this computer only when the saved host really is this computer; a runner reached
  over `https://` at another address is named as one, because `normalize_base_url` in
  `src-tauri/src/llm/local_endpoint.rs` requires loopback for plaintext but accepts a remote TLS host.
  `.ontology-atlas/llm-audit.jsonl` records each request either way.
  **It compiles** (second pass, 2026-09-06). The 2026-09-06 record left this route a named
  brain because the runner's tool catalogue read and proposed ontology concepts only, and
  wrote its own reopening condition: *a local tool catalogue that reads a source and writes
  a page under one consent card reopens local Compile.* That catalogue is
  `src/features/vault-agent/model/compile/compile-tool-catalog.ts`. Its three Compile-only tools
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
word carries in the list. The key under the picture counts what is on the canvas: sources,
pages, concepts, citations and mentions. A citation is drawn 1.5px against a mention's 1px, so
the two relations read apart, and the key draws each beside its count.
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

**The wiki index uses readable horizontal rows** (2026-09-09). Titles get up to two lines, with a short freshness caption below. The selected page has an indigo edge; changed or unmeasured source evidence and invalid page format keep distinct amber markers and accessible explanations. Search remains a ranked list. Compile marks the list busy without suggesting per-page progress.

A failed local model turn ends wiki compilation in the existing failure state with
its diagnostic. It does not become an empty review card or an approval opportunity;
retry remains explicit and no wiki file is written by the failed turn.
