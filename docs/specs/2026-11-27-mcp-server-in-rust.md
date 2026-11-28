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

## One way per concern

Every crate and every tool does each of these the one way named here; a second way is a defect
the reviewer rejects, and changing the way changes it everywhere in the same slice.

| Concern | The one way |
|---|---|
| Reading or writing a file | `confined-files` (`VaultRoot`, `SourceRoot`, `write_atomically`); nothing else names `std::fs` (clippy and `family_boundary`) |
| A write to the vault | a `WritePermit` from `write_checkpoint`: read-only, consent, reservation, one write at a time, then the audit line |
| Running git | `hardened-git`'s typed reads; no other process spawn |
| Errors | a `thiserror` enum per crate with typed reasons; the server maps each to one public `errorCode`; no error text parsed for meaning |
| Arguments | `Arguments::read`/`read_all` into typed structs; refusals as `invalid_arguments` naming the argument |
| Answers and text an agent reads | `answer-format` (numbers, UTF-16 counts, time as JavaScript wrote it); one answer text written once |
| Ids | `uuid` v4 |
| Order of names | one collation in `answer-format`, used by every sorted answer |
| Concurrency | the protocol's worker threads, `rayon` for data parallel work; no async runtime |
| Logging | `tracing`, no subscriber in release; standard error only for the lines the contract names |
| Tests | `cargo nextest`; `proptest` for rules over inputs, `insta` for answer shapes, the differential harness for agent-visible behaviour |
| Names | a crate, module or file is named for what it owns or exports; a tool's handler is found from the tool's name |

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
| Rust built in its own idiom; answers judged on merit, every change listed | all six | the harness must tell listed from silent differences | chosen |
| Rust with a new tool surface | freedom | breaks every saved prompt and agent skill | lost |

### The starting contract

This is what the JavaScript server does today. It is the default only where nothing better is
chosen; any part of it may change as a listed change below.

Tool names, descriptions, input and output schemas, annotations and order; the `initialize`
instructions, whose first 2,048 characters are the construction card; the negotiated protocol
versions; answer shapes (`ok`, `error`, `content`, `structuredContent` and their fields); the set
of `errorCode` values and repair fields; the seven retired names and their note; the seven
variables and their accepted values; newline-delimited JSON over stdio; the stderr lines; what
each write puts on disk (file bytes, frontmatter key order, atomic replacement, `expected_mtime`,
dry run, `confirm`, `overwrite`, `force`, the consent question) and the lines in
`.ontology-atlas/activity.jsonl` and `map-analysis.jsonl`.

### Declared behaviour changes

The Rust server is not held to the JavaScript server's answers. Each difference is judged on
whether it is better for the person or the agent, and is kept only as an entry here, mirrored with its request
ids in `tests/differential/declared-changes.json` (read by `--a=node --b=rust`) and summarised in the
merge's change record. An entry names the row, the case, the request id and the field's JSON path;
the harness treats it as an expected difference only there; a difference elsewhere fails, and so does an
entry whose difference no longer appears. Refusals, limits, error text, tool descriptions and
answer content may all be listed. Two things are shared with other programs and stay stable:

- **The vault file format.** A team keeps the vault in its own Git repository, and teammates run
  different Atlas versions for days after a release; the app's own editor writes the same files. If
  two writers format frontmatter differently, every save rewrites lines nobody changed and two
  writers keep rewriting each other's files. So a write changes only the lines it means to change
  and formats them in the one format the app also writes; the Rust server never reformats untouched
  keys, comments, quoting or order. Changing the format itself is a separate, deliberate change with
  its own decision record, never a side effect of this port.
- **The set of `errorCode` values.** Agents and saved prompts branch on them. A new code may be
  added as a listed change; an existing code keeps its meaning and is not renamed or removed.

A changed tool name or schema is also changed in the vault README and the agent skills in the same
merge.

| # | Tool, field | Before (JavaScript) | After (Rust) | Why |
|---|---|---|---|---|
| 1 | every limited text field | a cut through an emoji emits half of it | the cut falls before it | half a character is not text |
| 2 | `infer_imports` edges; outlines in `read_source` and `find_evidence` | line scanners per language | `tree-sitter` parse for TS/JS, Python, Go, Java, Kotlin, Rust, C; other languages keep a Rust scanner with today's rules | a parser sees multi-line imports and nested declarations a scanner misses |
| 3 | every answer that repeats a string the agent sent (tool name, method), and every argument holding a lone surrogate escape such as half an emoji | the half is kept and written back as the escape, `"\ud800"`, and a handler receives it | a name is read with U+FFFD and written as that character; an argument that holds one is refused as `invalid_arguments`, naming it, before any handler runs; a request `id` is written back exactly as sent | half of an emoji is not text; the JavaScript server stores such a value in the vault as U+FFFD without saying so, so a refusal tells the agent what it sent instead of saving something else |
| 4 | `unknown_tool` and `unknown_argument` `structuredContent`: `receivedTool`, `receivedArgument`, `receivedArguments`, `unknownArguments`, `toolName` and the fields beside them | the fields are read back out of the message text, so a name with a full stop, a comma, a quote, edge spaces or nothing in it gets the wrong fields or none | the fields are always written, from the typed values the message was made from; the message, the code and every other name are unchanged | a field is never parsed out of message text, and an agent repairing a call is given the name it sent |
| 5 | `unknown_argument` message and fields | unknown arguments are listed with integer-like names first, as a script object orders them, and a `__proto__` argument is dropped without a word so the call runs | they are listed in the order sent, and `__proto__` is an argument like any other, so it is refused as unknown | that order is an accident of JavaScript objects no client can rely on (a JavaScript client reorders keys again), and an argument ignored in silence runs a call the agent did not write |
| 6 | A write whose call is cancelled while its consent question is open | the question stays open and a late yes can still write | the call withdraws its question (`notifications/cancelled`) and never writes; a later answer to it is ignored. Corpus: replays from slice 10 | a yes that arrives after the agent was told the call ended must not change the vault |
| 7 | A ninth consent question open at once | all are sent | the ninth write is refused as a `tool_error` that writes nothing; answers nobody asked for take no place. Corpus: replays from slice 10 | a client that never answers must not hold every thread |
| 8 | The consent question of a one-row `add_concepts` or `add_relations` | the one slug or the two endpoints are put in the question as sent, so a hidden character (right-to-left mark, zero-width space) passes through while every other tool's question spells it out | they are spelled out by name in the question, as in every other tool's. Corpus: replays from slice 10 | what a person approves is what will be written |
| 9 | A refusal to write for lack of a yes (not approved, no way to ask, no answer in time) | the code follows the words of the message, so a summary that says "conflict" or "not found" is read as one | always `tool_error`, with the same words; a real conflict or missing file found by the write keeps `conflict`, `vault_conflict` and `not_found` | a refusal is not a conflict, and the code is never read back from text. Corpus: replays from slice 10 |
| 10 | A consent question that fails: a closed connection, an answer that cannot be read, a client that cannot be reached | the SDK's error text | the server's own words, each saying that no change was made; the code stays `tool_error`. Corpus: replays from slice 10 | the agent reports what happened instead of retrying |
| 11 | An audit line that cannot be written | the failure is swallowed in silence | one line on standard error naming the tool and the cause, `[ontology-atlas-mcp] audit line not written after <tool>: <cause>`, and a panic while writing it is reported the same way; the write's answer never changes. Corpus: replays from slice 10 | a finished write is not a failure, and the person can still find out the log is broken |
| 12 | An `activity.jsonl` or `map-analysis.jsonl` whose last line was torn (no final newline) | the next line is appended to the torn one and both are lost to a reader | the torn line is ended with a newline before the next line; the format of every line is unchanged. Corpus: replays from slice 10 | one interrupted write must not make the next line unreadable |
| 13 | `get_concepts` row for a file that exists and cannot be read (a link that loops, a permission) | `Could not capture a stable file snapshot: <absolute path> (ELOOP: ..., open '<absolute path>')`, classed `invalid_arguments` because the OS text holds the words "too many" | `Could not read the file of "<slug>": too many symbolic links encountered (ELOOP)`, classed `tool_error` | the answer shows an agent a path on the user's disk it never named, and the code says the agent mistyped an argument when the file is the problem |
| 14 | `query_concepts` filter nested deeper than 32 levels of `NOT` and brackets, or holding more than 256 clauses | the filter is read by recursion until the process's stack ends, so a filter of a hundred thousand clauses ends the whole server | refused as `invalid_arguments` naming `filter`, before the vault is read. Corpus: `query-concepts-filter-bounds` | a filter no agent wrote by hand must not end every agent's session |
| 15 | `query_concepts` zero-row `growthHint.reason` | the `kind=` and `domain=` names are found by scanning the filter's text, so a name inside a quoted title counts as a kind and a domain with a non-ASCII letter is cut where the letters stop | the names are the ones the parsed filter requires, whole. Corpus: `query-concepts-zero-row-names` | the hint names what the filter asked for |
| 16 | order of `find_backlinks` matches and of the kinds in `kind_census` | by UTF-16 code unit, the default sort | by the one collation every other list uses (`Intl.Collator('en')`). Corpus: `backlinks-and-orphans-edge-names` | one order for every list an agent reads |
| 17 | `git_status` and `git_history` `reason` when `git` is not installed (the program is not found) | `not-a-git-repository`, because every failed first call reads as no repository | `git-not-available`; a missing repository keeps `not-a-git-repository`, and a `git` that is found and cannot start is a `tool_error` with the operating system's words. Corpus: `no-git-executable` | an agent told "not a repository" on a machine with no git is led to run `git init` |
| 18 | `git_status` `files` for a file renamed in the working tree or index | one row for the new path, as `modified`, when the person's `status.renames` or `diff.renames` allows it, and an `added` row for the new path and a `deleted` row for the old when it does not | always two rows, the old path `deleted` and the new one `added` or `untracked`, whatever the person configured; `counts` follow. A history read never follows a rename either (`log.follow` is set off). Corpus: `git-status-staged-rename` | the answer must not depend on a setting of the person's, and the old path is not lost |
| 19 | `git_history` when `git log` fails on a repository that has a commit | the failure is swallowed: no commits, `historyComplete: true` | `tool_error` carrying git's words. A branch with no commit has no history and answers as before. Corpus: `git-history-with-a-missing-commit` (the branch names a commit that is not there) | an empty list that reads as a complete history is a false answer |
| 20 | `git_status` and `git_history` for a vault in a folder of its repository | the place is `relative(gitRoot, vault)`, so on Windows it is written with backslashes: git reads that as the same folder, but `isInsidePathspec` (`git-tools.mjs`) compares it with the `/` paths git prints, so every row counts as outside the vault and `vaultPathspec` shows backslashes. A vault path spelled in other letters than the disk holds (macOS and Windows keep the case but find a name without it) is placed by Node's `realpathSync`, which does not correct the case | the place is built from the real names below the top, as a `/` path, letters compared without case on Windows; a real folder called ` notes` or `-drafts` keeps its spelling. Corpus: `git-reads-in-a-nested-vault`, declared on Windows only (the two servers agree elsewhere) | the same vault must answer the same on every platform |
| 21 | `git_status` and `git_history` when the repository's own config cannot be read in time (the hardened run refuses to start `git`) | `not-a-git-repository`, because the refusal reads as a failed first call | a `tool_error` that says the config did not finish reading. No corpus case (it needs a config that names a pipe nobody writes): `hardened-git`'s `a_config_that_never_finishes_reading_refuses_the_run_instead_of_hanging` states the refusal | a repository that cannot be read safely is not a folder with no repository
| 22 | `query_ontology` refusal of a missing, out-of-bounds or contradictory argument: a missing required name (`slug`, `from`, `to`, `domain`), a list longer than its bound (`phases` over five items), or an argument that only another argument allows (`task` without `detail` `compact`) | `errorCode` `tool_error`, because the script server's classifier knew only "must be" sentences | `invalid_arguments`. Corpus: `query-ontology-storefront`, `query-ontology-atlas-ontology`, `query-ontology-miniature-repo`, `graph-selection-refusals`, `graph-selection-rich` | a call that omits a required argument or sends a list past its bound is a wrong call, as every other tool already says |
| 23 | the refusal of a vault whose node identity is broken (`compile_ontology`, `query_ontology`): its `errorCode`, and the file a merged-uid collision names | `invalid_arguments` when the sentence holds "must be" (a missing or invalid `uid`), `tool_error` for the rest, because the script server classified by the words; a merged uid that another node owns is named `unknown` | `tool_error` for every identity fault, and the collision names the node that lists the merged uid. Corpus: `graph-refuses-identity-uid-missing`, `graph-refuses-identity-uid-invalid`, `graph-refuses-identity-merged-collision` | a vault that cannot be compiled is not a wrong argument, and a refusal that says "unknown" sends the agent searching |
| 24 | `query_ontology` `topological_order`, and the `dependencyOrder` of `health`, which lists the same blocked nodes at `orderLimit`, with a limit below the number of blocked nodes | `order` is cut at `limit` and `blocked` lists every blocked node | `blocked` is cut at `limit` too, and `limited` is true when either list was cut. Corpus: `query-ontology-tangle-limited-order`, `query-ontology-tangle`, and for `health` `graph-selection-rich` and `graph-selection-tangle` | one `limit` bounds the answer, so a graph of fifty thousand nodes in one tangle does not answer with fifty thousand rows |
| 25 | the order of node names and edge ids inside a graph answer: the edge ids under a node (`out`, `in`), the nodes of a community or of a `health` component, and which of two equally near nodes a walk takes first | sorted again by UTF-16 code unit, and a walk's steps from a node by the text `slug:edge`, so `capabilities/build-index:dependencies` came before `capabilities/build:dependencies` because `-` sorts before `:` | the order the graph holds: nodes by the collation of their slugs, edges by the collation of `from:via:to:ref`, and a walk's steps by the node they lead to and then the edge, so `capabilities/build` comes before `capabilities/build-index`. Corpus: `compile-ontology-edge-names`, `compile-ontology-storefront`, `query-ontology-edge-names`, `graph-walks-containment-tangle` (the nodes of a `pattern_walk` layer), `graph-walks-edge-names` (the shortest path, the explained relation and the reachability of two equally short ways whose names share a prefix), `graph-selection-edge-names` (the nodes of a `health` component) | one order for every list an agent reads (row 16), and a graph that sorts once and answers in that order |
| 26 | the order of the keys of a table keyed by names (`aliasToSlug`, `slugToUid` and the other indexes of `compile_ontology`) when a name is a whole number | a JavaScript object lists a key that is a whole number before every other, whatever order it was added in | the keys are listed in the order they were added, which is the order of the graph. Corpus: `graph-numeric-names` | a node called `2024` should not jump the list because of how one language stores keys |
| 27 | the totals, counts and qualification of `reachability`, `impact`, `blast_radius`, `subgraph`, `builder_context` and `lineage` when `limit` is below what a node reaches | the search stops once `limit` (or `limit` + 1, + 2) nodes are found, so `totalNodes`, `summary`, `byKind`, `qualification` and the edge totals count only what it found before stopping, and a hub of fifty thousand reports a handful | the search finishes, at a cost of the size of what it reaches and never more, so every total counts everything and only the lists written are cut at `limit`. The terminal nodes of `reachability` are those of everything it reached, written first `limit` of them. The `edges` of `lineage` is a page (`total`, `limited`, `rows`) cut at `limit`, and the `cycles` of `containment_tree` are cut at `limit` with `limited` set; the script server wrote every one of both. Corpus: `graph-walks-storefront`, `query-ontology-storefront`, `graph-walks-tangle`, `graph-walks-atlas-ontology`, `graph-walks-containment-tangle` | one `limit` bounds the answer, not what the answer says exists (row 24) |
| 28 | what a walk answer lists beyond the question: the `edges` of `subgraph` and `builder_context`, and those of `reachability`, `impact` and `blast_radius` with `direction: both`; a node that contains itself in `containment_tree`; the `nearbyPatterns` of `relation_check`; `paths.total` and `limited` of `pattern_walk` after a cut layer; the operation named by a `project_map` refusal | `subgraph` lists only the edges its search took, so two nodes it shows can have an edge it omits, each written from the end the search stood on; with `direction: both` the other three list an edge once from each end the search met it from, so it is listed and counted twice; a node that contains itself is its own child and its cycle path repeats the node; the pattern the call matched is also listed as nearby (the identity test compares copies); a cut layer reports `total` one above the paths shown even when none are; a `project_map` refusal says `project_scope` | `edges` are the edges among the nodes shown, each once, written from the node it starts at (the three walks too, in their lists and in every count that reads them); a self-containing node is a cycle and no child; nearby patterns are the others; `total` counts the paths found and `limited` says a layer was cut; the refusal names `project_map`. Corpus: `graph-walks-storefront`, `graph-walks-containment-tangle`, `graph-walks-tangle`, `graph-walks-empty` | the answer says what the graph holds, not how the search happened to walk it |
| 29 | the `errorCode` of a wrong call to a walk: a missing `pattern` or `type`, a structural `types` given to `impact` or `blast_radius`, a `project` that names no project node, several projects with none named | `tool_error`, because the script server's classifier knew only sentences that hold "must be" and a few other phrases | `invalid_arguments`, which is the code the set already holds for a call the caller can correct; a vault with no project at all is not a wrong call, so `project_scope` and `project_map` on it still answer `tool_error`. Corpus: `graph-walks-storefront`, `graph-walks-containment-tangle`, `graph-walks-empty` | an agent that sent a wrong argument should be told to fix the call, not that the tool failed (row 22) |
| 30 | `query_ontology` `node_profile`, the `total` and `limited` of a lineage list | `total` counts the nodes found before the walk stopped at `limit`, and `limited` is true as soon as the walk has found as many nodes as `limit`, even when no further node exists | `total` counts every node the walk reaches and `limited` is true when `total` is more than `limit` (the shared lineage search of row 27). Corpus: `graph-selection-rich` | a flag that says "cut" must mean something was left out, and a total that counts what the answer says exists |
| 31 | `query_ontology` `maintenance_plan`, the `id` of a dependency-cycle action and the `afterActionId` cursor that names it | the cycle is hashed as `null` (`Array.isArray` on an object), so every cycle action of one length has one id and a cursor skips the others | the id hashes the cycle's nodes, so each cycle action has its own. Corpus: `graph-selection-rich`, `graph-selection-tangle`, `graph-selection-storefront` | a cursor that names an action must name that action alone |
| 32 | `query_ontology` `similar_nodes` and `domain_matrix`, the lists inside an answer when `limit` is below their length: the `sharedNeighbors` of each match and the `domains` | every shared neighbour of each match is listed, and every domain of the scope, whatever `limit` is | each is a page (`total`, `limited`, `rows`) cut at `limit`, as the `connections` of `domain_matrix` already were (the row-27 family). Corpus: `graph-selection-limited-lists`, `graph-selection-rich` | one `limit` bounds the answer, so a hub fifty thousand nodes share, or a vault of fifty thousand domains, does not answer with fifty thousand rows (row 27) |
| 33 | `infer_imports` `unresolved` for a source file whose bytes are not text (binary data under `.ts`, `.rs` and the like) | the bytes are read as text and any import-shaped text in them becomes an edge | the file is listed with the reason `source-not-parsed` and no edges, so "nothing was read" is never reported as "nothing was found". A new reason value, added to the set. Corpus: `infer-imports-syntax-tree-reads` | an import list for a file that is not source is a guess an agent would trust |
| 34 | `infer_imports` edges for Rust and JVM source | a `mod` after an inner attribute (`#![allow(..)]`) is dropped, a `use` under `#[cfg]` or split over lines is not read, a `use` inside a macro body is read, a JVM name stops at its first non-ASCII letter, text in comments and strings that looks like an import is read as one, and `import('./x').T` in a type position counts as a value import | all of them follow the syntax tree: the `mod` and the two `use` forms are read, the macro body is not, a name in any script is read whole, also inside a Kotlin string template, import-shaped text inside a comment or a string literal is no import, and `import('./x').T` in a type position is `type_only`. Corpus: `infer-imports-syntax-tree-reads`. An instance of row 2 | a parser reads the file the compiler reads; the scanners read what they happened to match |
| 35 | `inspect_architecture` `measured` for a scan root that is not inside a git repository, and for one whose `git` is missing or refused (the script server then falls back to the folder probe) | a `sha256:` fingerprint of the folder, from the probe the app also has (`inspect_source_inventory`, `src-tauri/src/project_source/mod.rs`) | **unfinished, not decided**: no `measured` key until slice 11 ports that probe once, for the app and for both tools; the brief and its conformance are unchanged, and a git repository still gets its commit and `dirty` flag. Corpus, one request each, declared only until then: `inspect-architecture-folder-without-git`, `inspect-architecture-profile-by-slug-without-git`, `inspect-architecture-atlas-ontology-vault-as-root` | the probe exists and stamps a folder, so leaving the stamp out is a gap in this port, not a choice. Open for slice 11: the probe hashes the bytes of hidden and credential-named files, which `confined-files` never opens, so the shared probe must name those by size only or give up the stamp |
| 36 | `infer_imports` `coverage.limitations` when a scan left source files unread for a credential-style name (`secrets.ts`, `credentials.py`, `private_key.rs`) | the files vanish: no edge, no row, no word | one more sentence, `N source files named like a credential were not read: a scan never opens such names, so their imports are not among the edges.`, present only when `N` is above zero, so every other answer is unchanged. The refusal itself stays. Corpus: `infer-imports-credential-named-source-files` | a safety refusal that says nothing makes an empty result read as "no imports", which the coverage field exists to prevent |
| 37 | `query_ontology` `health`, `workspace_brief` and `growth_plan`, the facts only the tool layer can read: the `vault_validation` and `meaning_assessment` checks and their actions, the `validation` object, the status they raise, and the `nextReads` of `growth_plan` | the three are answered with every one of them | none of them until slices 9 and 11 hand them over: an answer carries no check it did not run (`outside_checks.rs`). This is a gap, not a change anyone wants; it is declared so that the rest of each answer stays compared, and each entry goes when its slice builds the fact. Corpus: every case that asks the three | an answer that names a validation that did not run would be worse than one that names none |
| 38 | `read_source` `errorCode` of a refusal | `tool_error` for every refusal, because the script server's classifier knew only sentences that hold "must be" | `invalid_arguments` when the call can be corrected (a path outside `sources/`, one that names no file, a hidden or credential-style name), `not_found` for a file that is not there, and `tool_error` for a file the vault holds but the read refuses (a link, a pipe or folder, over the size cap, changed while read). The sentences are unchanged. Corpus: `read-source-miniature-repo`, `read-source-library-files`, `read-source-bytes`, `read-source-hostile-files` | an agent told "not found" looks at the name, and one told "invalid arguments" fixes the call, instead of retrying a call that cannot succeed |
| 39 | `read_source` `from`, `limit` and `sheet` | the advertised schema says integer, `from` and `sheet` at least 1, `limit` 1 to 1000, but the handler accepted `0`, `-1`, `1.5`, `"2"` and `5000` and clamped or coerced them, after it had looked at the path | each is checked as advertised, by name, before the path is looked at: `from must be a positive integer.`, `limit must be <= 1000.` | a window that was silently moved is a citation that points at other units than the agent asked for. Corpus: `read-source-argument-bounds`, `read-source-miniature-repo` |
| 40 | `find_evidence` for text that is not ASCII: the match, the `score`, the near titles of a search that found nothing | text is compared as lower-cased UTF-16, so a title typed composed (NFC) never finds a note saved decomposed (NFD, how macOS names files); the shared-word tie-break counts `a-z` and `0-9` only, so a Korean or accented exact title scores 1 where an ASCII one scores 1.1; a Korean title never has a near title | text is compared lower-cased and in one Unicode form, so both spellings find each other; words are the letters and digits of any script, so the tie-break works in every script (an exact Korean title scores 1.1); a title one slip or one swap away (`strsim` optimal string alignment distance, 0.7 or closer) is offered with the titles that share words. Corpus: `find-evidence-edge-names`, `find-evidence-unicode-and-typos` | the product's first users write Korean, and a search that misses the same word in another Unicode form says "nothing" when something is there |
| 41 | `read_source` for a source that is damaged or hostile | a damaged DOCX or XLSX fails with the library's bare text and no path (`not a zip file: no end-of-central-directory record`); a character reference outside Unicode in a DOCX stops the read with `Invalid code point 1114112`; a text file with a NUL byte is read line by line with the NUL in a unit; a path of any length is looked up part by part | the failure names the path, the format and the cause (`read_source: `sources/x.docx` could not be read as a DOCX: it has no end-of-central-directory record, so it is not a ZIP file.`); a reference that names no character is kept as written and the rest of the document is read; a text file with a NUL in its first 8,000 bytes (Git's test) is `binary` with a note and no units; a path over 4,096 bytes is `invalid_arguments` before the disk is asked. Corpus: `read-source-hostile-files`, `read-source-office-and-tables` | a read must end in an answer an agent can act on, whatever a stranger's vault holds, and a NUL in a unit is not text an agent can cite |
| 42 | `query_ontology` `analysis_history` and `analysis_record`, the refusals and the readable records: a `analysisCursor` that is no record file name, an archive folder that is a link or not a folder, a record the format refuses, a record whose header holds U+2028 or U+2029, a line of metadata that is not JSON | an invalid cursor is a `tool_error`; an unsafe folder and a corrupt record are `invalid_arguments` because their sentences hold "must be"; a record the app's own writer made with U+2028 or U+2029 in a header value cannot be read at all (a regular expression's `.` stops at them) and its row reads "Analysis metadata must use the supported JSON flow values." | an invalid cursor is `invalid_arguments` (the caller's to fix); an unsafe folder and a corrupt record are `tool_error` (the vault's); a record with line separators in its header is read and listed. A header nested deeper than 128 levels or holding half a surrogate pair is a `problems` row, a record deleted while it is read says "Analysis record disappeared while it was read.", and an operating-system failure carries the system's words and no path. Corpus: `analysis-records-written-by-the-app`, `analysis-records-damaged`, `analysis-records-over-a-hundred-files-paged-by-cursor`, `analysis-records-with-line-separators`, `analysis-folder-is-a-link`, `analysis-record-is-a-link` | the code names who must act, not which words an error holds; a record the app wrote must be readable by the app's own server |
| 43 | `query_ontology` `query_plan`: the arguments it states, the call it suggests and the code of its refusals | the plan applies defaults of its own that differ from the operation's: `subgraph` direction `outgoing` (the operation uses `both`), `explain_relation` limit 100 (20) and `centrality` limit 100 (10), so the counts, `indexesUsed` and cost class that follow differ with them; `normalized.types` writes the internal name `dependencies` for `depends_on`; a `neighbors` plan drops `includeExternal` and `includeUnresolved` from `suggestedQuery`; a plan for an operation that reads the whole graph drops its `slug`, `domain`, `project`, `depth` and `pattern` from `suggestedQuery`, a plan for an operation without a limit of its own states `limit` 100, and a `match_edges` plan repeats `types` as `relationTypes`; a wrong call (no `targetOperation`, no `slug`, structural `types` for `impact`) is a `tool_error` | one table of defaults, shared with the operations, so a plan states what the operation would use; `types` use the public relation names; `neighbors` keeps both flags; every target's `suggestedQuery` carries the subject arguments the call sent; `limit` is stated only where the operation has a default or the call sent one, otherwise `null`; `searchBudget` only for `all_paths`; `relationTypes` is gone; a wrong call is `invalid_arguments` (row 29). Corpus: `query-plan-storefront`, `query-plan-tangle`, `query-plan-containment-tangle`, `query-plan-empty`, `query-plan-one-node` | a suggested call that is not the call that was planned sends an agent to a different answer than it was told |
| 44 | the `errorCode` of a wrong `query_ontology` `agent_brief` call: `task` without `detail: "compact"`, `detail: "compact"` without `task`, a `detail` that is neither, an `expectedGraphHash` or `reviewRevision` that is not the digest it names | `tool_error`, because the script server's classifier knew only sentences that hold "must be" and a few other phrases | `invalid_arguments`, as row 29 gives the walks; the sentences are unchanged. Corpus: `agent-brief-operations`, `agent-brief-storefront` | an agent that sent a wrong argument should be told to fix the call |

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
| `answer-format` | text agents read as JavaScript wrote it: UTF-16 length and cuts, whitespace, number text, `JSON.stringify` for typed answers. The `'en'` order and integer-first key order join when the first family needs them | none; takes `js_text.rs` out of `mcp-server` |
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
  order; `indexmap` for keyed maps, in the order sent (JavaScript's integer-first order is added to
  `answer-format` only by a family whose written files need it); `preserve_order` enabled nowhere (Cargo would switch it on for the app's maps too);
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
   corpus sends planted hostile inputs, then each is refused (the JavaScript server's refusal is
   the floor, never the ceiling; a stricter refusal is a listed change) and nothing outside the vault is read or written: a slug with `..`, a null byte, an
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
| 7 | Evidence search: `find_evidence`, `read_source`, the `vault-index` probe, `strsim` (the agent brief moved to slice 11) | 4, 6 |
| 8 | Repository survey with `rayon`: `analyze_repo_structure` | 6, 7 |
| 9 | Meaning findings and construction depth; completes `validate_vault` | 5, 8 |
| 10 | Vault writes and `git_snapshot`: the nine writers | 4, 9 |
| 11 | Library, wiki and project source: seven tools; then `agent_brief`, whose answer embeds the validation, meaning and project-source checks | 10 |
| 12 | Nothing imports `mcp/src`: scripts, tests and screen modules moved; goldens recorded from JavaScript | 11 |
| 13 | Packaging: bundle, `.mcpb`, image, launcher; clean-host and installed-app walks | 11; criterion 7 |
| 14 | Deletion in the same branch: JavaScript except the launcher, Bun, the LGPL notice; then the one merge to `main` | 12, 13; criteria 1 to 9 |

Left to later slices by the selection operations of slice 4:

- Slice 9 fills `maintenance_plan`'s `staleSummaries`. The Node server lists a
  `rejudge_summary_membership` step for each domain or project whose containment list changed after
  its description, read from the node revisions in Git history and the stale-parent clock; slice 5
  did not build either (see its notes), so the Rust plan lists none, and building the revision
  reader and the clock together is the work of `validate_vault`'s summary freshness, which reads
  the same clock. Its case is a vault inside a repository where a domain's list changed after its
  body. No corpus vault is inside a repository today, so the Node server lists none there either.
- Slices 9 and 11 re-check three ids when they lift their declarations of the validation and the
  meaning-review checks: `graph-selection-rich#60`, `graph-selection-tangle#7` (both `health`,
  declared under row 24) and `graph-selection-edge-names#5` (`health`, row 25), and `query-ontology-edge-names#2` (`health`, row 25). Each is declared
  for the whole answer text, so a difference in an outside fact hides behind it.
- Three `query_ontology` operations had no slice in the table: `analysis_history`,
  `analysis_record` and `query_plan`. The graph-remaining slice builds them (rows 42 and 43), and
  `query-ontology-empty-and-one#15`, `query-ontology-storefront#15`, `#43` and `#44` pass.
  `analysis_history` and `analysis_record` read the record files of `.ontology-atlas/analyses`
  (one Markdown file each), not `map-analysis.jsonl`, and write nothing, so they need no consent
  and leave no audit line.

Slice 10 may start after slice 4 under named fields if the manifest shows that the bytes a write
puts on disk depend only on built functions.

One change for the three readers together, after the merge: the vault dialect reads `''` inside
single quotes as two characters, a `|` block without its last line break, and a blank line in a `>`
block as a blank line, where YAML 1.2 reads one quote, the break and a space. The app's reader, the
JavaScript server and the Rust reader agree on the dialect today (`vault-document`'s oracle test
names the three places), so each is changed in the same pull request or none is.

The app's own `git/runner.rs` still holds a second copy of the hardening table (base flags,
hooks, `ext::` transport, per-repository filter overrides, diff guard) and of the credential-prompt
silencing, for the commit, remote, briefing and status modules (64 call sites in 20 files). It
folds into `hardened-git` when those modules move to the typed reads, next when a slice touches
one of them: the commit keeps the person's hooks, the network verbs keep transports and the
process-group deadline kills a hook's children, none of which `hardened-git` runs today, so the
fold needs those three modes in its runner first. Until then a change to the table is made in both
places, and the app tests state the app's copy.

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
4. Declared changes never touch the format of bytes on disk, of audit lines, or the set of error
   codes (a new code may be added); the surface changes only as a listed row. The one change to a
   file's bytes is row 12: a newline ending a torn last line of an audit file before the next
   line. Reverse with a new decision that also states the rollback.
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
- 2026-11-27 (owner: the Rust server need not match the JavaScript; keep what is better, drop what
  is not needed): answers, refusals, limits, error codes and written bytes are all judged on merit
  and may change as listed entries; the harness only catches unlisted differences; JavaScript's
  refusals are a floor for criterion 9. Reviews no longer treat "differs from JavaScript" as a
  defect by itself.
- 2026-11-27: the vault file format and the `errorCode` set stay stable, because teammates on
  different versions share one vault through Git and the app writes the same files; a write changes
  only the lines it means to change. Everything else stays judged on merit.
- 2026-11-27 (owner: fix what was wrong before; ask "why this way, in Rust/Vite?" and weigh several approaches): every slice brief starts with a "Questioned" step. Before building, the slice lists the existing behaviours and structures it touches, asks of each whether it was right and whether the target platform offers a better way, weighs at least two approaches for each non-trivial one, and records the choice and the reason in its report and pull request. Old defects found this way are fixed in the slice, not carried over. The reviewer checks that the questioning happened and that the chosen approach is the better one, not only that the code works.
- 2026-11-27 (owner: build it well, package folders for maintenance, code that a developer finds and works on without comments): structure is an acceptance item for every slice. A crate or folder owns one responsibility named for it; a file is named for what it exports; a developer finds the code for a tool, route or rule from its name alone (tool `find_backlinks` → `tools/find_backlinks.rs` or its family crate; route `/library` → `src/routes/library/`). No `utils`, `helpers`, `common`, `misc` or `v2`. Types and names carry the meaning instead of comments; a comment stays only for a reason the code cannot show. Each crate and top-level UI folder has a short README map (what lives here, where to start) that a test keeps in step with the folder. The reviewer judges the layout by finding three things by name without searching.
- 2026-11-27 (owner: no meaningless tests; dense, important tests; more tests become a constraint): a slice adds a test only when it guards a behaviour a person or agent relies on, or a hole that was real, and it must fail when that behaviour breaks. Tests that pin markup, restate the implementation, repeat another test at another level, or exist only for coverage are not added, and the reviewer removes them. A port replaces old tests rather than adding beside them; the slice reports the test count before and after and why each new one earns its place.
- 2026-11-28 (slice 1b, review round; each item questioned, two approaches weighed, choice and why):
  a name of nine million characters held the session ten seconds, because every allowed name was
  compared in full: an edit distance is never below the difference in length, so a name longer than
  the longest allowed one plus its allowance is refused from its byte count, a candidate too far in
  length is skipped, and the test asserts well under 100 ms. Half a surrogate pair in an argument:
  refuse at the door as `invalid_arguments` naming it (chosen) against an `Arguments::is_malformed`
  flag each handler must remember; one place that cannot be forgotten wins, and a write no longer
  stores U+FFFD in the user's Markdown unannounced (row 3). Unknown-name fields are always written
  (row 4). JavaScript's integer-first key order is dropped from the shell, with `__proto__`
  handling (row 5): it served only byte equality, and key order is not something a JavaScript
  client keeps; a family whose written vault files need the order (the app's editor writes
  integer-like frontmatter keys first) adds it to `answer-format` with that reason. A call's
  answer is held once as the JSON text it was written to and is both `content` and
  `structuredContent`, then written straight to standard output after a dry run proves it can be
  written (replacing a copy for each of five stages and an empty line on failure). The error type
  is one struct with a code, not a variant and a match per code; API no caller uses (repair
  fields, growth hint, slug and conflict details, row failures, `prompt`) is deleted and each
  family adds what it uses. The collation module and the ICU crates are removed until a caller
  exists; that slice adds the `'en'` order with a `cargo bloat` figure and a data set baked for
  `und` and `en` only. Windows: a carriage return before a newline on standard input is part of
  the line end and none is ever written, checked from the bytes the program writes; the worker
  stack is 8 MiB on every platform in place of 256 MiB; tests for a vault path with backslashes,
  slashes and a verbatim prefix are `cfg(windows)` and run in CI only.
- 2026-11-28 (owner: every function and rule must be consistent; different ways for the same thing are hard to manage): added "One way per concern"; reviewers reject a second way.
- 2026-11-28 (slice 2b, review round): a dry run is decided once, in `Permit::pass`, which hands a
  handler a preview permit that cannot write or ask; a write passes read-only mode, consent and the
  session's write lock in that order, and the lock is held through the audit lines so two approved
  writes to one concept lose nothing. The sidecar code moved to `confined-files` (no-follow opens,
  handle-based identity, the folder flushed after a rename), `mcp-server` joined the clippy family
  with its own file refusing a write around the permit, and a planted handler proves clippy refuses
  it. The consent window is 60 seconds again, because clients on the JavaScript SDK give up then and
  a yes after the agent was told the call failed is worse than a second question. Rows 6 to 12 list
  the changes this slice makes. Windows: a link is refused by the handle's reparse tag and hard
  links by the link count; the code is not compiled on this machine (no Windows target), so
  `cfg(windows)` rests on the cited Microsoft documentation until CI runs it.
- 2026-11-28: slice 3 review fixes. A filter is refused beyond 32 levels or 256 clauses (row 14);
  the zero-row hint reads the parsed filter (row 15); `find_backlinks` and the kind census use the
  one collation (row 16). The reads keep a document cache between calls, revalidated by stat, with
  a racy window of two seconds. The `''` dialect point is recorded under Later for a joint fix.
- 2026-11-28: slice 5 (git reads and staleness). `source-evidence` is renamed `source-scan`
  (the survey half gets `repository-survey` in slice 8). `hardened-git` reads `HEAD` and the
  changed paths from one `status`, so a commit between two runs cannot split them; every read
  sets `GIT_OPTIONAL_LOCKS=0`, because `status` otherwise rewrites the index under
  `index.lock` and can fail a commit the person makes at that moment. History dating uses
  `log -z`, so no path is read through C-style quoting. `git_status` and `git_history` answer
  as JavaScript does except rows 17 to 21. A vault is placed under its repository by
  `source-scan`'s `place_folder` from real paths (`confined-files`), as a `RepoPath` built from
  the real folder names, so a folder called ` notes` or `-drafts` is not trimmed or refused; the
  names an agent wrote are checked as written before they go under it. `git log --stdin` carries
  the paths of a dating walk, so no list of them reaches a command-line limit. The app's three
  evidence commands call
  `source-scan` for dating and text pairs; its `git/runner.rs` stays for the other git modules.
  Not done here: node revisions and the stale-parent clock (their callers are `query_ontology`
  health and `get_concepts`, slice 4), the comparable-code normaliser and import reconciliation
  (slice 6), and `detect-drift` (slice 9); the app's screens still run the shared JavaScript
  comparison.
- 2026-11-28 (lessons from two public migration reports, Anthropic's Messages API move to Rust,
  2026-11-25, and claude.com's "How Anthropic runs large-scale code migrations", 2026-07-16):
  their tests passed about 98% while only about a quarter of real inputs matched, so the corpus is
  not enough. Before slice 14, a replay step feeds both servers the MCP calls that real agent
  sessions on this machine made (read from local session transcripts, never sent anywhere; only the
  call shape and arguments, against the same vault copy) and counts differing answers; every
  difference is fixed or declared. Every assertion a slice weakened is listed for the final review,
  because their audit found more than a hundred weakened ones. The one switch stays (no gradual
  move), since the replay stands in for their shadow traffic.
- 2026-11-28 (fix round of the walks sub-slice): the nearest domain of every node is found by one
  search down from the domains, because climbing from each node took 5.2 seconds on a chain of ten
  thousand against 19 milliseconds for `impact`; the totals of every walk count the whole
  neighbourhood (row 27); a walk that follows edges both ways lists each edge once (row 28); a
  walk takes first, of two equally near nodes, the one first in the graph's order (row 25); a
  vault with no project is a `tool_error` again (row 29). The containment, scope and project-root
  modules, the lineage search and the typed cycle and order facts moved where selection can read
  them.
- 2026-11-28 (slice 6, lead's review): `infer_imports` places an import into a hidden folder
  (`.generated`, `.storybook`) with an existence-only question added to `confined-files`
  (`regular_file_exists`): it never opens the file, sees through hidden folders, and refuses a
  hidden file such as `.env`, a credential name, `.git` and a link that leaves the root, so the
  proposed row 36 is dropped. The walk depth limit is 4096 folders, beyond what any path allows,
  because a limit of 128 would have dropped files Node read; the 256-statement limit for Rust and
  the 256-import limit for Go match Node and each has a corpus case. Row 35 stands: a folder not
  under git has no head to stamp.
- 2026-11-28 (slice 6, second review): row 35 gave the wrong reason. The app's probe does stamp a folder
  not under git (`src-tauri/src/project_source/mod.rs`, `inspect_source_inventory`), so a missing stamp
  in Rust is unfinished work, owned by slice 11, which ports that probe once for the app and both
  tools; the row says so, and names the case where `git` is missing or refused, which the script
  server also stamps as a folder. A scan root's brief is compared whole in cases that fail on any
  difference; the three requests that differ only by the stamp stand alone, one per case.
- 2026-11-28 (fix round of the selection sub-slice): a vault's top-level file is read as a plain
  file of at most 64 KiB, never through a link and never blocking on a pipe; `maintenance_plan` reads
  each body once, spread over the cores (3.5 seconds became about one on a hub of fifty thousand);
  selection takes its containment, scope and project root from the modules the walks share and
  keeps no copy of them, so a project slug that names nothing is `missing_node` as everywhere else;
  `limit` cuts the `sharedNeighbors` of `similar_nodes` and the `domains` of `domain_matrix` (row
  32); the facts only the tool layer can read are a named gap, declared per answer (row 37).
- 2026-11-28 (graph-remaining slice; each item questioned, approaches weighed): the analysis
  archive is a module of `mcp-server` (`src/analysis_records/`), not a ninth crate, because it has
  one reader and a crate would edit the workspace manifest every slice shares; records are
  validated over an ordered value so every refusal keeps its sentence and key order, instead of
  typed structures that would renumber them. The plan shares its defaults with the operations
  (`operation_defaults.rs`) rather than keeping a second table that drifts, which is how the
  script server's plan came to state a direction and a limit its operations never used (row 43).
- 2026-11-28 (slice 7, evidence search and raw sources): `find_evidence` and `read_source` answer from
  Rust; `agent_brief` does not yet: its answer embeds the validation, meaning and project-source
  checks, so slice 11 builds it after 9, and requests 3 and 6 of `agent-brief-operations` stay red
  until then. The probe of `vault-index` settled
  the question the Search paragraph left open: FTS5 answers whole tokens (`search.rs`: "each term
  must match, as a phrase of its tokens"), so `ord` finds nothing where `find_evidence` finds every
  node holding "order", the index exists only after the app built it (`Searcher::open` never
  creates one), and a lazy body fingerprint kept on each loaded document answers the same
  question from the files alone: on 10,000 nodes the search for a word no body holds takes 25 ms
  from the second call, against 0.04 ms for the index, which the server may not rely on. `read_source`
  reads through a new family crate, `raw-source-text` (units from bytes), and
  `confined-files::VaultRoot::read_raw_source` (the disk); rows 38 to 41 declare what changed.

