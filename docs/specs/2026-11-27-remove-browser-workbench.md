---
title: Remove the browser workbench
doc_type: spec
status: draft
area: product
date: 2026-11-27
decisions: []
---

# Remove the browser workbench

**In one minute.** Today the website can do part of what the app does: a visitor can pick a
Markdown folder in a browser and read and edit it there, and every ability a browser lacks shows a
card that says "this works in the app". The owner decided on 2026-11-27 that Atlas is used only in
the installed app. After this change:

- The website introduces Atlas and hands over the app: the gateway (`/` and `/download`), the
  guide, the changelog, and one new page, `/sample`, a map of a sample project that can be looked
  at but not edited. No page of the website opens, reads or remembers a folder.
- Any other address opened outside the app shows one page: "Ontology Atlas runs in the installed
  app", with a link to the download page and a link to the sample map.
- The installed app looks and works as it does today. It loses only code it never ran.
- The code for opening folders in a browser, the bundled-sample mode inside the app's screens and
  every "works in the app" card are deleted, in six ordered steps that merge together.

Words used below. **Browser workbench**: opening a local folder in a web browser and working on it
there. **Plain browser**: any browser window that is not the installed app. **App-only page**: the
one page above. **Faked app runtime**: the test helper that answers the app's native calls inside
a test browser (`installDesktopRailRuntime`, `tests/e2e/desktop-rail-arrival-harness.ts:128`).
**Bundled sample**: a sample folder turned into JSON when the site is built.

## Person and moment

1. **A visitor who already uses coding agents** reaches ontologyatlas.com and decides whether to
   install. Today the page offers "Try it in the browser" beside the download
   (`heroPlaygroundCta`, `messages/en/download.json:13`), which leads to the workbench at
   `/topology`.
2. **The owner**, who uses only the app, said on 2026-11-27 (translated): "The web browser is just
   a playground, not where it is really used; it should be usable only by those who install the
   app. Remove it cleanly and delete the source code too; don't leave anything confusing behind."
3. **People and agents who build Atlas** meet a browser branch in 135 product files (Today).

Nothing observed exists about a person working in the browser workbench: Atlas collects nothing, so
how many people ever opened a folder in a browser is unknown. The one record of visits says all 35
visits in 14 days arrived by web (`docs/DECISIONS.md:4609`), which says where people arrive, not
where they work. Criterion 1 therefore starts with a capture of the visitor's walk.

## Today

All counts were measured at commit `969fd2b804`.

- The web has two jobs: the gateway, and "a second-best workbench where no app exists yet"
  (`docs/ARCHITECTURE.md:372-381`; `.claude/rules/surfaces.md:23-25`; decided
  `docs/DECISIONS.md:4604`). Local-first promise 2 says "The browser path uses the File System
  Access API" (`.claude/rules/local-first.md:10-12`).
- A folder is picked in a browser at five places: the vault itself
  (`src/entities/vault-session/model/local-vault/use-vault-choice.ts:89-97`), block import and
  export (`src/features/ontology-blocks/ui/BlockImportModule.tsx:163-178`,
  `RealmBlockExportAction.tsx:38-53`), Library sources
  (`src/features/library/lib/sources/add-sources.ts:247-279`) and Planning files
  (`src/shared/lib/planning/add-files.ts:129-133`).
- The app does not use those calls, but it uses their shape: its native bridge returns an object
  shaped like a browser folder handle (`createTauriVaultHandle`,
  `src/shared/lib/vault-folder/native-vault/tauri-vault-handle.ts:240`), and 95 product files name
  that type (`git grep -lE 'FileSystem(Directory|File)Handle' -- src`, tests excluded).
- The app and the browser keep the remembered folder in the same IndexedDB store; the app's record
  carries an absolute path (`src/entities/local-fs-handle/api/store.ts:13-49`).
- With no folder open, a browser shows a bundled sample inside the app's own screens: Storefront by
  default (`src/shared/lib/vault-folder/sample-source.ts:1-11`; `docs/ARCHITECTURE.md:808-829`).
  The installed app never does (`docs/DECISIONS.md:1490`). 47 product files read that mode or the
  bundled data
  (`git grep -lE 'useDataSourceMode|useStaticVault|useSampleSource|sample-source|VaultSourceHydrationBoundary|docs-vault/data|useDogfoodInsight|DataSourceMode' -- src app`,
  tests excluded).
- `/` shows the gateway to a browser visitor without a folder and the map to one with a folder
  (`src/shared/lib/navigation/nav-destination.ts:72-78`). The gateway's second button leads to
  `/topology` (`src/views/download/ui/release/DownloadActions.tsx:142-172`), and the sitemap lists
  `/topology` (`app/sitemap.ts:21-30`).
- `/project/[slug]` and `/project/[slug]/edit` are built only for bundled samples
  (`app/[locale]/project/[slug]/page.tsx:33-35`); the app ships neither
  (`scripts/desktop/stage-desktop-frontend.mjs:27-31`).
- 14 abilities answer a browser with a card naming the app (`DEGRADED_SURFACES`,
  `tests/e2e/web-surface-smoke.spec.ts:256`); 135 product files and 78 unit tests match the
  browser-branch pattern (Inventory).
- Of 237 browser specs, 102 already run on the faked app runtime, 61 open a folder through a
  stubbed browser picker (`tests/e2e/vault-picker-stub.ts:8-55`; 23 of them use both), 53 open an
  app route with neither, on the bundled sample, and 21 open only public pages (classified by each
  spec's imports and the addresses it visits). `pnpm ui:look` and the performance session use the
  same stub (`scripts/design/look/open-vault.mjs:7`, `scripts/perf/lib/web-session.mjs:128`).
- A development build can pretend to be the app without the native bridge (`?shell=desktop`,
  `src/shared/lib/desktop-shell/desktop-shell.ts:14-24`).
- `README.md:19`, `:45` and `:49` offer "the browser version", the last one to Linux, which has no
  app.
- The app's bundle is the same static export minus website-only paths
  (`docs/ARCHITECTURE.md:328-339`).
- Unknown: the size of the app's staged bundle today, and whether anything still reads the raw
  document copies under `public/docs-vault/` (5.0 MB) once the bundled-sample mode is gone.

## Patterns that already worked

- **Expand, migrate, contract** ([Parallel Change](https://www.martinfowler.com/bliki/ParallelChange.html)).
  To remove something many callers use: first make the replacement serve every caller, move the
  callers, and only then delete. It works because the product is releasable at every step. It
  fails when the last step is skipped and both paths stay. Atlas borrows the order: browser specs
  move to the faked app runtime before any product code is deleted. New here: the callers being
  moved are tests and tools, not users.
- **A public playground with sample data, apart from the product**
  ([Grafana Play](https://grafana.com/blog/grafana-play-updates-a-redesigned-homepage-to-celebrate-our-community/)).
  A visitor judges the product on real screens with no setup, while the product carries no demo
  mode. It fails when the playground is mistaken for the product or drifts from it. Atlas borrows
  one sample at its own address, drawn by the app's own map renderer. New here: the sample is a
  file made at build time, so there is no server and nothing the visitor does is kept.
- **A link to an app screen that is answered in the browser**
  ([Figma: opening links in the desktop app](https://help.figma.com/hc/en-us/articles/22850791655831)).
  A shared address never dead-ends: the browser page says where the screen lives. It fails when
  the hand-off to the app silently does nothing in some browsers, which that help page exists to
  troubleshoot. Atlas borrows the answered address and leaves out the automatic hand-off.
- **A local-files app whose website only introduces and downloads** (assumption: Obsidian's site,
  not read for this spec). One place where files are opened means one promise to keep.

## Problem and alternatives

The request is the cause, not a symptom. Two surfaces promise to open a folder, and the weaker one
costs a branch in 135 files, 14 explanatory cards and a second test substrate, for a person nobody
has observed. What breaks for a current user: someone who works in the browser loses that door
(their files do not change), and a Linux user loses the only screen they had.

| Way | Value to the person | Cost | Local-first fit | Verdict |
|---|---|---|---|---|
| Status quo | A folder opens with no install | Every app ability needs a browser answer; two test substrates | Two places hold a folder handle | Lost: the owner uses neither, and nothing shows anyone else does |
| Keep the browser reading, remove editing | Look at one's own folder before installing | Keeps the picker, the remembered handle and most branches | Same as today | Lost: it keeps the code the owner asked to delete |
| Hide the browser door, keep the code | None | None now; the branches rot | Unchanged | Lost: "don't leave anything confusing behind" |
| **App only, website keeps a sample map** | One clear answer; a visitor still sees a real map | One-time: 113 specs move, about 500 files change | One place opens folders | **Chosen** |

Ranked parts of the owner's request, by value returned against cost: (1) no page opens a folder,
and every app address says so: this is the promise itself; (2) the bundled-sample mode leaves the
app's screens: it is the largest source of confusion for builders; (3) the cards and copy go;
(4) the documents stop describing a browser version. All four ship together, in that order of
dependency, because a half-removed surface is the confusing state the owner named.

## Flow

1. When a visitor opens `/` or `/download` in a plain browser, Atlas shows the gateway. Its first
   button downloads; its second reads "See a sample map" and opens `/sample`.
2. When the visitor opens `/sample`, Atlas draws the Storefront sample (125 concept documents)
   with the app's map renderer, under a line saying what it is and that it cannot be edited. They can pan,
   zoom, and press a concept to focus it and read its name, kind, first paragraph and relations in
   the compact panel. There is no rail, no open-folder control, no edit, no agent panel.
3. When they press "Get the app" on `/sample`, Atlas opens `/download`.
4. When anyone opens any other address in a plain browser (a bookmark to `/topology`, a shared
   link to `/library/?tab=wiki`, an old `/mcp/?install=…` link), Atlas shows the app-only page
   with two links: "Get the app" to `/download` and "See a sample map" to `/sample`. The address
   bar keeps what was typed.
5. When a coding agent, an old guide page or a search result still calls `/topology` "the browser
   version", the person lands on the same app-only page; nothing on it claims a browser version
   exists.
6. When the sample's data does not arrive, `/sample` says so and offers "Try again"; it never
   shows an empty map as if the sample were empty.
7. When a browser that once opened a folder here visits `/` or an app address, Atlas deletes the
   remembered-folder record that browser stored and shows the same pages as to anyone else. The
   folder on disk is not touched.
8. When a person opens the installed app, every screen behaves as before this change, and the
   app never shows the gateway, `/sample` or the app-only page.

## States

"Unchanged" names the app's existing screen and next step; this change adds no app state.

| State | Web | macOS app |
|---|---|---|
| Empty | `/`: the gateway; next: download or `download.sampleCta`. An app address: `appOnly.title`, `appOnly.body`; next: `appOnly.download`, `appOnly.sample` | Unchanged: first run (`firstRun.title`); next: `firstRun.openTitle` or `firstRun.createTitle` |
| Loading | `/sample`: the map's wait stage, then the map. An app address: that route's neutral fallback until the first script runs, then the app-only page; never the rail | Unchanged: the neutral frame, then the folder's map |
| Error | `/sample`: `sampleMap.loadFailed`; next: `sampleMap.retry`. Scripts off: the app-only page's title, body and download link from a `noscript` block, which a window running scripts never draws | Unchanged: `rootEntry.lostVaultMissing`; next: `rootEntry.lostVaultAction` |
| Partial | Out of scope — the sample is one file and arrives whole or not at all | Unchanged: the map draws arriving documents (`docs/ARCHITECTURE.md:787-803`) |
| Largest measured vault | `/sample`: fixed at 125 concepts; `sampleMap.size` states the count | Out of scope — no app code path changes |
| Remembered folder from the old workbench | Record deleted without a message; pages as for anyone | Record kept; the last folder reopens |
| Address that never existed | Unchanged: the not-found page offers Download, Guide, Changelog (`src/views/terminal-state/ui/NotFoundScreen.tsx:119-129`) | Unchanged: the window returns to the map |

## Copy

Written into all four catalogues (`messages/{en,ko,ja,zh}/`); Korean is in `messages/ko/`.

| Key | Where it appears | English |
|---|---|---|
| `appOnly.title` | App-only page, heading | Ontology Atlas runs in the installed app |
| `appOnly.body` | App-only page, under the heading | This address opens a screen of the app. Ontology Atlas reads and edits your Markdown folder only in the app installed on your computer. |
| `appOnly.download` | App-only page, first link | Get the app |
| `appOnly.sample` | App-only page, second link | See a sample map |
| `sampleMap.title` | `/sample`, heading | Sample map |
| `sampleMap.lead` | `/sample`, under the heading | The concepts of a sample online store's code and the relations between them. In the app, Ontology Atlas draws your own code this way from the Markdown files in your folder. |
| `sampleMap.readOnly` | `/sample`, beside the lead | This page opens no folder, so nothing here can be edited. |
| `sampleMap.size` | `/sample`, count line | {concepts} concepts · {relations} relations (plural forms in the catalogue) |
| `sampleMap.download` | `/sample`, button | Get the app |
| `sampleMap.loadFailed` | `/sample`, when the data fails | The sample map did not load. Check your connection, then try again. |
| `sampleMap.retry` | `/sample`, beside that message | Try again |
| `download.sampleCta` | Gateway hero and closing, guided build; replaces `webCta`, `heroPlaygroundCta`, `build.actions.tryBrowser` | See a sample map |
| `download.screens.subSample` | Gateway, Screens section; replaces `screens.sub` | The same Markdown folder opens as a screen for each job in the app. Press a name to see that screen; Map opens a sample map in this browser. |
| `download.screens.sampleMapLink` | Screens section, Map entry label; replaces `screens.mapLink` | Map, opens a sample map in this browser |
| `download.screens.sampleMapHint` | Screens section, Map entry hint; replaces `screens.mapHint` | sample map |
| `metadata.pages.sample`, `metadata.descriptions.sample` | `/sample` title and description | Sample map; A read-only map of a sample online store's code: domains, capabilities, elements and their relations. Ontology Atlas draws your own code this way in the app. |

The compact panel on `/sample` uses the map's existing labels; it adds no string. Replaced keys
are deleted in slice 6.

## Edge cases

- **Zero, one, largest.** The sample is fixed (1 project, 9 domains, 54 capabilities, 61 elements);
  a build whose sample holds no concept fails instead of publishing an empty `/sample`.
- **First run.** A first-time visitor and a returning one see the same pages; no page stores a
  choice.
- **Hangul input.** No public page has a text field. An address whose query holds a Hangul
  concept name (`/ko/topology/?p=<Hangul slug>`) shows the app-only page and echoes none of it.
- **Moved, renamed or unreadable folder.** No page of the website reads a folder. In the app the
  existing notice is unchanged (`rootEntry.lostVaultMissing`).
- **Two edits at once.** The website writes nothing; the app's guard is unchanged.
- **Offline.** The website has no offline copy and does not load; the app works offline as before.
- **Someone who used the browser workbench.** Their files were always on their disk and are not
  touched. The browser's record is deleted (Flow 7), so the site holds no handle to a local folder.
  They install the app and pick the same folder once, which was already the rule per surface
  (`docs/ARCHITECTURE.md:449-451`). Display preferences left in that browser are never read again.
- **Shared links.** Every former app address answers with the app-only page; `/project/<slug>`,
  which is removed, answers with the not-found page.
- **The app loads the same export.** The app-only page is part of the files the app receives and
  must never be drawn there, including the first frame after launch (criterion 4). `/sample` is
  left out of the app's bundle like `/download`.
- **Code the app shares with the browser path** stays: the folder-handle shape, the remembered
  folder store, the slow safety reread
  (`src/entities/vault-session/model/local-vault/use-local-vault.ts:48`, `:451-456`), and each native
  bridge's "no runtime" answer, which the build and unit tests still take.
- **`pnpm dev` in a browser** shows the public pages and the app-only page. Builders run the app
  with `pnpm desktop:dev`, or a test browser with the faked app runtime.

## Out of scope

- A button that opens the same screen in the installed app: the app answers one address grammar
  only (`docs/ARCHITECTURE.md:344-361`), and widening it is its own decision.
- A notice for people who used the browser workbench: none has been observed.
- A Linux app.
- Renaming the folder-handle type the app's bridge implements: 95 files, no change for a person.
- A second sample or a sample picker on `/sample`.

## Inventory and slices

Each list is produced by its command, so it stays true as `main` moves; counts are from
`969fd2b804`. All slices branch from `docs/remove-browser-workbench` and reach `main` together
through one integration branch. No file belongs to two slices. Slice 1 runs beside the others, and
2a, 2b and 2c beside each other; 2 to 6 run in order, because each deletes what the one before
stopped using.

**Deciding rule for a file the pattern finds.** Delete a branch that runs only when the app's
native bridge is absent or when the data is a bundled sample, with the code only it reaches. Keep
whatever the app runs, and each bridge's "no runtime" answer.

Browser-branch pattern (`BRANCH`), run as `git grep -lE "$BRANCH" -- src app`:
`isTauriVaultRuntime|isDesktopShell|GetAppLink|shouldShowGetAppTile|-get-app|web-limit|web-degraded|WebManualConnect|useDataSourceMode|useStaticVault|useSampleSource|sample-source|VaultSourceHydrationBoundary|showDirectoryPicker|showOpenFilePicker|isSupported|'unsupported'|"unsupported"|verifyHandlePermission|requestPermission|queryPermission|startPreferredSampleDownload|isGatewaySurface|dev:desktop-shell|state === 'web'|agentGap === 'browser'`

| Slice | Files | What it does |
|---|---|---|
| 1. Rules and documents | 76 by the document pattern, plus `AGENTS.md`, `README.{ko,ja,zh}.md` and the copies of 6 guide pages under `docs-i18n/guide/{ko,ja,zh}/` | Rewrites every living document that describes a browser version |
| 2. Test host (2a map, 2b library, 2c the rest) | 113 specs (49, 21, 43), the helpers and two tools | Moves every spec that reaches an app screen without the faked app runtime onto it; product code untouched |
| 3. Public site and the app-only page | about 40, named below | Adds `/sample` and the app-only page, repoints the gateway, removes the sample project routes |
| 4. Upper layers | 57 product files, 31 unit tests | Deletes browser branches in `src/views`, `src/widgets`, `src/app` |
| 5. Lower layers | 75 product files, 46 unit tests | Deletes browser branches and now-unused modules in `src/features`, `src/entities`, `src/shared` |
| 6. Sweep | message files in up to 38 namespaces × 4 locales, generated data, 13 ontology nodes | Removes orphaned copy and dead code, syncs the ontology, records the change |

**Slice 1.** List: `git grep -lE "$DOCS" -- 'README*.md' AGENTS.md CONTRIBUTING.md SECURITY.md .claude .agents .codex ':(glob)docs/*.md' docs/features docs/guide docs/engineering docs/design docs/contracts docs/benchmark mcp/README.md cli tests/AGENTS.md ':!docs/DECISIONS.md' ':!docs/CHANGELOG.md'`,
where `DOCS` is `File System Access|showDirectoryPicker|FSA|fallback workbench|browser|degradation card|degraded card|DEGRADED_SURFACES|web-surface-smoke|Chromium|the web|web (visitor|user|session|surface|smoke|playground|build|gateway|app)|Web:|hosted web`.
Frozen history (`docs/DECISIONS.md`, `docs/records/**`) and dated specs are not edited. Lines that
must change, read for this spec: `.claude/rules/surfaces.md:19-57` (jobs and the "Web behaviour"
column), `:166-209`; `.claude/rules/local-first.md:10-12`; `.claude/rules/testing.md:107-116`;
`AGENTS.md:25`; `README.md:19`, `:45`, `:49`, `:150`; `docs/ARCHITECTURE.md:26-29`, `:61-66`,
`:323-468`, `:771-829`, and the route list `:834-967` (adds `/sample`, removes
`/project/[slug]` and `/project/[slug]/edit`); `docs/PRODUCT-DIRECTION.md:289-291`, `:433-434`,
`:571-572`, `:625-628`; `docs/FEATURES.md` (6 lines); `docs/features/**` (26 files).

**Slice 2.** List: every spec under `tests/e2e` except `web-surface-smoke.spec.ts` and `gateway/`
whose imports reach `showDirectoryPicker`, or that opens an app route without
`__TAURI_INTERNALS__` (2a: `tests/e2e/map/`; 2b: `tests/e2e/library/`; 2c: every other folder and
the two tools). By folder: map 49, library 21, vault-session 10, app-shell 9, design-audits
7, projects 5, top level 4, agents 3, settings 3, planning 1, typography 1. A spec whose subject
is the browser itself is deleted, not moved: `planning/browser-fallback.spec.ts`,
`vault-session/open-vault-cta.spec.ts`, `vault-session/local-vault-picker.spec.ts`, and any test
asserting a "works in the app" card. Tools moved onto the faked app runtime:
`scripts/design/look/open-vault.mjs`, `scripts/perf/lib/web-session.mjs`. The specs that measured
the Storefront or Atlas sample keep those documents as their folder, served by the faked app
runtime.

**Slice 3.** New: `app/(gateway)/[locale]/sample/page.tsx`, a sample-map view, an app-only view.
Changed: `src/app/providers/AppShell.tsx`, `app/[locale]/layout.tsx`,
`src/views/root-entry/**`, `src/shared/lib/navigation/nav-destination.ts`,
`src/views/download/ui/release/DownloadActions.tsx`, `src/views/download/ui/ScreensStage.tsx`,
`src/views/download/ui/build-with-moru/BuildWithMoru.tsx`,
`src/shared/ui/fallbacks/gateway-entry-fallback.tsx`, `app/sitemap.ts`, `app/llms.txt/route.ts`,
`app/llms-full.txt/route.ts`, `src/i18n/gateway-messages.ts`,
`src/app/providers/root-entry-messages.ts`, `scripts/desktop/stage-desktop-frontend.mjs`,
`tests/e2e/web-surface-smoke.spec.ts` (rewritten: gateway, `/sample`, the app-only page on every
app route; it stays the website's one standing signal under the same file name, which
`scripts/ci/` names), `tests/e2e/gateway/**`, `tests/e2e/audited-routes.ts`, and the contracts
`tests/contract/routes/gateway-routes.contract.test.ts`,
`tests/contract/routes/scope-registry.contract.test.ts`,
`tests/contract/desktop/desktop-frontend-paths.contract.test.ts`. Deleted:
`app/[locale]/project/[slug]/page.tsx`, `opengraph-image.tsx`, `edit/page.tsx`,
`edit/ProjectEditClientPage.tsx`,
`tests/contract/vault-data/bundled-project-routes.contract.test.ts`, and the two helpers whose last
users this slice rewrites, `tests/e2e/vault-picker-stub.ts` and `tests/e2e/sample-source.ts`.

**Slices 4 and 5.** Lists: `BRANCH` over `src/app src/views src/widgets` (slice 4) and over
`src/features src/entities src/shared` (slice 5), less slice 3's files. Whole files that serve
only the browser path (a dry deletion left unresolved imports in 13 product files, each a barrel
or a file the pattern lists): slice 4, `src/views/home/ui/MapSampleHead.tsx`,
`src/views/docs-vault/ui/welcome/SampleNotice.tsx`, and the export `projectBreadcrumb`
(`src/views/project-detail/index.ts`); slice 5,
`src/features/docs-vault-local/ui/WebManualConnectPanel.tsx`,
`src/features/docs-vault-local/lib/manual-connect.ts`,
`src/features/first-run-starter/model/use-first-run-sample-mode-settled.ts`,
`src/entities/vault-session/model/vault-source/use-data-source-mode.ts`, `use-sample-source.ts`,
`use-static-vault-source.ts`, `src/entities/vault-session/ui/VaultSourceHydrationBoundary.tsx`,
`src/shared/ui/controls/get-app-link.tsx`, `src/shared/lib/navigation/show-get-app-tile.ts`,
`src/shared/lib/vault-folder/sample-source.ts`, `data-source-mode.ts`, each with its tests; the
export `sourceCheckoutLaunch` (`src/shared/config/mcp/mcp-server-launch.ts:76`); the
`?shell=desktop` seam; the picker declaration in `src/shared/types/file-system-access.d.ts`; and
under `src/entities/docs-vault/lib/bundled-vault/` every loader that `/sample`, the guide, the
changelog and the gateway hero do not import. `pnpm knip` after that dry deletion named
`sourceCheckoutLaunch`, `projectBreadcrumb` and one stale entry in
`scripts/quality/dead-code/exceptions.json` beyond the deleted files; orphans behind the edited
files appear only once slices 4 and 5 exist.

**Slice 6.** Message candidates: 134 keys whose name holds
`web|browser|getApp|unsupported|degraded|sample` and 80 values naming a browser or the app, across
38 of the 84 namespaces that existed; a key goes only when no source file uses it, in all four locales at once. Also:
`scripts/data/vitest-file-durations.json` and the browser-spec durations, `tests/quarantine.json`,
the docs-vault outputs nothing reads any more, `/ontology-sync` for the 13 nodes under
`docs/ontology` that describe a browser path, and one `Removed` change record.

## Acceptance criteria

1. **Slice 3, the visitor's walk.** Given a plain browser at 1920 wide, when a person goes
   `/` → "See a sample map" → presses a concept → "Get the app", then each step shows what Flow
   1-3 says, `sampleMap.size` shows the number of concept documents in `samples/storefront/` (125
   at `969fd2b804`, never 0), and no request leaves the site's origin. Captures of this walk and
   of today's walk are attached to the pull request. `tests/e2e/web-surface-smoke.spec.ts`.
2. **Slice 3, every app address.** Given a plain browser, when it opens each route of
   `docs/ARCHITECTURE.md`'s route list other than the public ones, in all four locales, with and
   without a query, then it shows `appOnly.title`, both links open their pages, and the page holds
   no rail, no map canvas and no open-folder control; with scripts off the title and download link
   are still in the HTML. Same spec.
3. **Slice 3, recovery.** Given a browser holding a remembered-folder record written by the build
   at `969fd2b804`, when it opens `/` and then an app address, then the gateway and the app-only
   page appear, the IndexedDB database is gone on the next load, `showDirectoryPicker` was never
   called, and every file in that folder is byte-identical. Given the faked app runtime with a
   remembered folder, the record survives and the folder reopens. Same spec, plus
   `src/entities/local-fs-handle/api/store.test.ts`.
4. **Slices 3 to 5, the app never shows a website page.** Given the faked app runtime, when the
   app starts and visits every rail destination, then no frame from the first one holds the
   gateway, `/sample` or the app-only page (`tests/e2e/app-shell/rail-stays-painted.spec.ts`).
   Given the rebuilt installed app with a real folder, a walk through every rail destination, Add sources,
   block import and export, and Planning's Add files works as before; the staged bundle's file
   count and bytes, printed by `stage-desktop-frontend.mjs`, are not above the figure captured
   before slice 3. Installed-app walk, recorded in the pull request.
5. **Slice 2, one test substrate.** Given unchanged product code, when slice 2 is complete, then
   `git grep -lE 'stubDirectoryPicker|useDogfoodSample|showDirectoryPicker' -- tests/e2e scripts`
   prints only the two helpers, `tests/e2e/web-surface-smoke.spec.ts` and files under
   `tests/e2e/gateway/`, and one whole browser run is green
   (`.github/workflows/e2e.yml`).
6. **Slices 4 and 5, the code is gone.** `git grep -nE 'showDirectoryPicker|showOpenFilePicker|showSaveFilePicker|useDataSourceMode|useStaticVaultSource|GetAppLink|shouldShowGetAppTile|DEGRADED_SURFACES|WebManualConnectPanel|dev:desktop-shell' -- src app scripts tests ':!tests/e2e/web-surface-smoke.spec.ts'`
   prints nothing (that spec names the picker only to prove it is never called); `pnpm typecheck`,
   the unit suite and one whole browser run are green.
7. **Slice 6, nothing orphaned.** `pnpm knip` is clean with no added exception; every key the
   message candidate scan still finds is used by a source file or listed under Copy;
   `pnpm messages:check` and `pnpm messages:coverage` pass for ko, ja and zh.
8. **Slice 1, the documents agree.** The slice 1 command, run for
   `browser version|Try it in the browser|fallback workbench|File System Access`, prints nothing
   outside frozen history; `pnpm docs:language`, `pnpm docs:links`, `pnpm decisions:check` and
   `pnpm agents:check` pass.

## Risks

1. **A deleted branch was one the app runs.** The folder-handle shape, the remembered-folder
   store and the permission answers look like browser code and are the app's. Answer: slice 2
   lands first, so every later deletion is judged by specs on the faked app runtime; criterion 4
   adds the installed-app walk; the deciding rule keeps anything the app runs.
2. **The spec move leaves the nightly browser run red, and a stable release needs a whole green
   run on its commit** (`.github/workflows/release-macos.yml:957-963`). Answer: slice 2 changes no
   product code and must be green by itself before slice 3 starts; its three parts are disjoint,
   so a red part does not hold the others.
3. **The installed app flashes the app-only page**, because the page ships in the same export and
   the page cannot know it is in the app until a script runs. Answer: the exported HTML of an app
   route stays its neutral fallback, and the scripts-off text sits in a `noscript` block; criterion
   4 watches every frame from the first.

## Later

1. Shrink the docs-vault build to what the public pages read (`public/docs-vault/`, 5.0 MB;
   `content.json`, 4.8 MB): next once criterion 7's run names the unread outputs.
2. An "Open in the app" link on the app-only page for `/mcp/?install=…`, through the address the
   app already answers: next when a vendor page links the web address instead of the app's.
3. Rename the folder-handle type to the app's own name: next when a builder is misled by it.
4. A notice for people who used the browser workbench: next if anyone reports a folder "missing"
   from the website.
5. Stop deleting the old browser record: next after two stable releases.

## Owner question

None. Decided here, each reversible in one file: the sample is Storefront, today's default for a
visitor without a folder, because the gateway hero already draws Atlas's own map
(`src/views/download/lib/use-stage-graph.ts:6-9`; reverse: change the data `/sample` imports); the old browser record is deleted without a notice (reverse: Later
4); Linux keeps the sample map and the MCP server from source, which the decision record carries
as dissent.

## Revisions

- 2026-11-27: first draft.
