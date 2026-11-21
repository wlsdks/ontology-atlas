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

- **The stage** (`src/views/library/ui/parts/first-run/LibraryStartStage.tsx`): artwork labelled
  with `kindSourcesTitle`/`kindWikiTitle` (`:93`), title `emptyTitle` (`:94`), body
  `emptyFoundBody` when candidates exist (`:95`), a primary `emptyFoundAction` button opening the
  find dialog (`:100`), then two chips, Add files and Bring from a service (`:51`, `:75`), and a
  note `sources.dropHint` carrying the folder label (`:132`), which is the absolute path in the app
  (`src/views/library/ui/library-page/LibraryEmptyFolderStage.tsx:38`). A dot-and-hairline field
  runs behind it (`:30`). Discovery runs on mount (`:22`).
- **There is no drag and drop.** Add files opens a picker in the app (`add-sources.ts:181`); the
  browser path already copies `File` objects (`add-sources.ts:43`). The app only imports paths the
  picker or discovery handed out (`src-tauri/src/library.rs:21`, `:309`).
- **Discovery's filter** keeps 14 document extensions (`library.rs:62`), prunes 11 folder names,
  none of them `public` or `output` (`:68`), refuses secret-like names (`:118`), and stops at 500
  (`:108`); the TS mirror is `src/entities/docs-vault/lib/library/source-discovery.ts`. It walks the
  open folder and bound project roots (`src/features/library/lib/sources/discover-sources.ts:66`).
  Run over this repository on 2026-11-21 it returns exactly the owner's three files (32 B, 1.2 KB,
  790 KB); `output/` is Git-ignored (`.gitignore:78`).
- **Reveal** selects a file only (`library.rs:677`); the cross-platform call underneath works on
  macOS, Windows and Linux (`src-tauri/src/app_shell/mod.rs:85`). Every catalogue says "Finder",
  Windows included (`library.sources.revealFailed`).
- **Words.** ko uses wonmun for a source in 156 keys across 10 namespaces and wiki munseo for a
  page; Atlas ko already uses soseu for the code folder (`messages/ko/architecture.json:57`). ja uses
  sosu for both a Library source and source code (`messages/ja/architecture.json:57`), plus genpon
  and shutten for the same thing. zh uses laiyuan uniformly, and "Wiki yemian" for the collection.
- **After adding**, the Sources home (PR #3742, `src/widgets/library-sources-overview/`) shows the
  band, one folder row, `recent.none` explaining a wiki page, and Next to write. With no agent the
  band's button is disabled with its reason; on the web it reads `progress.webLine`
  (`src/views/library/ui/parts/progress/SourceProgressBand.tsx:453-476`).
- **Unknown:** how a non-developer reads the stage; time to copy a 2,000-file drop.

## Problem and alternatives

The owner named three problems. Ranked by value against cost:

1. **The first recommended action is wrong** (high value, low cost). The primary button promotes
   whatever discovery found, and on his folder that is three non-documents in a dialog. Fixing the
   filter alone empties it; making the drop the one action stops a bad suggestion from leading.
2. **The words** (high value, medium cost: copy only, 156 ko and about 140 ja keys). They appear on
   every Library screen; the stage is first and is fixed here; the sweep is slice F3.
3. **The path and three buttons** fold into 1.

| Direction | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo plus filters | Owner's folder shows no button | Words, path, three doors remain | Small | Same | Lost: half the complaint |
| **Drop-first stage, quiet in-place suggestion, plain words** | One action; junk never leads | 5-second read in the mockup | Drop is new (web: the `File[]` path exists; app: the native drop must hand out paths) | Same: copies stay in the folder | **Chosen** |
| Three-step guide (add, connect agent, write) | Teaches the pipeline | More to read; the 2026-09-06 record cut the stage to one sentence and two doors | Medium | Same | Lost: more parts |
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

| Locale | Tab, raw | One raw item | Tab, written | One written page | Citation |
|---|---|---|---|---|---|
| en | Sources | source | Wiki | wiki page | cites, "from" |
| ko | jaryo (was wonmun) | jaryo | wiki | wiki munseo | chulcheo |
| ja | shiryo (was sosu) | shiryo | Wiki | Wiki peji | shutten |
| zh | laiyuan (unchanged) | laiyuan | Wiki (was "Wiki yemian") | Wiki yemian | yinyong |

- **ko jaryo**: the everyday word for gathered material, and the stem of the Library's own name
  (jaryosil). Lost: wonmun ("original text": literary, wrong for a spreadsheet, the owner's
  complaint); soseu (NotebookLM's choice, but Atlas and developers read it as source code); wonbon
  ("the original", false because Atlas copies); munseo (already means a wiki page); chulcheo (a
  relation, kept for citations).
- **ja shiryo** for the same reasons: sosu collides with code; shiryo matches the Library's name.
- **zh** keeps laiyuan (NotebookLM and Notion agree; code is yuanma), renaming only the collection.
- **Wiki stays** in every locale: it is the LLM wiki idea, and Korean readers know it from Namuwiki
  and Wikipedia. The stage explains it in one sentence (`start.body`).
- **Folder names** `sources/` and `wiki/` appear only on the folder line and in the reveal action.

### Decision record text (the lead runs `pnpm record:new`)

**Why**: the owner, first visit to an empty Library in Korean: "wonmun and wiki aren't words an
ordinary user finds easy", and a primary button that "comes out of nowhere" opening three
non-documents. **Prior**: upholds 2026-09-05 "three kinds of file" and 2026-09-07 "Markdown under
sources/ is a raw source"; narrows 2026-09-06 "An empty Library folder is an empty state" (two
doors become one drop area plus an optional suggestion; its falsifier stands); keeps the 2026-09-27
tabs. **Decision**: ko calls a source jaryo and ja shiryo; zh keeps laiyuan; wiki and wiki page stay
everywhere and are explained once on first contact; chulcheo and shutten name citations. The empty
stage leads with a drop area; found files are a quiet suggestion shown only after the document
filter. **Person, moment, proof**: first visit; a five-second test by three cold readers including
one non-developer; the owner's folder showing no suggestion. **Falsifier**: two of three cold
readers cannot say what jaryo holds versus a wiki page; or a filtered-out file is one a person
expected and looked for.

## Flow

1. When the person opens the Library on a folder with no sources and no pages, Atlas shows the
   stage: `start.title`, `start.body`, the drop area with three paper sheets (PDF, DOCX, XLSX),
   `start.drop.title`, the Choose files button, `start.drop.formats`, the folder line
   `start.where` with the reveal action, `start.privacy`, and `sources.import` as a text link. The
   stage is top-anchored, so a block arriving later moves nothing above it. No background field.
2. When discovery returns files that pass the document filter, Atlas shows `start.found.title`
   below the folder line with at most four sheets, two per row, all selected, `find.add` and
   `start.found.hide`; above four it adds `start.found.more`, which opens the find dialog.
3. When the person drags files over the window, the drop area takes the indigo border, the sheets
   lift, and the title becomes `start.drop.over`.
4. When the person drops files, chooses them, or presses `find.add`, Atlas copies them into
   `sources/`, shows `start.drop.copying` in the drop area (plus `start.drop.copyingLong` from 200
   files), then fades to the Sources home's first-day state with the toast `sources.added`.
5. When the person presses the reveal action, Atlas creates `sources/` if missing and selects it
   in Finder, File Explorer or the Linux file manager.
6. When the person presses `start.found.hide`, Atlas remembers those files as passed over (the
   existing declined store), removes the block, and toasts `start.found.hidden`.
7. When a suggested file is not a real document (the filter misfired), the person hides it; when a
   real one was filtered out, `find.empty` names what is skipped and the drop area still takes it.
8. When a dropped item is a folder, Atlas copies nothing and shows `start.drop.folderRefused`.
9. When a copy fails, the drop area shows `start.drop.failed` and lists the names with
   `start.drop.failedNames`; files that did copy stay; dropping again or Choose files retries.
10. When the app has no coding agent connected, `start.noAgent` sits under the body with
    `start.noAgentLink` to Agents; on the web `start.web` takes its place.

## States

| State | Web | macOS app |
|---|---|---|
| Empty, no suggestion | Stage; folder line `start.whereWeb`, no reveal | Stage; `start.where` with `start.reveal` (finder) |
| Discovery running | Stage only; the suggestion fades in when ready | Same |
| 1 to 4 suggestions | `start.found.*`, sheets, `find.add` | Same; also walks bound project roots |
| 5 or more | Four sheets and `start.found.more` | Same |
| Dragging over | `start.drop.over` | Same, from the native drop |
| Copying | `start.drop.copying`; input stays live | Same; `start.drop.copyingLong` from 200 files |
| Copy failed (all or some) | `start.drop.failed`, `start.drop.failedNames`; retry by drop or Choose files | Same |
| Folder dropped | `start.drop.folderRefused` (no file manager named) | `start.drop.folderRefused` naming Finder |
| Duplicate only | `sources.duplicate` toast; the stage stays | Same |
| No agent | `start.web` line | `start.noAgent` and `start.noAgentLink` |
| Reveal failed | Out of scope: the web has no reveal | `sources.revealFailed` toast; the folder line stays |
| After adding | Sources home, first day; band shows `progress.webLine` | Sources home, first day; band button `progress.continue` |
| Suggestion hidden | `start.found.hidden` toast | Same |
| Reduced motion | No lift, no fade; states swap at once | Same |
| Windows app | Out of scope: same as web | `start.reveal` (explorer); drop from File Explorer |

## Copy

Keys live in `messages/<locale>/library.json`. The ko, ja and zh strings are in the pull request
body and a ready patch; slice F2 applies them (spec prose stays English, `pnpm docs:language`).

| Key | Where | English |
|---|---|---|
| `start.title` | h1 | Add the sources you already have |
| `start.body` | Under the title | An agent reads them and writes a wiki: pages that sum them up, where every sentence names the source it came from. |
| `start.drop.title` | Drop area | Drop files here |
| `start.drop.or` / `.pick` | Drop area | or / Choose files |
| `start.drop.formats` | Drop area foot | PDF, Word, Excel, PowerPoint, text or any other format. Each file is copied as it is. |
| `start.drop.over` | While dragging | Drop to copy into sources/ |
| `start.drop.copying` | While copying | Copying {done, number} of {total, number}… |
| `start.drop.copyingLong` | Same, 200+ | You can leave this tab; copying goes on. |
| `start.drop.failed` | After a failure | {count, plural, one {# file} other {# files}} could not be copied: {reason}. Drop them again, or use Choose files. |
| `start.drop.failedNames` | Under it | Not copied: {names} |
| `start.drop.folderRefused` | Folder dropped | {where, select, web {A folder can't be dropped here yet. Drop the files inside it.} other {A folder can't be dropped here yet. Drop the files inside it, or put the folder into sources/ in {fileManagerName}.}} |
| `start.where` / `start.whereWeb` | Folder line | Sources go into sources/ inside {folder}. You can put files there yourself. / Sources go into sources/ inside {folder}. |
| `start.reveal` | Folder line | {fileManager, select, finder {Show in Finder} explorer {Show in File Explorer} other {Show in file manager}} |
| `start.privacy` | Stage foot | The copies stay on this computer. Nothing is sent anywhere until you ask an agent to write wiki pages. |
| `start.noAgent` / `start.noAgentLink` | Under the body, app | No agent is connected yet. Add sources now and connect one later. / Connect an agent |
| `start.web` | Under the body, web | On the web you can add and read sources; the app writes wiki pages. |
| `start.found.title` | Suggestion | {count, plural, one {# file} other {# files}} already in {folders} |
| `start.found.basis` | Beside it | Picked by name, format and size only |
| `start.found.more` | Suggestion | See all {count, number} |
| `start.found.hide` / `.hidden` | Suggestion / toast | Hide these / Hidden. Find files in the Sources tab shows them again. |
| `sources.import` (ko changed) | Stage link | Bring from a service |
| `sources.added` (changed) | Toast | {count, plural, one {# source added} other {# sources added}} |
| `sources.find` (changed) | Index chip | Find files |
| `find.title` (changed) | Dialog | Files already in {folders} |
| `find.preamble` (changed) | Dialog | Picked by name, format and size only. Nothing is copied until you add it. |
| `find.empty` (changed) | Dialog | Nothing here looks like a source. Atlas skips licence and notice texts, hash-named files, files under 1 KB, and folders such as public, output, build and vendor. |

Removed: `emptyTitle`, `emptyBody`, `emptyFoundBody`, `emptyFoundAction`, `sources.dropHint`,
`find.searchHint`, `find.walkedRoots`. `{folder}` is the folder's name, never its path.

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
- **Very large drop**: 2,000 files copy in order and input stays live; the time is unknown (Risk 3).

### Filter rules (both `library.rs` and its TS mirror, one parity test)

| Rule | Misfire |
|---|---|
| Prune folders `public`, `static`, `output`, `outputs`, `generated`, `gen`, `tmp`, `temp`, `cache`, `logs`, `third_party`, `third-party`, `licenses`, `fixtures`, `__fixtures__`, `testdata`, `test-results`, `playwright-report` (with today's eleven) | A whitepaper published from `public/`, a consultant's `output/` deliverables, a real contract under `fixtures/` |
| Text formats (`txt`, `rtf`) whose stem starts with `license`, `licence`, `copying`, `notice`, `third-party`, `thirdparty`, `third_party`, `authors`, `contributors`, `changelog`, `patents` | A `notice-to-customers.txt`; a PDF named `license-agreement.pdf` still shows |
| Stem of 16 or more hex digits, or a UUID | An export named only by its ID |
| Under 1 KiB (1,024 bytes) | A short text note of a few lines |

## Out of scope

- **Folder drops keeping their structure**: needs a sub-folder import contract; F2 refuses clearly.
- **Git-ignore as a filter**: no matcher exists on either side; the folder list covers the case.
- **Stopping a copy midway**: next once a measured drop takes over 10 s.
- **The Sources home and its first-day copy**: PR #3742 owns them.
- **Renaming `sources/` or `wiki/`**: MCP and CLI contracts use them.

## Acceptance criteria

1. Given this repository's own folder, when discovery runs, then it returns zero candidates and the
   stage shows no suggestion. `src-tauri/src/library/tests.rs`, `source-discovery.test.ts`.
2. Given one fixture per filter row (each rule caught, each named misfire kept where the table says
   so), when Rust and TS judge the same names and sizes, then both agree.
   `source-discovery.test.ts`, `src-tauri/src/library/tests.rs`.
3. Given an empty folder on the web, when two files are dropped, then both land in `sources/`, the
   Sources home shows two waiting sources and `sources.added` counts 2.
   `tests/e2e/library/first-run-drop.spec.ts`.
4. Given the installed macOS app, when three files are dragged from Finder onto the drop area, then
   they copy and the reveal action selects `sources/`. Installed-app walk with a PR capture; the
   Windows path handout and folder reveal by a Rust test on the Windows CI job.
5. Given a folder is dropped, then nothing is copied and `start.drop.folderRefused` shows.
   `first-run-drop.spec.ts`.
6. Recovery: given `sources/` refuses writes, when two files are dropped, then
   `start.drop.failed` names both and the reason, the drop area stays ready, and after the
   permission returns Choose files copies them. `first-run-drop.spec.ts` with a refusing handle.
7. Given the proposed stage in Korean, when three cold readers (one non-developer) look for five
   seconds, then each says where files go and that an agent writes wiki pages from them. Capture
   and notes on the pull request.
8. Given the four catalogues, then no stage key carries wonmun (ko) or sosu (ja) in the Library
   sense and every new key exists in all four. `pnpm test:i18n:messages` plus a key-word test.

## Slices

| Slice | What | Files | Overlap |
|---|---|---|---|
| F1 | Filter rules and parity test; criteria 1, 2 | `src-tauri/src/library.rs`, `src-tauri/src/library/tests.rs`, `src/entities/docs-vault/lib/library/source-discovery{,.test}.ts` | None; first |
| F2 | Stage, drop (web and native handout), folder reveal, suggestion, copy; criteria 3-8 | `src/views/library/ui/parts/first-run/**`, `LibraryEmptyFolderStage.tsx`, `use-library-sources.ts`, `add-sources.ts`, `library.rs` (after F1), `app_shell/mod.rs`, `messages/*/library.json` (`start.*` and the keys above) | Edits no `LibraryPage.tsx` line S-2 owns; lands after S-1 so `library.json` merges once |
| F3 | Word sweep: ko wonmun to jaryo (particles re-chosen), ja to shiryo, zh collection to Wiki | `messages/{ko,ja,zh}/*.json`, the keys below | After S-1, S-2 and PR #3744 (all edit `library.json`); skips `graph.*`, which S-3 deletes |
| F4 | Plain find dialog: title, one line, sheet rows, search only above 12 | `src/features/library/ui/FindDocumentsDialog.tsx` | None |

F3's ko keys (wonmun in the Library sense; ja changes the same keys where its noun is the source,
keeping shutten for citations): acpChat.tool.{readSource,connectSource,disconnectSource};
automations.documents.facts.{runs,writes}.body; download.screens.caption.{library,automations};
failures.{answer-sources-unmeasured,answer-previous-changed}; metadata.descriptions.library;
projectPages.detail.{surfaceFolderScope,libraryCounts}; topology.bootstrap.libraryFiles;
vaultWidgets.viewer.sourceCitation{Missing,Unavailable,Title,TitleAt};
vaultWidgets.parts.meta.notOnMapWikiBody; library.{lede,stageBody,kindSourcesTitle,index.sources,
home.staleClause,localCompile.readLabel,source.writeUp.behind,collections.kind.sourceReference};
library.answers.{provenance,refreshUnavailable,sourceDelta,sameSources,state.{changed,missing,
rewritten,unmeasured},paths.{changed,missing,added,rewritten}}; library.questionDesk.{title,intro,
folderScope,originalsTitle,otherOriginals,recentMeta,coverage,coverageCompact,zeroLocalAgentNote,
limits,limitsBoth,limitUnreadable,wikiCaveat,noCitation,reviewBadge,sourceState.{stale,missing},
report.{investigate,caveat,citationNote,citationUnavailable,fileRefused.{no-evidence,citation,
source,changed,anchor}},jev.{missing,stale,unmeasured,too-long,obsolete,advisory}};
library.sources.{listAria,empty,statesAria,needsCompileSplit,staleOnly,filterShow};
library.wiki.{compileTooltip,fileAnswerTooltip,newPageMetadata,newPageSection.notInSources,
problem.{uncited-fact.do,bad-citation.do,bad-truncation-record-shape.{what,do},
bad-truncation-record-path.{what,do},citation-target-missing-sources.{what,do},
shared-source-unlinked.what,shared-source-unlinked-more.{what,do}}};
library.shelf.{listAria,freshness.{fresh,stale},state.{fresh,stale,unverified},compiling};
library.stage.{title,compile.checkingLine,read.{coveredLine,coveredChecking,coveredPartial,
coveredStale,coveredUnreadable},transferLocal,blockedNoSources,blockedNothingWaiting,statusReady};
library.report.{structuralClean,rule.citation-target-missing,rule.shared-source-unlinked};
library.search.{placeholder,matches,nothing,showSources,reading};
library.workspace.{sources,sourcesCount}; library.rounds.{kind.consistency,name.consistency,
sheet.{onStale,redraftHint,noAgent,readbackFolders,readbackWholeFolder,readbackFoldersLead,
readbackWholeFolderLead}}; library.progress.{aria,first,chartAria,point,continue,batchReturned,
allDone}; library.wikiReader.{citedSources,openSource}; plus `library.collections.kind.wikiReference`
and `library.collections.referenceCount`, so a wiki page is no longer called jaryo. Kept (another
sense): acpChat.permission.taskReview.{detailsPointer,reason.source_basis_unavailable},
acpChat.checkAnswerFull, analysisWorkbench.definitionMissing, gatewayNav.{bodyLanguageNote,
emptyBody}, topology.createNode.primaryLocaleRequired. zh: library.{kindWikiTitle,index.wiki,
workspace.wiki}, library.wikiReader.{citedSources,openSource}, failures.{answer-sources-unmeasured,
answer-previous-changed}, vaultWidgets.viewer.sourceCitation{Missing,Title,TitleAt},
vaultWidgets.parts.meta.notOnMapWikiBody.

## Risks

1. **Jaryo reads as too vague**, so people cannot tell it from a wiki page. Probe: criterion 7's
   cold readers before F3 merges; the falsifier reopens the choice.
2. **The filter hides a document someone expected.** Answer: the drop area is the action, the
   suggestion is optional, and `find.empty` names what is skipped. Probe: run F1 over two Apache-2.0
   repositories and the inspection fixture and list every file each rule drops.
3. **The native drop fails or is slow.** Tauri's window drop takes the event from the page, the
   app must hand out dropped paths as the picker does, and Windows differs. Probe: in F2 drop 3 and
   2,000 files in the installed app on macOS and record the time; Windows CI covers the path
   handout; Choose files stays as the fallback.

## Later

1. F3 word sweep: next once S-1, S-2 and PR #3744 merge.
2. F4 plain dialog: next when F2 merges, since "See all" opens it.
3. Folder drops keeping structure: next when a person drops a folder twice in a week of use.
4. Stop a copy midway: next when a measured drop passes 10 s.
5. Git-ignore filter: next when a misfire comes from an ignored folder not on the list.

## Owner question

None. Decided: ko jaryo, ja shiryo, zh unchanged, wiki kept. Reversing is a catalogue-only F3 revert.

## Revisions

- 2026-11-21: first draft.
