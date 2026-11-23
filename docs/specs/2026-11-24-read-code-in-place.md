---
title: Read a concept's code in place
doc_type: spec
status: draft
area: product
date: 2026-11-24
decisions: []
---

# Read a concept's code in place

Split on 2026-11-24 from `docs/specs/2026-11-23-review-agent-work-by-meaning.md`, where it was the
second ability in the owner's priority: judging happens in Atlas, so the lines a concept rests on
should be readable where the concept is. It is built alone on the map first; the review spec then
opens the same reader on a branch's file as its evidence. No capture of this moment exists;
criterion 1 makes one.

## Person and moment

A developer who already runs coding agents. On the map he selects a capability to check what its
rule really does. The panel gives him a path to copy; he leaves for the editor, finds the file and
counts to the line. Next, someone learning a codebase through its map meets the same wall at
every concept.

## Today

- **A concept's code is a path with Copy.** Code locations sit in full detail only
  (`docs/features/map/node-datasheet.md:51`) and offer Copy (`messages/en/fullDetail.json:35-39`).
- **The app knows only whether a body cites lines** (`src/shared/lib/vault-document/line-cite.ts:6-10`).
  The parser that reads which lines lives in the MCP server
  (`mcp/src/construction/build-depth/line-cites.mjs:37`).
- **No tool shows repository code to a person.** The MCP tool `read_source` reads vault sources
  under `sources/`, not repository code (`mcp/src/server/tool-definitions/read.mjs:592-594`).
- **This repository's own vault**: 97 concepts (`list_kinds`, 2026-11-24), 89 distinct `path:`
  values and 2 of 98 documents that cite lines (`review-share.py` in the session scratchpad,
  2026-11-24).
- **A connected repository is read on Unix only** (`docs/features/change-briefing.md:145`); a file
  comparison shows at most 32 KiB (`docs/features/change-briefing.md:149-150`).
- **The detail panel is 352 px and never full-screen** (`docs/features/map/node-datasheet.md:51`,
  `.claude/rules/forbidden.md:11`); the rail is 64 px at scale 1
  (`app/styles/base-root-alpha.css:40`).
- **The copy exists**: `messages/{en,ko,ja,zh}/codeReader.json`, written 2026-11-24 and read by no
  code yet.
- **Unknown**: how often a cited range is stale on a real map; whether the bound source read can
  be made on Windows.

## Problem and alternatives

The map shows evidence as a string to copy, so every "what does this really do" ends outside
Atlas and the person comes back, or does not.

| Way | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo: Copy the path | the path | leave, find, count lines | none | holds | loses: it is the trip |
| Open the editor at the line | the editor's whole view | one press, and he has left | `docs/specs/2026-11-24-open-outside-tools.md` | holds | kept as the reader's way out, not its replacement: it still leaves |
| Print the cited lines inside the concept's document | no new surface | lines with no file around them | the agent would paste code into the vault | code copied into Markdown goes stale and doubles the source | rejected |
| **A read-only reader beside the panel, on a window of the file with the cited range marked** | the rule's lines where the concept is | one press, the map still in view | one bounded read, one surface | reads inside the source grant, writes nothing | chosen |

**What changes for someone who uses the concept panel today.** One row is added, **Code**. Full
detail keeps its code locations with Copy.

### Decisions

1. **The reader is one compact surface beside the list**, read-only, never full-screen. It reads
   a window of the file around the cited range, not the file.
2. **It opens from the concept panel's Code row**, on the concept's entry file; one chip per
   cited range moves within the file.
3. **It says whether the cited lines can be trusted**: the document cites these lines, the file
   changed after the document was written, or Atlas could not check. It never moves a cite by
   itself.
4. **No syntax colours, no editing, no search.** Plain mono first (Later 3).
5. **macOS and Linux.** Windows shows the path with Copy and says so (`state.otherSystem`).

## Flow

1. When the person selects a concept whose document names code, the panel shows a **Code** row
   with how many ranges it cites.
2. When he presses it, Atlas opens the reader beside the panel on the entry file, the first cited
   range in view and marked before the first paint.
3. When he presses another range's chip, the reader scrolls to it; **Show lines above** and
   **below** read the next window.
4. When the file changed after the document was written, the reader says `cite.stale` above the
   same lines and makes no claim about where the rule went.
5. When the file is gone, the folder moved, no code folder is connected, or the path is one Atlas
   refuses, the reader says which and offers the one next step; no text is shown.
6. When he presses the Code row again or Close, the reader gives its width back and the map is
   where he left it.

## States

| State | Web | macOS app |
|---|---|---|
| Empty: a concept that names no code | the Code row is not drawn | the Code row is not drawn |
| A concept with code | the Code row is not drawn; full detail keeps the path with Copy and the card `codeReader.web.*` with Get the app | the Code row with `row.cites`; pressing opens the reader |
| Loading | Out of scope: no reader | the reader takes its width at once; `reading` only after 150 ms |
| Cited lines fit; file changed since; not checked; cite past the end; no cite | Out of scope: no reader | `cite.current`; `cite.stale`; `cite.unknown`; `cite.beyond`; `cite.none` |
| Partial: more of the file above or below | Out of scope: no reader | `more.above`, `more.below` with the count |
| Error: file gone; no code folder; folder moved | Out of scope: no reader | `state.gone` with `askToFind`; `state.notConnected` with `connect`; `state.accessLost` with `chooseAgain` |
| Error: refused or unreadable | Out of scope: no reader | `state.secret`, `state.outside`, `state.tooLarge`, `state.notText`, each with Copy path |
| The file changed under it | Out of scope: no reader | the text stays; `state.changed` with Read again |
| Windows | Out of scope: no reader | `state.otherSystem` with Copy path |
| Offline | the same as online | the same as online: the read is local |
| Largest measured: a 2 MiB file | Out of scope: no reader | a window of at most 400 lines or 64 KiB; larger files are `state.tooLarge` |

## Layout

The surface beside the building or the map is the list (400 px in Work status, 352 px on the
map) and, when open, the reader. Rules, by the width of the slot, not the window: the building or
the map always keeps 480 px; the reader is 480 to 640 px wide and stands left of the list while
that holds; otherwise the reader takes the list's place, with a Back row naming the concept or
branch; when even that would leave under 480 px beside an open conversation, the conversation is
put away while the reader is open and comes back as it was when the reader closes. Its session
keeps running.

| Window | Work status | Map | Map with the conversation open |
|---|---|---|---|
| 1040 | building 480, reader 496 in the list's place | map 480, reader 496 in the list's place | map 480, reader 496; the list and the conversation give way |
| 1512 | building 480, reader 568, list 400 | map 480, reader 616, list 352 | map 480, reader 575 in the list's place, conversation 393 |
| 1920 | building 816, reader 640, list 400 | map 864, reader 640, list 352 | map 480, reader 604, list 352, conversation 420 |

A head with the path as a mono eyebrow cut in the middle and one chip per cited range; code in the
mono face with quiet line numbers, lines never wrapped, scrolled sideways inside the code box; the
cited range as a band; a foot with Copy path. Every control is a word. The Code row keeps its
selected colour while the reader is open and closes it on a second press.

## Motion

| What moves | Why | Clock | Reduced motion |
|---|---|---|---|
| The reader opening and closing | a surface takes width | the slot gives width on `--agent-panel-reflow-duration`, the map's camera on the same clock; code fades in over `--motion-fast` after the width; closing clears the text first, on `EXIT_TRANSITION` | width at once, text cross-fades |
| The cited band | where to look | fades in once over `--motion-settle`; the range is in view before the first paint | drawn at once |
| Another cited range in the open file | the person asked | scroll over `--motion-slow` | jump |

Nothing loops. Movement uses `transform` and `opacity`; the reader's width is the one reflow per
press, declared to `expectSmoothMotion`.

## Security

Nothing leaves the machine: the read is a file on this computer inside the source grant of the
vault's recorded binding, and no model is called.

- **Rust resolves the root itself**: the vault's one recorded binding inside its grant, or, for
  the review spec, a listed worktree; never a path the page sends (the rule Harness reads follow,
  `.claude/rules/surfaces.md:87`, decision e35a25fe). The page sends a repository-relative path
  and a line.
- **What vault text can do**: a `path:` or a cite chooses which existing file inside the
  connected code folder the reader shows, and at which line. Nothing else.
- **The reader refuses** a file whose name holds keys or passwords (`DENIED_NAMES`,
  `.claude/rules/surfaces.md:121`), anything under `.git/`, anything under another dot folder
  that the Harness read does not already allow (`.claude/rules/surfaces.md:84`), a path with `..`
  or through a link out of the folder, a file over 2 MiB and a file that is not text. A read
  returns at most 400 lines or 64 KiB, as plain text the page draws as text.

## Copy

The words are in `messages/{en,ko,ja,zh}/codeReader.json`; this revision changes none. The three
`branch.*` keys of that namespace are listed in the review spec, which uses them.

| Key | Where it appears | English |
|---|---|---|
| `codeReader.row.label` / `.open` / `.cites` | Concept panel row | Code / Read {path} / {count} cited ranges |
| `.title` / `.back` / `.close` | Reader | Code for {concept} / Back to {concept} / Close |
| `.lines.range` / `.single` / `.top` | Range chips | L{start}–{end} / L{line} / From the top |
| `.cite.current` / `.none` | Under the head | The document cites these lines. / The document names this file and cites no lines. |
| `.cite.stale` | Under the head | This file changed after the document was written, so these may not be the lines it meant. |
| `.cite.unknown` | Under the head | Atlas could not check whether this file changed after the document was written. |
| `.cite.beyond` | Under the head | The document cites {lines}, and this file now ends at line {last}. |
| `.reading` / `.more.above` / `.more.below` | Reader | Reading {path}… / Show {count} lines above / Show {count} lines below |
| `.state.gone` / `.askToFind` | Reader | {path} is not in the connected code folder. It was moved, renamed or deleted after the document was written. / Ask the agent to find it |
| `.state.notConnected` / `.connect` | Reader | No code folder is connected to this project, so Atlas cannot read {path}. / Connect code folder |
| `.state.accessLost` / `.chooseAgain` | Reader | The connected code folder is not where it was, so Atlas cannot read {path}. / Choose the folder again |
| `.state.secret` | Reader | Atlas does not read {path}, because files with that name hold keys or passwords. |
| `.state.outside` | Reader | {path} points outside the connected code folder, so Atlas did not read it. |
| `.state.tooLarge` / `.notText` | Reader | {path} is larger than {limit}, so Atlas does not read it here. / {path} is not text, so there is nothing to read here. |
| `.state.changed` / `.readAgain` | Reader | This file changed after Atlas read it. / Read again |
| `.state.otherSystem` | Reader, Windows | Atlas reads code in place on macOS and Linux only. Copy the path to open the file yourself. |
| `.copyPath` / `.copied` | Reader foot | Copy path / Copied |
| `.web.title` / `.body` | Web, full detail | Reading code needs the desktop app / A browser can open only the folder you chose, and the code is outside it. The desktop app reads the code folder connected on this computer. |

## Edge cases

- **Zero, one, most**: a concept with no code has no Code row; one cited range is one chip; a
  concept citing twelve ranges shows twelve chips, scrolled sideways inside the head; a file of 2 MiB is read by window and
  one byte more is `state.tooLarge`.
- **First run**: a folder with no connected code says `state.notConnected` with Connect code
  folder, and the reader stays open on that sentence.
- **Hangul**: a Hangul path is read as it is on disk and compared in one Unicode form; Hangul in
  the code is drawn in the mono face's Hangul fallback without changing line height.
- **Moved, renamed, unreadable**: a renamed file is `state.gone`; a moved code folder is
  `state.accessLost`; a file the OS will not open is `state.outside` or `state.notText` by its
  cause, never an empty box.
- **Two edits at once**: an agent writes the file while the reader is open, the text stays and
  `state.changed` offers Read again; a read that returns after another concept was selected is
  dropped.
- **Offline**: the same as online.

## Out of scope

- **Editing code, a terminal or an editor inside Atlas**: the owner's rejection in the review spec.
- **Opening the editor at the line**: `docs/specs/2026-11-24-open-outside-tools.md` adds it to the
  reader's foot.
- **A branch's file with its changed lines marked**: the review spec's slice 3 adds it.
- **Removed text and a two-sided patch**: Changes' patch reader has it (Later 2).
- **Syntax colours**: a dependency to explain; plain mono first (Later 3).
- **Search in the file, and following a symbol to another file**: that is an editor.
- **The web**: a browser can open only the chosen folder, and the code is outside it.

Build: `src-tauri/src/code_reader/`, `src/shared/lib/project-source/tauri-code-reader.ts`,
`src/widgets/code-reader/`, the Code row in `src/widgets/ontology-map/ui/OntologyMapDetailPanel.tsx`,
its seat in `src/views/home/ui/map-panels/`, which lines a body cites in
`src/shared/lib/vault-document/line-cite.ts`, the bridge row in `.claude/rules/surfaces.md`, a
`DEGRADED_SURFACES` entry, `docs/features/map/node-datasheet.md`. Not a one-way change: no route,
nothing sent, and the read stays inside a grant that exists.

## Acceptance criteria

1. **The capture, first.** Given this repository's vault and two maps built by the mapping run,
   when every concept's `path:` and cites are resolved before any reader is drawn, then the pull
   request states how many concepts name code, how many cite lines, and how many cites fit, are
   stale, run past the end or name a missing file. If under a tenth of concepts cite lines, the
   Code row still ships and the lead is told that the band will be rare. Checked: the probe's
   output in the pull request.
2. **The reader shows the cited lines or says why not.** Given a concept that cites lines, when
   Code is pressed, then the range is in view and marked in the first drawn frame, the map keeps
   480 px at the three widths, and the reader's box is never the window's. Given a document older
   than its file, a cite past the end and a concept with a path and no cite, then `cite.stale`,
   `cite.beyond` and `cite.none` show. Checked: `tests/e2e/code-reader.spec.ts`; `pnpm ui:look` at
   1040, 1512 and 1920.
3. **A refused read returns no text.** Given a path outside the folder, a link out of it, `.env`,
   a file under `.git/`, a 3 MiB file, a binary, a missing file and no connected folder, then no
   text is returned and the matching state shows with its next step. Checked:
   `src-tauri/src/code_reader/tests.rs`, `tests/e2e/code-reader.spec.ts`.
4. **Smooth, and free at rest.** Given the static export in headless Chromium with GPU
   compositing, when the reader opens, moves to another range and closes, then no frame interval
   is above 50 ms (`expectSmoothMotion`); given the reader open on a file that does not change for
   60 seconds, then it makes no DOM change and no read. Checked:
   `tests/e2e/code-reader-motion.spec.ts`.
5. **The web says why.** Given the web build, then no Code row is drawn, and the
   `code-reader-get-app` entry of `DEGRADED_SURFACES` gives its reason and a destination that
   opens. Checked: `tests/e2e/web-surface-smoke.spec.ts`.
6. **The walk, which is the recovery proof.** On the owner's Mac, in a rebuilt installed app: for
   five capabilities he chooses, Code opens the reader on the cited lines with the map still in
   view; a file edited by hand while open says `state.changed`; closing returns the map where it
   was. Then for one working day the owner notes each time he leaves Atlas and why: no note says
   "to find the file". Checked: the walk's recording and the day's notes in the pull request.

## Risks

1. **Few concepts cite lines, so the reader opens at the top of a file.** On this vault 2 of 98
   do. Design: `cite.none` says so and the file is still read in place; the mapping run's
   concepts cite lines. Probe: criterion 1.
2. **The cited lines are stale and he trusts the band.** Design: decision 3 says stale or
   unchecked above the lines. Probe: criterion 1's stale count; over a third makes Later 1 next.
3. **He reads ten lines, then opens the editor anyway.** Design: the reader is for the rule, the
   editor one press away once the openers ship. Probe: in criterion 6's notes, count "opened the
   editor to read more"; more than half of opens makes Later 3 or search next.

## Later

1. Follow moved lines: land where the cited lines went since the document was written. Next when
   `cite.stale` shows on more than a third of opens.
2. Removed text and the whole patch, through Changes' patch reader (Work status Later 2). Next by
   the review spec's third risk.
3. Syntax colours. Next when a reader stays open past a glance in the walk.
4. The reader on Windows. Next when a person can walk it on a Windows machine; until then only CI
   would run that code.

## Owner question

None. The compact, read-only surface (decision 1) and plain mono (decision 4) are decided here;
each reverses by a Later line. It spends no money, publishes nothing and sends nothing.

## Revisions

- 2026-11-24: split from `docs/specs/2026-11-23-review-agent-work-by-meaning.md` for length: that
  spec's second moment, its former decision 8, slice 2, the reader's layout, motion, states, copy,
  refusals and criterion 4, unchanged in content. New here: the alternatives table, the capture of
  criterion 1, the reader's own walk, and its risks.
