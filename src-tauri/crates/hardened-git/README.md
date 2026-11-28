# hardened-git

The one place that starts the person's own `git` against a repository that may be attacker
authored: a vault or a connected source can carry a config that makes `git` run code on `status`,
`add` or `log`. Every run goes through this crate, which neutralises what the repository's own
config could execute before `git` honours it. It depends on neither `tauri` nor an async runtime,
and it and `confined-files` are the only crates that may name `std::process`.

| File | Owns |
|---|---|
| `src/argv.rs` | The argument list of a run: no bare or embedded repository, no fsmonitor, literal pathspecs, no `log.follow`, hooks off except for the snapshot commit, no `ext::` transport, no diff, textconv or signature program |
| `src/environment.rs` | The environment of a run: no setting that conflicts with literal paths or relocates the repository, no lazy fetch, no index write on a read |
| `src/filter_overrides.rs` | The repository's `filter.*` entries, read once per folder and redirected to identity, with a time limit on reading the config |
| `src/runner.rs` | `run_git`: one process, bounded output on both streams, a timeout, standard input, no console window |
| `src/history_state.rs` | `HistoryState`: the commit `HEAD` names plus the shallow, graft and replacement files, so a caller can keep what a `log` said until one of them moves |
| `src/repo_path.rs` | `RepoPath`: a place in a repository, checked when built; the names an agent wrote are refused for any spelling that could be an option, and the real names of a folder never are |
| `src/repository.rs` | `Repository`: typed reads (head, status, history, blobs, touched paths) built from checked values |
| `src/working_tree.rs` | `git status --porcelain=v2 -z` read as rows and a head |
| `src/touch_history.rs` | `git log -z --raw` read as the paths each commit touched |

Start with `Repository` for a read and `run_git` for a verb the typed reads do not cover. The
tests: `tests/hostile_repositories.rs` plants a repository whose config would run a program and
shows none runs, and `tests/typed_reads.rs` holds the typed reads against real repositories.
