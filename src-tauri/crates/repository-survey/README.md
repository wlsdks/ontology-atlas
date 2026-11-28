# repository-survey

The breadth map `analyze_repo_structure` returns: how large a repository is, its product units,
entry points and the abilities a builder has to place. One crate, one job: it reads a repository
through `confined-files` and `source-scan` and returns a typed map plus the text an agent reads. It
writes nothing and runs no repository code.

Every source file the walk admits is read once, on the global rayon pool (`par_iter` only, no pool
of its own), and each product file gives its own facts in that read (lines, class, entry signals,
declarations, dispatched operations). Walking, grouping and every list's order stay sequential, so
the answer is the same as reading one file after another. Four things read again, and the map
counts them as separate reads: the import links come from `source_scan::scan_imports`, a second
walk of the root that reads and parses the files itself; the entry files, a unit's main files and
the library export files are read a second time through `SurveyFiles` to find a row's line; the
manifests and the README are read once each when asked for; and the documentation pages are a
third, smaller walk of `docs`, `doc` and `documentation` with their own rule (see row 48 of the
specification).

| File | Owns |
|---|---|
| `breadth_map.rs` | Assembly, fitting to the response bound, the text |
| `unit_collection.rs` | The walk, per-file facts, units and what was left out |
| `source_class.rs`, `tooling_path.rs` | Product, test, example, benchmark, generated, vendored, docs, tooling, migration |
| `folder_tree.rs`, `survey_areas.rs`, `main_files.rs` | Folder arena, areas of a large repository, a unit's main files |
| `unit_exports.rs`, `unit_imports.rs` | Exported names per unit, unit-to-unit import edges |
| `entry_points.rs`, `entry_signals.rs` | Manifest and source entry points |
| `ability_rows.rs`, `ability_row.rs` | The 120-row ability floor and one row's text |
| `library_exports.rs`, `sibling_families.rs`, `dispatched_operations.rs`, `documented_abilities.rs` | Where abilities come from |
| `operator_rows.rs`, `operator_language.rs`, `subcommand_rows.rs`, `flag_rows.rs`, `setting_rows.rs`, `worker_rows.rs`, `enclosing_declarations.rs` | An operator's side: subcommands a parser registers, flags grouped as the code groups them, the settings a configuration type turns on, background workers, and the declaration a line sits in |
| `jvm_masking.rs`, `jvm_file_facts.rs`, `jvm_rows.rs` | Java and Kotlin: comments and literals blanked, each file's classes read once, then routes, executables, workers and families across files |
| `readme_purpose.rs`, `doc_pages.rs` | README purpose, documentation pages |
| `survey_cache.rs` | The survey kept until Git's `status` (or one walk, without Git) says the repository changed; only changed files are read again |
| `git_ignored_paths.rs` | What Git ignores, so a built checkout counts like a clean one |
| `survey_files.rs` | The only way a path from a manifest or README becomes a read |
| `survey_text.rs`, `js_pattern.rs`, `name_key.rs`, `bounded_lines.rs`, `declaration_index.rs` | Text escaping and counts, JavaScript pattern meanings, name comparison, line bounds, the declaration index |

Folders a scan skips (build output, caches, editor settings, virtual environments) are one list,
`source_scan::DEFAULT_IGNORE`, shared with the import scan.
