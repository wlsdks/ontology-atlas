---
title: The Library speaks plain words and starts with a drop
doc_type: spec
status: draft
area: library
date: 2026-11-21
decisions: []
---

# The Library speaks plain words and starts with a drop

## Person and moment

**Observed (the owner, installed app in Korean, 2026-11-21, his own folder `docs/ontology` bound to
this repository; feedback translated by the lead).** He opened the Library with no sources and no
pages. On the headline (`library.emptyTitle`, ko "wonmun and wiki don't exist yet"): "This feels
hard. Wonmun and wiki aren't words an ordinary user finds easy." On the primary button
(`library.emptyFoundAction`, "See 3 documents we found"): "What is this? It comes out of nowhere."
It opened a dialog titled `find.title` ("Documents in the folders you granted") over a legal
preamble, offering `public/third-party-licenses.txt`, a hash-named `public/39b8c5...txt` and
`output/promo/<Korean name>.txt`: "From the user's side I have no idea what this is. It isn't
seamless." He also read a long absolute path and three competing buttons.

| Person | Trying to | Needs |
|---|---|---|
| Uses coding agents daily (the owner) | Put this project's documents in so an agent can write the wiki | One obvious place to put files; no junk offered |
| Learning agents | Understand what this tab is for | Words already on screen; what happens after adding |
| Wants an ontology without agents | Keep documents beside the map | The same stage; a calm note that writing needs an agent |

The moment is the first visit to an empty Library: five seconds to know what to do and what
happens next.

## Today

Lines are against `main` at 62bab6da6 unless named.

- **The stage** (`src/views/library/ui/parts/first-run/LibraryStartStage.tsx`): artwork labelled
  with `kindSourcesTitle`/`kindWikiTitle` (`:93`), title `emptyTitle` (`:94`), body
  `emptyFoundBody` when candidates exist (`:95`), a primary `emptyFoundAction` button opening the
  find dialog (`:100`), then two chips, Add files and Bring from a service (`:51`, `:75`), and a
  note `sources.dropHint` carrying the folder label (`:132`), which is the absolute path in the app
  (`src/views/library/ui/library-page/LibraryEmptyFolderStage.tsx:38`). A dot-and-hairline field
  runs behind it (`:30`). Discovery runs on mount (`:22`). S-2 (cd351399c, branch
  `feat/library-sources-home`) mounts the same stage a second time, in the Sources home of a folder
  with wiki pages and no sources (its `LibraryPage.tsx:787`).
- **There is no drag and drop.** Add files opens a picker in the app (`add-sources.ts:181`); the
  browser path already copies `File` objects (`add-sources.ts:43`). The app imports only paths the
  picker or discovery offered; any other path fails `source-not-offered`
  (`src-tauri/src/library.rs:338-355`). Each import call re-hashes all of `sources/` once
  (`index_existing_files`, `:245`, called at `:333`).
- **Discovery's filter** keeps 14 document extensions (`library.rs:62`), prunes 11 folder names,
  none of them `public` or `output` (`:68`), refuses secret-like names (`:118`), and stops at 500
  (`:108`); the TS mirror is `src/entities/docs-vault/lib/library/source-discovery.ts`. It walks the
  open folder and bound project roots (`src/features/library/lib/sources/discover-sources.ts:66`).
  Run over this repository on 2026-11-21 it returns exactly the owner's three files (32 B, 1.2 KB,
  790 KB); `output/` is Git-ignored (`.gitignore:78`).
- **Reveal** selects a file only (`library.rs:677`); the call underneath works on macOS, Windows
  and Linux (`src-tauri/src/app_shell/mod.rs:85`). Every catalogue says "Finder", Windows included
  (`library.sources.revealFailed`).
- **What reads `sources/` and leaves the computer**: a coding-agent turn the person starts (Compile,
  Ask from the question desk, rounds), any connected outside agent calling MCP `read_source`
  (`mcp/src/server/tool-definitions/read.mjs:620`), and a Jev Send after its popup
  (`library.questionDesk.jev.transfer`). Meaning search talks only to this computer.
- **Words.** ko wonmun appears in 203 keys on `main` (156 on 2026-11-20; #3742 and #3744 added
  `sourcesHome.*`, `wikiIndex.*`, `wikiLog.*`, `sourcesIndex.add*`, `progress.chartLabel`); ko soseu
  already names the code folder (`messages/ko/architecture.json:57`). ja uses sosu for both a
  Library source and source code (`messages/ja/architecture.json:57`), plus genpon and shutten. zh
  uses laiyuan uniformly, and "Wiki yemian" for the collection. `docs/GLOSSARY.md:137` names the
  Library's input and output "source / wiki page".
- **After adding**, the Sources home (#3742, mounted by S-2) shows the band, one folder row,
  `recent.none` explaining a wiki page, and Next to write. With no agent the band's button is
  disabled with its reason; on the web it reads `progress.webLine`
  (`src/views/library/ui/parts/progress/SourceProgressBand.tsx:453-476`).
- **Unknown:** how a non-developer reads the stage; time to copy a 2,000-file drop.

## Problem and alternatives

The owner named three problems. Ranked by value against cost:

1. **The first recommended action is wrong** (high value, low cost). The primary button promotes
   whatever discovery found, and on his folder that is three non-documents in a dialog. Fixing the
   filter alone empties it; making the drop the one action stops a bad suggestion from leading.
2. **The words** (high value, medium cost: copy only, about 200 ko and 140 ja keys). They appear on
   every Library screen. The sweep (F3) lands before the stage (F2), so the stage and the Sources
   home it hands over to never use two words for one thing.
3. **The path and three buttons** fold into 1.

| Direction | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo plus filters | Owner's folder shows no button | Words, path, three doors remain | Small | Same | Lost: half the complaint |
| **Drop-first stage, quiet in-place suggestion, plain words** | One action; junk never leads | 5-second read in the mockup | Drop is new (web: the `File[]` path exists; app: Rust offers dropped paths) | Same: copies stay in the folder | **Chosen** |
| Three-step guide (add, connect agent, write) | Teaches the pipeline | More to read | Medium | Same | Lost: more parts |
| One word for both kinds | Simplest vocabulary | Erases the source-versus-page line the Library rests on | Copy only | Same | Lost: breaks "raw wins on what a document said" |

### Words

Sources fetched 2026-11-21. NotebookLM's help page "Add or discover new sources" (now titled Gemini
Notebook) uses soseu (ko), sosu (ja) and laiyuan (zh), with "notes" for what the person writes.
Notion AI's FAQ uses chulcheo (ko), sosu (ja), laiyuan (zh) for what an answer draws on, and page
(peiji, peji, yemian) for documents. MediaWiki core i18n names a page munseo (ko), peji (ja),
yemian (zh), and an upload's origin "wonbon file name"; ko Wikipedia's citation guide is titled with
chulcheo; Namuwiki calls every page munseo. Obsidian's translations: notes, attachments, "Reveal in
Finder", and on Windows "Show in folder" (ko) and "Show in system explorer" (zh). Karpathy's gist:
"Raw sources: your curated collection of source documents" and "The wiki: a directory of
LLM-generated markdown files". Readwise Reader (documents, library) and Mem (notes) ship English
only; Confluence (pages, attachments) is from use, since its localized help renders by script.

| Locale | Tab, raw | One raw item | Tab, written | One written page | Claim | Citation |
|---|---|---|---|---|---|---|
| en | Sources | source | Wiki | wiki page | claim | cites |
| ko | jaryo (was wonmun) | jaryo | wiki | wiki munseo | jujang | chulcheo |
| ja | shiryo (was sosu) | shiryo | Wiki | Wiki peji | shucho | shutten |
| zh | laiyuan (unchanged) | laiyuan | Wiki (was "Wiki yemian") | Wiki yemian | lunduan | yinyong |

- **ko jaryo**: the everyday word for gathered material, and the stem of the Library's own name
  (jaryosil). Lost: wonmun ("original text": literary, wrong for a spreadsheet, the owner's
  complaint); soseu (NotebookLM's choice, but Atlas and developers read it as source code); wonbon
  ("the original", false because Atlas copies); munseo (already means a wiki page); chulcheo (a
  relation, kept for citations).
- **ja shiryo** for the same reasons: sosu collides with code; shiryo matches the Library's name.
- **zh** keeps laiyuan (NotebookLM and Notion agree; code is yuanma), renaming only the collection.
- **Wiki stays** in every locale: it is the LLM wiki idea, and Korean readers know it from Namuwiki
  and Wikipedia. The stage explains it in one sentence (`start.body`).
- **Clashes F3 resolves**: `vaultAgentPanel.uncited` ("Read this turn", ko jaryo today) becomes
  "files"; `library.collections.{referenceCount,membersWithReferencesNamed,kind.*}` (ko "reference
  jaryo" for sources and pages alike) become "reference items", with the kind naming jaryo or
  wiki munseo.
- **Folder names** `sources/` and `wiki/` appear only on the folder line and in the reveal action.

### Decision record text (the lead runs `pnpm record:new`)

**Why**: the owner, first visit to an empty Library in Korean: "wonmun and wiki aren't words an
ordinary user finds easy", and a primary button that "comes out of nowhere" opening three
non-documents. **Prior**: the 2026-08-25 record "One word per thing, and it may be the accurate
one" (`docs/DECISIONS.md:5459`) chose the domain's accurate word; its falsifier ("reports the folder
term as jargon") names this evidence, and a person has now called the source word jargon, so for
this thing the plain word wins and one word per thing stands. Upholds 2026-09-05 "three kinds of
file", 2026-09-07 "Markdown under sources/ is a raw source", and the 2026-09-14 Library tabs
decision (c5472b7d). Overturns 2026-09-06 "An empty Library folder is an empty state" in its "one
centred stage" and two doors: the stage is top-anchored with one drop area, an optional suggestion
and a quiet Find files, and the labelled sources-to-wiki artwork is removed; its falsifier
("cannot find where documents go") stands. **Decision**: ko calls a source jaryo and ja shiryo; zh
keeps laiyuan; wiki and wiki page stay everywhere and are explained once on first contact; chulcheo
and shutten name citations; a `sourceWord` vocabulary row keeps the old words out. Found files are
a quiet suggestion shown only after the document filter. **Person, moment, proof**: first visit; a
five-second test by three cold readers including one non-developer; the owner's three files
filtered to none. **Falsifier**: two of three cold readers cannot tell jaryo from a wiki page; or a
filtered-out file is one a person expected and looked for.

## Flow

1. When the person opens the Library on a folder with no sources and no pages, Atlas shows the
   stage: `start.title`, `start.body`, the drop area with three paper sheets (PDF, DOCX, XLSX),
   `start.drop.title`, the Add files button (`sources.add`), `start.drop.formats`, the folder line
   `start.where` with `start.reveal` and a quiet `sources.find`, `start.privacy`, and
   `sources.import` as a text link. The stage is top-anchored, so a block arriving later moves
   nothing above it. No background field, no artwork.
2. When the folder has wiki pages but no sources, the Sources home shows the same stage with
   `start.bodyWikiOnly` in place of `start.body`.
3. When discovery returns files that pass the document filter, Atlas shows `start.found.title`
   below the folder line with at most four sheets, two per row, all selected, `find.add` and
   `start.found.hide`; above four it adds `start.found.more`, which opens the find dialog.
4. When the person drags files over the window, the drop area takes the indigo border, the sheets
   lift, and the title becomes `start.drop.over`.
5. When the person drops files, adds them, or presses `find.add`, Atlas copies them in one import
   whose progress streams back as `start.drop.copying`, then fades to the Sources home's first-day
   state with the toast `sources.added`. Leaving the tab does not stop the copy; the Sources home
   shows the files as they land.
6. When the person presses the reveal action, Atlas creates `sources/` if missing and selects it
   in Finder, File Explorer or the Linux file manager.
7. When the person presses `start.found.hide`, Atlas remembers those files as passed over (the
   existing declined store), removes the block, and toasts `start.found.hidden`; `sources.find`
   opens the dialog, where `find.declined` and `find.forgetDeclined` bring them back.
8. When a suggested file is not a real document (the filter misfired), the person hides it; when a
   real one was filtered out, `find.empty` names what is skipped and the drop area still takes it.
9. When a dropped item is a folder, Atlas copies nothing and shows `start.drop.folderRefused`.
10. When a copy fails, the drop area shows `start.drop.failed` and lists the names with
    `start.drop.failedNames`; files that did copy stay; dropping again or Add files retries.
11. When the app has no coding agent connected, `start.noAgent` sits under the body with
    `start.noAgentLink` to Agents; on the web `start.web` takes its place.

**Security.** The page never names a path to import. Rust takes dropped paths from the native
window event (`WindowEvent::DragDrop(Drop { paths })`), offers them exactly as the picker does, and
the page passes back only what was offered; no new command takes a path list from the page, and
any path never offered fails `source-not-offered`.

## States

| State | Web | macOS app |
|---|---|---|
| Empty, no suggestion | Stage; folder line `start.whereWeb` and `sources.find`, no reveal | Stage; `start.where`, `start.reveal` (finder), `sources.find` |
| Wiki pages, no sources | Same stage inside the Sources home, `start.bodyWikiOnly` | Same |
| Discovery running | Stage only; the suggestion fades in when ready | Same |
| 1 to 4 suggestions | `start.found.*`, sheets, `find.add` | Same; also walks bound project roots |
| 5 or more | Four sheets and `start.found.more` | Same |
| Dragging over | `start.drop.over` | Same, from the native drop |
| Copying | `start.drop.copying`; input stays live | Same |
| Copy failed (all or some) | `start.drop.failed`, `start.drop.failedNames`; retry by drop or Add files | Same |
| Folder dropped | `start.drop.folderRefused` (web branch) | `start.drop.folderRefused` naming `start.fileManagerName` |
| Duplicate only | `sources.duplicate` toast; the stage stays | Same |
| No agent | `start.web` line | `start.noAgent` and `start.noAgentLink` |
| Reveal failed | Out of scope: the web has no reveal | `sources.revealFailed` toast; the folder line stays |
| After adding | Sources home, first day; band shows `progress.webLine` | Sources home, first day; band button `progress.continue` |
| Suggestion hidden | `start.found.hidden`; `sources.find` brings them back | Same |
| Reduced motion | No lift, no fade; states swap at once | Same |
| Windows app | Out of scope: same as web | `start.reveal` and `start.fileManagerName` (explorer); drop from File Explorer |

## Copy

Keys live in `messages/<locale>/library.json`. The ko, ja and zh strings are in the pull request
body and a ready patch; F2 applies them (spec prose stays English, `pnpm docs:language`).

| Key | Where | English |
|---|---|---|
| `start.title` | h1 | Add the sources you already have |
| `start.body` | Under the title | An agent reads them and writes a wiki: pages that sum them up, where every claim names the source it came from. |
| `start.bodyWikiOnly` | Same, wiki pages but no sources | This folder has wiki pages but no sources yet. Add the documents they came from, so every claim can cite one. |
| `start.drop.title` | Drop area | Drop files here |
| `start.drop.or` | Before `sources.add` (Add files, unchanged) | or |
| `start.drop.formats` | Drop area foot | PDF, Word, Excel, PowerPoint, text or any other format. Each file is copied as it is. |
| `start.drop.over` | While dragging | Drop to copy into sources/ |
| `start.drop.copying` | While copying | Copying {done, number} of {total, number}… |
| `start.drop.failed` | After a failure | {count, plural, one {# file} other {# files}} could not be copied: {reason}. Drop them again, or use Add files. |
| `start.drop.failedNames` | Under it | Not copied: {names} |
| `start.drop.folderRefused` | Folder dropped | {where, select, web {A folder can't be dropped here yet. Drop the files inside it.} other {A folder can't be dropped here yet. Drop the files inside it, or put the folder into sources/ in {fileManagerName}.}} |
| `start.fileManagerName` | Fills `{fileManagerName}` | {fileManager, select, finder {Finder} explorer {File Explorer} other {the file manager}} |
| `start.where` / `start.whereWeb` | Folder line | Sources go into sources/ inside {folder}. You can put files there yourself. / Sources go into sources/ inside {folder}. |
| `start.reveal` | Folder line | {fileManager, select, finder {Show in Finder} explorer {Show in File Explorer} other {Show in file manager}} |
| `sources.find` (changed) | Folder line; index chip | Find files |
| `start.privacy` | Stage foot | The copies stay in this folder. Atlas sends nothing on its own; an agent reads them only when you give it a task. |
| `start.noAgent` / `start.noAgentLink` | Under the body, app | No agent is connected yet. Add sources now and connect one later. / Connect an agent |
| `start.web` | Under the body, web | On the web you can add and read sources; the app writes wiki pages. |
| `start.found.title` | Suggestion | {count, plural, one {# file} other {# files}} already in {folders} |
| `start.found.basis` | Beside it | Picked by name, format and size only |
| `start.found.more` | Suggestion | See all {count, number} |
| `start.found.hide` / `.hidden` | Suggestion / toast | Hide these / Hidden. Find files shows them again. |
| `sources.import` (ko changed) | Stage link | Bring from a service |
| `sources.added` (changed) | Toast | {count, plural, one {# source added} other {# sources added}} |
| `sources.revealFailed` (changed) | Toast | Could not show it in {fileManagerName}: {reason} |
| `find.title` (changed) | Dialog | Files already in {folders} |
| `find.preamble` (changed) | Dialog | Picked by name, format and size only. Nothing is copied until you add it. |
| `find.empty` (changed) | Dialog | Nothing here looks like a source. Atlas skips licence and notice files, hash-named files, build and test files, empty files, and folders such as public, output, build and vendor. |

F2 removes `emptyTitle`, `emptyBody`, `emptyFoundBody`, `emptyFoundAction`, `sources.dropHint`;
F4 removes `find.searchHint` and `find.walkedRoots` (read at `FindDocumentsDialog.tsx:136,146`).
`{folder}` is the folder's name, never its path.

## Edge cases

- **Zero, one, most.** Zero filtered candidates shows no block (the owner's folder: 3 before, 0
  after). One shows one sheet. Discovery stops at 500; above four the dialog lists them.
- **First run** of the app: no agent and no bound root, so only the open folder is walked.
- **Hangul names**: macOS hands out decomposed names; sheets and toasts show composed text, and
  the dialog's search waits for IME composition to end.
- **Moved, renamed or unreadable folder**: the copy fails into `start.drop.failed` with the
  reason; an unreadable root stays in `find.unreadable`.
- **Two edits at once**: the same bytes twice are a duplicate by sha256; the same name with other
  bytes is renamed, as today.
- **Offline**: everything works; Bring from a service needs the network and says so in its flow.
- **Very large drop**: 2,000 files go in one import, so `sources/` is hashed once, not per file;
  input stays live; the time is unknown (Risk 3).

### Filter rules (both `library.rs` and its TS mirror, one parity test)

| Rule | Misfire |
|---|---|
| Prune folders `public`, `static`, `output`, `outputs`, `generated`, `gen`, `tmp`, `temp`, `cache`, `logs`, `third_party`, `third-party`, `licenses`, `fixtures`, `__fixtures__`, `testdata`, `test-results`, `playwright-report`, and the paths `src/test/resources` and `tests/data` (with today's eleven) | A whitepaper published from `public/`, a consultant's `output/` deliverables, a real contract under `fixtures/` |
| Any format whose stem is, or starts with followed by `-`, `_` or `.`, `license`, `licence`, `copying`, `notice`, `third-party`, `thirdparty`, `third_party`, `authors`, `contributors`, `changelog`, `patents` (catches `LICENSE-3rdparty.csv`) | A contract named `license-agreement.pdf`; the drop area still takes it |
| Build and crawler files: `CMakeLists.txt`, `requirements.txt`, `requirements-*.txt`, `robots.txt` | A text note someone named `requirements.txt` |
| Hash names: a stem of 16 or more hex characters with at least one of a-f, or exactly 32, 40 or 64 hex characters, or a UUID; a scanner's `2026111509301500.pdf` survives | An export named only by a hex ID |
| Under 64 bytes (empty or placeholder) | A one-line note; a 700-byte `budget.csv` survives |

## Out of scope

- **Folder drops keeping their structure**: needs a sub-folder import contract; F2 refuses clearly.
- **Git-ignore as a filter**: no matcher exists on either side; the folder list covers the case.
- **Stopping a copy midway, and a long-work card for copies**: next once a measured drop takes
  over 10 s.
- **The Sources home and its first-day copy**: #3742 and S-2 own them; F3 rewords them.
- **Renaming `sources/` or `wiki/`**: MCP and CLI contracts use them.

## Acceptance criteria

1. Given a fixture of the owner's three files (`public/third-party-licenses.txt` 790 KB,
   `public/39b8c5bebbe326f89097083d57514dcc.txt` 32 B, `output/promo/<name>.txt` 1.2 KB), when
   Rust and TS discovery judge it, then both return zero candidates; and given one fixture per
   filter row, each rule catches its case and keeps each named survivor (`2026111509301500.pdf`,
   a 700-byte `budget.csv`). `source-discovery.test.ts`, `src-tauri/src/library/tests.rs`.
2. Given F1, when it runs over one JVM and one C/C++ Apache-2.0 repository chosen for the probe,
   then the pull request lists every file each rule drops and every file kept, a reader marks none
   of the dropped files a document and none of the kept files a build or test file; the
   repositories are named only in the pull request.
3. Given an empty folder on the web, when two files are dropped, then both land in `sources/`, the
   Sources home shows two waiting sources and `sources.added` counts 2; given a folder is dropped,
   nothing is copied and `start.drop.folderRefused` shows. `tests/e2e/library/first-run-drop.spec.ts`.
4. Given the installed macOS app, when three files are dragged from Finder onto the drop area, then
   they copy in one import with streamed progress and the reveal action selects `sources/`.
   Installed-app walk with a PR capture. Given the page side sends `$HOME/.ssh/id_ed25519` to the
   import, then it fails `source-not-offered` and nothing is read. Rust test in
   `src-tauri/src/library/tests.rs`, run on the macOS and Windows CI jobs.
5. Recovery: given `sources/` refuses writes, when two files are dropped, then `start.drop.failed`
   names both and the reason, the drop area stays ready, and after the permission returns Add
   files copies them. `first-run-drop.spec.ts` with a refusing handle.
6. Given suggestions were hidden, when the person presses `sources.find` on the stage, then the
   dialog shows `find.declined` and `find.forgetDeclined` brings them back. `first-run-drop.spec.ts`.
7. Given the proposed stage in Korean (with and without an agent) and the Sources home after
   adding, when three cold readers (one non-developer) look for five seconds each, then each can
   say what jaryo holds, what a wiki munseo is and who writes it. Capture and notes on the PR.
8. Given F3, then a `sourceWord` row in `scripts/lib/i18n/locale-vocabulary.mjs` bans ko wonmun
   and the Library sense of ja sosu outside its kept keys, `pnpm test:i18n:messages` passes, and
   the pull request lists every path that reads `sources/` and leaves the computer (coding-agent
   turns, MCP `read_source`, Jev Send; meaning search local) with the press that starts each, so
   `start.privacy` holds for every row.

## Slices

Order: S-2 merges, then F1 and F3 in parallel, then F2, then F4.

| Slice | What | Files | Overlap |
|---|---|---|---|
| F1 | Filter rules, parity test; criteria 1, 2 | `src-tauri/src/library.rs`, `src-tauri/src/library/tests.rs`, `src/entities/docs-vault/lib/library/source-discovery{,.test}.ts` | None |
| F3 | Word sweep and `sourceWord` row; criterion 8 | `messages/{ko,ja,zh}/*.json`, `scripts/lib/i18n/locale-vocabulary.mjs`, `docs/GLOSSARY.md:137` (the ko/ja words) | Right after S-2, which edits `library.json` and deletes `graph.*` |
| F2 | Stage, drop, folder reveal, suggestion, streamed import; criteria 3-7 | `src/views/library/ui/parts/first-run/**`, `LibraryEmptyFolderStage.tsx`, `src/views/library/ui/LibraryPage.tsx`, `use-library-sources.ts`, `add-sources.ts`, `library.rs` and `app_shell/mod.rs` (after F1), `messages/*/library.json` (`start.*`, keys above), `docs/features/library/workspace.md:316-330`; old test IDs in `tests/e2e/library/library.spec.ts:508-529`, `library-import-service.spec.ts:13,62-64`, `source-import-motion.spec.ts`, `source-import-fixture.ts:31-34`, `import-from-empty-library.spec.ts:69` | After S-2 and F3 |
| F4 | Plain find dialog: title, one line, sheet rows, search only above 12; removes `find.searchHint`, `find.walkedRoots` | `src/features/library/ui/FindDocumentsDialog.tsx`, `messages/*/library.json` | After F2 |

**F3's key list is generated, by meaning, when F3 starts.** A script lists candidates: every
ko/ja string whose English names a Library source (on `main` today a word match finds 266, plus 17
more that carry ko wonmun with other English), and every key carrying the old word. A person marks
each candidate Library source or other; the kept set becomes the `sourceWord` row's exceptions.
Known Library-source keys that use another word: ko `workCard.scheduled.staleBody`,
`library.answers.state.unchanged`, `library.answers.compareHint`, `library.questionDesk.jev.transfer`,
`library.sources.addTooltip`, `library.rounds.sheet.markHint`, `libraryImport.*`; ja
`library.answers.state.new-sources`, `library.rounds.sheet.markHint`,
`settings.workspaceReset.dialogBody`, `workCard.scheduled.staleBody`. Kept, another sense:
`acpChat.tool.{connectSource,disconnectSource}` (they connect a code folder and take the
code-folder word, `messages/ko/acpChat.json:227`), `acpChat.permission.taskReview.{detailsPointer,
reason.source_basis_unavailable}`, `acpChat.checkAnswerFull`, `analysisWorkbench.definitionMissing`,
`gatewayNav.{bodyLanguageNote,emptyBody}`, `topology.createNode.primaryLocaleRequired`.

## Risks

1. **Jaryo reads as too vague**, so people cannot tell it from a wiki page. Probe: criterion 7's
   cold readers on the mockup before F3 merges; the falsifier reopens the choice.
2. **The filter hides a document someone expected.** Answer: the drop area is the action, the
   suggestion is optional, Find files is always on the stage, and `find.empty` names what is
   skipped. Probe: criterion 2.
3. **The native drop fails or is slow.** Tauri's window drop takes the event from the page, Rust
   must offer dropped paths, and Windows differs. Probe: in F2 drop 3 and 2,000 files in the
   installed app on macOS and record the time; Windows CI runs the Rust tests; Add files stays as
   the fallback.

## Later

1. F4 plain dialog: next when F2 merges.
2. Folder drops keeping structure: next when a person drops a folder twice in a week of use.
3. Stop a copy midway, with progress in the long-work card: next when a measured drop passes 10 s.
4. Git-ignore filter: next when a misfire comes from an ignored folder not on the list.

## Owner question

None. Decided: ko jaryo, ja shiryo, zh unchanged, wiki kept. Reversing is a catalogue-only F3 revert.

## Revisions

- 2026-11-21: first draft.
- 2026-11-21: review round. Privacy line states only what Atlas does, with an outbound-path
  criterion; F3 moves before F2 and its key list is generated by meaning with a `sourceWord` row;
  Find files stays on the stage; dropped paths are offered only by Rust; filter rules narrowed
  (hash names, licence names in every format, build files, 64-byte floor); Add files kept; one
  streamed import; the wiki-only state, F2's test IDs and feature doc, and the decision text's
  overturns added.
