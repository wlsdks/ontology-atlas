---
title: The MCP server moves to Rust
doc_type: spec
status: draft
area: mcp
date: 2026-11-27
decisions: [6c76a2d9-e080-4b3a-97cc-dd8e2780a7de]
---

# The MCP server moves to Rust

**One-minute summary.** The program an agent talks to (`ontology-atlas-mcp`) is written in
JavaScript today and shipped as a 62 MB file that carries a whole JavaScript engine. It will be
written again in Rust, the language the desktop app already uses, so the rules live in one place.
An agent and its person must notice nothing: same 33 tools, same words, same answers, same files
written. That is proven by a machine that asks both programs the same questions and compares the
answers. The JavaScript program keeps shipping until the Rust one is equal and no worse on any
measured figure; then it is deleted. Three things change for people and are named below: lists
get one sort order whoever starts the server, a source checkout must build the program once
before the usual command works, and the server-only download carries a program instead of scripts.

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
- One tool reaches far beyond its own folder. Functions executed by one call on `docs/ontology`
  (V8 coverage): start alone 72 in 27 files, 11 of them in `git/`; `list_concepts` 229 in 43
  files, 33 in `meaning/`; `validate_vault` 827 in 89 files (`analyze/` 200, `construction/` 155,
  `infer-imports/` 67, `git/` 60); `add_concepts` 929 in 118 files (`analyze/` 199,
  `construction/` 138, `ontology-engine/` 111, `infer-imports/` 67). The writers import the
  survey and build-depth code (`mcp/src/tools/writes/write-concepts.mjs:28-30`), `git_snapshot`
  runs the vault validation (`mcp/src/tools/git.mjs:40`), and start spawns `git`
  (`mcp/src/server/runtime.mjs:36`).
- Sort order depends on who starts the server. Of 176 `localeCompare` calls, 11 pass `'en'`;
  the rest use the starting program's locale, among them the `list_concepts` order
  (`mcp/src/tools/read.mjs:139`) and the input of the project-source graph hash
  (`mcp/src/project-source/project-source-graph-hash.mjs:20,57`). Under `ko_KR` Node sorts
  Hangul before Latin, under `en` after; the app's reader clears the environment
  (`src-tauri/src/gray_area/rpc.rs:33`) while a Korean terminal passes `ko_KR`.
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
  (`mcp/package.json:327-328`; `mcp/README.md:65` still says 2.3.0 and is corrected in slice 1).
  Frontmatter is read by a hand-written parser, not a YAML library (`mcp/src/parser.mjs:1-9`).
  Git is the person's own `git`, spawned with hardening (`mcp/src/git/hardened-git.mjs:1-5`).
  Confinement of source reads and the read snapshot are ambient, carried by `AsyncLocalStorage`
  (`mcp/src/infer-imports/confinement/confined-source-fs.mjs:6`,
  `mcp/src/vault/documents/document-cache.mjs:583`).
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
  `mcp/scripts/` import it; 43 test files under `tests/` do (the review counted 42); `cli/`
  imports none.
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
  list of differences grows. Atlas borrows: the comparison; its two lists of differences (named
  fields below, declared differences under Edge cases) may only shrink or stay.
- **Same commands, new engine** (uv for pip, Ruff for flake8). Assumption, not verified here.

New in Atlas's combination: the product is the files on disk, so after every write the two vault
folders are compared byte for byte, not only the two answers.

## Problem and alternatives

The pains, ranked by what the person gets back: (1) LGPL code inside a file Atlas ships; (2) every
agent session holds its own server (51.6 MB at start, 343 MB at peak); (3) the server is 59% of
the bundle's two programs; (4) rules written two and three times; (5) start time, which nobody
perceives. One change answers all five. On (4) the port removes only the small duplication, five
Rust twins; the large one (9,006 lines of screen twins) becomes removable and is a later track.

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

One thing changes first, in JavaScript and on purpose: slice 0a pins `'en'` in the 165
`localeCompare` calls that lack it, so every list has one order whoever starts the server. Lists
reorder once for people whose agent ran under another locale, and project-source receipts
re-measure once; its change record says both.

### What equal means

- **Compared**: per request id, each `content[]` item's `text` byte for byte, `structuredContent`
  with its keys in emitted order, and `isError`. After a write, the two vault folders file by
  file, side files included.
- **Nothing is masked.** Both servers take a fixed clock and a seeded UID source from a test-only
  switch: a cargo feature the release build lacks, and on the JavaScript side a preload the
  harness passes with `--import`, never a variable the shipped server reads (the pattern of
  `scripts/lib/mcp-memory-probe.mjs:1`). They run one after the other on one absolute path
  restored from one snapshot, so paths are equal too.
- **File times.** Corpus vaults carry planted modification times: whole, fractional and exactly
  half a millisecond, because an agent sends `mtime` back as `expected_mtime` and the guard
  compares numbers (`mcp/src/vault/writes/atomic-writes.mjs:57-61`). The time the system gives a
  file written during a run is the one value not compared across servers: each run must report
  the file's own time, and a following call must be accepted with it.
- **Both JavaScript runtimes.** The corpus runs against Node and against the shipped Bun binary.
  Where those two already differ, slice 0 lists the case and the Bun binary, the one people run,
  is the reference.
- **Named fields.** While something a family calls is not ported, its answers compare "equal
  except these named fields", listed per family in the manifest (for example the findings on a
  write answer). Bytes written to disk are never on that list. The list may only shrink, a check
  refuses an addition, and it is empty at the cut-over.
- **Reach.** A family is proven only when the corpus runs at least 95% of the functions and 85%
  of the blocks its tools execute, by V8's block coverage; lines are not used, since start alone
  loads every module (the review measured 28% of lines run by `initialize` and `tools/list`).
  Each function never run is named in the manifest with its reason.

### Protocol behaviour

The JavaScript SDK decides these today. Slice 0 records each from both runtimes; slice 1 must
answer the same. Expectations marked "review" were reported by the reviewer and are unverified
here.

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
| Arguments nested thousands deep | recorded answer; never a crash |

This asks for a reader thread that keeps receiving while a call or a question is in flight, and a
catch at dispatch so a fault in one tool cannot end the session.

### One Rust implementation

Six crates join `crates/vault-index` in the workspace at `src-tauri/Cargo.toml:10`. All but the
last depend on neither `tauri` nor an async runtime, so the app links them; all inherit the
workspace lints against `unwrap`, indexing and `panic` (`src-tauri/Cargo.toml:14-17`).

| Crate | Owns | App twin it replaces |
|---|---|---|
| `confined-files` | the one type that opens, reads and writes files under a vault or source root; slug and root paths, scan root, credential and hidden names, snapshot limits | not read closely: `src-tauri/src/confined_files.rs` may fold in |
| `hardened-git` | the one table and runner for spawning `git` | the hardening table of `git/runner.rs` |
| `vault-document` | frontmatter, schema, documents, writes, side files, validation, Markdown tree, library, wiki | `vault/walk.rs`, `git/document.rs` kinds, `vault/temporary_files/names.rs` |
| `ontology-graph` | compiler, engine, queries, agent brief | none |
| `source-evidence` | staleness, evidence search, imports, survey, meaning, construction, project source | rule parts of `git/evidence/`, the inventory bound of `project_source/mod.rs` |
| `mcp-server`, the `ontology-atlas-mcp` program | protocol loop, registry, schemas, instructions, envelope, consent, write log, tool handlers | none |

JavaScript's confinement is ambient; Rust's is a type. No family crate calls `std::fs` or
`std::process` directly: a check in the merge lanes fails on either name outside `confined-files`
and `hardened-git`.

Choices, each a dependency to explain in its pull request and to pass `pnpm licenses:check`
(allow-list: `docs/engineering/third-party-code.md`; licences read from crates.io on 2026-11-27):

- **Protocol: a hand-written stdio loop, not the official `rmcp` SDK** (3.12.0, Apache-2.0,
  allowed). Atlas uses `initialize`, `ping`, `tools/list`, `tools/call`, cancellation and one
  `elicitation/create`, and keeps its own version list on purpose (`mcp/README.md:72-75`); `rmcp`
  reached its third major version in 20 months and brings an async runtime. Reverse by adopting
  `rmcp` behind the same module when Atlas needs a second transport.
- **JSON**: `serde_json` for parsing, and Atlas's own ordered value type for answers. The
  `preserve_order` feature is not enabled anywhere in the workspace: Cargo would switch it on for
  the app too and reorder every map the app serialises. `ryu-js` (Apache-2.0 option) writes
  numbers as JavaScript does.
- **Frontmatter**: a port of the hand-written parser. A YAML crate would accept files the vault
  format refuses.
- **Markdown**: `pulldown-cmark` (MIT) with source offsets, replacing `markdown-it`; both follow
  CommonMark, and the corpus carries the cases `mcp/src/markdown-tree.mjs` works around.
- **Patterns**: `regex` (MIT or Apache-2.0, in `Cargo.lock`), linear time; `fancy-regex` (MIT, in
  `Cargo.lock`) only for the 37 look-around and one back-reference pattern lines. Each port
  restates JavaScript's meaning of `\s`, `\w`, `\b`, `.`, `^`, `$` and case folding under `i`.
- **Order**: the 132 comparator-less sorts keep UTF-16 code unit order; the 176 `localeCompare`
  calls, all `'en'` after slice 0a, use `icu_collator` (Unicode-3.0, allowed).
- **Unicode forms**: `icu_normalizer` (Unicode-3.0, already linked at
  `src-tauri/crates/vault-index/Cargo.toml:19`) for the 21 `normalize()` calls (11 NFC, 9 NFKC,
  1 NFKD).
- **Git**: keep spawning the person's `git`. A library would not run the person's pre-commit hook
  on `git_snapshot` or honour their ignore rules.
- **Hashing and archives**: `sha2` and `miniz_oxide`, both already linked.

During the port every tool name, description, schema and the instructions text has one authored
source, the JavaScript registry. The Rust server embeds a copy generated from it and committed
under `src-tauri/crates/mcp-server/surface/`; `pnpm mcp:surface:check` is red when the registry
changed and the copy did not. The copy becomes the authored source in the deletion slice.

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

- **App bundle**: same name, same place, no arguments, so a client config written before the
  update keeps working. macOS signs and notarizes it as a nested binary as today; the ad-hoc
  re-sign Bun needs (`scripts/packaging/build-mcp-binary.mjs:103-114`) goes away. The Windows
  installer stays unsigned as today (`docs/features/download.md:26`).
- **Source checkout: the command stays, a build step is new.** `node <checkout>/mcp/src/index.js`
  remains the command, for good: checkouts follow `main`, not releases. That file becomes a small
  launcher that starts the program `pnpm mcp:build-binary` built. So the 84 files that name the
  command stay true (`grep -rl 'mcp/src/index.js'` outside generated data and frozen records:
  `scripts/` 17, `src/` 15, `docs/` 14, `mcp/` 11, `tests/` 9, `cli/` 5, others 13; the review
  counted 74), `inspectMcpServerLaunch` is untouched and its binary-name pattern
  (`src/shared/config/mcp/mcp-server-launch.ts:57`) is not asked to match a build output. What
  changes publicly is the prerequisite, stated in `.claude/rules/surfaces.md`, `mcp/README.md`,
  `cli/README.md`, `docs/TROUBLESHOOTING.md`, `docs/guide/connect-agent.md` and its three
  translations: a Rust toolchain and one build.
  - A stale build never answers. The built program records the commit of the server crates it
    came from; the launcher refuses a program older than the checkout (Copy).
  - A wrong toolchain is named. Cargo installed without `rustup` ignores `rust-toolchain.toml`;
    the crates declare the lowest Rust they build with, and the build prints which version built
    the program and that only the pinned one is proven equal.
- **`.mcpb` bundle and image**: carry the compiled program for macOS arm64, Windows x64 and Linux
  x64 and arm64, so a host without Node can run them. The macOS program is signed with the
  Developer ID and notarized; a bare program cannot carry the ticket, so its first start on a
  clean Mac with no network is unknown and is walked before release, as is a first start on a
  clean Windows host and in the image on both Linux architectures. Whether one `.mcpb` may hold
  several platforms is unknown; that slice probes it first.
- Still no npm package, and no crates.io publication without the owner asking.
- Windows is executed only in CI.

## Flow

1. When a person installs the cut-over release over an older one, Atlas replaces the bundled
   server in place; every agent config already written starts the new server unedited.
2. When an agent starts a session, Atlas answers `initialize` and `tools/list` with the same bytes
   as before.
3. When an agent calls a tool, Atlas returns the same text and structure, and a write leaves the
   same bytes on disk and the same audit line.
4. When an agent is wrong (unknown tool or argument, a stale `expected_mtime`, a write under
   `OATLAS_READ_ONLY`, a path that leaves the vault), Atlas returns the same `errorCode`, message
   and repair fields, and writes nothing.
5. When evidence is missing (no `git`, a cited file gone, a source folder not connected), Atlas
   reports the same `unknown` or `missing` state and never a guess.
6. When a person with a source checkout pulls and their agent runs the usual command, Atlas
   starts the built program if it matches the checkout, or says what to run and exits 1.

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
Built with Rust {found}. Only Rust {pinned} is proven equal to the previous server.
```

## Edge cases

- **Zero, one, largest**: an empty folder, one node, 50,000 files.
- **First run**: a missing vault root prints the two existing lines and exits 1.
- **Hangul**: slugs, titles and bodies in Hangul, decomposed (NFD) names from macOS, and the one
  `'en'` order among Hangul, Latin and emoji titles on Node, on Bun and in Rust; the generated
  vaults are one third Korean.
- **Character counts**: limits count UTF-16 units as today. Declared difference 1: where
  JavaScript cuts through an emoji and emits half of it, Rust cuts before it.
- **Numbers**: rounding ties in `toFixed` and `Math.round`, doubles with long fractions, whole
  doubles, integer-like object keys (JavaScript lists them first) and a `__proto__` key.
- **Patterns**: case folding under `i`, `^` and `$` across lines, `split` and `replace` with
  groups, patterns built at run time, U+00A0 and U+3000 beside word boundaries.
- **Error text**: every message that `rpc.mjs:249-255` turns into an `errorCode`.
- **Bytes**: CRLF, a byte-order mark, invalid UTF-8, the Markdown shapes `markdown-tree.mjs`
  handles specially.
- **Moved, renamed or unreadable folder**; a symlink leaving the vault; a file over 1 MiB.
- **Two edits at once**: two server processes on one vault; a file changed between read and
  `patch_concept`; a process killed during a batch write.
- **Offline**: the server opens no connection; Git runs with fetching disabled.
- **Windows**: drive letters, backslashes, `\\?\` long paths, `.exe`.

## Out of scope

- A new or changed tool, argument, response field or behaviour of a proven family (Decided).
- The app's screens calling Rust, and deleting the TypeScript twins: Later.
- Removing the browser workbench: its own spec.
- An HTTP transport: it needs its own security review (`mcp/README.md:115-117`).
- Replacing `git` with a library, or batching Git calls differently: behaviour first.
- A Linux desktop app, an npm package, a crates.io publication.

## Acceptance criteria

Nine, one more than the template allows, because the review asked for a separate security
criterion.

1. **Baseline kept.** Given `main` before any Rust, when `pnpm perf:mcp:baseline` runs, then it
   prints every row of the Today table for the Node server and the Bun binary with peak resident
   memory, peak footprint and heap by space, and exits 1 if a row is missing. Check: its output
   in the first pull request and its row in `docs/DEVELOPMENT-CHECKS.md`.
2. **The harness can fail.** Given a server that differs from the JavaScript one by one character
   of a tool description, one `errorCode`, the order of two `structuredContent` keys, or the
   order of two frontmatter keys in a written file, when `pnpm mcp:differential` runs, then it
   exits 1 and names the request id and the first differing byte. Check:
   `tests/differential/harness-detects-planted-difference.test.mjs`, one case per planted kind.
3. **The corpus reaches the code, and the manifest says how far.** Given the family manifest
   committed in slice 0 (per tool, the functions it executes; per family, its tools, named fields
   and unrun functions), when `pnpm mcp:differential -- --coverage` replays the corpus, then it
   exits 1 if a family about to be called proven runs under 95% of its functions or 85% of its
   blocks, if an unrun function has no reason, or if a named-field list grew. Check: that
   command in the merge lanes; planted by deleting one corpus case.
4. **The shell is equal.** Given the Rust server before any tool is ported, when the harness
   compares every row of the Protocol behaviour table, `tools/list` under each value of
   `OATLAS_READ_ONLY` and `OATLAS_TOOL_PROFILE`, an unknown tool, an unknown argument and a
   missing vault root, then every answer is equal. Check: `pnpm mcp:differential --
   --family=shell` and `pnpm docs:surface:check` run against the Rust program.
5. **Each family is equal before it counts.** Given a family's slice, when the harness replays
   its corpus against Node, the Bun binary and Rust, then it exits 1 on the first differing byte
   outside that family's named fields, on any difference between the written folders, or when
   the child-process tests for that family execute a different number of tests against Rust
   than against JavaScript. Check: `pnpm mcp:differential -- --family=<name>`.
6. **Recovery.** Given a file changed after the agent read it, when `patch_concept` arrives with
   the old `expected_mtime`, then the Rust server refuses with the JavaScript server's `errorCode`
   and the file's bytes are unchanged; given a server killed during `add_concepts`, no partial
   file remains; given a checkout whose program is missing or stale, the launcher prints the
   lines under Copy and exits 1, and after `pnpm mcp:build-binary` the same command lists 33
   tools. Check: the write family's corpus and `mcp/src/index.test.mjs`.
7. **Equal and no worse, measured.** Given the Rust program before the cut-over, when
   `pnpm perf:mcp:baseline` measures it and the Bun binary in the same run (median of 7) and
   `pnpm perf:mcp:scale -- --check` runs, then the command exits 1 if any Rust figure in the
   table below is larger than the Bun binary's, and reports peak footprint, peak resident memory
   and live heap bytes by owner (document cache, compiled graph, source text, Git output,
   response). Check: both outputs in the cut-over pull request.
8. **Cut-over and deletion are clean.** Given the cut-over beta installed over the previous
   release, when an agent with an untouched config connects, then it lists 33 tools and reads a
   concept; `codesign --verify --deep --strict` passes; `windows-beta-check.yml` boots
   `ontology-atlas-mcp.exe` and runs the harness; the `.mcpb` and image start on clean hosts;
   before deletion the corpus answers are frozen as goldens the Rust server must keep matching;
   after it `NOTICE.md` has no LGPL section for the server, no workflow installs Bun, and nothing
   outside `mcp/` imports `mcp/src`. Check: an installed-app walk, the clean-host walks, the
   Windows job, `pnpm notice:check`, `pnpm mcp:differential -- --goldens`.
9. **Safety first.** Given the Rust server before any reading or writing family is ported, when
   the corpus sends planted hostile inputs, then each is refused exactly as the JavaScript server
   refuses it and nothing outside the vault is read or written: a slug with `..`, a null byte, an
   absolute path or a symlink out of the root (`mcp/src/vault/documents/slug-paths.mjs:61-126`
   and `:257-266`); a scan root outside the vault and repository
   (`mcp/src/server/runtime.mjs:85-105`); credential and hidden names
   (`mcp/src/evidence-search/credential-names.mjs`); the snapshot's
   size caps and descriptor limit (`mcp/src/infer-imports/confinement/confined-source-fs.mjs`); a
   repository whose config would run code (`mcp/src/git/hardened-git.mjs`); a write under
   read-only mode (`mcp/src/index.js:126-130`); a write with consent on and no way to ask
   (`mcp/src/server/write-consent.mjs:110-179`); a stale or raced write
   (`mcp/src/vault/writes/atomic-writes.mjs:57-161`); and each audit line
   (`mcp/src/server/write-log.mjs:91-115`). The module tests of those files are lifted into
   server-level corpus cases. Check: `pnpm mcp:differential -- --family=safety`, and the
   `std::fs` check named above, planted red once.

| Figure | Today (Bun binary) | Gate | Goal |
|---|---|---|---|
| Program size, macOS arm64 | 62.2 MiB | not larger | 10 MiB |
| Start to `tools/list` answered | 132 ms; 51.6 MB resident | not worse | 50 ms; 15 MB |
| `validate_vault` on `docs/ontology` | 3,972 ms; 343 MB | not worse | 2,500 ms; 100 MB |
| 5,000 documents, first `list_concepts` | 423 ms; 136 MB | not worse | 150 ms; 60 MB |
| 5,000 documents, `validate_vault` | 629 ms; 167 MB | not worse | 250 ms; 60 MB |
| 50,000 files: second call, after 20 calls, peak | within 600 ms, 185 MB, 470 MB | the existing limits | 300 ms, 92 MB, 235 MB |

The gate compares against the Bun binary measured in the same run, not against these numbers.
36% of today's `validate_vault` call waits on Git, which a like-for-like port keeps. No unit test
asserts a wall-clock number.

## Risks

1. **A difference nobody asked about reaches an agent** (a number's text, `\s` in a pattern, an
   order), most likely in behaviour only the 142 module tests exercise. Answer: the reach floor
   on functions and blocks, the corpus classes under Edge cases, three programs compared, and
   folders compared byte for byte.
2. **The port never catches the moving target** (245 commits in 30 days). Answer: the behaviour
   of a proven family is frozen until the cut-over, except a fix that lands in JavaScript and
   Rust in one pull request; one authored source for the surface. Stop rule: `pnpm
   mcp:differential -- --drift --days=14` replays the corpus against JavaScript as it was 14 days
   ago and as it is now; when more answers changed in proven families than were newly proven
   equal in those 14 days, stop and re-plan with the owner.
3. **The slice plan is wrong because it was drawn from folders.** One write runs 929 functions
   across 118 files. Answer: slice 0's manifest replaces the order and sizes under Later before
   slice 1 starts.

Rollback. Before the cut-over nothing has shipped. From the cut-over to the deletion, reverting
the packaging commit ships the Bun binary again at the same path; configs and vault files need
nothing, because both servers write the same bytes. After the deletion, reverting its merge
restores the JavaScript as frozen, which stays a true rollback only until the first surface
change made in Rust alone.

## Later

Provisional: drawn from folders and the six measured calls, and replaced by slice 0's manifest,
which sizes each slice by the functions its tools execute. At most four slices are in flight.

| # | Slice | Estimate (`mcp/src` lines) | Needs |
|---|---|---|---|
| 0a | One sort order: pin `'en'` in JavaScript | 165 calls | none |
| 0 | Baseline, harness, corpus, family manifest, drift command | no port | 0a |
| 1 | Shell: protocol table, registry, generated surface, variables; `hardened-git` | 9,300 (6,600 generated) | 0 |
| 2 | Safety (criterion 9): `confined-files`, paths, read-only, consent, write gates, atomic writes, audit lines | 1,800 | 1 |
| 3 | Vault documents and plain reads: `connection_info`, `list_concepts`, `get_concepts`, `find_backlinks`, `find_orphans`, `query_concepts` | 5,700 | 2 |
| 4 | Graph: `compile_ontology`, `query_ontology` | 8,000 | 3 |
| 5 | Git reads and staleness: `git_status`, `git_history`; app evidence twin replaced | 2,900 | 3; parallel with 4 |
| 6 | Imports and architecture: `infer_imports`, `inspect_architecture` | 6,100 | 5 |
| 7 | Evidence search and agent brief: `find_evidence`, `read_source`, brief operations | 6,500 | 4, 6 |
| 8 | Repository survey: `analyze_repo_structure` | 8,700 | 6, 7 |
| 9 | Meaning findings and construction depth; completes `validate_vault` | 9,400 | 5, 8 |
| 10 | Vault writes and `git_snapshot`: the nine writers, after everything a write executes | 2,800 | 4, 9 |
| 11 | Library, wiki and project source: seven tools | 6,600 | 10 |
| 12 | Nothing imports `mcp/src`: 12 scripts, 20 files under `mcp/scripts/`, 43 test files under `tests/`, 5 under `src/`, 54 contract files moved to shared tables, 15 screen modules moved; goldens frozen | no port | 11 |
| 13 | Cut-over: bundle, `.mcpb`, image, beta, then stable (`docs/specs/2026-11-22-ci-split-and-beta.md`) | no port | 11; criterion 7 |
| 14 | Delete `mcp/src` JavaScript except the launcher, Bun, the LGPL notice | deletion | 12, 13 |

Slice 10 may start after slice 4 under named fields if the manifest shows that the bytes a write
puts on disk depend only on ported functions.

After 14: the app's screens ask Rust through Tauri commands and the twins go; next when the
workbench removal has merged. Then the app calls the crates in-process where it spawns the bundled
server today (the gray-area reader).

## Owner question

None — the owner delegated the three open points and the lead decided them on 2026-11-27.

1. One sort order for everyone, pinned to `'en'` in JavaScript first (slice 0a). Reverse by
   choosing another fixed locale in one place.
2. The behaviour of a proven family, not only the tool surface, is frozen until the cut-over,
   except fixes that land in both languages in one pull request. Reverse by lifting the freeze
   for one named family, at the price of porting its change twice.
3. The Rust server ships when it is equal and no figure is worse than the Bun binary's; the
   halved figures are goals. Reverse by promoting a goal to a gate before the cut-over.

## Decision record draft

For the lead to record with `pnpm record:new`.

- **Title**: The MCP server is ported to Rust behind a differential harness; a source checkout
  builds it once.
- **Why**: the shipped server statically links LGPL code (`NOTICE.md:57-84`), is 62 MiB, holds
  51.6 MB per session at start, and its rules are written again in the app's Rust and screens.
- **Prior**: upholds 2026-07-27 "The app embeds MCP" (`docs/DECISIONS.md:4622`), same path and
  stdio, replacing its Bun runtime. Adds a build step to the source channel of
  `.claude/rules/surfaces.md`; its command stays. Acts on the falsifier of 2026-09-11 "release
  bundle" (`docs/DECISIONS.md:248`) by moving that channel to a compiled binary. 2026-09-02
  "Installed MCP evidence" (`docs/DECISIONS.md:1193`) still governs how an installed build is
  trusted. The mechanism of 2026-08-30 "The CLI executes the MCP modules"
  (`docs/DECISIONS.md:1472`) is already gone from `cli/`.
- **Decision**: a function-for-function port into six workspace crates, the surface unchanged,
  safety proven first, each family proven byte-equal against Node and the Bun binary before it
  counts; every `localeCompare` pinned to `'en'` beforehand; a proven family's behaviour frozen
  until the cut-over; the Rust server ships when equal and no worse on any measured figure; then
  the JavaScript, Bun and the LGPL notice are deleted. No WebAssembly build. The `.mcpb` and
  image carry the compiled program.
- **Dissent**: two languages are maintained for the whole port on code that changes 245 times in
  30 days; byte equality is stricter than an agent needs; a packer change alone might have removed
  the LGPL code; "no worse" lets a port ship that gained little.
- **Falsifier**: a defect reaches a stable release that the harness could not have expressed; or
  a figure is worse at the cut-over; or the 14-day stop rule fires.

## Revisions

- 2026-11-27: first draft.
- 2026-11-27: the browser workbench is being removed (owner decision relayed by the lead), so the
  web section drops WebAssembly and any browser copy, and names the screen twins as a later track.
- 2026-11-27: revised after an independent review ("prove first"). The lead decided the three
  open points (one `'en'` sort order first, behaviour freeze, ship when equal and no worse).
  Equality is now compared unmasked with an injected clock and UID source, against Node and the
  Bun binary, with reach measured in functions and blocks; a safety criterion comes before any
  family; the slice order is provisional until slice 0's manifest; the source command stays and
  gains a build step; a protocol table, corpus classes, an ordered JSON type of our own and a
  rollback statement were added.
