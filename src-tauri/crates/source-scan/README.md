# source-scan

Files under a source root, read for what they say about the meaning recorded beside them. The
crate runs `git` only through `hardened-git` and reads files only through `confined-files`
(clippy refuses `std::fs` and `std::process` here), and depends on neither `tauri` nor an async
runtime, so the app and the MCP server link the same code. It never sees the ontology graph: the
one thing it asks of the vault is a `VaultFacts` the caller builds.

## Citations and folders

| File | Owns |
|---|---|
| `src/path_dating.rs` | When a cited path last changed: a file by its newest commit, a concept document by the first commit that left it with its present bytes |
| `src/folder_placement.rs` | Where a folder lies below its repository's top, from real paths, as the `/` path git is asked about |
| `src/evidence_texts.rs` | A cited file at a commit and in the working tree, as text, under one read budget; hidden and credential names are never read |

## Reading source

| File | Owns |
|---|---|
| `src/source_language.rs` | The eight languages with a grammar (TypeScript, TSX, JavaScript, Python, Go, Java, Kotlin, Rust) and which extension is which |
| `src/bounded_parse.rs` | One parse under a byte cap, a binary test, a time budget and a node budget; walking a tree without recursion |
| `src/script_imports.rs` | TypeScript and JavaScript imports from the tree: static, dynamic, `require`, re-exports, type position |
| `src/python_imports.rs` | Python `import` and `from` statements, relative levels kept |
| `src/rust_dependencies.rs` | Rust `mod` and `use` declarations, `#[cfg]` and split paths included, macro bodies not |
| `src/jvm_declarations.rs` | Java and Kotlin package, imports, declared types and the types a file names, in any script |
| `src/go_imports.rs` | Go packages: the imports of every file of a package, read as one |
| `src/source_outline.rs` | A file's declarations with line numbers, read from its tree: the table of contents the survey's outline reads and its symbol reads start from |
| `src/file_reading.rs` | What reading one file gives, by language, from its text alone |
| `src/batch_reading.rs` | A batch of files parsed on a pool of eight threads (`rayon`), the readings in the order given |

## Placing imports

| File | Owns |
|---|---|
| `src/source_walk.rs` | The one walk below a root: byte order, ignored names, depth and entry limits, a visitor; the credential-named files it left unread are counted |
| `src/path_facts.rs` | Questions about paths below the root, asked through `confined-files` |
| `src/workspace_packages.rs` | Package roots a repository declares |
| `src/script_resolution.rs` | A script specifier to a file: relative, `tsconfig` aliases, workspace packages |
| `src/python_resolution.rs` | A Python module to a file or package |
| `src/rust_resolution.rs` | A Rust module path to a file, `crate`, `self` and `super` |
| `src/jvm_resolution.rs` | A JVM type to the file that declares it |
| `src/config_json.rs` | A configuration file's keys, in the order written |
| `src/import_edges.rs` | The edge, external import and unresolved rows, and the reasons an import is not placed |
| `src/import_scan.rs` | The scan itself: walk, read, place, group; `ImportScanOptions` and `ImportScan` |
| `src/import_rollup.rs` | Edge counts a module or package row carries |
| `src/module_grouping.rs` | Which module a file belongs to, and the edges between modules |
| `src/import_coverage.rs` | What the scan does not read, as a sentence an agent can quote |
| `src/autotools_c.rs` | An autotools C project, which the scan names and does not read |
| `src/planted_tree.rs` | Test only: files planted in a temporary folder and read back through the confined source a scan uses |

## Judging imports against the vault

| File | Owns |
|---|---|
| `src/import_reconciliation.rs` | Code edges against the vault's `depends_on` edges: candidates, qualifications, vault-only and unjudgeable rows |
| `src/import_review.rs` | The next relation to review, and the recovery packet when an endpoint is not modelled |
| `src/import_focus.rs` | The edges around one file, paged by a cursor |
| `src/import_delivery.rs` | Which review a request asks for, and the automatic choice between a whole answer and a compact one under 128 KiB |

## Refusals

| File | Owns |
|---|---|
| `src/source_scan_error.rs` | `SourceScanError`: the one error of this crate, its sentence and its `code()` |

## Architecture profiles

| File | Owns |
|---|---|
| `src/architecture_profile.rs` | An architecture profile read from a document's frontmatter, and the profiles of a vault |
| `src/path_pattern.rs` | The path patterns of a profile, matched without backtracking |
| `src/architecture_conformance.rs` | Import edges against a profile's layers and rules, and the brief an agent reads |
| `src/source_stamp.rs` | The commit and dirty flag a brief was measured at, from the scan root's git repository |

Start with `scan_imports`, `reconcile_import_edges`, `build_next_relation_review`,
`build_import_impact_focus`, `evaluate_architecture_conformance` and the dating and evidence
functions. The app's `git_paths_last_change`, `git_bound_evidence_dates` and
`git_evidence_text_pairs` call the last group; the MCP server's `infer_imports` and
`inspect_architecture` call the rest; `repository-survey` reads the walk (`walk_sorted`,
`DEFAULT_IGNORE`), the outlines, the declarations and the workspace members.

## Program size

Measured 2026-11-28 on macOS arm64 with `cargo-bloat` 0.12.1 and `size`, on a release build with
`strip` turned off (`CARGO_PROFILE_RELEASE_STRIP=none`). `cargo-bloat` reads the symbols of Rust
code, so a grammar's tables and C functions show as `[Unknown]` or as a few KiB
(`tree_sitter_typescript` 3.2 KiB); the per-grammar figure is therefore the compiled C objects each
grammar's build leaves in `target/release/build/<grammar>/out`, read with `size`. The scan refers
to every grammar, so the linker keeps all of it.

| Grammar | Compiled objects |
|---|---|
| `tree-sitter-kotlin-ng` | 3,365 KiB |
| `tree-sitter-typescript` (TypeScript and TSX) | 2,794 KiB |
| `tree-sitter-rust` | 1,093 KiB |
| `tree-sitter-python` | 444 KiB |
| `tree-sitter-java` | 405 KiB |
| `tree-sitter-javascript` | 404 KiB |
| `tree-sitter-go` | 213 KiB |
| `tree-sitter` (the runtime) | 175 KiB |

- **The MCP program** (`ontology-atlas-mcp-rust`, stripped) is 13.2 MiB with the grammars and about
  4.1 MiB without them, against 62.6 MiB for the Bun program built in the same run. `source_scan`
  is 372 KiB of `.text`, the largest crate after `std`. The goals are 20 MiB with and 10 MiB
  without; both hold, so no grammar is dropped. `pnpm mcp:program-size:check` repeats the
  measurement and fails when the Rust program is larger than the Bun one.
- **The app** (`ontology-atlas`, 28.6 MiB unstripped) holds no grammar. It calls only the dating,
  placement and evidence functions of this crate, so the linker removes every parser (`nm` finds
  no `tree_sitter` or `ts_parser` symbol in its release binary). An app feature that scans imports
  would add the 8.5 MiB above.
- Kotlin and TypeScript are 70 percent of the grammar weight; they are the two to weigh against
  the answers they give if a goal ever tightens.
