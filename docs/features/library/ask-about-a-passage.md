---
title: "Library: ask about a passage"
doc_type: feature
status: current
area: library
routes: [/library]
---

# Library: ask about a passage

### Library — ask about a passage, and a graph that explains its marks (2026-09-07)

Select eight or more characters in a wiki page and one bar stands just above the first
selected line — where does this come from, does anything disagree with it, explain it in
plain words — with a line for the person's own words at its end. While the bar is up the
rest of the page steps back to quaternary ink, so the selection and the questions are the
only bright things; a press outside the page or Escape clears both. (The first shape that
day, a chip under the selection opening a list beside the text, covered three lines of the
page and took a second press; the owner rejected it on sight.) The chosen question goes to
the docked agent as one read-only turn with
the exact passage quoted, the page named, and the rule to read the page and its originals
and cite them (`buildAskBrief`). A page that cites several originals folds them under one closed line naming the count
(`Disclosure`, 2026-09-07); open, they are chips on a wrapping row, each a press that opens
the source. Six full rows had pushed the Summary below the fold of the installed app. A
page with one original keeps its single row. The graph's legend line becomes a description while a mark
is under the pointer or the keyboard: an original file, a wiki page, or a concept on the
map, each with what its lines mean and what pressing does; the **Names without a page**
header carries a tooltip saying why only map kinds can be proposed.

**Search, and a page of your own** (2026-09-07). One field above the lists filters both:
a source by its path, a page by its title or by the text the Library already holds for
the contract check, with a line saying how many of each matched; the headers keep the
folder's totals. **New page** starts a page a person writes by hand — the contract's
sections, `created_by: human`, empty `sources:` — opens it, and leaves the writing to any
editor; the folder watcher brings the text back and the list says what the page still
lacks.

**Check results, a page in the pane** (2026-09-07). The check's closing block also lists
its findings — a disagreement, a superseded claim, a missing link — each with the pages it
touches. When the check ends the pane opens *Check results*: the last check's record at
the head, one section per kind with every summary whole and each page a press, a **Fix**
chip per row, then **Names without a page** with its Propose chips; the *Check results N*
row above the wiki list reopens it, and a wiki never checked gets the Check door itself. The
page takes the pane only when nothing else has it and only after a check that completed; a
cancelled or failed turn opens nothing and clears nothing, and the focus stays where the
person had it, because a completion is not a press. In the 280px column these had been three-line clips that pushed the page list
off the screen (installed app, six findings and seven names). Fix
starts one agent turn on those pages with the same rules the compile brief holds: both
values with both citations for a disagreement, the current value first for a superseded
claim, links both ways for a missing link, nothing outside those pages. The edits land or
stop at the card exactly as a compile's do, and `wiki/_log.md` records the turn as `fix`.

**After the council** (2026-09-07, evening). A finding a Fix turn completed wears *Fixed ·
check again* in place of its door until the next check re-judges the pages; Fix and Propose
wait while any turn runs. The *auto-allowed* notice in the conversation carries two doors —
*Open* the page that landed, and *Ask next time*, which writes the same setting Settings
owns. *New page* and *File the answer* toasts carry *Undo*, which removes the file just
written. The *Check results* page has the reader's outline rail from two sections up and
the same back-to-top. Below 420px of reading column at `lg` and above the index folds on
its own and unfolds above 460px; unfolding it while narrow is the person's choice and
stands. The fold is one icon control in one place — the panel glyph on the column's
eyebrow line closes it, and the same glyph at the pane's top-left opens it — and the
reader's way back reads *Graph*, the thing it shows, with no arrow (owner, 2026-09-07). A search whose matches all sit on the other half of the switch says so under the empty list and offers the switch, instead of a count over nothing. A page whose first line is a section heading no longer carries the section gap above it. A *Conversation* chip on the graph's status row and on the reader's top row reopens the dock after it was closed; before, closing it was the end of the transcript. The conversation's composer has one quiet row at its bottom, the way chat composers are laid out elsewhere: the tool with its model as one text picker (*Codex · GPT-5.6-Sol (low)*) and the mode on the left, the status word, past conversations, new conversation and send on the right; a tool that has run out of plan is named as a limit with the hour it lifts, not as a generic problem with a retry. The app's Claude follows the terminal login at every session start, and which place holds that login is measured rather than assumed: both of Claude Code's keychain items and `~/.claude/.credentials.json` are compared by digest, carriers that agree settle it themselves, carriers that disagree are settled by whichever the terminal wrote last, and carriers that settle nothing install nothing at all. The winner is mirrored into the app's own keychain item, so an account switched in the terminal reaches the app without a repair. The account name beside a login is a cache each side refreshes on its own clock, not a fact about the token, so the terminal's name travels into the app folder only when it is the fresher of the two. A door pressed into a broken session restarts the session and then sends, instead of waiting behind the old error. The writer label prints only on the rows that are the exception to the
folder's majority writer, and the source list treats its state word the same way: past one
screen of rows the most common state is said once above the list, in its own tone with its
count, and a row keeps a badge only when its state differs (2026-09-18: a freshly filled
folder wore the same amber pill on 1,600 rows). Both lists keep only the rows in view in
the DOM (`useWindowedRows`, 2026-09-18): 3,000 file rows were 33,000 nodes and ~450 ms of
element creation on the rail press, and every later layout read paid for the whole tree;
now the scroller is the whole list's height and holds about forty rows, heights measured
as they are seen, and a list with no scroller or no height renders every row as before.
Each list is one tab stop (`useRovingRows`, 2026-09-19): the arrows, PageDown and PageUp,
Home and End walk the rows, the list scrolls a row into its scroller before focus moves
onto it, the nearest rendered row carries the stop when the keyboard's row has scrolled
away, and Tab leaves the list for the next control, the way the radiogroups already rove. The scroll-end gate measures the Library's own scrollers. The
end of a page now keeps room for the floating *Back to top*: the last line stands clear of
the pill instead of ending behind it — on a wiki page, on *Check results*, and on the Docs
reader, which is the same pane — and below `lg` the pill itself stands above the bottom tab
bar rather than behind it (owner, 2026-09-08).

**Observed work stays visible outside the conversation** (2026-09-08). Exact
structured tool targets bind reading, provisional writing and permission waits
to source/page marks without moving the knowledge graph. Unknown targets never
light a guessed file. A bounded, session-local receipt strip distinguishes tool
reads and proposals from observed wiki revision changes or confirmed local writes;
it is not a durable audit log or an attribution of every change to the agent.
Waiting is still, reduced motion retains the state markers, and idle work emits
no animation frames. Existing write permission and validation policies are unchanged.

**Closing the dock puts the conversation away** (2026-09-08). Pressing X on the Library's
conversation used to end it: the panel unmounted, its ACP session stopped, and the adapter
process was killed — so a turn in flight died with the press and the transcript went with
it. The panel now stays mounted behind the shut frame. The frame is what closes, in the
same width movement as before, and while it is shut it is `inert` and `aria-hidden`, so
nothing behind it can be tabbed into or read out. A turn keeps running, its clock keeps
counting, and a permission card raised while the dock was shut is still waiting when it
opens. The conversation ends when the person leaves the Library, which is when the screen
that started it goes away. While a turn runs behind the shut dock, the same *Conversation*
chip — right end of the graph's status row and of the reader's top row — says which step is
running and what it is on (*Editing · Write wiki/contractor-quotes.md*, *Waiting for
approval · …*) with one indigo dot beside it; there is no second resting surface, because
one door to one conversation is enough. And reopening lands in **this folder's latest
conversation** rather than a blank one: the dock asks the adapter for its conversations in
this folder, resumes the newest, and the past-conversations door is reachable from the
first ready frame instead of only after a turn. An adapter with no session list, a folder
with no past conversation, and a conversation the adapter will not reload all fall through
to a new one, which is what happened before. *New conversation* still means new.

**File the answer** (2026-09-07, ordinary conversation included 2026-09-09). After a question from the conversation or passage menu ends, a chip in the conversation,
directly under the answer and above the composer, writes the last answer as a page under
`wiki/answers/`: the question is the title and summary,
every answer line with a `[[src:…]]` citation becomes a fact, the cited files become
`sources:` with `unmeasured` receipts, and uncited lines go under "Not in
sources". A citation an agent wrote loosely in prose, `sources/<file>#p3` bare or in
backticks with or without `src:`, is rewritten into the wiki form first, since it names
the same place (the first installed-app answer cited every fact that way and was refused
as uncited); the ask brief now names the form outright. Plain-text file references such as `sources/notes.md:7` and ascending `:5-6` ranges are also normalized to explicit line anchors; binary-document pages are not inferred. Ordinary follow-up questions do not inherit an earlier Compile or Check request, and their capture does not change tool permissions. The page meets the same validator
as every other; an answer that cites nothing is refused by name (`no-cited-fact`), and one
that does not fit is not written and the first problem is said instead. The summary ends
with "See also" links to every page that already writes up a cited source, so the folder
check's `shared-source-unlinked` has nothing to raise on a filed answer.
Passive source hashes do not establish which bytes the answer used. Filing an
older answer after its source changed therefore keeps that answer unverified
and does not clear the outstanding source revision. Its citations still need
review; a cited sentence is not automatically a supported claim. Undo removes
the newly filed answer while preserving the original source and existing pages.

**Reading a DOCX without a shell** (2026-09-07). The MCP server's `read_source` returns the
text of one file under `sources/` in the units a citation names — a DOCX by heading, an
XLSX by sheet and row, a CSV by row, text and HTML by line — each unit with its anchor. The
Compile, Check, Fix and ask briefs point the agent at it, so a turn that only reads no longer
raises an execute permission card for `unzip -p … | sed …`; a PDF the runtime reads itself,
page by page. Nothing is converted and kept: the file is read on request. This is the LLM Wiki pattern's "answers
can be filed back", done by the app rather than by another agent turn, so nothing is
claimed that the answer did not cite.
