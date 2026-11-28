# repository-candidates

The candidate scan for `analyze_repo_structure` with `view: "analysis"`.

| Module | What it holds |
|---|---|
| `repository_files` | Path questions and reads below a repository root, through `confined-files`; the skipped-row log |
| `scan_limits`, `scan_tables` | The size limits and the folder, manifest and capability-clue tables |
| `candidate_text` | Names to titles and slugs, domain matching |
| `toml_lines`, `package_contracts` | `Cargo.toml`, `pyproject.toml`, `setup.py` and `package.json` as quotable contracts |
| `authored_markdown` | The prose and headings an author wrote, line numbers kept (`pulldown-cmark`) |
| `semantic_risk`, `semantic_excerpt` | Risk flags and trust, and which sections an excerpt quotes |

Status: the modules above are built and tested; the assembly into the analysis answer is not
yet written.
