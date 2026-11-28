# meaning-findings

What a vault's nodes claim that their source does not back. Pure over documents and a source tree
seen through `confined-files`; it writes nothing and runs no program. Every finding is advisory.

| Question | File |
|---|---|
| What is a finding? | `src/finding.rs` |
| Does a node's `path:` name only a folder, so its drift can never be checked? | `src/folder_only_evidence.rs` |
| Does a dependency's citing file never mention the other side? | `src/dependency_witness.rs` |
| Is a starter example still in a vault that has real nodes of its kind? | `src/starter_example.rs` |
| Which repository place does a `path:` name, and does it escape the repository? | `src/repository_path.rs` |
| Which file paths does a relation's note name? | `src/note_paths.rs` |
| Which modules does a source file bring in, in every language a vault describes? | `src/module_specifiers.rs` |

Each module has the tests that guard what an agent sees; `cargo test -p meaning-findings` runs
them.
