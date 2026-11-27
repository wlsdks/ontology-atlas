---
title: Remove the browser workbench
doc_type: spec
status: draft
area: product
date: 2026-11-27
decisions: [ce69837e-d990-42fe-8566-460052231c0a]
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
- The download page and that page say in one sentence which computers have an app (Apple Silicon
  Mac, Windows) and send everyone else to the sample map or the MCP server run from source.
- The installed app looks and works as it does today. It loses the bundled-sample branches, which
  it never ran; its own "no folder loaded" state stays.
- The browser picker code, the bundled-sample mode and every "works in the app" card are deleted.
  All six steps, the test move first, enter one integration branch shared with the Vite move;
  nothing reaches `main` until the combined checks pass on its head, and then it arrives in one
  merge.

Words used below. **Browser workbench**: opening a local folder in a web browser and working on it
there. **Plain browser**: any browser window that is not the installed app. **App-only page**: the
one page above. **Faked app runtime**: the test helper that answers the app's native calls inside
a test browser (`installDesktopRailRuntime`, `tests/e2e/desktop-rail-arrival-harness.ts:128`).
**Bundled sample**: a sample folder turned into JSON when the site is built. **Boot script**: the
inline script at the top of every page's body that marks the installed app on `<html>`.

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

Counts were measured at commit `969fd2b804`.

- The web has two jobs: the gateway, and "a second-best workbench where no app exists yet"
  (`docs/ARCHITECTURE.md:372-381`; `.claude/rules/surfaces.md:23-25`; decided
  `docs/DECISIONS.md:4604`). Local-first promise 1 says "`pnpm dev` opens a usable first screen"
  and promise 2 "The browser path uses the File System Access API"
  (`.claude/rules/local-first.md:8-12`).
- A folder is picked in a browser at five places: the vault itself
  (`src/entities/vault-session/model/local-vault/use-vault-choice.ts:89-97`), block import and
  export (`src/features/ontology-blocks/ui/BlockImportModule.tsx:163-178`,
  `RealmBlockExportAction.tsx:38-53`), Library sources
  (`src/features/library/lib/sources/add-sources.ts:247-279`) and Planning files
  (`src/shared/lib/planning/add-files.ts:129-133`).
- The app's native bridge returns an object shaped like a browser folder handle
  (`createTauriVaultHandle`, `src/shared/lib/vault-folder/native-vault/tauri-vault-handle.ts:240`);
  95 product files name that type (`git grep -lE 'FileSystem(Directory|File)Handle' -- src`).
- The app and the browser keep the remembered folder in one IndexedDB database, `demo-kv`
  (`src/shared/lib/vault-folder/idb-kv.ts:1`), under three key shapes
  (`src/entities/local-fs-handle/api/store.ts:13-15`); the app's record carries an absolute path
  (`:44-50`), and the launch chooser probes that path
  (`src/features/vault-switch/model/use-recent-vault-reachability.ts:66-69`).
- The data-source mode is `static` whenever no folder's manifest is loaded
  (`src/shared/lib/vault-folder/data-source-mode.ts:13-15`). A browser fills that state with a
  bundled sample, Storefront by default (`src/shared/lib/vault-folder/sample-source.ts:1-11`); the
  app never does (`docs/DECISIONS.md:1490`) but runs the state itself on first run, cold restore,
  folder switch and the destinations that open without a folder
  (`src/shared/config/destinations.ts:30`; `src/app/providers/AppShell.tsx:171-172`, `:310`;
  `src/features/project-data-source/model/use-project-mutations.ts:53`, `:161-163`;
  `src/widgets/app-settings-menu/ui/panes/WorkspacePane.tsx:123`). 44 product files read the mode
  or the bundled data (`git grep -lE 'useDataSourceMode|useStaticVault|useSampleSource|sample-source|VaultSourceHydrationBoundary|docs-vault/data|useDogfoodInsight|DataSourceMode' -- src app`, tests excluded).
- The exported HTML of an app route already holds the workbench: the static export built on
  2026-11-27 has `data-testid="app-nav-rail"` and the bottom tab bar (`nav[data-tabbar="primary"]`)
  in `out/en/topology/index.html` and no `noscript`. The boot script sits before them (byte 7,938
  against 9,629; `app/layout.tsx:91`) and sets `data-shell="desktop"` when `window.isTauri` is
  true (`src/shared/ui/document/lang-boot-script.tsx:21`); `/` already hides its gateway fallback
  under that mark (`src/shared/ui/fallbacks/gateway-entry-fallback.tsx:22`).
- `/` shows the gateway to a browser visitor without a folder and the map to one with a folder
  (`src/shared/lib/navigation/nav-destination.ts:72-78`). The gateway's second button leads to
  `/topology` (`src/views/download/ui/release/DownloadActions.tsx:142-172`), whose page draws the
  sample's header (`app/[locale]/topology/page.tsx:4`, `:32`). The sitemap lists `/topology`
  (`app/sitemap.ts:21-30`) and each indexed sample project (`:57`); `llms.txt` says "the map also
  runs in the browser" and links "Try it in the browser" (`app/llms.txt/route.ts:24`, `:29`).
- `/project/[slug]` and `/project/[slug]/edit` are built only for bundled samples
  (`app/[locale]/project/[slug]/page.tsx:33-35`); the app opens projects through `fallback` and
  `new` (`scripts/desktop/stage-desktop-frontend.mjs:31`).
- The download page sorts visitors into Mac, Windows and handheld; an Intel Mac or Linux visitor
  is offered the Apple Silicon file (`src/views/download/lib/release/visitor-platform.ts:8-10`).
- 14 abilities answer a browser with a card naming the app (`DEGRADED_SURFACES`,
  `tests/e2e/web-surface-smoke.spec.ts:256`); 135 product files and 78 unit tests match the
  browser-branch pattern (Inventory). The installed-app verifier fails when it finds one of them,
  `ai-connection-web-degraded` (`src-tauri/src/webview_verify/ai_settings_verify.js:96-100`,
  `scripts/lib/verify-macos/ai-settings-contract.mjs:44-46`).
- Of 237 browser specs, 102 run on the faked app runtime, 61 open a folder through a stubbed browser
  picker (`tests/e2e/vault-picker-stub.ts:8-55`; 23 of them also install the runtime), 53 open an
  app route with neither, on the bundled sample, and 21 open only public pages (classified by each
  spec's imports and the addresses it visits). The fake serves one folder (one `root`,
  `desktop-rail-arrival-harness.ts:137`). `pnpm ui:look`, the performance session and five
  measuring tools open the browser workbench (`scripts/design/look/open-vault.mjs:7`,
  `scripts/perf/lib/web-session.mjs:128`, `scripts/design/measure-a11y.mjs:19`,
  `measure-contrast.mjs:31`, `:36-37`, `measure-graph-readability.mjs:51`,
  `scripts/perf/perf-node-drag.mjs:118`, `scripts/download/map-screen.mjs:24`).
- A development build can pretend to be the app without the native bridge (`?shell=desktop`,
  `src/shared/lib/desktop-shell/desktop-shell.ts:14-24`).
- `README.md:19`, `:45` and `:49` offer "the browser version", the last one to Linux, which has no
  app.
- Unknown: the size of the app's staged bundle today, and whether anything still reads the raw
  document copies under `public/docs-vault/` (5.0 MB) once the bundled-sample mode is gone.

## Patterns that already worked

- **Expand, migrate, contract** ([Parallel Change](https://www.martinfowler.com/bliki/ParallelChange.html)).
  To remove something many callers use: make the replacement serve every caller, move the callers,
  then delete. It works because the product is releasable at every step; it fails when the last
  step is skipped and both paths stay. Atlas borrows the order: specs move to the faked app runtime
  and merge before any product code is deleted. New here: the callers are tests and tools.
- **A public playground with sample data, apart from the product**
  ([Grafana Play](https://grafana.com/blog/grafana-play-updates-a-redesigned-homepage-to-celebrate-our-community/)).
  A visitor judges the product on real screens with no setup, while the product carries no demo
  mode. It fails when the playground is mistaken for the product or drifts from it. Atlas borrows
  one sample at its own address, drawn by the app's map renderer. New here: the sample is a file
  made at build time, so there is no server and nothing the visitor does is kept.
- **A link to an app screen that is answered in the browser**
  ([Figma: opening links in the desktop app](https://help.figma.com/hc/en-us/articles/22850791655831)).
  A shared address never dead-ends: the browser page says where the screen lives. It fails when
  the hand-off to the app silently does nothing in some browsers. Atlas borrows the answered
  address and leaves out the automatic hand-off.
- **A local-files app whose website only introduces and downloads** (assumption: Obsidian's site,
  not read for this spec). One place where files are opened means one promise to keep.

## Problem and alternatives

The request is the cause, not a symptom. Two surfaces promise to open a folder, and the weaker one
costs a branch in 135 files, 14 explanatory cards and a second test substrate, for a person nobody
has observed. What breaks for a current user: someone who works in the browser loses that door
(their files do not change), and a visitor on Linux, an Intel Mac or a phone loses the only screen
they had; the one-sentence answer in Flow 1 and 4 is what they get instead.

| Way | Value to the person | Cost | Local-first fit | Verdict |
|---|---|---|---|---|
| Status quo | A folder opens with no install | Every app ability needs a browser answer; two test substrates | Two places hold a folder handle | Lost: the owner uses neither, and nothing shows anyone else does |
| Keep the browser reading, remove editing | Look at one's own folder before installing | Keeps the picker, the remembered handle and most branches | Same as today | Lost: it keeps the code the owner asked to delete |
| Hide the browser door, keep the code | None | None now; the branches rot | Unchanged | Lost: "don't leave anything confusing behind" |
| **App only, website keeps a sample map** | One clear answer; a visitor still sees a real map | One-time: 113 specs move, about 500 files change | One place opens folders | **Chosen** |

Ranked parts of the owner's request, by value returned against cost: (1) no page opens a folder,
and every app address says so; (2) the bundled-sample mode leaves the app's screens, the largest
source of confusion for builders; (3) the cards and copy go; (4) the documents stop describing a
browser version. All four ship together, because a half-removed surface is the confusing state the
owner named.

## Flow

1. When a visitor opens `/` or `/download` in a plain browser, Atlas shows the gateway. Its first
   button downloads; its second reads "See a sample map" and opens `/sample`. Under the buttons one
   sentence names the computers the app runs on and links the sample map and the guide section
   "Connect from a source checkout" (`docs/guide/connect-agent.md:63`).
2. When the visitor opens `/sample`, Atlas draws the Storefront sample (125 concept documents)
   with the app's map renderer, under a line saying what it is and that it cannot be edited. They
   can pan, zoom, and press a concept to read its name, kind, first paragraph and relations in the
   compact panel. There is no rail, no open-folder control, no edit, no agent panel.
3. When they press "Get the app" on `/sample`, Atlas opens `/download`.
4. When anyone opens any other address in a plain browser (a bookmark to `/topology`, a shared
   link to `/library/?tab=wiki`, an old `/mcp/?install=…` link), Atlas shows the app-only page
   from the first paint, with "Get the app", "See a sample map" and the same one sentence. The
   address bar keeps what was typed. The page is never indexed.
5. When a coding agent, an old guide page or a search result still calls `/topology` "the browser
   version", the person lands on the same app-only page; nothing on it claims a browser version.
6. When the sample's data does not arrive, `/sample` says so and offers "Try again"; it never
   shows an empty map as if the sample were empty.
7. When a browser that once opened a folder here visits `/` or an app address, Atlas deletes the
   `demo-kv` database that browser stored and shows the same pages as to anyone else. The folder
   on disk is not touched.
8. When a person opens the installed app, or the app loads an app route as a new document (an
   install link, `src-tauri/src/app_shell/deep_link.rs:123`), every screen behaves as before, and
   no frame ever shows the gateway, `/sample` or the app-only page.

## States

"Unchanged" names the app's existing screen and next step; this change adds no app state.

| State | Web | macOS app |
|---|---|---|
| Empty | `/`: the gateway; next: download or `download.sampleCta`. An app address: `appOnly.title`, `appOnly.body`, `appOnly.otherComputers`; next: `appOnly.download`, `appOnly.sample` | Unchanged: first run (`firstRun.title`); next: `firstRun.openTitle` or `firstRun.createTitle` |
| Loading | `/sample`: the map's wait stage, then the map. An app address: the app-only page from the HTML, at first paint | Unchanged: the neutral frame, then the folder's map; the app-only face stays hidden under `data-shell="desktop"` |
| Error | `/sample`: `sampleMap.loadFailed`; next: `sampleMap.retry`. Scripts off: the app-only page as exported, both links live | Unchanged: `rootEntry.lostVaultMissing`; next: `rootEntry.lostVaultAction` |
| Partial | Out of scope — the sample is one file and arrives whole or not at all | Unchanged: the map draws arriving documents (`docs/ARCHITECTURE.md:787-803`) |
| Largest measured vault | `/sample`: fixed at 125 concepts; `sampleMap.size` states the count | Out of scope — no app code path changes |
| Visitor on an Intel Mac, Linux or a phone | `/download` and the app-only page show `download.otherComputers` / `appOnly.otherComputers`; next: `/sample` or the guide section. A phone keeps today's handheld order, sample button first | Out of scope — that visitor has no app |
| Narrow (390 wide) and touch | `/sample`: heading, lead and size stack above the map; one-finger pan, pinch zoom, tap opens the compact panel; links meet the 24 px target. App-only page: one column, each link on its own line | Out of scope — neither page is drawn in the app |
| Keyboard | `/sample`: Tab reaches "Get the app", then the map, which keeps its keyboard walk (`src/widgets/ontology-map/interaction/keyboard-walk.ts`); Escape closes the panel. App-only page: Tab reaches the four links in reading order | Out of scope — neither page is drawn in the app |
| Text at 200% | Both pages reflow with no horizontal scroll at 1280 wide; no line is clipped | Out of scope — neither page is drawn in the app |
| Remembered folder from the old workbench | Database deleted without a message; pages as for anyone | Record kept; the last folder reopens |
| Address that never existed | Unchanged: the not-found page offers Download, Guide, Changelog (`src/views/terminal-state/ui/NotFoundScreen.tsx:119-129`) | Unchanged: the window returns to the map |

## Copy

Written into all four catalogues (`messages/{en,ko,ja,zh}/`); Korean is in `messages/ko/`.

| Key | Where it appears | English |
|---|---|---|
| `appOnly.title` | App-only page, heading | Ontology Atlas runs in the installed app |
| `appOnly.body` | App-only page, under the heading | This address opens a screen of the app. Ontology Atlas reads and edits your Markdown folder only in the app installed on your computer. |
| `appOnly.download` | App-only page, first link | Get the app |
| `appOnly.sample` | App-only page, second link | See a sample map |
| `appOnly.otherComputers`, `download.otherComputers` | App-only page under the links; gateway under the download buttons | The app runs on Apple Silicon Macs and, as a beta, on Windows x64. On an Intel Mac, Linux or a phone, `<sample>`see a sample map`</sample>`, or `<guide>`run the MCP server from the source code`</guide>` to connect a coding agent. |
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

`<sample>` links `/sample`; `<guide>` links `/guide/connect-agent#connect-from-a-source-checkout`.
The compact panel on `/sample` adds no string. `sampleMap`, `appOnly` and the two `metadata` keys
join the gateway's message set (`GATEWAY_MESSAGE_PATHS`, `src/i18n/gateway-messages.ts:13-29`).
Replaced keys are deleted in slice 6.

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
- **Someone who used the browser workbench.** Their files are not touched; the browser's database
  is deleted (Flow 7). They install the app and pick the same folder once, already the rule per
  surface (`docs/ARCHITECTURE.md:449-451`). Display preferences left in that browser are never read.
- **Shared links.** Every former app address answers with the app-only page; `/project/<slug>`,
  which is removed, answers with the not-found page.
- **The app loads the same export.** Every app route's HTML carries both faces: the workbench and
  the app-only page. Which one paints is chosen in CSS by `data-shell="desktop"`, which the boot
  script sets before the first face in the document, the pattern `/` already uses. A plain browser
  with or without scripts paints only the app-only face; the app paints only the workbench, also
  on a document load of an app route. The Vite move must carry this HTML shape into its
  page-by-page parity (`docs/specs/2026-11-27-ui-on-vite.md`, criterion 3). `/sample` is left
  out of the app's bundle like `/download`.
- **Code the app shares with the browser path** stays: the folder-handle shape, the remembered
  folder store, the slow safety reread
  (`src/entities/vault-session/model/local-vault/use-local-vault.ts:48`, `:451-456`), the "no
  folder loaded" state, and each native bridge's "no runtime" answer.
- **`pnpm dev` in a browser** shows the public pages and the app-only page. Builders run the app
  with `pnpm desktop:dev`, or a test browser with the faked app runtime.

## Out of scope

- A button that opens the same screen in the installed app: the app answers one address grammar
  only (`docs/ARCHITECTURE.md:344-361`), and widening it is its own decision.
- A notice for people who used the browser workbench: none has been observed.
- A Linux or Intel Mac app.
- Detecting an Intel Mac or Linux to change the download button: a user agent does not tell Apple
  Silicon from Intel, so the one sentence is shown to every visitor.
- Renaming the folder-handle type the app's bridge implements: 95 files, no change for a person.
- A second sample or a sample picker on `/sample`.

## Inventory and slices

Each list is produced by its command, so it stays true as `main` moves; counts are from
`969fd2b804`. No file belongs to two slices.

**Order and merge (owner, 2026-11-27: "collect every switch in one branch and, with no issue,
put it into `main` at once"; arranged by the lead).** Every slice merges, `--no-ff` and unsquashed,
into one integration branch, `integration/e2e-app-runtime-2026-11-27`, in this order: 2 (it
changes tests and tools only), then 1, then 3 to 6, because each of 3 to 6 deletes what the one
before stopped using; slice 1 may be built beside them. The Vite move's slices follow in the same
branch (`docs/specs/2026-11-27-ui-on-vite.md`, Slices). `origin/main` is merged into the
integration branch at least daily. Nothing reaches `main` until the combined gate passes on the
branch's head (the Vite spec, "The gate before the merge to `main`"); then the branch reaches
`main` in one merge. The MCP server's move to Rust keeps its own integration branch over `mcp/`,
`src-tauri/crates/` and `src-tauri/Cargo.*`, and merges once on its own. Three Next-shaped pieces
of slice 3 are rewritten by Vite's switch: the `stage-desktop-frontend.mjs` edit, the `app/**` page
files, and the two-face HTML. Keep each thin: page files only import a view from `src/views`.

**Deciding rule for a file the pattern finds.** Delete a branch that runs only when the app's
native bridge is absent or when the data is a bundled sample, with the code only it reaches. Keep
whatever the app runs and each bridge's "no runtime" answer. The `static` data-source mode is the
app's "no folder loaded" state: rename it so and keep it; delete only its bundled-sample arms.

Browser-branch pattern (`BRANCH`, 26 tokens), run as `git grep -lE "$BRANCH" -- src app`:
`isTauriVaultRuntime|isDesktopShell|GetAppLink|shouldShowGetAppTile|-get-app|web-limit|web-degraded|WebManualConnect|useDataSourceMode|useStaticVault|useSampleSource|sample-source|VaultSourceHydrationBoundary|showDirectoryPicker|showOpenFilePicker|isSupported|'unsupported'|"unsupported"|verifyHandlePermission|requestPermission|queryPermission|startPreferredSampleDownload|isGatewaySurface|dev:desktop-shell|state === 'web'|agentGap === 'browser'`.
Nine of them name code the app runs and stay where the app uses them (`KEPT`):
`isTauriVaultRuntime|isDesktopShell|useDataSourceMode|isSupported|'unsupported'|"unsupported"|verifyHandlePermission|requestPermission|queryPermission`.
The other 17 are `GONE`.

| Slice | Files | What it does |
|---|---|---|
| 2. Test host (2a map, 2b library, 2c the rest) | 113 specs (49, 21, 43), the helpers, eight tools | Moves every spec and tool that reaches an app screen without the faked app runtime onto it; product code untouched |
| 1. Rules and documents | 76 by the document pattern, plus `AGENTS.md`, `README.{ko,ja,zh}.md`, the copies of 6 guide pages under `docs-i18n/guide/{ko,ja,zh}/` | Rewrites every living document that describes a browser version |
| 3. Public site and the app-only page | about 45, named below | Adds `/sample` and the app-only page, repoints the gateway, removes the sample project routes |
| 4. Upper layers | 57 product files, 31 unit tests, the installed-app verifier | Deletes browser branches in `src/views`, `src/widgets`, `src/app` |
| 5. Lower layers | 75 product files, 46 unit tests | Deletes browser branches and now-unused modules in `src/features`, `src/entities`, `src/shared` |
| 6. Sweep | message files in up to 38 namespaces × 4 locales, generated data, 13 ontology nodes | Removes orphaned copy and dead code, syncs the ontology, records the change |

**Slice 2.** List: the check of criterion 5, run on its base. By folder: map 49, library 21,
vault-session 10, app-shell 9, design-audits 7, projects 5, top level 4, agents 3, settings 3,
planning 1, typography 1. A spec whose subject is the browser itself is deleted, not moved:
`planning/browser-fallback.spec.ts`, `vault-session/open-vault-cta.spec.ts`,
`vault-session/local-vault-picker.spec.ts`, and any test asserting a "works in the app" card. The
fake grows to serve several folders, keep writes across a reload, answer create, remove and rename
and the source pickers. Specs that measured Storefront or the Atlas sample keep those documents as
their folder. Tools moved onto the fake: `scripts/design/look/open-vault.mjs`,
`scripts/perf/lib/web-session.mjs`, `scripts/design/measure-a11y.mjs`, `measure-contrast.mjs` (its
`/project/storefront/` rows move to the app's project address), `measure-graph-readability.mjs`,
`scripts/perf/perf-node-drag.mjs`, `scripts/download/map-screen.mjs`. Deleted: `perf:web-open`,
`scripts/perf/perf-web-open.mjs` and its rows in `scripts/perf/budgets.json`; `perf:app-open`
remains. New: the check in criterion 5. `pnpm e2e:durations` is refreshed from slice 2's green run.

**Slice 1.** List: `git grep -lE "$DOCS" -- 'README*.md' AGENTS.md CONTRIBUTING.md SECURITY.md .claude .agents .codex ':(glob)docs/*.md' docs/features docs/guide docs/engineering docs/design docs/contracts docs/benchmark mcp/README.md cli tests/AGENTS.md ':!docs/DECISIONS.md' ':!docs/CHANGELOG.md'`,
where `DOCS` is `File System Access|showDirectoryPicker|FSA|fallback workbench|browser|degradation card|degraded card|DEGRADED_SURFACES|web-surface-smoke|Chromium|the web|web (visitor|user|session|surface|smoke|playground|build|gateway|app)|Web:|hosted web`.
Frozen history and dated specs are not edited. Lines that must change, read for this spec:
`.claude/rules/surfaces.md:19-57`, `:166-209`; `.claude/rules/local-first.md:8-12` (promise 1
becomes "`pnpm desktop:dev` opens a usable first screen", promise 2 loses the browser path);
`.claude/rules/testing.md:107-116`; `AGENTS.md:25`; `README.md:19`, `:45`, `:49`, `:150`;
`docs/ARCHITECTURE.md:26-29`, `:61-66`, `:323-468`, `:771-829`, and the route list `:834-967`
(adds `/sample`, removes `/project/[slug]` and `/project/[slug]/edit`);
`docs/PRODUCT-DIRECTION.md:289-291`, `:433-434`, `:571-572`, `:625-628`; `docs/FEATURES.md`
(6 lines); `docs/features/**` (26 files); `docs/guide/connect-agent.md:57-61`.

**Slice 3.** New: `app/(gateway)/[locale]/sample/page.tsx`, views `src/views/sample-map` and
`src/views/app-only` (the latter marked `data-testid="app-only-page"`). Changed:
`src/app/providers/AppShell.tsx`, `app/[locale]/layout.tsx` (the second face and `noindex`),
`app/[locale]/topology/page.tsx` (drops `MapSampleHead`), `src/views/root-entry/**`,
`src/shared/lib/navigation/nav-destination.ts`, `src/views/download/ui/release/DownloadActions.tsx`,
`src/views/download/ui/ScreensStage.tsx`, `src/views/download/ui/build-with-moru/BuildWithMoru.tsx`,
`src/shared/ui/fallbacks/gateway-entry-fallback.tsx`, `app/sitemap.ts` (adds `/sample`, drops
`/topology` and the project rows), `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`,
`src/i18n/gateway-messages.ts`, `src/app/providers/root-entry-messages.ts`,
`scripts/desktop/stage-desktop-frontend.mjs`, `tests/e2e/web-surface-smoke.spec.ts` (rewritten:
gateway, `/sample`, the app-only page on every app route; it keeps its name, which `scripts/ci/`
uses), `tests/e2e/gateway/**`, `tests/e2e/audited-routes.ts`, a new
`tests/e2e/app-shell/app-document-load.spec.ts`, and the contracts
`tests/contract/routes/gateway-routes.contract.test.ts`, `scope-registry.contract.test.ts`,
`tests/contract/desktop/desktop-frontend-paths.contract.test.ts`, `app/sitemap.test.ts`. Deleted:
`app/[locale]/project/[slug]/page.tsx`, `opengraph-image.tsx`, `edit/page.tsx`,
`edit/ProjectEditClientPage.tsx`, `tests/contract/vault-data/bundled-project-routes.contract.test.ts`,
`tests/e2e/vault-picker-stub.ts`, `tests/e2e/sample-source.ts`.

**Slices 4 and 5.** Lists: `BRANCH` over `src/app src/views src/widgets` (slice 4) and over
`src/features src/entities src/shared` (slice 5), less slice 3's files. Slice 4 also re-points the
installed-app verifier (`src-tauri/src/webview_verify/ai_settings_verify.js:96-100`,
`scripts/lib/verify-macos/ai-settings-contract.mjs:44-46`) from the deleted card to
`app-only-page`: finding it fails the run with "installed app rendered the page meant for
browsers". The MCP-in-Rust work owns only `src-tauri/crates/**` and `src-tauri/Cargo.*`. Whole
files that serve only the browser path: slice 4, `src/views/home/ui/MapSampleHead.tsx`,
`src/views/docs-vault/ui/welcome/SampleNotice.tsx`, the export `projectBreadcrumb`
(`src/views/project-detail/index.ts`); slice 5,
`src/features/docs-vault-local/ui/WebManualConnectPanel.tsx`,
`src/features/docs-vault-local/lib/manual-connect.ts`,
`src/entities/vault-session/model/vault-source/use-sample-source.ts`,
`use-static-vault-source.ts`, `src/entities/vault-session/ui/VaultSourceHydrationBoundary.tsx`,
`src/shared/ui/controls/get-app-link.tsx`, `src/shared/lib/navigation/show-get-app-tile.ts`,
`src/shared/lib/vault-folder/sample-source.ts`, each with its tests; the export
`sourceCheckoutLaunch` (`src/shared/config/mcp/mcp-server-launch.ts:76`); the `?shell=desktop`
seam; the picker declaration in `src/shared/types/file-system-access.d.ts`; and under
`src/entities/docs-vault/lib/bundled-vault/` every loader that `/sample`, the guide, the changelog
and the gateway hero do not import. Kept and renamed with the "no folder loaded" arm:
`data-source-mode.ts`, `use-data-source-mode.ts`, `use-first-run-sample-mode-settled.ts`.

**Slice 6.** Message candidates: 134 keys whose name holds
`web|browser|getApp|unsupported|degraded|sample` and 80 values naming a browser or the app, across
38 of 84 namespaces; a key goes only when no source file uses it, in all four locales at once.
Also: `scripts/data/vitest-file-durations.json`, `tests/quarantine.json`, the docs-vault outputs
nothing reads, `/ontology-sync` for the 13 nodes under `docs/ontology` that describe a browser
path, and one `Removed` change record.

## Acceptance criteria

1. **Slice 3, the visitor's walk.** Given a plain browser at 1920 wide, when a person goes
   `/` → "See a sample map" → presses a concept → "Get the app", then each step shows what Flow
   1-3 says, `download.otherComputers` and its two links work, `sampleMap.size` shows the number
   of concept documents in `samples/storefront/` (125 at `969fd2b804`, never 0), and no request
   leaves the site's origin; at 390 wide with touch, by keyboard alone, and at 200% text, `/sample`
   and the app-only page meet their States rows. Captures of this walk and of today's walk are
   attached to the pull request. `tests/e2e/web-surface-smoke.spec.ts`.
2. **Slice 3, every app address.** Given a plain browser, when it opens each route of
   `docs/ARCHITECTURE.md`'s route list other than the public ones, in all four locales, with and
   without a query, then frames sampled from the first paint never hold a visible rail or tab bar,
   the page shows `appOnly.title` with its links working, carries `noindex`, and holds no map
   canvas or open-folder control; with scripts off the same page and links are visible. The built
   `sitemap.xml` lists `/sample` and neither `/topology` nor any `/project/` address, and
   `pnpm seo:check` passes. Same spec, plus `app/sitemap.test.ts`.
3. **Slice 3, recovery.** Given a browser whose `demo-kv` holds hand-built records of all three key
   shapes (`docs-vault:fs-handle:current`, `docs-vault:current-handle`,
   `docs-vault:fs-handle:recent`), each holding a real folder handle from the test browser's
   private file system, when it opens `/` and then an app address, then the gateway and the
   app-only page appear, `demo-kv` is gone on the next load, `showDirectoryPicker` was never
   called, and every file in that folder is byte-identical. Given the faked app runtime with a
   record carrying `desktopRootPath`, the record survives and the folder reopens. Same spec, plus
   `src/entities/local-fs-handle/api/store.test.ts`.
4. **Slices 3 to 5, the app never shows a website page.** Given the faked app runtime, frames
   sampled from the first paint never hold the gateway, `/sample`, the app-only page or
   `app-only-page` in: no folder (first run), reopen after quit, a second folder then the launch
   chooser, a folder switch, a moved folder, and an install link loaded as a new document
   (`tests/e2e/app-shell/app-document-load.spec.ts`, `rail-stays-painted.spec.ts`). Given the
   rebuilt installed app with a real folder, every rail destination, Add sources, block import and
   export, and Planning's Add files work as before; `pnpm desktop:smoke` and the installed-app
   verifier pass; the staged bundle's file count and bytes, printed by `stage-desktop-frontend.mjs`,
   are not above the figure captured before slice 3; `verify-windows`
   (`.github/workflows/windows-beta-check.yml:134`) is green. Installed-app walk in the pull request.
5. **Slice 2, one test substrate, first into the integration branch.** Given unchanged product
   code, a new check (`tests/contract/e2e/app-route-runtime.contract.test.ts`) reads every spec
   outside `tests/e2e/gateway/` and `web-surface-smoke.spec.ts` and lists each that visits an app
   route without installing the faked app runtime (through any helper), or names `?shell=desktop`,
   `stubDirectoryPicker`, `useDogfoodSample` or `demo:sample-source`; on its base commit it lists
   at least 113 specs, after slice 2 none. `playwright test --list` before and after differ only by
   the titles named as deleted in the pull request; `tests/quarantine.json` holds no entry and no
   `skip` was added; a spec serves two folders, reloads after a write without re-seeding, creates,
   removes and renames a file, answers both source pickers, and shows the launch chooser on the app
   arm (`use-recent-vault-reachability.ts:66-69`). One whole browser run
   (`.github/workflows/e2e.yml`, dispatched on the integration branch) is green on the integration
   tree with slice 2 merged in, and `pnpm e2e:durations` is refreshed from it.
6. **Slices 4 and 5, the code is gone.** `git grep -nE "$GONE|showSaveFilePicker|DEGRADED_SURFACES|web-session|perf-web-open" -- src app scripts src-tauri/src tests ':!tests/e2e/web-surface-smoke.spec.ts'`
   prints nothing (that spec names the picker only to prove it is never called). For `KEPT`, the
   pull request lists each remaining file with the app path it serves, and the file count per
   token does not rise. `pnpm typecheck`, the unit suite and one whole browser run on the
   integration tree are green.
7. **Slice 6, nothing orphaned.** `pnpm knip` is clean with no added exception; every key the
   message candidate scan still finds is used by a source file or listed under Copy;
   `pnpm messages:check` and `pnpm messages:coverage` pass for ko, ja and zh.
8. **Slices 1 and 3, the documents and emitted text agree.** The slice 1 command, run for
   `browser version|Try it in the browser|fallback workbench|File System Access`, prints nothing
   outside frozen history; after `pnpm build`, `grep -rlE "Try it in the browser|runs in the browser|browser version" out`
   prints nothing (it covers `llms.txt`, `llms-full.txt`, `sitemap.xml` and every page's metadata);
   `pnpm docs:language`, `pnpm docs:links`, `pnpm decisions:check` and `pnpm agents:check` pass.

## Risks

1. **A deleted branch was one the app runs**, as the `static` mode nearly was. Answer: slice 2
   enters the integration branch first, so every deletion is judged by specs on the faked app
   runtime; the deciding rule keeps the "no folder loaded" arm; criterion 4 walks the states where
   no manifest exists.
2. **The spec move leaves a browser run red, and a stable release needs a whole green run on its
   commit** (`.github/workflows/release-macos.yml:957-963`). Answer: `main` receives nothing until
   the combined gate passes, so its nightly run and its releases never see a half-moved suite;
   slice 2 changes no product code and its three parts are disjoint, so a red part does not hold
   the others inside the branch.
3. **The installed app flashes the app-only page, or a plain browser the rail**, because both
   faces ship in one export. Answer: CSS chooses the face by `data-shell="desktop"`, which the boot
   script sets before either face is parsed; criteria 2 and 4 sample from the first paint,
   including a document load inside the app.

## Later

1. Shrink the docs-vault build to what the public pages read (`public/docs-vault/`, 5.0 MB): next
   once criterion 7's run names the unread outputs.
2. An "Open in the app" link on the app-only page for `/mcp/?install=…`: next when a vendor page
   links the web address instead of the app's.
3. Rename the folder-handle type to the app's own name: next when a builder is misled by it.
4. A notice for people who used the browser workbench: next if anyone reports a folder "missing".
5. Stop deleting the old browser database: next after two stable releases.

## Owner question

None. Decided by the lead on 2026-11-27: the two pages name the computers with an app and point
the rest to the sample and the source-run MCP server. Decided by the owner on 2026-11-27 and
arranged by the lead: every slice here and of the Vite move enters one integration branch, slice 2
first, and reaches `main` in one merge after the combined gate passes. Decided here, each reversible in one file: the sample is
Storefront, because the gateway hero already draws Atlas's own map
(`src/views/download/lib/use-stage-graph.ts:6-9`; reverse: change the data `/sample` imports); the
old browser database is deleted without a notice (reverse: Later 4).

## Revisions

- 2026-11-27: first draft.
- 2026-11-27: after an independent review. Both faces in the exported HTML, chosen by
  `data-shell`, replace the "neutral fallback" claim; criteria 2 and 4 sample from first paint. The
  `static` mode is kept as "no folder loaded". Slice 2 gains a standing check, title counts and a
  richer fake, and merges alone first (lead decision). The other-computers sentence and its States
  row added (lead decision). Verifier, measuring tools, sitemap, `noindex`, `MapSampleHead`,
  emitted text and narrow, touch, keyboard and 200% states assigned. 47 corrected to 44.
- 2026-11-27: owner decision ("collect every switch in one branch and, with no issue, put it into
  `main` at once"). Slice 2 no longer merges to `main` alone: slices 2, 1 and 3 to 6 merge in order
  into `integration/e2e-app-runtime-2026-11-27`, the Vite slices follow there, and the branch
  reaches `main` in one merge after the combined gate. Criterion 5's whole browser run runs on the
  integration tree; Risks 1 and 2 and the Owner question follow.
- 2026-11-28: slice 3 as built. `rootEntry.lostVaultMissing` is deleted: the app never rendered it.
  The `download.json` `screens.*` keys were rewritten in place to the sample map (`sub`, `mapLink`,
  `mapHint`), and `build.actions.sample` is new in its place of `tryBrowser`. `appOnly` stays outside
  `GATEWAY_MESSAGE_PATHS`: only the workbench documents carry the app-only page, and the gateway
  pages never render it. The locale root hands a browser to `/download/` from a script in the document
  head (`GatewayHandOverScript`), not from the workbench, so no app code is fetched on the way; the
  installed app, once hydrated, drops the app-only page from its document so its first `main` is its own.
- 2026-11-28: the plain-browser half of `app-document-load.spec.ts` moved to
  `tests/e2e/gateway/app-address-in-a-browser.spec.ts`, because what a browser sees at an app address
  is the public site's behaviour and the per-test runtime check rightly lists it otherwise; the
  dehydrated-HTML hold is now proven there ("keeps the app-only page and mounts nothing").
