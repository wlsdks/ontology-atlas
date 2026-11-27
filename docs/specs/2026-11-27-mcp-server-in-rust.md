---
title: The MCP server moves to Rust
doc_type: spec
status: draft
area: mcp
date: 2026-11-27
decisions: [6c76a2d9-e080-4b3a-97cc-dd8e2780a7de, 2318a03a-a902-41b7-802d-b2cb5f16595d]
---

# The MCP server moves to Rust

**One-minute summary.** The program an agent talks to (`ontology-atlas-mcp`) is written in
JavaScript today and shipped as a 62 MB file that carries a whole JavaScript engine. It will be
built again in Rust, the language the desktop app already uses, the way Rust programs are written:
the JavaScript tells us what each tool must do, never how the code is arranged. An agent and its
person keep the same 33 tools, the same tool descriptions and inputs, the same answer shapes and
the same files written. Where Rust gives a better answer (a real parser's imports, a cut that never
splits an emoji) the difference is written down by name before it is allowed; any other difference
fails. A machine that asks both programs the same questions proves it. Every piece is built and
checked in one integration branch, which reaches `main` in a single merge that also deletes the
JavaScript server, Bun and its licence notice. Three things change for people: lists get one sort
order whoever starts the server, a source checkout must build the program once before the usual
command works, and the server-only download carries a program instead of scripts.

Words used here. **Differential harness**: the machine that sends one request to both servers and
compares. **Family**: tools built and proven together. **Declared behaviour change**: a named,
reviewed difference in one answer field, the only difference the harness lets through. **Twin**:
the same rule written a second time in another language. **The merge**: the one merge of
`integration/mcp-rust-2026-11-27` into `main`, after which the bundled server is the Rust one.

## Person and moment

Someone who already uses coding agents starts a session; the agent spawns the server, reads its
instructions and tool list, then reads and writes the vault. They never look at the server. No
capture exists of a person waiting on it or hurt by its size; what is observed is the owner's
decisions of 2026-11-27 (translated): "Move the MCP server to Rust. Even if it is big, it is
better to do it cleanly and anew"; "since everything moves to Rust, do not follow the existing
logic, structure it to suit Rust"; "good, well-known libraries that are doing well as of November
2026 may be adopted"; on keeping answers equal, "you have to judge that yourself, that is what
making it best and new means; trying to follow the old one makes it hard"; and "check and inspect
everything at once and switch straight away". Also the owner's standing demand that memory use be
reported and kept low, and the figures under Today. Criterion 1 turns those figures into a kept
command.

## Today

Measured 2026-11-27 on Apple Silicon (load average 7, so times are noisy; medians of 5 to 7 runs).
Memory is the most the process held (resident) and its peak footprint, the figure Activity Monitor
shows. A throwaway probe under `/usr/bin/time -l` took them; criterion 1 makes it a kept command.

| What | Node source server | Shipped Bun binary |
|---|---|---|
| Program size | none | 65,246,384 bytes, beside the app's own 45,400,576 in the installed bundle |
| Start to `tools/list` answered, `samples/storefront` | 212 ms; 95.0 MB; 60.3 MB | 132 ms; 51.6 MB; 28.9 MB |
| `tools/list` response | 76,282 bytes | 76,282 bytes |
| `validate_vault`, `docs/ontology` (98 files), call only | 4,232 ms; 317 MB; 293 MB | 3,972 ms; 343 MB; 258 MB |
| 5,000 generated documents, first `list_concepts` | not measured | 423 ms; 136 MB; 105 MB |
| 5,000 generated documents, `validate_vault` | 842 ms; 212 MB; 178 MB | 629 ms; 167 MB; 125 MB |

The lead measured the same start at 187 ms and 52 MB. Heap at peak, from the collector's own
records on the Node server: `validate_vault` on `docs/ontology` 151.6 MB used of 216.5 MB (new
space 64.0, old space 75.2, large objects 6.7, code 2.7); 5,000 documents 90.6 MB; start 35.3 MB.
A profile of that `validate_vault` call: of 5,315 ms sampled, 1,931 ms (36%) waits on `git`
children, 982 ms reads files, 361 ms is `lstat`.

- Size of the code: `mcp/src` holds 275 source files (67,503 lines) and 156 test files (68,028
  lines). 14 test files (30,068 lines) start the server or its verifier as a child process
  (`scripts/lib/mcp-test-rpc.mjs:27`), among them `integration.test.mjs` (10,767) and
  `verify-script.test.mjs` (10,888). The other 142 import modules, so they cannot be run against
  another program.
- One tool reaches far beyond its own folder. Functions executed by one call on `docs/ontology`
  (V8 coverage): start alone 72 in 27 files, 11 of them in `git/`; `list_concepts` 229 in 43
  files, 33 in `meaning/`; `validate_vault` 827 in 89 files (`analyze/` 200, `construction/` 155,
  `infer-imports/` 67, `git/` 60); `add_concepts` 929 in 118 files (`analyze/` 199,
  `construction/` 138, `ontology-engine/` 111, `infer-imports/` 67). The writers import the
  survey and build-depth code (`mcp/src/tools/writes/write-concepts.mjs:28-30`), `git_snapshot`
  runs the vault validation (`mcp/src/tools/git.mjs:40`), and start spawns `git`
  (`mcp/src/server/runtime.mjs:36`).
- Code is understood by line scanners, not parsers: six import scanners
  (`mcp/src/infer-imports/languages/`, 3,566 lines with their tests; Kotlin rides the Java one,
  `java-imports.mjs:1-16`) and the outline, which says of itself "a line scanner, not a parser, so
  a missed declaration is not evidence of absence" (`mcp/src/evidence-search/source-outline.mjs:1-7`).
- Sort order: the integration branch already pins `'en'` in every `localeCompare` and fails a test
  on any call that names no locale (commits `64b18a3db6`, `eded9c8e88`); `main` does not yet.
- It moves fast: 245 commits touched `mcp/src` in the last 30 days (49,465 lines added, 24,714
  deleted); `server/` 89, `tools/` 75, `construction/` 71, `analyze/` 55, `parser.mjs` 3.
- The surface: 33 tools, 19 read and 14 write (`docs/.generated/mcp-surface.json`); seven retired
  names still answer (`mcp/src/server/registry.mjs:180-188`); answers are shaped by `ok` and
  `error` (`mcp/src/server/rpc.mjs:22-66`), and an `errorCode` can be derived from the error's
  English text (`mcp/src/server/rpc.mjs:249-255`); five protocol versions are negotiated
  (`mcp/README.md:72-75`); seven environment variables are read (`OATLAS_VAULT`,
  `OATLAS_REPO_ROOT`, `OATLAS_READ_ONLY`, `OATLAS_TOOL_PROFILE`, `OATLAS_WRITE_CONSENT`,
  `OATLAS_CONFINED_SOURCE_READS`, `OATLAS_SOURCE_SNAPSHOT_FD`); a bad vault root prints two lines
  and exits 1 (`mcp/src/server/runtime.mjs:68-77`).
- Dependencies: `@modelcontextprotocol/server` 2.4.0 and `markdown-it` 15.0.3
  (`mcp/package.json:327-328`; `mcp/README.md:65` still says 2.3.0). Frontmatter is read by a
  hand-written parser, not a YAML library (`mcp/src/parser.mjs:1-9`). Git is the person's own
  `git`, spawned with hardening (`mcp/src/git/hardened-git.mjs:1-5`). Confinement of source reads
  and the read snapshot are ambient, carried by `AsyncLocalStorage`
  (`mcp/src/infer-imports/confinement/confined-source-fs.mjs:6`,
  `mcp/src/vault/documents/document-cache.mjs:583`).
- The Rust shell on the integration branch (merged as `53bd2775a3`) answers the protocol from a
  reader thread and workers (`src-tauri/crates/mcp-server/src/session.rs:1-9`), but copies
  JavaScript's structure in three places this revision replaces: its own JSON value type with
  `serde_json` refused (`src-tauri/crates/mcp-server/src/json.rs:1-7`, an object of a sorted map,
  a list and a hash index, `json/value.rs:97-104`); an `errorCode` chosen by matching the
  message's English text (`envelope/failure_details.rs:313-337`); and JavaScript text rules kept
  inside the server crate (`js_text.rs:10-49`). Its program is named `ontology-atlas-mcp-rust`
  until the merge (`src-tauri/crates/mcp-server/Cargo.toml:13-18`).
- Already in `src-tauri/Cargo.lock`: `serde_json` 1.0.150, `indexmap` 2.14.0, `ryu-js` 1.0.4,
  `rayon` 1.12.0, `walkdir` 2.5.0, `dunce` 1.0.5, `thiserror` 2.0.18, `strsim` 0.11.1, `tracing`
  0.1.44, `regex` 1.12.3, `fancy-regex`, `icu_normalizer` 2.2.0. Absent: `icu_collator`,
  `tree-sitter`, `pulldown-cmark`, `insta`, `proptest`, `saphyr`. The app's `vault-index` crate
  keeps a full-text index of a vault's Markdown in SQLite FTS5
  (`src-tauri/crates/vault-index/Cargo.toml:4,10-12`); it indexes no source code.
- Licence: Bun statically links JavaScriptCore, WebKit and TinyCC under LGPL-2.1, which obliges a
  relink path (`NOTICE.md:57-84`).
- Twins in the app's Rust: `src-tauri/src/git/evidence/text.rs`, `git/document.rs`,
  `vault/temporary_files/names.rs` and `project_source/mod.rs` each name the `mcp/src` file they
  mirror, and `mcp/src/git/hardened-git.mjs:4-5` names `git/runner.rs`; `vault/walk.rs` and the
  evidence rule are held equal by `tests/contract/vault-format/vault-walk-rules.contract.test.ts`
  and `tests/contract/analysis/evidence-drift-parity.contract.test.ts:36-39`.
- Twins in the screens: `src/` imports 10 `mcp/src` modules (15 files, 3,724 lines with what they
  import), and 26 TypeScript modules (9,006 lines) rewrite server rules, held equal by 54 of the
  254 files under `tests/contract/`.
- Other importers: 12 files under `scripts/` reach 211 `mcp/src` files; 20 files under
  `mcp/scripts/` import it; 43 test files under `tests/` do; `cli/` imports none.
- Four artifacts carry the server: the app bundle (`src-tauri/tauri.conf.json:45-46`), a source
  checkout (`.claude/rules/surfaces.md:213-218`), and the `.mcpb` bundle and container image,
  which run the scripts on Node (`NOTICE.md:19-28`, `mcp/Dockerfile:40`).

## Patterns that already worked

- **Ship only the whole.** fish moved from C++ to Rust inside its working tree for two years while
  releasing C++ builds; its first Rust release held no C++ at all
  ([retrospective](https://fishshell.com/blog/rustport/)). How it fails: fish "mostly kept the
  structure of the C++ code intact", and says its Rust is in places "a straight translation" that
  idiomatic Rust would make shorter. Atlas borrows the mechanism of releasing only when nothing of
  the old program is left, and departs on structure, as the owner asked.
- **Name each intended difference.** Ruff's formatter publishes "Known Deviations from Black": each
  intended difference is a named section with Black's and Ruff's output for one input
  ([page](https://docs.astral.sh/ruff/formatter/black/)). How it fails: the list grows until
  "compatible" means little. Atlas borrows a list whose every entry carries tool, field, before,
  after and reason, checked by the harness at the exact request and path.
- **Publish the difference as a number.** Biome keeps Prettier's own output as snapshots and
  reports compatibility as a percentage
  ([above 96%](https://biomejs.dev/blog/biome-wins-prettier-challenge)). How it fails: an accepted
  list of differences grows. Atlas borrows the comparison and a cap on the declared list
  (Falsifier: 30 entries).
- **The old program as oracle, not template.** TypeScript's compiler moved to Go
  ([announcement](https://devblogs.microsoft.com/typescript/typescript-native-port/)) and is
  reported to be checked against the old compiler's tests (assumption: not read in full). How it
  fails: order-dependent results differ once work runs in parallel. Atlas borrows: one fixed order
  for every list, sorted after any parallel step.

New in Atlas's combination: the product is the files on disk, so after every write the two vault
folders are compared byte for byte, and no declared change may touch them.

## Problem and alternatives

The pains, ranked by what the person gets back: (1) LGPL code inside a file Atlas ships; (2) every
agent session holds its own server (51.6 MB at start, 343 MB at peak); (3) the server is 59% of
the bundle's two programs; (4) rules written two and three times; (5) answers from line scanners
where a parser would know; (6) start time, which nobody perceives. One change answers all six. On
(4) the work removes only the small duplication, five Rust twins; the large one (9,006 lines of
screen twins) becomes removable and is a later track.

| Way | Gives | Costs | Verdict |
|---|---|---|---|
| Keep the Bun binary | nothing to build | all six pains stay | lost |
| Keep JavaScript, change the packer | may drop LGPL (unverified) | size, memory, twins, scanners stay | lost |
| Rust, function for function, byte-equal | pains 1 to 4 | JavaScript's structure in Rust; every scanner quirk reproduced; the owner rejected it | lost |
| Rust built in its own idiom, same contract, declared changes | all six | the harness must tell declared from silent differences | chosen |
| Rust with a new tool surface | freedom | breaks every saved prompt and agent skill | lost |

### The contract that stays

Tool names, descriptions, input and output schemas, annotations and order; the `initialize`
instructions, whose first 2,048 characters are the construction card; the negotiated protocol
versions; answer shapes (`ok`, `error`, `content`, `structuredContent` and their fields); the set
of `errorCode` values and repair fields; the seven retired names and their note; the seven
variables and their accepted values; newline-delimited JSON over stdio; the stderr lines; what
each write puts on disk (file bytes, frontmatter key order, atomic replacement, `expected_mtime`,
dry run, `confirm`, `overwrite`, `force`, the consent question) and the lines in
`.ontology-atlas/activity.jsonl` and `map-analysis.jsonl`.

### Declared behaviour changes

An answer may differ from the JavaScript server's only as an entry here, mirrored with its request
ids in the harness manifest (`declaredChanges`) and summarised in the merge's change record. An
entry names the tool, the field's JSON path, before, after and why. The harness treats it as an
expected difference only at its request ids and paths; a difference elsewhere fails, and so does an
entry whose difference no longer appears. Never declarable: bytes written to the vault, audit
lines, the tool surface, and the set of `errorCode` values, so the rollback stays true and two
servers can share one vault during an upgrade.

| # | Tool, field | Before (JavaScript) | After (Rust) | Why |
|---|---|---|---|---|
| 1 | every limited text field | a cut through an emoji emits half of it | the cut falls before it | half a character is not text |
| 2 | `infer_imports` edges; outlines in `read_source` and `find_evidence` | line scanners per language | `tree-sitter` parse for TS/JS, Python, Go, Java, Kotlin, Rust, C; other languages keep a Rust scanner with today's rules | a parser sees multi-line imports and nested declarations a scanner misses |

Slices add rows only with a corpus case for each; the lead reviews each row in the slice's pull
request.

### What equal means

- **Compared**: per request id, each `content[]` item's `text` byte for byte, `structuredContent`
  with its keys in emitted order, and `isError`, minus the declared entries. After a write, the two
  vault folders file by file, side files included, with nothing excepted.
- **Nothing is masked.** Both servers take a fixed clock and a seeded UID stream from a test-only
  switch: a cargo feature the release build lacks, and on the JavaScript side a preload the harness
  passes with `--import`. The stream's contract for the Rust side (call order, values, which calls
  draw from it) is the README of the `differential` folder the harness slice adds under
  `scripts/mcp` (not yet on the integration branch). They run one after the other on one absolute
  path restored from one snapshot, so paths are equal too.
- **File times.** Corpus vaults carry planted modification times: whole, fractional and exactly
  half a millisecond, because an agent sends `mtime` back as `expected_mtime` and the guard
  compares numbers (`mcp/src/vault/writes/atomic-writes.mjs:57-61`). The time the system gives a
  file written during a run is the one value not compared across servers: each run must report the
  file's own time, and a following call must be accepted with it.
- **Both JavaScript runtimes.** The corpus runs against Node and against the shipped Bun binary.
  Where those two already differ, slice 0 lists the case and the Bun binary is the reference.
- **Named fields.** While something a family calls is not built, its answers compare "equal except
  these named fields", listed per family in the manifest. Bytes written to disk are never on it.
  The list may only shrink and is empty at the merge. It is not the declared list: named fields are
  unfinished work; declared changes are kept.
- **Reach.** A family is proven when the corpus runs at least 95% of the JavaScript functions and
  85% of the blocks its tools execute (V8 block coverage), and the corpus plus the crates' own
  tests run at least 85% of the family crates' regions under `cargo llvm-cov`, so code the
  JavaScript never had (a parser's paths) is reached too. Each function never run is named in the
  manifest with its reason.

### Protocol behaviour

Slice 0 records each case from both runtimes; the Rust shell must answer the same. Expectations
marked "review" were reported by the reviewer and are unverified here.

| Case | Must equal |
|---|---|
| A request before `initialize` | recorded answer |
| `initialize` with each of the five versions, a newer one, an unknown one | negotiated version |
| A line that is not JSON, a batch array, `id` null, `id` 1.5 | no response (review) |
| Unknown method; wrong parameter types | error -32601; -32602, same shape (review) |
| `notifications/cancelled` during a tool call | recorded answer |
| A read call while a consent question is open | answered without waiting for it |
| Standard input closes while a consent question is open | the write is refused; nothing on disk |
| Standard output closed by the client | the server exits; no panic text, no partial file |
| A handler fails unexpectedly | one `tool_error` answer; the session continues |
| Arguments nested thousands deep; a lone surrogate escape in a string or an `id` | recorded answer; never a crash |

`serde_json` refuses nesting past 128 and lone surrogates where JavaScript accepts both; the shell
slice either keeps JavaScript's answer or adds a declared row, and says which.

### One Rust implementation

**How it is built (lead, 2026-11-27).** Each family is designed as Rust: states are types, errors
are enums, collections are walked with iterators, and what JavaScript carries ambiently (the
confinement, the read snapshot, the clock) is a value passed in and owned. The JavaScript is read
for what a tool must answer, never for how its modules are cut. A reviewer who finds a Rust module
that mirrors a JavaScript file's functions one to one asks why.

Eight crates join `crates/vault-index` in the workspace at `src-tauri/Cargo.toml:9-20`. All but
`mcp-server` depend on neither `tauri` nor an async runtime, so the app links them; all inherit the
workspace lints against `unwrap`, indexing and `panic` (`src-tauri/Cargo.toml:22-27`).

| Crate | Owns | App twin it replaces |
|---|---|---|
| `answer-format` | text agents read as JavaScript wrote it: UTF-16 length and cuts, number text, the `'en'` order, an object's key order (integer-like keys first) | none; takes `js_text.rs` and the key order out of `mcp-server` |
| `confined-files` | the one type that opens, walks, reads and writes files under a vault or source root; slug and root paths, credential and hidden names, snapshot limits | `src-tauri/src/confined_files.rs` may fold in (not read closely) |
| `hardened-git` | the one table and runner for spawning `git` | the hardening table of `git/runner.rs` |
| `vault-document` | frontmatter, schema, documents, writes, side files, validation, Markdown tree, library, wiki | `vault/walk.rs`, `git/document.rs` kinds, `vault/temporary_files/names.rs` |
| `ontology-graph` | compiler, engine, queries, agent brief | none |
| `source-scan` | files under a source root: languages, imports, outlines, declarations, evidence search, staleness | rule parts of `git/evidence/` |
| `repository-survey` | survey, meaning findings, construction depth, project source | the inventory bound of `project_source/mod.rs` |
| `mcp-server`, the `ontology-atlas-mcp` program | protocol loop, registry, schemas, instructions, envelope, consent, write log, tool handlers | none |

`source-evidence` splits because its two halves change for different reasons and have different
weights: scanning carries the parser grammars, the survey carries the heaviest code the writers
call (`write-concepts.mjs:28-30`); split, the survey slices build without recompiling grammars and
the program's size is measurable per half. `repository-survey` depends on `source-scan`, never the
reverse. No family crate calls `std::fs` or `std::process` directly: a check in the merge lanes
fails on either name outside `confined-files` and `hardened-git`.

**Choices (lead, 2026-11-27; versions and licences read from crates.io that day).** Each new
dependency is explained in its pull request and passes `pnpm licenses:check` (allow-list:
`docs/engineering/third-party-code.md`).

- **Protocol**: the hand-written stdio loop stays, in one `protocol` module. `rmcp` 3.12.0
  (Apache-2.0) always needs `tokio`, lacks Atlas's `2024-10-07` version, and MCP 2026-07-28
  replaces `initialize` and elicitation; `rmcp` is re-evaluated when Atlas adopts that revision.
- **Concurrency**: threads, and `rayon` for per-file work; no `tokio`. Every list is sorted after a
  parallel step, so ties never depend on scheduling.
- **JSON**: `serde_json` with typed `#[derive(Serialize)]` answers, whose field order is the key
  order; `indexmap` for keyed maps, through `answer-format` where JavaScript's integer-key rule
  applies; `preserve_order` enabled nowhere (Cargo would switch it on for the app's maps too);
  `ryu-js` for number text; `tools/list` sent as a verbatim `RawValue` of the generated surface.
  The branch's own value type is deleted.
- **Errors**: one `thiserror` enum per `errorCode`; the code comes from the variant, never from
  message text.
- **Frontmatter**: Atlas's own parser, written as Rust, because YAML crates accept files the vault
  refuses (`serde_yaml` is deprecated; `serde_yml` is unsound, RUSTSEC-2025-0068). `saphyr` 0.4.1
  (MIT or Apache-2.0) is a `proptest` oracle only: where both accept a file, they agree.
- **Markdown**: `pulldown-cmark` 0.13.6 (MIT) with source offsets, replacing `markdown-it`.
- **Code understanding**: `tree-sitter` 0.27.2 with MIT grammars: TypeScript 0.23.2, JavaScript
  0.25.0, Python 0.25.0, Go 0.25.0, Java 0.23.5, `tree-sitter-kotlin-ng` 1.1.0, Rust 0.24.2, C
  0.24.2 (all MIT on crates.io). The import and outline slice measures each grammar's share of the
  program with `cargo bloat` and drops a grammar whose size the program-size gate cannot carry.
- **Search**: `find_evidence` reuses `vault-index` for the vault-Markdown part of its question if
  the corpus shows equal or declared answers; source code keeps a hand index in `source-scan`,
  since `vault-index` indexes none. Fuzzy suggestions use `strsim`.
- **Patterns**: `regex`, linear time; `fancy-regex` only where look-around is needed. Each pattern
  restates JavaScript's meaning of `\s`, `\w`, `\b`, `.`, `^`, `$` and case folding under `i`.
- **Order and Unicode**: `icu_collator` pinned to the ICU 2.2 line the workspace links
  (`icu_normalizer` 2.2.0), or every ICU crate moves together; `icu_normalizer` for NFC, NFKC and
  NFKD.
- **Git**: keep spawning the person's `git` through `hardened-git`, so their hooks and ignore rules
  apply; `gix` may later serve read-only hot paths.
- **Files**: `walkdir`; writes by `create_new`, `sync_all`, then `rename`, keeping the app's
  temporary-file names; `dunce` for Windows paths.
- **Graph**: ordered adjacency by hand, so ties are deterministic.
- **Hashing and archives**: `sha2` and `miniz_oxide`, both already linked.
- **Diagnostics and tests**: `tracing` with no subscriber in the release build; `insta`
  snapshots, `proptest`, run by `cargo-nextest`.

Every tool name, description, schema and the instructions text has one authored source, the
JavaScript registry, until the merge; the Rust server embeds a generated copy under
`src-tauri/crates/mcp-server/surface/`, and `pnpm mcp:surface:check` is red when the registry
changed and the copy did not. The copy becomes the authored source in the same merge.

### What the web and the app's screens use

Assumed, as relayed by the lead on 2026-11-27 and specified elsewhere: the browser workbench is
removed, and the web keeps the gateway, download page, guide and a read-only sample map built from
data prepared at build time. So there is no WebAssembly build and no browser copy of any rule.

- The sample map's data comes from the built Rust server at build time; today its generator
  imports `mcp/src` (`scripts/docs-vault/generator/vault-scan.mjs:126-127`).
- The app's screens keep their TypeScript rules for now. The 15 files they import from `mcp/src`
  move under `src/` unchanged before the JavaScript is deleted. Those 3,724 lines and the 9,006
  lines of twins become deletable once the screens ask Rust through Tauri commands: a later track.
- Until then each surviving twin is held to the Rust crate by one shared case table that both
  sides run, the pattern of `tests/fixtures/document-dating-cases.json`.

### How people get the server

- **App bundle**: same name, same place, no arguments, so a client config written before the
  update keeps working. macOS signs and notarizes it as a nested binary as today; the ad-hoc
  re-sign Bun needs (`scripts/packaging/build-mcp-binary.mjs:103-114`) goes away. The Windows
  installer stays unsigned as today (`docs/features/download.md:26`).
- **Source checkout: the command stays, a build step is new.** `node <checkout>/mcp/src/index.js`
  remains the command, for good: checkouts follow `main`, not releases. That file becomes a small
  launcher that starts the program `pnpm mcp:build-binary` built, so the 84 files that name the
  command stay true and `inspectMcpServerLaunch`
  (`src/shared/config/mcp/mcp-server-launch.ts:57`) is untouched. The prerequisite, a Rust
  toolchain and one build, is stated in `.claude/rules/surfaces.md`, `mcp/README.md`,
  `cli/README.md`, `docs/TROUBLESHOOTING.md`, `docs/guide/connect-agent.md` and its translations.
  - A stale build never answers. The built program records the commit of the server crates it
    came from; the launcher refuses a program older than the checkout (Copy).
  - A wrong toolchain is named. Cargo without `rustup` ignores `rust-toolchain.toml`; the crates
    declare the lowest Rust they build with, and the build names the version that built it.
- **`.mcpb` bundle and image**: carry the compiled program for macOS arm64, Windows x64 and Linux
  x64 and arm64, so a host without Node can run them. The macOS program is signed and notarized; a
  bare program cannot carry the ticket, so its first start on a clean Mac with no network is
  walked before the merge, as are a clean Windows host and the image on both Linux architectures.
  Whether one `.mcpb` may hold several platforms is unknown; the packaging slice probes it first.
- Still no npm package, and no crates.io publication without the owner asking. Windows is executed
  only in CI.

## Flow

1. When a person installs the first release cut after the merge over an older one, Atlas replaces
   the bundled server in place; every agent config already written starts the new server unedited.
2. When an agent starts a session, Atlas answers `initialize` and `tools/list` with the same bytes
   as before.
3. When an agent calls a tool, Atlas returns the same text and structure except the declared
   changes, which the release's change record lists, and a write leaves the same bytes on disk and
   the same audit line.
4. When an agent is wrong (unknown tool or argument, a stale `expected_mtime`, a write under
   `OATLAS_READ_ONLY`, a path that leaves the vault), Atlas returns the same `errorCode`, message
   and repair fields, and writes nothing.
5. When evidence is missing (no `git`, a cited file gone, a source folder not connected, a file the
   grammar cannot parse), Atlas reports the same `unknown` or `missing` state and never a guess.
6. When a person with a source checkout pulls and their agent runs the usual command, Atlas starts
   the built program if it matches the checkout, or says what to run and exits 1.

## States

| State | Web | macOS app |
|---|---|---|
| Empty | Out of scope — the public site starts no server | A folder with no nodes still answers the full tool list; unchanged |
| Loading | Out of scope — same reason | The first start may wait on macOS's signature scan, up to the 25 s limit (`src-tauri/src/agent_setup.rs:27`); unchanged |
| Error | Out of scope — same reason | Bundled server missing: `docsVault.agentSetup.serverMissingReason`; the person reinstalls. Other check strings were not read |
| Partial | Out of scope — same reason | Never shipped: `main` holds the JavaScript server before the merge and only the Rust one after |
| Largest measured vault | Out of scope — same reason | 50,000 files, the scale `pnpm perf:mcp:scale -- --check` gates |

## Copy

None in `messages/` — no on-screen string changes. `messages/en/agentConnect.json:54-57` name a
source checkout for the browser's manual panel, which the workbench removal owns. The launcher at
`mcp/src/index.js` prints to stderr and exits 1, when the program is not built:

```
[ontology-atlas-mcp] The MCP server is now a compiled program, and this checkout has not built it.
[ontology-atlas-mcp] Run `pnpm mcp:build-binary` in the checkout, then restart your agent.
[ontology-atlas-mcp] Your agent config is unchanged and will work after the build.
```

When the built program is older than the checkout:

```
[ontology-atlas-mcp] The built MCP server is older than this checkout, so it was not started.
[ontology-atlas-mcp] Run `pnpm mcp:build-binary` in the checkout, then restart your agent.
```

`pnpm mcp:build-binary` prints, when the toolchain is not the pinned one:

```
Built with Rust {found}. Atlas is tested with Rust {pinned}; install it with rustup to build the tested program.
```

## Edge cases

- **Zero, one, largest**: an empty folder, one node, 50,000 files.
- **First run**: a missing vault root prints the two existing lines and exits 1.
- **Hangul**: slugs, titles and bodies in Hangul, decomposed (NFD) names from macOS, and the one
  `'en'` order among Hangul, Latin and emoji titles on Node, on Bun and in Rust; the generated
  vaults are one third Korean.
- **Character counts**: limits count UTF-16 units as today; cuts follow declared change 1.
- **Numbers**: rounding ties in `toFixed` and `Math.round`, doubles with long fractions, whole
  doubles, integer-like object keys (JavaScript lists them first) and a `__proto__` key.
- **Patterns**: case folding under `i`, `^` and `$` across lines, `split` and `replace` with
  groups, patterns built at run time, U+00A0 and U+3000 beside word boundaries.
- **Error text**: every message that `rpc.mjs:249-255` turns into an `errorCode` maps to the same
  code from its enum variant.
- **Parsing source**: a file with a syntax error (the parse keeps what it can and says so), a file
  in a language with no grammar, a minified line, a file over the snapshot limit.
- **Bytes**: CRLF, a byte-order mark, invalid UTF-8, the Markdown shapes `markdown-tree.mjs`
  handles specially.
- **Moved, renamed or unreadable folder**; a symlink leaving the vault; a file over 1 MiB.
- **Two edits at once**: two server processes on one vault, one JavaScript and one Rust; a file
  changed between read and `patch_concept`; a process killed during a batch write.
- **Offline**: the server opens no connection; Git runs with fetching disabled.
- **Windows**: drive letters, backslashes, `\\?\` long paths, `.exe`.

## Out of scope

- A new or renamed tool, argument or response field: the contract stays.
- A changed answer outside the declared list, and any declared change to bytes on disk.
- The app's screens calling Rust, and deleting the TypeScript twins: Later.
- Removing the browser workbench: its own spec.
- An HTTP transport: it needs its own security review (`mcp/README.md:115-117`).
- `gix` for Git reads, and MCP 2026-07-28: Later.
- A Linux desktop app, an npm package, a crates.io publication.

## Acceptance criteria

Nine, one more than the template allows, because the review asked for a separate security
criterion.

1. **Baseline kept.** Given `main` before any Rust, when `pnpm perf:mcp:baseline` runs, then it
   prints every row of the Today table for the Node server and the Bun binary with peak resident
   memory, peak footprint and heap by space, and exits 1 if a row is missing. Check: its output in
   the harness pull request and its row in `docs/DEVELOPMENT-CHECKS.md`.
2. **The harness can fail.** Given a server that differs from the JavaScript one by one character
   of a tool description, one `errorCode`, the order of two `structuredContent` keys, the order of
   two frontmatter keys in a written file, a difference at a request id its declared entry does not
   name, or a declared entry whose difference no longer appears, when `pnpm mcp:differential`
   runs, then it exits 1 and names the request id and the first differing byte. Check:
   `tests/differential/harness-detects-planted-difference.test.mjs`, one case per planted kind.
3. **The corpus reaches the code.** Given the family manifest, when `pnpm mcp:differential --
   --coverage` replays the corpus, then it exits 1 if a family about to be called proven runs
   under 95% of its JavaScript functions or 85% of its blocks, if its crates run under 85% of
   their regions, if an unrun function has no reason, or if a named-field list grew. Check: that
   command in the merge lanes; planted by deleting one corpus case.
4. **The shell is equal.** Given the Rust shell rebuilt on typed answers, when the harness compares
   every row of the Protocol behaviour table, `tools/list` under each value of `OATLAS_READ_ONLY`
   and `OATLAS_TOOL_PROFILE`, an unknown tool, an unknown argument and a missing vault root, then
   every answer is equal or a declared row. Check: `pnpm mcp:differential -- --family=shell` and
   `pnpm docs:surface:check` against the Rust program.
5. **Each family is equal or declared before it counts.** Given a family's slice, when the harness
   replays its corpus against Node, the Bun binary and Rust, then it exits 1 on the first
   difference outside named fields and declared rows, on any difference between the written
   folders, or when the family's child-process tests run a different number of tests against Rust
   than against JavaScript. Check: `pnpm mcp:differential -- --family=<name>`.
6. **Recovery.** Given a file changed after the agent read it, when `patch_concept` arrives with
   the old `expected_mtime`, then the Rust server refuses with the JavaScript server's `errorCode`
   and the file's bytes are unchanged; given a server killed during `add_concepts`, no partial
   file remains; given a checkout whose program is missing or stale, the launcher prints the lines
   under Copy and exits 1, and after `pnpm mcp:build-binary` the same command lists 33 tools.
   Check: the write family's corpus and `mcp/src/index.test.mjs`.
7. **No worse, measured.** Given the integration branch before the merge, when
   `pnpm perf:mcp:baseline` measures the Rust program and the Bun binary in the same run (median of
   7) and `pnpm perf:mcp:scale -- --check` runs, then the command exits 1 if any Rust figure in the
   table below is larger than the Bun binary's, and reports peak footprint, peak resident memory
   and live heap bytes by owner (document cache, compiled graph, source text, Git output,
   response). Check: both outputs in the merge's pull request.
8. **One merge, clean.** Given the integration branch with every family proven, when the merge's
   pull request is opened, then: an app built from that branch and installed over the previous
   release lets an agent with an untouched config list 33 tools, read a concept and write one;
   `codesign --verify --deep --strict` passes; `windows-beta-check.yml` boots
   `ontology-atlas-mcp.exe` and runs the harness green; the `.mcpb` and image start on clean hosts;
   the corpus answers recorded from the JavaScript before its deletion are goldens the Rust server
   matches, declared rows aside; and in the same branch `NOTICE.md` has no LGPL section for the
   server, no workflow installs Bun, and nothing outside the launcher imports `mcp/src`. Check: an
   installed-app walk, the clean-host walks, the Windows job, `pnpm notice:check`,
   `pnpm mcp:differential -- --goldens`.
9. **Safety first.** Given the Rust server before any reading or writing family is built, when the
   corpus sends planted hostile inputs, then each is refused exactly as the JavaScript server
   refuses it and nothing outside the vault is read or written: a slug with `..`, a null byte, an
   absolute path or a symlink out of the root (`mcp/src/vault/documents/slug-paths.mjs:61-126` and
   `:257-266`); a scan root outside the vault and repository
   (`mcp/src/server/runtime.mjs:85-105`); credential and hidden names
   (`mcp/src/evidence-search/credential-names.mjs`); the snapshot's size caps and descriptor limit
   (`mcp/src/infer-imports/confinement/confined-source-fs.mjs`); a repository whose config would
   run code (`mcp/src/git/hardened-git.mjs`); a write under read-only mode
   (`mcp/src/index.js:126-130`); a write with consent on and no way to ask
   (`mcp/src/server/write-consent.mjs:110-179`); a stale or raced write
   (`mcp/src/vault/writes/atomic-writes.mjs:57-161`); and each audit line
   (`mcp/src/server/write-log.mjs:91-115`). No safety refusal is declarable. Check:
   `pnpm mcp:differential -- --family=safety`, and the `std::fs` check, planted red once.

| Figure | Today (Bun binary) | Gate | Goal |
|---|---|---|---|
| Program size, macOS arm64 | 62.2 MiB | not larger | 10 MiB without grammars, 20 MiB with |
| Start to `tools/list` answered | 132 ms; 51.6 MB resident | not worse | 50 ms; 15 MB |
| `validate_vault` on `docs/ontology` | 3,972 ms; 343 MB | not worse | 2,500 ms; 100 MB |
| 5,000 documents, first `list_concepts` | 423 ms; 136 MB | not worse | 150 ms; 60 MB |
| 5,000 documents, `validate_vault` | 629 ms; 167 MB | not worse | 250 ms; 60 MB |
| 50,000 files: second call, after 20 calls, peak | within 600 ms, 185 MB, 470 MB | the existing limits | 300 ms, 92 MB, 235 MB |

The gate compares against the Bun binary measured in the same run, not against these numbers.
36% of today's `validate_vault` call waits on Git, which spawning the person's `git` keeps. No
unit test asserts a wall-clock number.

## Risks

1. **A difference nobody declared reaches an agent** (a number's text, `\s` in a pattern, an
   order a parallel step changed), most likely where a redesigned module behaves differently in
   cases only the 142 module tests exercise. Answer: both reach floors, the corpus classes under
   Edge cases, three programs compared, folders compared byte for byte, and a declared entry
   checked only at its own request ids.
2. **The one merge never arrives, or arrives as a big bang** (245 commits in 30 days on `main`).
   Answer: `origin/main` is merged into the integration branch at least weekly; every slice is
   green on the harness and on `pnpm checks:changed -- --run --slice` before it joins; a proven
   family's behaviour is frozen on `main` until the merge except a fix carried in both languages.
   Stop rule: `pnpm mcp:differential -- --drift --days=14` replays the corpus against JavaScript
   as it was 14 days ago and now; when more answers changed in proven families than were newly
   proven in those 14 days, stop and re-plan with the owner.
3. **The parser grammars cost more than they give.** Seven grammars can make the program larger
   than the Bun binary, and parse answers can differ in ways nobody reviews. Answer: the import and
   outline slice reports `cargo bloat` per grammar first; the program-size gate is checked in that
   slice, not only at the merge; each grammar enters declared change 2 only with corpus cases in
   which its answer is at least as complete as the scanner's.

Rollback. Before the merge nothing has shipped. After it, reverting the merge commit restores the
JavaScript server and Bun at the same path; configs and vault files need nothing, because no
declared change touches the bytes a write leaves. This stays a true rollback only until the first
surface change made in Rust alone.

## Later

The first five rows are on the integration branch or under way; slice 0's manifest resizes the
rest, sizing each slice by the functions its tools execute. At most four slices are in flight;
every slice merges into `integration/mcp-rust-2026-11-27` with `git merge --no-ff`, never into
`main`.

| # | Slice | Needs |
|---|---|---|
| 0a | One sort order: `'en'` pinned in JavaScript (merged into the integration branch) | none |
| 0 | Baseline, harness, corpus, family manifest with `declaredChanges`, drift command | 0a |
| 1 | Shell (merged as `53bd2775a3`): protocol table, registry, generated surface, variables | 0 |
| 1b | Shell in Rust idiom: `answer-format` crate; typed `serde_json` answers, `RawValue` tool list; `thiserror` codes; own JSON type deleted | 1 |
| 2 | Safety (criterion 9): `confined-files` with `walkdir` and `dunce`, `hardened-git`, read-only, consent, atomic writes, audit lines | 1b |
| 3 | Vault documents and plain reads: own frontmatter parser with the `saphyr` oracle, `pulldown-cmark`; six read tools | 2 |
| 4 | Graph: `compile_ontology`, `query_ontology` | 3 |
| 5 | Git reads and staleness: `git_status`, `git_history`; app evidence twin replaced | 3; parallel with 4 |
| 6 | Source scan: `tree-sitter` imports and outlines, `infer_imports`, `inspect_architecture`; `cargo bloat` per grammar | 5 |
| 7 | Evidence search and agent brief: `find_evidence`, `read_source`, the `vault-index` probe, `strsim` | 4, 6 |
| 8 | Repository survey with `rayon`: `analyze_repo_structure` | 6, 7 |
| 9 | Meaning findings and construction depth; completes `validate_vault` | 5, 8 |
| 10 | Vault writes and `git_snapshot`: the nine writers | 4, 9 |
| 11 | Library, wiki and project source: seven tools | 10 |
| 12 | Nothing imports `mcp/src`: scripts, tests and screen modules moved; goldens recorded from JavaScript | 11 |
| 13 | Packaging: bundle, `.mcpb`, image, launcher; clean-host and installed-app walks | 11; criterion 7 |
| 14 | Deletion in the same branch: JavaScript except the launcher, Bun, the LGPL notice; then the one merge to `main` | 12, 13; criteria 1 to 9 |

Slice 10 may start after slice 4 under named fields if the manifest shows that the bytes a write
puts on disk depend only on built functions.

After the merge: the app's screens ask Rust through Tauri commands and the twins go, next when the
workbench removal has merged; the app calls the crates in-process where it spawns the bundled
server today (the gray-area reader); `gix` for Git read hot paths, next when a profile shows Git
reads above a third of a call again; MCP 2026-07-28 and `rmcp`, next when Atlas adopts that
revision.

## Owner question

None — the owner delegated the open points and the lead decided them on 2026-11-27.

1. One sort order for everyone, pinned to `'en'` in JavaScript first. Reverse by choosing another
   fixed locale in one place.
2. A proven family's behaviour is frozen on `main` until the merge, except fixes carried in both
   languages in one pull request. Reverse by lifting the freeze for one named family.
3. The integration branch merges when every family is equal or declared and no figure is worse
   than the Bun binary's; the goals are not gates. Reverse by promoting a goal to a gate.
4. Declared changes never touch bytes on disk, audit lines, the surface or the set of error codes.
   Reverse with a new decision that also states the rollback.
5. `source-evidence` splits into `source-scan` and `repository-survey`; the eighth crate is
   `answer-format`. Reverse by merging the crates before the merge, when nothing outside depends
   on the names.

## Revisions

- 2026-11-27: first draft.
- 2026-11-27: the browser workbench is being removed (owner decision relayed by the lead), so the
  web section drops WebAssembly and any browser copy, and names the screen twins as a later track.
- 2026-11-27: revised after an independent review ("prove first"). The lead decided the three
  open points (one `'en'` sort order first, behaviour freeze, ship when equal and no worse).
  Equality is now compared unmasked with an injected clock and UID source, against Node and the
  Bun binary, with reach measured in functions and blocks; a safety criterion comes before any
  family; the slice order is provisional until slice 0's manifest; the source command stays and
  gains a build step; a protocol table, corpus classes and a rollback statement were added.
- 2026-11-27: the owner asked for a Rust design rather than a translation, allowed current
  well-known libraries, left equality to the lead's judgment and asked for one switch with no soak
  period (decision 2318a03a, narrowing 6c76a2d9). The function-for-function port becomes idiomatic
  Rust with the JavaScript as behaviour reference; byte equality becomes "equal or declared", with
  a Declared behaviour changes section and harness check; the crate choices and an eighth crate
  (`answer-format`, plus `source-evidence` split in two) replace the branch's own JSON type and
  text-derived error codes; the beta and staged release are removed and all slices reach `main` in
  one merge that also deletes the JavaScript, Bun and the LGPL notice; the clock and UID stream
  contract points to the harness slice's README; the decision record draft is removed now that
  both records exist.
