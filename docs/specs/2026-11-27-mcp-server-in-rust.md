---
title: The MCP server moves to Rust
doc_type: spec
status: draft
area: mcp
date: 2026-11-27
decisions: []
---

# The MCP server moves to Rust

**One-minute summary.** The program an agent talks to (`ontology-atlas-mcp`) is written in
JavaScript today and shipped as a 62 MB file that carries a whole JavaScript engine. It will be
written again in Rust, the language the desktop app already uses, so the rules live in one place.
An agent and its person must notice nothing: same 33 tools, same words, same answers, same files
written. That is proven by a machine that asks both programs the same questions and compares the
answers. The JavaScript program keeps shipping until the Rust one passes everything; then it is
deleted. Two things do change for people and are named below: a source checkout runs a program
you build instead of `node <checkout>/mcp/src/index.js`, and the server-only download carries a
program instead of scripts.

Words used here. **Differential harness**: the machine that sends one request to both servers and
compares. **Family**: tools ported and proven together. **Twin**: the same rule written a second
time in another language. **Cut-over**: the release whose bundled server is the Rust one.

## Person and moment

Someone who already uses coding agents starts a session; the agent spawns the server, reads its
instructions and tool list, then reads and writes the vault. They never look at the server. No
capture exists of a person waiting on it or hurt by its size; what is observed is the owner's
decision (2026-11-27, translated: "Move the MCP server to Rust. Even if it is big, it is better to
do it cleanly and anew"), the owner's standing demand that memory use be reported and kept low,
and the figures under Today. Criterion 1 turns those figures into a kept command.

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
- It moves fast: 245 commits touched `mcp/src` in the last 30 days (49,465 lines added, 24,714
  deleted); `server/` 89, `tools/` 75, `construction/` 71, `analyze/` 55, `parser.mjs` 3.
- The surface: 33 tools, 19 read and 14 write (`docs/.generated/mcp-surface.json`); seven retired
  names still answer (`mcp/src/server/registry.mjs:180-188`); answers are shaped by `ok` and
  `error` (`mcp/src/server/rpc.mjs:22-66`); five protocol versions are negotiated
  (`mcp/README.md:72-75`); seven environment variables are read (`OATLAS_VAULT`,
  `OATLAS_REPO_ROOT`, `OATLAS_READ_ONLY`, `OATLAS_TOOL_PROFILE`, `OATLAS_WRITE_CONSENT`,
  `OATLAS_CONFINED_SOURCE_READS`, `OATLAS_SOURCE_SNAPSHOT_FD`); a bad vault root prints two lines
  and exits 1 (`mcp/src/server/runtime.mjs:68-77`).
- Dependencies: `@modelcontextprotocol/server` 2.4.0 and `markdown-it` 15.0.3
  (`mcp/package.json:327-328`). Frontmatter is read by a hand-written parser, not a YAML library
  (`mcp/src/parser.mjs:1-9`). Git is the person's own `git`, spawned with hardening
  (`mcp/src/git/hardened-git.mjs:1-5`).
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
- Other importers: 12 files under `scripts/` reach 211 `mcp/src` files; 43 test files under
  `tests/` import it; `cli/` imports none.
- Four artifacts carry the server: the app bundle (`src-tauri/tauri.conf.json:45-46`), a source
  checkout (`.claude/rules/surfaces.md:213-218`), and the `.mcpb` bundle and container image,
  which run the scripts on Node (`NOTICE.md:19-28`, `mcp/Dockerfile:40`).

## Patterns that already worked

- **Port, do not redesign.** TypeScript's compiler moved to Go as a port, not a rewrite
  ([announcement](https://devblogs.microsoft.com/typescript/typescript-native-port/)), and is
  reported to be checked against the old compiler on its existing tests (assumption: the report
  was not read in full). Why it worked: the old program is the specification. How it fails:
  order-dependent results differ once work runs in parallel. Atlas borrows: old program as
  oracle; one fixed order for every list.
- **Replace piece by piece, keep shipping.** fish moved from C++ to Rust component by component
  and released throughout, preferring fidelity to idiom
  ([retrospective](https://fishshell.com/blog/rustport/)). How it fails: two languages are
  maintained for the whole period (two years there). Atlas borrows: family-by-family proof, and a
  beta before the stable release.
- **Publish the difference as a number.** Biome keeps Prettier's own output as snapshots and
  reports compatibility as a percentage
  ([above 96%](https://biomejs.dev/blog/biome-wins-prettier-challenge)). How it fails: an accepted
  list of differences grows. Atlas borrows: the comparison; its list of declared differences starts
  with one entry (Edge cases) and grows only by a dated line under Revisions.
- **Same commands, new engine** (uv for pip, Ruff for flake8). Assumption, not verified here.

New in Atlas's combination: the product is the files on disk, so after every write the two vault
folders are compared byte for byte, not only the two answers.

## Problem and alternatives

The pains, ranked by what the person gets back: (1) LGPL code inside a file Atlas ships; (2) every
agent session holds its own server (51.6 MB at start, 343 MB at peak); (3) the server is 59% of
the bundle's two programs; (4) rules written two and three times; (5) start time, which nobody
perceives. One change answers all five, so the ranking decides what gates the cut-over: parity
first, then licence and memory. On (4) the port removes only the small duplication, five Rust
twins; the large one (9,006 lines of screen twins) becomes removable and is a later track.

| Way | Gives | Costs | Verdict |
|---|---|---|---|
| Keep the Bun binary | nothing to build | all five pains stay | lost |
| Keep JavaScript, change the packer | may drop LGPL (unverified) | size, memory and twins stay | lost |
| Rust port, same surface, proven by comparison | all five | two languages until cut-over | chosen |
| Rust rewrite with a new tool surface | freedom | breaks every saved prompt and agent skill | lost |

"Cleanly and anew" is honoured in structure, not in the surface an agent sees.

### What must not change

Tool names, descriptions, input and output schemas, annotations and order; the `initialize`
instructions, whose first 2,048 characters are the construction card; the negotiated protocol
versions; every result's `content` text and `structuredContent`; every `errorCode`, error message
and repair field; the seven retired names and their note; the seven variables and their accepted
values; newline-delimited JSON over stdio; the stderr lines; what each write puts on disk (file
bytes, frontmatter key order, atomic replacement, `expected_mtime`, dry run, `confirm`,
`overwrite`, `force`, the consent question) and the lines in `.ontology-atlas/activity.jsonl` and
`map-analysis.jsonl`.

Equal means: after masking only wall-clock timestamps, newly minted UIDs and the temporary
folder's prefix, `initialize`, `tools/list` and every `tools/call` result are byte-equal, and after
a write the two vault copies are byte-identical. Malformed protocol messages compare by JSON-RPC
error code; their text belongs to the JavaScript SDK. Numbers print as JavaScript prints them,
because an agent sends `mtime` back as `expected_mtime`.

### One Rust implementation

Four crates join `crates/vault-index` in the workspace at `src-tauri/Cargo.toml:10`; the first
three depend on neither `tauri` nor an async runtime, so the app links them.

| Crate | Owns (ported `mcp/src` lines) | App twin it replaces |
|---|---|---|
| `vault-document` | frontmatter, schema, documents, writes, side files, validation, Markdown tree, library, wiki (10,700) | `vault/walk.rs`, `git/document.rs` kinds, `vault/temporary_files/names.rs` |
| `ontology-graph` | compiler, engine, queries, agent brief (10,100) | none |
| `source-evidence` | hardened Git, staleness, evidence search, imports, survey, meaning, construction, project source (31,200) | rule parts of `git/evidence/`, the hardening table of `git/runner.rs`, the inventory bound of `project_source/mod.rs` |
| `mcp-server`, the `ontology-atlas-mcp` program | protocol loop, registry, schemas, instructions, envelope, consent, write log, tool handlers (15,600) | none |

Choices, each a dependency to explain in its pull request and to pass `pnpm licenses:check`
(allow-list: `docs/engineering/third-party-code.md`; licences read from crates.io on 2026-11-27):

- **Protocol: a hand-written stdio loop, not the official `rmcp` SDK** (3.12.0, Apache-2.0,
  allowed). Atlas uses `initialize`, `ping`, `tools/list`, `tools/call`, cancellation and one
  `elicitation/create`, and keeps its own version list on purpose (`mcp/README.md:72-75`); `rmcp`
  reached its third major version in 20 months and brings an async runtime. Reverse by adopting
  `rmcp` behind the same module when Atlas needs a second transport.
- **JSON**: `serde_json` with insertion order kept (`indexmap`), both already in `Cargo.lock`;
  `ryu-js` (Apache-2.0 option) for number text.
- **Frontmatter**: a port of the hand-written parser. A YAML crate would accept files the vault
  format refuses.
- **Markdown**: `pulldown-cmark` (MIT) with source offsets, replacing `markdown-it`; both follow
  CommonMark and the harness proves the tree.
- **Patterns**: `regex` (MIT or Apache-2.0, in `Cargo.lock`), linear time; `fancy-regex` (MIT, in
  `Cargo.lock`) only for the 37 look-around and one back-reference pattern lines. Each port
  restates JavaScript's meaning of `\s`, `\w`, `\b` and `.`.
- **Order**: the 132 comparator-less sorts keep UTF-16 code unit order; the 167 `localeCompare`
  sites use `icu_collator` (Unicode-3.0, allowed) unless the schema proves their input ASCII.
- **Git**: keep spawning the person's `git` under the one hardening table. A library would not run
  the person's pre-commit hook on `git_snapshot` or honour their ignore rules.
- **Hashing and archives**: `sha2` and `miniz_oxide`, both already linked.

During the port every tool name, description, schema and the instructions text has one authored
source: the JavaScript registry, from which the Rust server's copy is generated. The authored
source flips to the Rust side in the deletion slice.

### What the web and the app's screens use

Assumed, as relayed by the lead on 2026-11-27 and specified elsewhere: the browser workbench is
removed, and the web keeps the gateway, download page, guide and a read-only sample map built from
data prepared at build time. So there is no WebAssembly build and no browser copy of any rule.

- The sample map's data comes from the built Rust server at build time; today its generator
  imports `mcp/src` (`scripts/docs-vault/generator/vault-scan.mjs:126-127`).
- The app's screens keep their TypeScript rules for now. The 15 files they import from `mcp/src`
  move under `src/` unchanged before the JavaScript is deleted. Those 3,724 lines and the 9,006
  lines of twins (`parse-frontmatter`, `validate-vault-document`, `meaning-findings`,
  `wiki-page-schema`, `wiki-folder`, `derive-ontology-from-vault`, `vault-health`,
  `architecture-profile`, the in-app agent's tool handlers and 17 smaller modules) become
  deletable once the screens ask Rust through Tauri commands. That is a later track.
- Until then each surviving twin is held to the Rust crate by one shared case table that both
  sides run, the pattern of `tests/fixtures/document-dating-cases.json`.

### How people get the server

This changes the public contract of `.claude/rules/surfaces.md`, "Two distribution channels only".

- **App bundle**: same name, same place, no arguments, so a client config written before the
  update keeps working. macOS signs and notarizes it as a nested binary as today; the ad-hoc
  re-sign Bun needs (`scripts/packaging/build-mcp-binary.mjs:103-114`) goes away. The Windows
  installer stays unsigned as today (`docs/features/download.md:26`).
- **Source checkout**: `pnpm mcp:build-binary` runs `cargo build` with the toolchain in
  `rust-toolchain.toml`; the config command is the built program's absolute path with no
  arguments, the shape `inspectMcpServerLaunch` already accepts
  (`src/shared/config/mcp/mcp-server-launch.ts:53-59`). `node <checkout>/mcp/src/index.js` stops
  being a channel. For one stable release that file remains as a small launcher (Copy).
- **`.mcpb` bundle and image**: carry the compiled program for macOS arm64, Windows x64 and Linux
  x64 and arm64, so a host without Node can run them. Whether one `.mcpb` may hold several
  platforms is unknown; that slice probes it first.
- Still no npm package, and no crates.io publication without the owner asking.
- Targets: macOS arm64 and Windows x64 as today, Linux for the bundle and image. Windows is
  executed only in CI.

## Flow

1. When a person installs the cut-over release over an older one, Atlas replaces the bundled
   server in place; every agent config already written starts the new server unedited.
2. When an agent starts a session, Atlas answers `initialize` and `tools/list` with the same bytes
   as before.
3. When an agent calls a tool, Atlas returns the same text and structure, and a write leaves the
   same bytes on disk and the same audit line.
4. When an agent is wrong (unknown tool or argument, a stale `expected_mtime`, a write under
   `OATLAS_READ_ONLY`), Atlas returns the same `errorCode`, message and repair fields, and writes
   nothing.
5. When evidence is missing (no `git`, a cited file gone, a source folder not connected), Atlas
   reports the same `unknown` or `missing` state and never a guess.
6. When a person with a source checkout pulls the deletion and their agent runs the old command,
   Atlas starts the built server, or says what to run and exits 1.

## States

| State | Web | macOS app |
|---|---|---|
| Empty | Out of scope — the public site starts no server | A folder with no nodes still answers the full tool list; unchanged |
| Loading | Out of scope — same reason | The first start may wait on macOS's signature scan, up to the 25 s limit (`src-tauri/src/agent_setup.rs:27`); unchanged |
| Error | Out of scope — same reason | Bundled server missing: `docsVault.agentSetup.serverMissingReason`; the person reinstalls. Other check strings were not read |
| Partial | Out of scope — same reason | Never shipped: the bundled server is wholly JavaScript before the cut-over and wholly Rust after |
| Largest measured vault | Out of scope — same reason | 50,000 files, the scale `pnpm perf:mcp:scale -- --check` gates |

## Copy

None in `messages/` — no on-screen string changes. `messages/en/agentConnect.json:54-57` name a
source checkout for the browser's manual panel, which the workbench removal owns. The launcher at
`mcp/src/index.js` prints to stderr, when the program is not built:

```
[ontology-atlas-mcp] The MCP server is now a compiled program, and this checkout has not built it.
[ontology-atlas-mcp] Run `pnpm mcp:build-binary` in the checkout, then restart your agent.
[ontology-atlas-mcp] Your agent config is unchanged and will work after the build.
```

## Edge cases

- **Zero, one, largest**: an empty folder, one node, 50,000 files.
- **First run**: a missing vault root prints the two existing lines and exits 1.
- **Hangul**: slugs, titles and bodies in Hangul, decomposed (NFD) names from macOS, and sort
  order among Hangul, Latin and emoji titles; the generated vaults are one third Korean.
- **Character counts**: limits count UTF-16 units as today. Declared difference 1: where
  JavaScript cuts through an emoji and emits half of it, Rust cuts before it.
- **Bytes**: CRLF, a byte-order mark, invalid UTF-8, U+00A0 and U+3000 beside word boundaries.
- **Moved, renamed or unreadable folder**; a symlink leaving the vault; a file over 1 MiB.
- **Two edits at once**: two server processes on one vault; a file changed between read and
  `patch_concept`; a process killed during a batch write.
- **A request during an open consent question**: today's order is unknown; the corpus records it.
- **Offline**: the server opens no connection; Git runs with fetching disabled.
- **Windows**: drive letters, backslashes, `.exe`.

## Out of scope

- A new or changed tool, argument or response field: the surface is the fixed point.
- The app's screens calling Rust, and deleting the TypeScript twins: Later.
- Removing the browser workbench: its own spec.
- An HTTP transport: it needs its own security review (`mcp/README.md:115-117`).
- Replacing `git` with a library, or batching Git calls differently: behaviour first.
- A Linux desktop app, an npm package, a crates.io publication.

## Acceptance criteria

1. **Baseline kept.** Given `main` before any Rust, when `pnpm perf:mcp:baseline` runs, then it
   prints every row of the Today table for both servers with peak resident memory, peak footprint
   and heap by space. Check: the command's output in the first pull request and its row in
   `docs/DEVELOPMENT-CHECKS.md`.
2. **The harness can fail.** Given a server that differs from the JavaScript one by one character
   of a tool description, one `errorCode`, or the order of two frontmatter keys in a written file,
   when `pnpm mcp:differential` runs, then it exits 1 and names the request and the first
   differing byte. Check: `tests/differential/harness-detects-planted-difference.test.mjs`.
3. **The corpus reaches the code.** Given the corpus (every request the 14 child-process test
   files send, inputs lifted from the 142 module tests where coverage is short,
   `samples/storefront`, `docs/ontology`, the 5,000 and 50,000 document vaults and the planted
   Edge-case vaults), when it replays against the JavaScript server under V8 coverage, then each
   family's report lists every function not executed, and a family is not called proven below 90%
   of its lines. Check: the report `pnpm mcp:differential -- --coverage` writes.
4. **The shell is equal.** Given the Rust server before any tool is ported, when the harness
   compares `initialize` for each of the five protocol versions, `tools/list` under each value of
   `OATLAS_READ_ONLY` and `OATLAS_TOOL_PROFILE`, an unknown tool, an unknown argument and a
   missing vault root, then every answer is equal as defined above. Check: `pnpm mcp:differential
   -- --family=shell` and `pnpm docs:surface:check` run against the Rust program.
5. **Each family is equal before it counts.** Given a family's slice, when the harness replays its
   corpus on two copies of each vault, then answers are equal and the folders are byte-identical,
   and the child-process test files for that family pass against the Rust program with the same
   number of tests executed as against JavaScript. Check: `pnpm mcp:differential -- --family=<name>`.
6. **Recovery.** Given a file changed after the agent read it, when `patch_concept` arrives with
   the old `expected_mtime`, then the Rust server refuses with the JavaScript server's `errorCode`
   and the file's bytes are unchanged; given a server killed during `add_concepts`, no partial
   file remains; given the old source command after the deletion, the launcher starts the built
   server or prints the three lines above and exits 1. Check: the write family's corpus and
   `mcp/src/launcher.test.mjs`.
7. **Faster and smaller, measured.** Given the Rust program before the cut-over, when criterion
   1's command and `pnpm perf:mcp:scale -- --check` run, then every target below holds and the
   report gives peak footprint, peak resident memory and live heap bytes by owner (document cache,
   compiled graph, source text, Git output, response). Check: both outputs in the cut-over pull
   request.
8. **Cut-over and deletion are clean.** Given the cut-over beta installed over the previous
   release, when an agent with an untouched config connects, then it lists 33 tools and reads a
   concept; `codesign --verify --deep --strict` passes; `windows-beta-check.yml` boots
   `ontology-atlas-mcp.exe` and runs the harness; after deletion `NOTICE.md` has no LGPL section
   for the server, no workflow installs Bun, and nothing outside `mcp/` imports `mcp/src`. Check:
   an installed-app walk, the Windows job, `pnpm notice:check`, and
   `tests/contract/release/npm-channel-retired.contract.test.ts` updated to the new channel.

| Target, gating the cut-over | Today (Bun binary) | Rust |
|---|---|---|
| Program size, macOS arm64 | 62.2 MiB | at most 10 MiB |
| Start to `tools/list` answered | 132 ms; 51.6 MB resident | at most 50 ms; 15 MB |
| `validate_vault` on `docs/ontology` | 3,972 ms; 343 MB | at most 2,500 ms; 100 MB |
| 5,000 documents, first `list_concepts` | 423 ms; 136 MB | at most 150 ms; 60 MB |
| 5,000 documents, `validate_vault` | 629 ms; 167 MB | at most 250 ms; 60 MB |
| 50,000 files: second call, after 20 calls, peak | limits 600 ms, 185 MB, 470 MB | at most 300 ms, 92 MB, 235 MB |

The `validate_vault` time target is modest because 36% of today's call waits on Git, which a
like-for-like port keeps. These bounds are checked by the measuring commands, never by a unit test
asserting a wall-clock number.

## Risks

1. **A difference nobody asked about reaches an agent** (sort order of Hangul titles, `\s` in a
   pattern, a number's text), most likely in behaviour only the 142 module tests exercise.
   Answer: criterion 3's coverage floor, the planted Edge-case vaults, and folders compared byte
   for byte.
2. **The port never catches the moving target** (245 commits in 30 days). Answer: one authored
   source for the surface; families that change most are ported last; from the day a family is
   proven, a pull request changing its JavaScript changes its Rust, and the harness in the merge
   checks is red otherwise. Falsifier: in any 14 days, more lines change in proven JavaScript
   families than are ported; then stop and re-plan with the owner.
3. **The gain is smaller than promised**, because Git dominates the slow call, or the harness lane
   makes merge checks slow on free runners. Answer: criterion 7 gates the cut-over, so a missed
   target ships nothing; the harness lane is measured in the first slice, and above five minutes
   with a warm cache it moves to the nightly run with only the changed family before merge.

Rollback: until the deletion, reverting the packaging commit ships the Bun binary again at the
same path. The deletion waits for one stable release on Rust with no open difference.

## Later

At most four slices are in flight. Sizes are `mcp/src` lines to port; "parallel" slices own
separate crate folders and one handler file per family in `mcp-server`.

| # | Slice | Size | Needs | Becomes next when |
|---|---|---|---|---|
| 0 | Baseline and differential harness | 14 child-process test files made server-neutral | none | first |
| 1 | Server shell: protocol loop, registry, schemas, instructions, envelope, variables | 9,100 (6,600 generated data) | 0 | 0 can fail on purpose |
| 2 | Vault documents and plain reads: `connection_info`, `list_concepts`, `get_concepts`, `find_backlinks`, `find_orphans`, `query_concepts` | 6,000 | 1 | 1 equal |
| 3 | Graph: `compile_ontology`, `query_ontology` | 8,000 | 2 | 2 equal; parallel with 4 and 5 |
| 4 | Vault writes: the nine concept and relation writers | 3,900 | 2 | 2 equal; parallel |
| 5 | Git and staleness: `git_status`, `git_history`, `git_snapshot`; app evidence twin replaced | 3,100 | 2 | 2 equal; parallel |
| 6 | Library and wiki: `list_constellations`, `get_constellation`, `validate_wiki`, `absorb_document` | 3,700 | 2, 4 | 4 equal; parallel |
| 7 | Imports and architecture: `infer_imports`, `inspect_architecture` | 6,100 | 2, 5 | 5 equal; parallel |
| 8 | Evidence search and agent brief: `find_evidence`, `read_source`, brief operations | 6,500 | 3, 7 | 7 equal |
| 9 | Repository survey: `analyze_repo_structure` | 8,700 | 7, 8 | 8 equal |
| 10 | Project source and meaning: `connect_project_source`, `disconnect_project_source`, `finalize_project_meaning` | 2,900 | 4, 5 | 5 equal; parallel with 8 |
| 11 | Meaning findings and construction depth; completes `validate_vault` and write findings | 9,400 | 5, 9, 10 | 9 and 10 equal |
| 12 | Nothing imports `mcp/src`: 12 scripts, 43 test files, 15 screen modules moved, `cli init` | no port | 8, 11 | all tools equal |
| 13 | Cut-over: bundle, `.mcpb`, image, beta, then stable (`docs/specs/2026-11-22-ci-split-and-beta.md`) | no port | 8, 11; criterion 7 | targets hold |
| 14 | Delete `mcp/src` JavaScript, Bun, the LGPL notice; keep the launcher one release | deletion | 12, 13 | one stable release on Rust |

After 14: the app's screens ask Rust through Tauri commands and the twins go; next when the
workbench removal has merged. Then the app calls the crates in-process where it spawns the bundled
server today (the gray-area reader).

## Owner question

While the port runs, may the tool surface change? Recommended answer: no new tool, argument or
response field from slice 1 to the cut-over; fixes continue under risk 2's same-pull-request rule.
A yes makes each such change a change in two languages.

## Decision record draft

For the lead to record with `pnpm record:new`.

- **Title**: The MCP server is ported to Rust behind a differential harness, and a source
  checkout runs a built program.
- **Why**: the shipped server statically links LGPL code (`NOTICE.md:57-84`), is 62 MiB, holds
  51.6 MB per session at start, and its rules are written again in the app's Rust and screens.
- **Prior**: upholds 2026-07-27 "The app embeds MCP" (`docs/DECISIONS.md:4622`), same path and
  stdio, replacing its Bun runtime. Changes the source channel of `.claude/rules/surfaces.md`.
  Acts on the falsifier of 2026-09-11 "release bundle" (`docs/DECISIONS.md:248`) by moving that
  channel to a compiled binary. 2026-09-02 "Installed MCP evidence" (`docs/DECISIONS.md:1193`)
  still governs how an installed build is trusted. The mechanism of 2026-08-30 "The CLI executes
  the MCP modules" (`docs/DECISIONS.md:1472`) is already gone from `cli/`.
- **Decision**: a function-for-function port into four workspace crates, the surface unchanged,
  each family proven byte-equal against the JavaScript server before it counts; JavaScript ships
  until every family and the targets pass; then it, Bun and the LGPL notice are deleted. No
  WebAssembly build. The `.mcpb` and image carry the compiled program.
- **Dissent**: two languages are maintained for the whole port on code that changes 245 times in
  30 days; byte equality is stricter than an agent needs; a packer change alone might have removed
  the LGPL code.
- **Falsifier**: a defect reaches a stable release that the harness could not have expressed; or
  the targets are missed at the cut-over; or risk 2's 14-day measure fires.

## Revisions

- 2026-11-27: first draft.
- 2026-11-27: the browser workbench is being removed (owner decision relayed by the lead), so the
  web section drops WebAssembly and any browser copy, and names the screen twins as a later track.
