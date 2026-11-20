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
   - *Spine*: what lists, the graph and the map need for every document: slug, title, kind, relation references, tags, modified time, display labels, finding codes.
   - *Detail*: headings, excerpt, definition preview, link passages, diagnostics. Read by slug when a surface shows it.
   - *Text*: the file body. Held only for the open document and for files being derived.
3. **One store interface, `DocumentStore`, in `src/entities/docs-vault/store/`.** Methods: `detail(slug)`, `backlinks(slug, { offset, limit })`, `text(slug)`, and later `window({ scope, order, offset, limit })`. Detail comes from the stored row when one matches the file's stamp, else from deriving that one file. The web and an app with the index switched off never have a row, so they take the second path: same contract, no fork.
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
| No bridge reply exceeds 4 MiB; rows reply for 2,048 paths stays under a byte bound | Size (Rust test) | S8 |

Each new gate goes through `/gate-probe`. Footprint, heap, time to loaded, frame p95 and the longest task stay manual: `perf:app-open`, `perf:web-open`, `perf:mcp:scale --check`, `perf:vault-index --check` and `perf:vault-open --check` run on the owner's Mac for every performance pull request and before a release, and the pull request states steady memory, peak memory and composition.

## Slices

Slice 0, the Library restart-loop fix (`fix/library-page-text-restart-loop`), is in flight and not planned here. Owners are Opus implementers; days are budgets.

| # | Slice and value | Owns | Reads | Acceptance | One-way |
|---|---|---|---|---|---|
| S1 | **Harness and traces.** Every later number has a command; the two freezes get a named cause. 1.5 d | `scripts/perf/perf-app-open.mjs`, `scripts/perf/perf-web-open.mjs`, `scripts/perf/lib/**`, `scripts/perf/budgets.json`, `src/shared/lib/scheduling/**`, the `perf:app-open` and `perf:web-open` lines of `package.json`, their rows in `docs/DEVELOPMENT-CHECKS.md` | `scripts/perf/gen-scale-vault.mjs`, `scripts/verify-macos/**`, `tests/e2e/map/frame-work.ts` | Both commands print every budget row at 2,000, 20,000 and 50,000. The pull request carries a CPU profile of the `all` 50,000 open naming the five largest functions in each freeze, one for map first appearance and first hover, one for island open, and the `vmmap` regions at 2,000 | No |
| S2 | **Wiki judgement from per-page facts; `validate_wiki` bounded.** 5 s and 600 MB transient → 1.5 s and 150 MB first call, 0.3 s repeat. 2 d | `mcp/src/library/wiki-schema.mjs`, `src/shared/lib/library/wiki-page-schema.ts`, new `mcp/src/library/wiki-judgement.mjs`, the wiki functions of `mcp/src/tools/validate-vault.mjs`, `scripts/perf/perf-mcp-scale.mjs` | `mcp/src/vault/documents.mjs` | `pnpm perf:mcp:scale -- --files=50000 --tool=validate_wiki` meets the row; the equality test passes; `pnpm test:mcp:unit` green. Response shape unchanged | No |
| S3 | **The Library holds no folder text.** Crash at 50,000 → none; 20,000 peak 2.4 GB → Library adds ≤ 100 MB and returns to steady within 60 s. 3 d | `src/features/library/model/**`, `src/features/library-rounds/model/consistency-pass.ts`, `src/views/library/ui/library-page/{use-library-graph-cards,use-library-reader,use-library-turns}.ts`, `src/views/library/ui/LibraryPage.tsx`, `src/views/library/ui/parts/questions/LibraryQuestionDesk.tsx`, `src/views/library/lib/rounds/use-rounds-runner.ts`, `src/views/library/lib/questions/use-answer-history.ts` | S2's names; `tauri-vault-index-rows.ts`; `tauri-vault-fs.ts` | `pnpm perf:app-open -- --files=20000 --files=50000 --shape=library --walk=library` meets the Library row with no frame gap over 50 ms; the page-read call-count gate | No |
| S4 | **Opening a folder never freezes.** `all` 50,000: 44 s and 96 s → longest task ≤ 50 ms; loaded 171 s → ≤ 40 s; the reading line keeps moving. 4 d | `src/entities/docs-vault/lib/local-manifest/build-local-manifest.ts`, `src/entities/docs-vault/worker/**`, `src/entities/docs-vault/lib/derive-ontology-from-vault.ts`, `src/features/vault-ontology/model/**`, `src/shared/lib/vault-folder/tauri-vault-index-rows.ts` | S1's profile and `runSliced`; `apply-vault-changes.ts` | `pnpm perf:web-open -- --files=50000 --shape=all --shape=key` and `pnpm perf:app-open` with the same flags meet the longest-task and loaded rows; worker equality and yield gates | No |
| S5 | **The map appears and answers the first hover without a spike.** 450–590 ms → ≤ 50 ms at 20,000; frame p95 ≤ 16.7 ms at 50,000. 4 d | `src/widgets/ontology-map/flat-graph/**`, `src/widgets/ontology-map/model/layout/**`, `src/widgets/ontology-map/worker/**` | S1's profile; `src/widgets/library-graph/model/library-graph-quadtree.ts` | `--walk=map` of both scripts at 20,000 and 50,000 meets the frame rows; ratio gates; frame-by-frame capture of the position hand-off | No |
| S6 | **Opening an island.** 2.1 s → first frame ≤ 300 ms, no frame over 50 ms. 2 d | `src/widgets/library-graph/**` | S1's profile | `--walk=library` island row at 20,000; ratio gate | No |
| S7 | **Focus obeys the cost floor.** O(files) per focus → no walk in the app, floored on the web. 0.5 d | `src/entities/vault-session/model/local-vault/use-local-vault.ts`, `poll-cadence.ts` | `TauriVaultWatchBridge.tsx` | Call-count gate; `pnpm exec vitest run src/entities/vault-session` | No |
| S8 | **Detail leaves the page.** Web 50,000 steady 250 MB → ≤ 120 MB; app 20,000 steady 981 MB → ≤ 650 MB. 4 d | `src/entities/docs-vault/store/**`, `src/entities/docs-vault/model/types.ts`, `build-local-manifest.ts` (after S4 merges), the files that read `excerpt`, `headings`, `definitionPreview`, `backlinksDetail` or `linksOut` outside S3's and S5's lists | `tauri-vault-index-rows.ts` | `pnpm perf:web-open -- --files=50000` and `pnpm perf:app-open -- --files=20000` meet the figures and print composition; the no-detail gate | No: the producer hash versions the row value |
| S9 | **Source hashes are kept.** Re-hashing every launch → zero reads for unchanged sources; reopen with 50,000 sources ≤ 1 s. 3 d | `src-tauri/src/library.rs`, `src-tauri/crates/vault-index/src/{confine,rows}.rs` and a new `sources.rs`, their tests, `src-tauri/crates/vault-index/src/bin/vault-index-bench.rs`, `scripts/perf/perf-vault-index.mjs`, `tauri-vault-fs.ts` hash functions | `stamps.rs`, `lifecycle.rs` | `pnpm perf:vault-index -- --shape=library --check` with a reopen row; `cargo test -p vault-index`; Windows path cases in CI | **Yes**: the index admits `sources/**` stamps and SHA-256 |
| S10 | **Search covers every source.** 200 files and 20 MB per query → all sources, first hits ≤ 300 ms. 4 d | `src/views/library/lib/sources/**`, `src-tauri/crates/vault-index/sql/search.sql`, `search.rs`, `src-tauri/src/vault/index.rs`, the Settings caption keys in `messages/*/settingsPrivacy.json`; the bench and `perf-vault-index.mjs` pass from S9 | `src/shared/lib/library/source-passage.ts` | `pnpm perf:vault-index -- --shape=library --check` search row; e2e of a hit in a source past the old cap | **Yes**: the index holds words of non-Markdown sources |
| S11 | **Spine as columns, lists as windows.** Planned again from S8's composition; built only if S8 misses the 50,000 row | — | — | — | — |

Acceptance criteria, each covered above: (1) no crash and bounded Library memory, S3; (2) no task over 50 ms on open, S4; (3) no map spike, S5; (4) island open, S6; (5) bounded `validate_wiki`, S2; (6) memory rows, S8 then S11; (7) kept hashes and full source search, S9 and S10; (8) every budget measurable, S1; (9) gates, with their slices.

Gaps: the app's 2,000-document floor (586 MB) has a target and no slice until S1 prints its regions; meaning search is budgeted by its own spec; Windows memory and frames are not measured anywhere (`footprint` and `vmmap` are macOS tools), so Windows evidence is CI tests only.

## Order

- **Now, in parallel:** S1, S2, S7. They share no file.
- **After S1:** S4, S5, S6 in parallel. S3 also waits for S2, slice 0, `feat/wiki-check-keeps-running` and `design/library-sources-header`, which edit its files.
- **After S4:** S8, which takes over `build-local-manifest.ts`.
- **After the search-by-meaning branches merge** (they edit the crate, `src-tauri/src/lib.rs` and `package.json`): S9, then S10 behind one decision record.
- Each slice is its own draft merged with `pnpm pr:land`; no integration branch. S5 and S6 each need an independent `reviewer` (algorithmic code).

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
