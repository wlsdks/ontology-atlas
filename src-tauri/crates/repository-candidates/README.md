# repository-candidates

The candidate scan for `analyze_repo_structure` with `view: "analysis"`: what a repository's
layout, documents and imports propose as domains, capabilities and elements. It proposes only; the
vault changes through a reviewed write.

| Module | What it holds |
|---|---|
| `repository_analysis` | The scan itself: the order the readers run in and the answer's fields |
| `analysis_view` | What the `analysis` view keeps of the scan's relations, and its note |
| `repository_files` | Path questions and reads below a repository root, through `confined-files`; the skipped-row log |
| `scan_limits`, `scan_tables` | The size limits and the folder, manifest and capability-clue tables |
| `candidate_text`, `candidate_nodes` | Names to titles and slugs, domain matching; the candidate shapes |
| `project_detection` | The project, its README headings and the nodes the vault already has |
| `toml_lines`, `package_contracts` | `Cargo.toml`, `pyproject.toml`, `setup.py` and `package.json` as quotable contracts |
| `authored_markdown` | The prose and headings an author wrote, line numbers kept (`pulldown-cmark`) |
| `semantic_document`, `semantic_evidence`, `semantic_risk`, `semantic_excerpt` | The documents that state meaning, their risk flags and trust, and which sections an excerpt quotes |
| `source_elements`, `native_evidence` | Packages and folders that become element candidates: workspaces, Python, Go, Rust, C |
| `meaning_gate` | The questions the scan can and cannot answer, and the extraction contract |
| `cargo_manifest`, `rust_source_files`, `rust_feature_attributes`, `rust_feature_configuration` | Where Cargo features are switched on in source: the manifest's package, features and workspace members, the Rust files of each package's conventional targets, the `cfg` attributes that name a feature, and the evidence built from them |

The Markdown reader was measured against the script server's `markdown-it` on the analysis of this
repository's own `docs` (983 leaves compared): the only difference is a skipped dotfile row the
confined reader cannot list (`tests/differential/declared-changes.json`, row 61).
