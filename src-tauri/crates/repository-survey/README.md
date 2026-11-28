# repository-survey

The breadth map `analyze_repo_structure` returns: how large a repository is, its product units,
entry points and the abilities a builder has to place. One crate, one job: it reads a repository
through `confined-files` and `source-scan` and returns a typed map plus the text an agent reads. It
writes nothing and runs no repository code.

Every source file is read once, on the global rayon pool (`par_iter` only, no pool of its own);
each product file gives all its facts in that read (lines, class, entry signals, declarations,
dispatched operations). Walking, grouping and every list's order stay sequential, so the answer is
the same as reading one file after another.

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
| `readme_purpose.rs`, `doc_pages.rs` | README purpose, documentation pages |
| `git_ignored_paths.rs` | What Git ignores, so a built checkout counts like a clean one |
| `survey_files.rs` | The only way a path from a manifest or README becomes a read |
| `survey_text.rs`, `js_pattern.rs`, `name_key.rs`, `bounded_lines.rs`, `declaration_index.rs` | Text escaping and counts, JavaScript pattern meanings, name comparison, line bounds, the declaration index |

Not read by this build: subcommands, flags, settings, background workers and JVM operation
families (`ability_rows::GAPS`).
