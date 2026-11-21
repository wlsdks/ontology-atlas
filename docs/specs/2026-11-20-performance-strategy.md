---
title: Performance strategy for folders of 2,000 to 50,000 documents
doc_type: spec
status: current
date: 2026-11-20
decisions: []
area: architecture
---

# Performance strategy for folders of 2,000 to 50,000 documents

The planner wrote this on 2026-11-20 from figures measured that day on main `dd4806cef`. It sets where each kind of data lives, the algorithm for each hot path, a budget per size, and the order of work. It plans no screen.

## The ask

The owner said on 2026-11-20, translated: "Let's set an optimization strategy across every area. We use Rust too, so manage memory well, develop the right algorithms, and make it feel smooth."

Standing rules this strategy is held to:

- The installed app (macOS; Windows must work) is the product. The web is an example.
- A folder holds thousands to tens of thousands of documents. The walk stops at 100,000 entries (`VAULT_WALK_MAX_ENTRIES` in `walk-vault.ts` and `walk.rs`).
- Every performance change reports steady memory, peak memory and what the memory is made of.
- Measure first, fix the algorithm first. Another language is allowed only where JavaScript is the measured bottleneck.
- No frame over 50 ms while something runs. Long work runs in the background and does not stop on navigation.
- Free CI only. Licences are MIT-compatible. No server. The derived index is rebuildable and never canonical.

## Where the bytes and milliseconds go

"Document" means one `.md` file. "Concept" means a document with `kind:`. The `key` shape is a few thousand concepts over many plain pages; the `all` shape makes every page a concept (`scripts/perf/gen-scale-vault.mjs`).

| Surface | Measured today | Dominant cost | Growth |
|---|---|---|---|
| App WebView | 586 MB steady and 762 MB peak at 2,000 documents; 981 MB and 1.67 GB at 20,000. 50,000 is not measured | Every document stays in the page as a full object for the whole session: about 22 KB of footprint per document above the 2,000 figure. What the 586 MB floor is made of is not measured | O(documents × fields kept) |
| Web, `key` 50,000 | First concepts 2 s, loaded 14 s, heap 250 MB steady and 338 MB peak | 264 MB counted: 150 MB is 1.9 million short strings (38 per document: headings, excerpt, link passages, titles), 31 MB objects, 26 MB arrays, 8 MB file handles | O(documents × strings per document) |
| Web, `all` 50,000 | Loaded 171 s, two frozen stretches of 44 s and 96 s with nothing on screen, heap 627 MB peak | Two main-thread tasks that run once per publish and grow faster than the concept count. The function is not identified from code; slice S1 names it | Worse than linear in concepts |
| Library | 50,000 sources and 50,000 pages: crash at 537 s and 3.85 GB. 20,000: 2.4 GB peak, 1.2 GB never released | `use-library-model.ts` keeps every wiki page's raw text and validates the whole folder in one synchronous pass. The restart loop (slice 0) multiplies it | O(total wiki text) memory, O(pages) per publish |
| Map, 20,000 | Pan p95 16.7 ms. First appearance and first hover 450 to 590 ms. Opening a Library island 2.1 s | Caches keyed by layout and model are built inside the first frame that needs them; flat layout is O(passes × (iterations × domains² + iterations × members²)) with up to 20 placement passes | O(relations) and O(names) once, on the main thread |
| Focus | A full folder check 2 s after every focus | The focus path skips the cost floor the poll obeys (`poll-cadence.ts`) | O(files) per focus |
| Rust side | Bench limits at 50,000: build 15 s, reopen 0.6 s, one-file update 20 ms, search p95 50 ms, peak RSS 250 MB (`perf:vault-index`) | Not a bottleneck. It causes two WebView costs: each chunk of 2,048 stored rows is one JSON document parsed on the main thread, and source hashes are recomputed on every launch because nothing keeps them | O(source bytes) per launch |
| MCP, 50,000 | 0.2 s per read call; `validate_wiki` 5 s with a 600 MB transient heap, 82 MB kept; RSS stays at 850 MB to 1.16 GB | A read call stats every file (O(files)). `validate_wiki` judges every page for each page of reply | O(pages × page bytes) per call |
| Search | Non-Markdown sources: at most 200 files and 20 MB per query, read again each query. Meaning: 7 to 18 passages/s, 1.5 to 8 h at 50,000 | Re-reading and re-extracting per query; embedding throughput | O(files read) per query |

## Decisions

1. **The 50 ms rule is one rule for every slice.** After first paint no main-thread task exceeds 50 ms, at any size, on either surface. A pass over every document either runs in a worker or yields at least every 8 ms. Chromium is measured by `longtask`; WebKit has no `longtask`, so the app is measured by the longest gap between animation frames.
2. **Three tiers of data, named the same everywhere.**
   - *Spine*: what lists, the graph and the map need for every document: slug, title, kind, relation references, link targets, tags, modified time, display labels, finding codes, parser diagnostics, and a concept's definition preview (it is the concept's summary on every surface).
   - *Detail*: headings, excerpt, word count. Read for a document when a surface shows it. Link passages are not derived at all (see "S8 plan").
   - *Text*: the file body. Held only for the open document and for files being derived.
3. **One store interface, `DocumentStore`, in `src/entities/docs-vault/store/`.** S8 builds `detail(doc)` and `details(docs)`; `backlinks(slug, { offset, limit })`, `text(slug)` and `window({ scope, order, offset, limit })` wait for a surface that needs them. Detail is derived from the file, read at its current stamp, on every surface; the index keeps no detail rows (see "S8 plan", decision 5).
4. **Rust stores and serves; TypeScript derives.** Record `183a2c12` stands: the crate never interprets frontmatter, and parsing, the graph and validation stay in TypeScript and MCP. New derived facts enter `rows.sqlite` as new producer namespaces through the existing `vault_index_rows_get` and `vault_index_rows_put`. No schema change is needed for Markdown files.
5. **Two workers, placed by layer.** `src/entities/docs-vault/worker/vault-build.worker.ts` parses, aggregates and derives. `src/widgets/ontology-map/worker/map-layout.worker.ts` lays out and precomputes map indexes. Each worker file is a thin message shell over exported pure functions. Where `Worker` is missing the caller runs the same function through `runSliced` on the main thread.
6. **A worker never calls the bridge.** In the app the main thread invokes, receives an `ArrayBuffer` and transfers it; decoding and `JSON.parse` happen in the worker. On the web the worker reads through transferred file handles. `SharedArrayBuffer` is not used: neither surface sets the isolation headers.
7. **Bulk crosses the bridge as bytes, in batches.** Raw request and response bodies, 64 files or more per call, no per-file call in a loop, no reply over 4 MiB. Vault text crosses only for the open document, files being derived and search hit lines.
8. **The map receives typed arrays.** Positions as `Float32Array`, edges as offset and target `Uint32Array`s, kinds as `Uint8Array`, names from one string table. A position hand-off from the worker eases from the drawn position; it never snaps.
9. **Per-document work becomes a stored fact; folder-wide work runs over facts.** A wiki page's verdict, links and cited sources are computed once per file version. `wikiPageFacts(raw, parsed)` and `validateWikiFolderFromFacts(facts)` are added to `mcp/src/library/wiki-schema.mjs`, the one validator the app and MCP share, and equal `validateWikiFolder` byte for byte.
10. **Shared scheduling names.** `yieldToFrame()` and `runSliced(items, work, budgetMs = 8)` live in `src/shared/lib/scheduling/`.
11. **Progress uses what exists.** Folder open keeps the map's "Reading {read} of {total} files" line painting; runs longer than a few seconds take the shell seat that the long-work-in-background spec defines (branch `feat/wiki-check-keeps-running`, not on main yet). This spec adds no copy.
12. **The web is budgeted at 2,000 and 20,000.** At 50,000 it must not freeze or crash; its times are reported, not gated. It gets no WebAssembly port of the crate (`.claude/rules/surfaces.md`, "Do not backfill app abilities onto the web").
13. **One budget table.** `scripts/perf/budgets.json` holds every number below; every `perf:*` script's `--check` reads it.

No decision here waits on the owner.

## Target architecture

| Data | App | Web | Page holds |
|---|---|---|---|
| Text | Files; `search.sqlite` tokens | Files | The open document |
| Detail | `rows.sqlite`, read by path | Derived from the file on demand | 256 most recent, by slug |
| Spine | Built in the worker from rows | Built in the worker from files | Slice S8: lean objects. Slice S11: columns, with the page holding only windows |
| Wiki facts | `rows.sqlite`, producer `wiki-facts/<hash>` | Worker memory | Verdict codes and link ids per page |
| Source hashes | Index, Rust producer (slice S9) | `crypto.subtle`, in memory | A map of path to hash |
| Map | Worker output | Worker output | Typed arrays and visible names |
| Vectors | `vectors.sqlite` (search-by-meaning spec) | None | Nothing |

Strings: the measured 150 MB is 38 strings per document, of which about 30 are detail. Moving detail out removes them without interning. For the spine, slice S11 keeps one concatenated string per column with a `Uint32Array` of offsets, sliced on read, so 50,000 titles are one string. Lists ask for windows of at most 200 rows.

## Algorithms per hot path

| Path | Today | Target | Structure |
|---|---|---|---|
| Folder read | Walk O(F); parse O(bytes) on the main thread; each partial publish re-aggregates O(D log D + links) | Same work in the worker; partial publishes append to a running aggregate, O(batch log D) each | Sorted array with binary insertion; backlinks as map of target to set |
| Incremental rebuild | Watcher delta O(changed × log D) plus one O(D) list copy; derive O(changed) (`apply-vault-changes.ts`) | Keep. Focus and the 60 s poll in the app compare stamps natively and read nothing when equal | As today |
| Map layout, 50,000 | Synchronous; `separate` is O(rounds × n²); ForceAtlas2 without Barnes–Hut inside clusters | In the layout worker; uniform-grid separation O(rounds × n × k); Barnes–Hut above 64 bodies; at most one result posted per frame | Uniform grid; quadtree (the Library graph already has one) |
| Physics | ForceAtlas2 on the dragged neighbourhood, synchronous | Keep on the main thread while a tick stays under 4 ms; larger neighbourhoods are cut to the 4 ms budget | Subgraph by id set |
| First appearance and first hover | Attention, flow keys, link probes and text widths built in the first frame that asks | Built in the worker with the layout, or sliced before first input; text measured only for names admitted to the screen, widths cached by font and text in an LRU of 4,096 | Offset arrays per concept; LRU |
| Island open | 2.1 s, cause not identified from code | Layout of the opened island only, O(n log n + E), sliced; first frame of the opening within 300 ms | As `library-flow-layout.ts` states |
| Search, Markdown | FTS5, p95 limit 50 ms at 50,000 | Keep | FTS5 with positions |
| Search, other sources | Reads up to 200 files per query | Units extracted once per file version, indexed, searched like Markdown (slice S10) | FTS5 table for source units |
| Search, meaning | Brute force over 1-bit vectors, int8 rescoring | Owned by `docs/specs/2026-11-19-search-by-meaning.md` | — |
| `validate_wiki` | Judges every page per reply; transient heap O(total text) | First call streams one page at a time and keeps facts and verdicts by stamp; later calls judge changed pages only; the folder half runs over facts | Map of path to stamp, verdict and facts |
| Library hashing | Sequential, repeated every launch | Hashed once per file version on a bounded thread pool, kept in the index | Row keyed by path and stamp |
| Library page text | Every page's text kept; folder validated in one pass | Text read in batches of 64, facts kept, text dropped; verdicts recomputed for changed pages only | Rows; LRU of one open page |

## Budgets

Targets on the owner's M2 Max, installed app unless said, `key` shape unless said. "Today" repeats the measured figure; "n.m." means not measured.

| Budget | 2,000 | 20,000 | 50,000 | Command |
|---|---|---|---|---|
| App WebView steady (physical footprint) | ≤ 450 MB (today 586) | ≤ 520 MB (today 981) | ≤ 600 MB (n.m.) | `pnpm perf:app-open` (new) |
| App WebView peak | ≤ 600 MB (today 762) | ≤ 750 MB (today 1,670) | ≤ 900 MB (n.m.) | `pnpm perf:app-open` |
| App WebView with the Library open | ≤ +50 MB | ≤ +100 MB (today 2.4 GB peak) | ≤ +150 MB, no crash (today crash at 3.85 GB) | `pnpm perf:app-open -- --walk=library` |
| App main process, meaning search aside | ≤ 150 MB steady, 250 MB peak (n.m.) | ≤ 150 / 250 MB (n.m.) | ≤ 200 / 300 MB (n.m.) | `pnpm perf:app-open` |
| MCP binary footprint after 20 calls / peak | ≤ 80 / 150 MB (n.m.) | ≤ 120 / 300 MB (n.m.) | ≤ 185 / 470 MB (existing gate) | `pnpm perf:mcp:scale -- --check` |
| Web heap steady / peak | ≤ 60 / 100 MB (n.m.) | ≤ 90 / 150 MB (n.m.) | reported: ≤ 120 / 200 MB (today 250 / 338) | `pnpm perf:web-open` (new) |
| First concepts, app reopen | ≤ 0.5 s | ≤ 1 s | ≤ 1.5 s (web today 2 s) | `pnpm perf:app-open` |
| Loaded, app reopen from rows | ≤ 1 s | ≤ 2 s | ≤ 3 s | `pnpm perf:vault-open -- --check`, `pnpm perf:app-open` |
| Loaded, first open | ≤ 2 s | ≤ 6 s | ≤ 15 s (web today 14 s); `all` ≤ 40 s (today 171 s) | `pnpm perf:app-open`, `pnpm perf:web-open` |
| Longest main-thread task after first paint | ≤ 50 ms | ≤ 50 ms (today 450–590 ms) | ≤ 50 ms (today 44 s and 96 s on `all`) | `pnpm perf:web-open`; frame gap in `pnpm perf:app-open` |
| Frame p95 for pan, zoom, hover, drag | ≤ 16.7 ms | ≤ 16.7 ms (today 16.7) | ≤ 16.7 ms (n.m.) | `--walk=map` of both scripts |
| Island open, first frame | ≤ 300 ms | ≤ 300 ms (today 2.1 s) | ≤ 300 ms (n.m.) | `--walk=library` |
| MCP read call p95 | ≤ 30 ms | ≤ 100 ms (today 80) | ≤ 250 ms (today 200) | `pnpm perf:mcp:scale` |
| `validate_wiki`, first / repeat call | ≤ 0.2 / 0.05 s | ≤ 0.6 / 0.15 s | ≤ 1.5 / 0.3 s, transient heap ≤ 150 MB (today 5 s, 600 MB) | `pnpm perf:mcp:scale -- --tool=validate_wiki` |
| Index search p95 | ≤ 50 ms | ≤ 50 ms | ≤ 50 ms (existing limit) | `pnpm perf:vault-index -- --check` |
| Focus | No folder walk while the watcher is healthy; on the web at most one check per max(2 s, 20 × the last check's cost) | same | same | call-count test |

`perf:app-open` wraps `pnpm desktop:verify-app` with `--webview-fixture-vault` on a generated folder, samples the `footprint` of the app and its WebContent process twice a second, and prints `vmmap --summary` regions as the app's composition. `perf:web-open` drives the static export in GPU Chromium (`channel: 'chromium'`) and reports heap composition from a heap snapshot. Heap composition is read on the web because WebKit offers no automated heap census; the JavaScript is the same build.

## Regression guard

CI gates run on the free Linux runner inside the existing `Perf · Ratios` job (`pnpm test:perf`) and the Rust test job. None reads a wall clock against a fixed number.

| Gate | Shape | Ships with |
|---|---|---|
| A built document holds no detail field; median spine row ≤ 600 B serialized on the 2,000 fixture | Size | S8 |
| A watcher batch of k files reads ≤ k files and walks 0 times; an unchanged focus check reads 0 files | Call count | S7 |
| The build yields at least once per 64 files; no slice callback runs more than 64 items | Call count | S4 |
| Layout, aggregation, island layout and name admission: time at 4N ÷ time at N ≤ 5, same run | Ratio | S4, S5, S6 |
| One `validate_wiki` page on a warm cache judges ≤ `limit` pages; the transcript equals the old validator's on the fixture | Call count, equality | S2 |
| The Library reads each page once per stamp and keeps no page text after facts exist | Call count | S3 |
| A manifest built in the worker equals one built on the main thread | Equality | S4 |
| The stored row values of one 2,048-path lookup total ≤ 4 MiB on the 2,000 fixture | Size (TypeScript test: the crate stores values as opaque bytes, so only what TypeScript writes sets the bound) | S8 |

Each new gate goes through `/gate-probe`. Footprint, heap, time to loaded, frame p95 and the longest task stay manual: `perf:app-open`, `perf:web-open`, `perf:mcp:scale --check`, `perf:vault-index --check` and `perf:vault-open --check` run on the owner's Mac for every performance pull request and before a release, and the pull request states steady memory, peak memory and composition.

## Slices

Slice 0, the Library restart-loop fix (`fix/library-page-text-restart-loop`), is in flight and not planned here. Owners are Opus implementers; days are budgets.

| # | Slice and value | Owns | Reads | Acceptance | One-way |
|---|---|---|---|---|---|
| S1 | **Harness and traces.** Every later number has a command; the two freezes get a named cause. 1.5 d | `scripts/perf/perf-app-open.mjs`, `scripts/perf/perf-web-open.mjs`, `scripts/perf/lib/**`, `scripts/perf/budgets.json`, `src/shared/lib/scheduling/**`, the `perf:app-open` and `perf:web-open` lines of `package.json`, their rows in `docs/DEVELOPMENT-CHECKS.md` | `scripts/perf/gen-scale-vault.mjs`, `scripts/verify-macos/**`, `tests/e2e/map/frame-work.ts` | Both commands print every budget row at 2,000, 20,000 and 50,000. The pull request carries a CPU profile of the `all` 50,000 open naming the five largest functions in each freeze, one for map first appearance and first hover, one for island open, and the `vmmap` regions at 2,000 | No |
| S2 | **Wiki judgement from per-page facts; `validate_wiki` bounded.** 5 s and 600 MB transient → 1.5 s and 150 MB first call, 0.3 s repeat. 2 d | `mcp/src/library/wiki-schema.mjs`, `src/shared/lib/library/wiki-page-schema.ts`, new `mcp/src/library/wiki-judgement.mjs`, the wiki functions of `mcp/src/tools/validate-vault.mjs`, `scripts/perf/perf-mcp-scale.mjs` | `mcp/src/vault/documents/document-cache.mjs` | `pnpm perf:mcp:scale -- --files=50000 --tool=validate_wiki` meets the row; the equality test passes; `pnpm test:mcp:unit` green. Response shape unchanged | No |
| S3 | **The Library holds no folder text.** Crash at 50,000 → none; 20,000 peak 2.4 GB → Library adds ≤ 100 MB and returns to steady within 60 s. 3 d | `src/features/library/model/**`, `src/features/library-rounds/model/consistency-pass.ts`, `src/views/library/ui/library-page/{use-library-graph-cards,use-library-reader,use-library-turns}.ts`, `src/views/library/ui/LibraryPage.tsx`, `src/views/library/ui/parts/questions/LibraryQuestionDesk.tsx`, `src/views/library/lib/rounds/use-rounds-runner.ts`, `src/views/library/lib/questions/use-answer-history.ts` | S2's names; `tauri-vault-index-rows.ts`; `tauri-vault-fs.ts` | `pnpm perf:app-open -- --files=20000 --files=50000 --shape=library --walk=library` meets the Library row with no frame gap over 50 ms; the page-read call-count gate | No |
| S4 | **Opening a folder never freezes.** `all` 50,000: 44 s and 96 s → longest task ≤ 50 ms; loaded 171 s → ≤ 40 s; the reading line keeps moving. 4 d | `src/entities/docs-vault/lib/local-manifest/build-local-manifest.ts`, `src/entities/docs-vault/worker/**`, `src/entities/docs-vault/lib/derive-ontology-from-vault.ts`, `src/features/vault-ontology/model/**`, `src/shared/lib/vault-folder/tauri-vault-index-rows.ts` | S1's profile and `runSliced`; `apply-vault-changes.ts` | `pnpm perf:web-open -- --files=50000 --shape=all --shape=key` and `pnpm perf:app-open` with the same flags meet the longest-task and loaded rows; worker equality and yield gates | No |
| S5 | **The map appears and answers the first hover without a spike.** 450–590 ms → ≤ 50 ms at 20,000; frame p95 ≤ 16.7 ms at 50,000. 4 d | `src/widgets/ontology-map/flat-graph/**`, `src/widgets/ontology-map/model/layout/**`, `src/widgets/ontology-map/worker/**` | S1's profile; `src/widgets/library-graph/model/library-graph-quadtree.ts` | `--walk=map` of both scripts at 20,000 and 50,000 meets the frame rows; ratio gates; frame-by-frame capture of the position hand-off | No |
| S6 | **Opening an island.** 2.1 s → first frame ≤ 300 ms, no frame over 50 ms. 2 d | `src/widgets/library-graph/**` | S1's profile | `--walk=library` island row at 20,000; ratio gate | No |
| S7 | **Focus obeys the cost floor.** O(files) per focus → no walk in the app, floored on the web. 0.5 d | `src/entities/vault-session/model/local-vault/use-local-vault.ts`, `poll-cadence.ts` | `TauriVaultWatchBridge.tsx` | Call-count gate; `pnpm exec vitest run src/entities/vault-session` | No |
| S8 | **Detail leaves the page.** Web 50,000 steady 250 MB → ≤ 120 MB; app 20,000 steady 981 MB → ≤ 650 MB; app first open at 50,000 about 9 s → about 5 s. 4.5 d, in three sequential slices S8.1–S8.3 and a conditional S8.4 | See "S8 plan" | See "S8 plan" | See "S8 plan" | No: the producer hash versions the row value |
| S9 | **Source hashes are kept.** Re-hashing every launch → zero reads for unchanged sources; reopen with 50,000 sources ≤ 1 s. 3 d | `src-tauri/src/library.rs`, `src-tauri/crates/vault-index/src/{confine,rows}.rs` and a new `sources.rs`, their tests, `src-tauri/crates/vault-index/src/bin/vault-index-bench.rs`, `scripts/perf/perf-vault-index.mjs`, `tauri-vault-fs.ts` hash functions | `stamps.rs`, `lifecycle.rs` | `pnpm perf:vault-index -- --shape=library --check` with a reopen row; `cargo test -p vault-index`; Windows path cases in CI | **Yes**: the index admits `sources/**` stamps and SHA-256 |
| S10 | **Search covers every source.** 200 files and 20 MB per query → all sources, first hits ≤ 300 ms. 4 d | `src/views/library/lib/sources/**`, `src-tauri/crates/vault-index/sql/search.sql`, `search.rs`, `src-tauri/src/vault/index.rs`, the Settings caption keys in `messages/*/settingsPrivacy.json`; the bench and `perf-vault-index.mjs` pass from S9 | `src/shared/lib/library/source-passage.ts` | `pnpm perf:vault-index -- --shape=library --check` search row; e2e of a hit in a source past the old cap | **Yes**: the index holds words of non-Markdown sources |
| S11 | **Spine as columns, lists as windows.** Planned again from S8's composition; built only if S8 misses the 50,000 row | — | — | — | — |

Acceptance criteria, each covered above: (1) no crash and bounded Library memory, S3; (2) no task over 50 ms on open, S4; (3) no map spike, S5; (4) island open, S6; (5) bounded `validate_wiki`, S2; (6) memory rows, S8 then S11; (7) kept hashes and full source search, S9 and S10; (8) every budget measurable, S1; (9) gates, with their slices.

Gaps: the app's 2,000-document floor (586 MB) has a target and no slice until S1 prints its regions; meaning search is budgeted by its own spec; Windows memory and frames are not measured anywhere (`footprint` and `vmmap` are macOS tools), so Windows evidence is CI tests only.

## Order

- **Now, in parallel:** S1, S2, S7. They share no file.
- **After S1:** S4, S5, S6 in parallel. S3 also waits for S2, slice 0, `feat/wiki-check-keeps-running` and `design/library-sources-header`, which edit its files.
- **S8** runs as S8.1, S8.2, S8.3, one at a time ("S8 plan", Order). S8.1 and S8.2 touch no file of S4 or of L5 in the large-folders spec and may start now. S8.3 edits `build-local-manifest.ts` only at the seam that plan names, and starts when no L5 branch is open.
- **After the search-by-meaning branches merge** (they edit the crate, `src-tauri/src/lib.rs` and `package.json`): S9, then S10 behind one decision record.
- Each slice is its own draft merged with `pnpm pr:land`; no integration branch. S5 and S6 each need an independent `reviewer` (algorithmic code).

## S8 plan: detail leaves the page

Planned on 2026-11-20 against main `83ad538e6`, after #3723 (vault text read as framed bytes) and #3726 (graph signatures hashed once). S8 changes **what** a built document holds. It does not change **where** parsing runs. That belongs to L5, the worker half of S4 in the spec "Large folders load gradually and nothing waits for everything" (drafted 2026-11-20, not on main yet), whose decision 14 leaves S8 here.

### What a document holds today and who reads it

`buildMdEntry` (`build-local-manifest.ts:372-440`) puts on every document:

- headings, excerpt and word count;
- definition preview;
- link targets (`linksOut`);
- link passages (`linkContexts`), which go on the build entry and the stored row, and which the aggregate turns into `manifest.backlinksDetail`.

The app's stored row (`app-entry/<hash>`) holds `{ doc, linkContexts }`, so every reopen loads all of it back into the page.

The research of 2026-11-20 measured the derive cost per document in V8 on synthetic 3.5 KB documents:

| Step | Share |
|---|---|
| `meaningFindings` | 32% |
| `extractOutLinksWithContext` (extracting link targets alone is 10× cheaper) | 31% |
| `buildExcerpt` | 19% |
| Frontmatter | 7% |
| `countWhitespaceWords` | 5% |
| `extractHeadings` | 4% |

Readers outside the build, found with `grep -rnw` on 2026-11-20:

| Field | Readers | Reads for |
|---|---|---|
| `headings` | `views/docs-vault/ui/DocsVaultPage.tsx:362`; `views/docs-vault/model/use-doc-outline.ts:21`; `views/docs-vault/model/use-vault-manifest.ts:76` (bundled headings); `views/docs-vault/model/use-doc-write-actions.ts:349` (insert table of contents); `views/library/ui/library-page/use-library-reader.ts:107` (S3's file) | The selected document |
| `wordCount` | `views/docs-vault/ui/parts/DocMetaBar.tsx:46,153` | The selected document |
| `excerpt`, shown on screen | `widgets/docs-quick-drawer/ui/doc-list/DocRow.tsx:31,79,85` (the hover preview of one row); `widgets/project-drawer/ui/more-info/ProjectConnectionLists.tsx:121,140` (at most five related documents) | Documents on screen |
| `excerpt`, matched or scored across every document | `widgets/docs-vault/lib/search.ts:140`; `widgets/search-palette/ui/SearchPalette.tsx:47` (bundled sample only); `views/library/ui/parts/index-column/LibrarySection.tsx:460`, through `entities/docs-vault/lib/library/vault-library.ts:152`; `entities/docs-vault/lib/doc-navigation/related-docs.ts:52,62`; `entities/docs-vault/lib/library/wiki-retrieval.ts:51` | Search and ranking |
| `excerpt`, used as fallback text | `entities/docs-vault/lib/projects/derive-projects-from-vault.ts:41`; `views/project-selector/lib/authored-description.ts:31`; the in-app agent (`widgets/vault-agent-panel/model/use-vault-agent.ts:163`, `features/vault-agent/model/agent-tools/{vault-read-port,tool-executor}.ts`) | Project descriptions; the agent's `excerpt` body mode and its list summaries |
| `definitionPreview` | `entities/docs-vault/lib/derive-ontology-from-vault.ts:156` | The `summary` of every concept |
| `backlinksDetail` | `views/docs-vault/ui/DocsVaultDocumentPane.tsx:129,339` (`layout="strip"`: chips, no passages); `views/docs-vault/model/use-doc-write-actions.ts:133` and `views/home/model/authoring/use-topology-authoring.tsx:542` (referrer names only); `entities/docs-vault/lib/local-manifest/apply-vault-changes.ts:708-721` | Referring slugs only |
| `linksOut` | `views/library/ui/library-page/use-library-graph-cards.ts:73`; `views/library/ui/parts/wiki/wiki-reader-facts.ts:90,106`; `widgets/library-graph/model/build-library-graph.ts:231,248`; `related-docs.ts:45` | Link targets, which are spine |

Two findings change the strategy's tiers:

- **No surface shows a link passage.** The docs pane draws backlinks as a strip of chips. The list layout of `widgets/docs-vault/ui/DocsVaultBacklinks.tsx`, which does show passages, has no caller. The sentence in `docs/ARCHITECTURE.md` saying the stored passage is "what the backlinks show" is wrong today.
- **The definition preview is spine.** It is the summary of every concept on the map, in the inspector and in search.

MCP and the CLI do not share this code. `mcp/src/parser.mjs` and `mcp/src/meaning/meaning-findings.mjs` are separate copies, each under its own parity contract, and neither reads excerpts, headings or link passages. The bundled samples are built by `scripts/docs-vault/build-docs-vault.mjs`, which has its own copy of the extractors. S8 touches neither that script nor the data it generates.

### Decisions

1. **The spine.** `VaultDoc` loses `headings`, `excerpt` and `wordCount`. It keeps:
   - slug, path, title, description, tags and frontmatter;
   - diagnostics, which health reads for every document and which exist only on malformed files;
   - `meaningEvidencePaths`, `meaningFindings` and `citesReadLines`;
   - `updatedAt`, `revision`, `linksOut` and `mtime`;
   - `definitionPreview`, for documents with `kind:` only.
2. **Detail.** A document's detail is `VaultDocDetail { headings: VaultHeading[]; excerpt: string; wordCount: number }`. One pure function derives it: `deriveDocumentDetail(raw: string): VaultDocDetail` in `src/entities/docs-vault/store/document-detail.ts`. It calls the same `parseFrontmatter`, `extractHeadings`, `buildExcerpt` and `countWhitespaceWords` that `buildMdEntry` calls today, so its output equals today's inline fields by construction.
3. **Link passages are not derived anywhere.**
   - The manifest's `backlinksDetail: Record<string, VaultBacklinkEntry[]>` becomes `backlinkSources: Record<string, string[]>`. For each target it lists the referring slugs, sorted by `compareCollated` as today.
   - A document's targets are its `linksOut` plus its resolved frontmatter relation refs, minus itself. That is the same set of keys `backlinkContribution` produces today.
   - The body scan becomes `extractOutLinkTargets(body, fromSlug): string[]`, which equals `extractOutLinksWithContext(...).slugs`.
   - Removed: `VaultBacklinkEntry`, `LinkContext`, `BuiltVaultEntry.linkContexts`, `extractOutLinksWithContext` in `parse-frontmatter.ts`, and the unused list layout of `DocsVaultBacklinks`.
   - Falsifier: when a surface needs to show a passage, add `DocumentStore.backlinks(slug, { offset, limit })`, which derives passages from the referring files one page at a time.
4. **The store and its hooks.**
   - `createDocumentStore({ readTexts })` in `src/entities/docs-vault/store/document-store.ts` answers `detail(doc)` and `details(docs)`, where a doc is `Pick<VaultDoc, 'slug' | 'path' | 'mtime'>`.
   - It reads at most 64 paths per call (strategy decision 7).
   - It keeps the 256 most recent details in an LRU keyed by path and file stamp, so an edited file never answers with its old detail.
   - Text comes from three readers. In the app, `readTauriVaultTextFiles` (framed bytes since #3723). On the web, the folder's file handles. For the bundled samples, the inline JSON fields plus `loadStaticVaultHeadings`, with no derivation at all.
   - React uses `useDocumentDetail(doc)` and `useDocumentDetails(docs)`, in `src/features/document-detail/` and exported from `@/features/document-detail`: they join session state with the store, so they sit one layer above both entities. Both return `undefined` until the answer is known.
   - A surface that already holds the document's text, such as the open document, derives from that text and reads nothing.
5. **The index keeps no detail rows.** Reading one stored row and reading one file each cost one bridge call per batch, and deriving one file's detail takes about 0.1 ms. A detail namespace would double the row writes and gain nothing measurable. Falsifier: in the app at 50,000 documents, `useDocumentDetails` for five documents takes more than 50 ms at p95.
6. **Pending is not empty.** While detail is pending, a surface shows what it showed before detail existed; it never shows an empty value.
   - The outline rail and the word count appear when known, through the existing presence motion.
   - The project drawer's related-documents section appears once all of its rows have their detail.
   - The hover preview opens when its text arrives.
   - "Insert table of contents" waits for the detail before it decides that there are no headings.
7. **Search drops the excerpt tier.** Wherever the excerpt was matched or scored, the document's summary takes its place: its `description`, else its `definitionPreview`.
   - **In the app** the index is on by default (`vaultIndexPreference`) and matches the whole body through FTS5, which contains every word of the excerpt. While the index is on, the app finds everything it found before.
   - **On the web, and in the app with the index off,** a plain page is found by its title, display name, slug, tags and description, and no longer by its first paragraph.
   - `related-docs.ts` scores its `/project/` and name tiers on the summary.
   - `derive-projects-from-vault.ts` and `authored-description.ts` fall back to `definitionPreview`.
   - `wiki-retrieval.ts` falls back to the title, description, `definitionPreview` and tags.
   - The in-app agent's output does not change. Its `excerpt` body mode and its list `summary` run `buildExcerpt` over the text it already reads, for the rows it returns.
8. **The stored row.**
   - The namespace stays `app-entry/<hash>`. The value becomes `{ doc }`, holding the spine document only.
   - `ROW_PRODUCER_ENTRY` in `scripts/lib/row-producer.mjs` points to the new `md-entry.ts` (decision 9), so the hash covers exactly the code that writes and reads a row.
   - On the first launch after S8.3, every stored row has the old hash. The app derives every file once and prunes the old rows at the end of a complete walk (`createRowSource().finish`). Nothing is migrated, and the index stays rebuildable.
9. **The seam with L5.** S8.3 moves the per-document code out of `build-local-manifest.ts` into a new file, `src/entities/docs-vault/lib/local-manifest/md-entry.ts`. Moved: `buildMdEntry`, `storedMdEntry`, `mdEntryRowValue` (today written inline in `createRowSource().keep`), `internDoc`, `createMetadataStringPool`, `survivesJson`, `backlinkTargets` (today `backlinkContribution`), `frontmatterRefStrings`, `refResolver`, `slugTail` and `refersToTail`.
   - **S8 owns what one file becomes and what its row holds:** `md-entry.ts`.
   - **L5 owns where and when that runs:** `build-local-manifest.ts` (the walk, the reads, the row lookups, the aggregate and the partial publisher) and `worker/**`.
   - **The contract between them** is `buildMdEntry(entry, raw, lastModified, intern): BuiltVaultEntry`, whose signature S8 keeps, plus `storedMdEntry`, `mdEntryRowValue` and `backlinkTargets`.
   - **S8.3's only edits inside `build-local-manifest.ts`:** delete the moved functions, import them, and replace the backlink map in `aggregateBuild` (today lines 453, 494–501, 511–514 and 530) with a map from target to slugs.
   - L5 never edits `md-entry.ts`. S8 never edits the worker, the publisher or `tauri-vault-index-rows.ts`.
   - Splitting the 1,061-line file by responsibility is also what `.claude/rules/architecture.md` asks.
10. **The bundled samples keep their JSON.** One adapter, `bundledVaultManifest(json)` in `src/entities/docs-vault/lib/bundled-vault/bundled-manifest.ts`, converts a sample's `backlinksDetail` into `backlinkSources`. It runs at the four places that cast a sample to `VaultManifest`: `static-vault-source.ts:28,38`, `dogfood-manifest.ts:10` and `load-static-vault-source.ts:28,39`. The generated files under `src/entities/docs-vault/data/` and `public/docs-vault/` are not edited.
11. **The privacy copy stays true.** In Settings › Privacy · data, the caption `storedHere.switchCaption` in `messages/{en,ko,ja,zh}/settingsPrivacy.json` lists headings, excerpt, link text and link passages among what the index keeps. S8.3 removes them from that list in all four languages, in the same pull request that stops storing them. No other copy changes.

### Slices

A slice merges only once its acceptance is met. Every pull request states steady memory, peak memory and what the memory is made of (the strategy's rule), even when the slice does not change them.

| # | Slice and value | Owns | Reads | Acceptance | Implementer | Budget |
|---|---|---|---|---|---|---|
| S8.1 | **Detail on demand.** Every surface that shows a heading, excerpt or word count gets it from the store. The manifest still carries the fields, and they serve as the test oracle. The only visible change is that detail can arrive a moment after its surface. Complexity: reads are O(documents shown), batched at most 64 per call; the LRU is O(1) | New `src/entities/docs-vault/store/**` (`document-detail.ts`, `detail-cache.ts`, `document-store.ts`, tests); new `src/features/document-detail/**` (hooks, one text reader per source, tests); `src/entities/vault-session/index.ts` (`useGrantedVaultFiles` only); `src/views/docs-vault/ui/DocsVaultPage.tsx`; `src/views/docs-vault/model/{use-doc-outline,use-vault-manifest}.ts`; `src/views/docs-vault/ui/parts/DocMetaBar.tsx`; `src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx`; `src/widgets/project-drawer/ui/ProjectDrawer.tsx`; the headings hunk of `src/views/library/ui/library-page/use-library-reader.ts` (lines 105–115; this is S3's file, and whichever slice merges second rebases those lines); their tests | `parse-frontmatter.ts`; `count-whitespace-words.ts`; `tauri-vault-fs.ts`; `use-local-vault.ts` (not edited: S7 and L5 own it); `static-headings.ts`; `build-local-manifest.ts` | `pnpm exec vitest run src/entities/docs-vault/store src/features/document-detail src/views/docs-vault src/widgets/docs-quick-drawer src/widgets/project-drawer src/views/library/ui/library-page`, with three new gates: (1) for every document of the bundled dogfood sample and of a generated 2,000-document `key` folder, `deriveDocumentDetail` of its file equals the manifest's inline `{ headings, excerpt, wordCount }`; (2) a second `detail` at the same stamp reads 0 files, and one at a changed stamp reads 1; (3) `details` for 200 documents makes at most 4 read calls. `pnpm typecheck`. `pnpm ui:look` of the docs page (outline rail, word count) and the project drawer in dark mode, attached to the pull request | Opus: async state, caching and the pending rule (decision 6) | 1.5 d |
| S8.2 | **Search and fallbacks stop reading the excerpt** (decision 7). Complexity unchanged: one pass over the spine per query | `src/widgets/docs-vault/lib/search.ts`; `src/widgets/search-palette/ui/SearchPalette.tsx`; `src/views/library/ui/parts/index-column/LibrarySection.tsx`; `src/entities/docs-vault/lib/library/{vault-library,wiki-retrieval}.ts`; `src/entities/docs-vault/lib/doc-navigation/related-docs.ts`; `src/entities/docs-vault/lib/projects/derive-projects-from-vault.ts`; `src/views/project-selector/lib/authored-description.ts`; `src/widgets/vault-agent-panel/model/use-vault-agent.ts`; `src/features/vault-agent/model/agent-tools/{vault-read-port,tool-executor}.ts`; `src/views/architecture/ui/HarnessPage.tsx` (the type of `EMPTY_DOCS`); their tests; the search lines of `docs/features/cross-cutting/search-palettes.md` and `docs/features/library/ontology-tab-and-docs.md:70` | `derive-ontology-from-vault.ts`; `concept-evidence-pack.ts`; `use-vault-text-search.ts` | `pnpm exec vitest run src/widgets/docs-vault src/widgets/search-palette src/views/library/ui/parts/index-column src/entities/docs-vault/lib src/views/project-selector src/features/vault-agent src/widgets/vault-agent-panel`, with three new gates: (1) on the bundled sample, the agent's output in excerpt body mode and its list summaries equal their old output; (2) with an index hit, `searchDocs` still finds a page by a word that only its first paragraph holds; (3) none of the owned files reads `excerpt` from a `VaultDoc`. S8.3's typecheck then proves (3) for every file | Sonnet is safe here: every substitution is decided above, and existing tests pin each reader | 1 d |
| S8.3 | **The spine build.** This slice delivers S8's value. Expected figures: web steady at 50,000 goes from 250 MB to ≤ 120 MB; app WebView steady at 20,000 goes from 981 MB to ≤ 650 MB. Derive drops from about 234 µs to about 120 µs per document, because excerpt (19%), link passages (about 28%), word count (5%) and headings (4%) are no longer computed. App first open at 50,000 therefore goes from about 9 s to about 5 s, and web `key` 50,000 loaded from 14 s to about 8 s. The timings are the research's estimates; this slice measures them. Complexity: per file O(bytes), with one link scan where there were two passes; the aggregate stays O(D log D + links) | `src/entities/docs-vault/model/vault-manifest.ts`; `src/entities/docs-vault/index.ts`; new `src/entities/docs-vault/lib/local-manifest/md-entry.ts` and its tests, including the new perf-lane gate `md-entry.spine.perf.test.ts`; `build-local-manifest.ts` at the seam only (decision 9), and its existing tests; `apply-vault-changes.ts` and its tests; `src/entities/docs-vault/lib/bundled-vault/{bundled-manifest,static-vault-source,dogfood-manifest,load-static-vault-source}.ts`; `src/shared/lib/vault-document/parse-frontmatter.ts` (`extractOutLinkTargets` added; `extractOutLinksWithContext` and `LinkContext` removed); `scripts/lib/row-producer.mjs` and its test; `src/views/docs-vault/model/use-doc-write-actions.ts`; `src/views/home/model/authoring/use-topology-authoring.tsx`; `src/views/docs-vault/ui/DocsVaultDocumentPane.tsx`; `src/widgets/docs-vault/ui/DocsVaultBacklinks.tsx` and its test; `tests/contract/analysis/derive-relation-keys.contract.test.ts`; `tests/contract/map/neural-impact.contract.test.ts`; `storedHere.switchCaption` in `messages/{en,ko,ja,zh}/settingsPrivacy.json`; the rows paragraph of `docs/ARCHITECTURE.md` (about line 225) and the stored-here lines of `docs/features/cross-cutting/search-palettes.md` | `tauri-vault-index-rows.ts`; `derive-ontology-from-vault.ts`; S8.1's store; `scripts/perf/gen-scale-vault.mjs` | Checks: `pnpm typecheck`; `pnpm exec vitest run src/entities/docs-vault src/entities/vault-session src/views/docs-vault src/views/home/model/authoring src/widgets/docs-vault tests/contract/analysis/derive-relation-keys.contract.test.ts tests/contract/map/neural-impact.contract.test.ts`; `node --test scripts/lib/row-producer.test.mjs`; `pnpm perf:vault-open -- --files=50000 --shape=key --shape=all --check`. Gates in `pnpm test:perf`, each through `/gate-probe`: (1) on a generated 2,000-document `key` folder, no built document has `headings`, `excerpt`, `wordCount` or `linkContexts`, and the median serialized row is ≤ 600 B; (2) the rows of one 2,048-path lookup total ≤ 4 MiB. Equality tests, written before the old code is removed: `extractOutLinkTargets` equals the old `extractOutLinksWithContext(...).slugs` on the parser fixtures and on 1,000 generated bodies; `backlinkSources` equals the slugs of the old `backlinksDetail` on the existing backlink fixtures. On the owner's Mac, one installed-app run at a time: `pnpm perf:web-open -- --files=50000` meets `web-heap-steady` ≤ 120 MB and prints the composition; `pnpm perf:app-open -- --files=20000` meets `app-webview-steady` ≤ 650 MB; `pnpm perf:app-open -- --files=50000` reports `loaded-first-open` (target about 5 s) and steady memory at 50,000. The Windows path cases in CI stay green | Opus: the build, the rows, the incremental backlinks and the measurements | 2 d |
| S8.4 | **Conditional: cheaper spine passes.** Runs only if, after S8.3, `perf:app-open -- --files=50000` first open is still over 5 s, or `web-heap-steady` misses 120 MB because of transient strings. `meaningFindings` (32% of derive today) parses body sections once per document, and collapses whitespace in one loop instead of running `/\s+/g` over joined passages. Estimated gain: 1.5–2× on that share | `src/shared/lib/vault-document/meaning-findings.ts` and its tests | `mcp/src/meaning/meaning-findings.mjs` (not edited; its parity contract must stay green) | Finding codes byte-equal on the parser fixtures, on the bundled sample and on a generated 20,000-document `all` folder; `pnpm test:mcp:unit` and the meaning-findings parity contract green; the same perf commands as S8.3 | Opus, with an independent `reviewer`, because parsing is algorithmic code | 1 d |

Coverage: S8.3's acceptance holds the strategy's S8 memory figures, and its `pnpm test:perf` holds both S8 gates (no detail field with a median row ≤ 600 B, and ≤ 4 MiB per 2,048-path lookup).

Gaps:

- **App memory at 50,000 has no S8 target.** The strategy's ≤ 600 MB row there is not measured; S8.3 reports the figure and S11 is planned from it.
- **Windows memory** is not measured anywhere.
- **Real frontmatter can break the row gate.** The gate runs on generated frontmatter, so a real folder with large frontmatter can still exceed 4 MiB per lookup. Chunking by bytes would belong to `ROWS_LOOKUP_CHUNK`, which L5 owns.

### Order

- One slice at a time: S8.1, then S8.2, then S8.3, then S8.4 only if its condition holds. Each slice is its own draft, merged with `pnpm pr:land`. There is no integration branch.
- S8.1 and S8.2 share no file with each other, with S4 or with L5, so either can run while L5 is in flight. They run one after the other because of the owner's one-track rule, not because one depends on the other.
- S8.3 waits for S8.1, whose hook the docs pane and the table-of-contents action use, and for S8.2, because S8.3's typecheck removes the excerpt that search still reads until S8.2.
- S8.3 starts only when no L5 branch is open. It is best run before L5 starts: the worker's messages then carry spine documents from their first version, and L5's equality gate is written once, against the final document shape. If L5 lands first, S8.3 makes the same cut in the module the worker imports, and the seam stays where it is.
- S3 and S8.1 share only the headings hunk of `use-library-reader.ts`. Whichever merges second rebases those lines.

### Risk

What a reviewer must check that tests will not catch:

- **Pending shown as empty.** In the running app with a cold LRU, check four surfaces: the outline rail, the word count, the hover preview, and the project drawer's related documents. None may show an empty state that later fills in or jumps. "Insert table of contents" must never report "no headings" while detail is pending. Opening a local document must not flash the column title before its first heading arrives.
- **Search narrowing.** On the web, and in the app with the index off, a plain page is no longer found by a word that only its first paragraph holds. Confirm that the installed build has the index on by default, and that the Library's wiki list still finds a page by its body text through `indexedPaths`.
- **Retrieval weights.** Where a page's text is absent, `wiki-retrieval.ts` falls back to the title, description, definition preview and tags. Once S3 stops keeping page text, that applies to every page, so S3 should keep retrieval terms as a per-page fact.
- **First launch after the update.** Old rows carry another hash, so the app reads and derives every file once: about 5 s at 50,000. The release note must say so. Nothing is migrated.
- **Bundled parity.** The bundled samples still carry `excerpt`, `headings` and `wordCount` in their JSON and are read through the adapter. Check the `/docs` and gateway pages in a static build, where no local folder is open.
- **MCP and CLI parity** is untouched: both use their own parser copies and read none of the removed fields. The only change to `parse-frontmatter.ts` adds one function and removes one that no other file in `src/` calls. The three-way frontmatter parity contracts must stay green.
- **Privacy caption truth.** After S8.3, the caption in all four languages lists what the rows hold, and nothing more.

## What not to do

- **Do not rewrite the parser, graph or validation in Rust.** A reopen already skips parsing (3 s limit at 50,000), the measured costs are retained objects and main-thread passes, and a second parser would let the app, the web and MCP disagree. Reopen only if first open at 50,000 stays over 15 s after S4.
- **Do not give MCP a watcher, a persistent index or the app's index.** Record `2d359c0a` chose the stamp pass; 0.2 s per call is not felt in an agent turn; the index is opened only by the app.
- **Do not chase MCP RSS** with another allocator or restarts. The footprint, which the user pays, is gated; RSS counts freed pages.
- **Do not replace SQLite, add a vector extension or a graph database.** The limits are met.
- **Do not move the map to another renderer or to WebAssembly.** Pan is at 16.7 ms; the spikes are first-use index builds.
- **Do not cache documents in IndexedDB.** It holds the folder handle only (`.claude/rules/local-first.md`).
- **Do not gate wall-clock time in CI.** Shared runners vary several-fold.
- **Do not lower the walk ceiling or hide rows with CSS** to meet a budget.

## Risk

- A row can outlive its file version between a watcher event and a read: detail must fall back to the file whenever the stamp differs.
- Worker and main-thread builds must stay byte-equal, and worker layout must stay deterministic for the same seeds.
- The position hand-off and sliced first frames are motion: check frame by frame on a static build, since unit tests miss a snap.
- S9 and S10 put source words and hashes in the cache folder: the Settings caption must say so before either ships.
- New native commands are `async` on the blocking pool; a synchronous command runs on the main thread and a panic there aborts the app.
- Budgets marked n.m. are provisional until S1 measures them; S1 may revise this table once, with a dated revision.
- Installed-app runs from parallel sessions kill each other's app; `perf:app-open` runs one at a time.

## Revisions

- 2026-11-20: first version.
- 2026-11-20: S8 planned in detail on main `83ad538e6` (section "S8 plan"). S8 runs as three sequential slices, S8.1, S8.2 and S8.3, plus a conditional S8.4. Decision 2 now puts a concept's definition preview and the parser diagnostics in the spine: every concept's summary and every health pass read them. Decision 3 builds only `detail(doc)` and `details(docs)`. Link passages are no longer derived, because no surface shows them, and the index keeps no detail rows. The rows gate becomes a TypeScript size test, because the crate stores values as opaque bytes. The order now lets S8.1 and S8.2 run before S4. S8.3 meets L5 of the large-folders spec only at the new `md-entry.ts` seam.
- 2026-11-21: S8.1's hooks and readers moved from `src/entities/vault-session/model/document-store/` to `src/features/document-detail/`. In vault-session they read six more names from the sibling `docs-vault` entity, which the same-layer cross-import ratchet refuses; a feature imports both entities downward. `vault-session` exports only `useGrantedVaultFiles`.
- 2026-11-21: S8.3 keeps `definitionPreview` on every document, not only on those with `kind:` (S8 plan, decision 1): since S8.2, search, the Library's wiki rows and related documents read it as any page's summary. Measured on main `e33dfb597` before S8.3, app WebView steady at 20,000 was already 396 to 471 MB in three runs, not 981 MB, so the 20,000 row was met before the slice; at 50,000 S8.3 took app first open from 7.2 to 7.6 s down to 3.3 to 3.7 s and web steady from 243 to 102 MB, so S8.4's condition does not hold.
- 2026-11-21: S3 landed in part (#3737). The Library keeps per-page facts, not page text; it re-judges only changed pages through the shared mirror of `validateWikiFolder`, and a hash publish rebuilds only the rows it changes. Measured with `perf:app-open --shape=library --walk=library` (one run each side): at 50,000, peak 2,616 → 2,156 MB, loaded first open 230 → 144 s, reopen 210 → 76 s, longest frame gap 1,465 → 1,269 ms (319 → 267 gaps over 50 ms); at 20,000, steady 717 → 719 MB, peak 1,424 → 1,388 MB, longest gap 986 → 905 ms. The acceptance does not hold yet: (1) the remaining 50,000 gaps come with each hash publish rebuilding `buildLibraryGraph` (`src/widgets/library-graph/ui/LibraryGraph.tsx`), which moves to S6 and goes away when the Sources table (`docs/specs/2026-11-21-library-sources-redesign.md`, S-2/S-3) replaces that picture; (2) "Library adds ≤ 100 MB" waits for a `key`-shape run, because in the `library` shape the Library is open from the start; (3) rounds keep their scan's page texts while a pass runs, because `pass-pages.ts` needs them to detect a write conflict; (4) kept facts still total about 73% of page-text characters on the `library` shape (claims, summary, problem messages, hashes, term pointers), the next target. The text reader moved to `src/shared/lib/vault-folder/vault-text-reader.ts` and falls back to the file handle when the bridge cannot open a path, as the manifest builder does.
- 2026-11-21: S6 "Opening an island" lost its subject when the Library graph was removed
  (`docs/records/decisions/2026-11-21-library-sources-home-replaces-graph-ae902a78-d4ff-4e23-b6f9-9e34382bff9a.md`);
  the Library walk now times a Sources home row pick (`row-pick-first-frame`).
- 2026-11-22: the excerpt cites in the detail-consumer table now name the files the drawers were split into (`doc-list/DocRow.tsx`, `more-info/ProjectConnectionLists.tsx`); no plan changed.
- 2026-11-22: cites of `mcp/src/vault/` modules now name the subfolders the vault code was grouped into (`documents/`, `writes/`, `graph/`); no plan changed.
- 2026-11-22: the manifest type cite names `vault-manifest.ts`, renamed from `types.ts`; no plan changed.
