---
paths:
  - "src/shared/lib/**/tauri-*.ts"
  - "src/entities/vault-session/**"
  - "src/features/docs-vault-local/**"
  - "src-tauri/**"
  - "tests/e2e/web-surface-smoke.spec.ts"
  - "tests/e2e/design-audits/responsive-overflow-audit.spec.ts"
  - "src/shared/config/mcp/mcp-server-launch.ts"
  - ".github/workflows/e2e.yml"
---

# Written exceptions to local-first reads

Each section is one written exception to `local-first.md`'s rule against reads
outside the vault, numbered in the order it was decided. `surfaces.md` owns the
bridge roster; this file owns what each exception may read, run, send or write,
its gate and its record. Another exception needs a decision record and a
section here.

## Reading the person's agent config files

The first written exception to `local-first.md`'s rule against reads outside the
vault:

| | |
|---|---|
| Files | `~/.claude.json` (user scope plus **only** the open folder's `projects[<path>]` block), `~/.codex/config.toml`, `~/.cursor/mcp.json`, and the open folder's `.mcp.json` |
| Returned | server name, transport, command and arguments or URL, and env/header **key names** |
| Never returned | any `env` or `headers` **value**, and any other file |
| Direction | read only; `discovery_never_writes_anything` fails the build if a writer appears |
| Gate | `no_env_value_survives_serialization` in `src-tauri/src/connectors.rs` |

A fifth file, or any value, needs a new decision record.
`resolve_connector_runtimes` answers a fixed allow-list (`npx`, `node`, `uvx`,
`python3`, `docker`) with an absolute path or nothing; it opens no file, takes
no name from the caller, and executes nothing
(`the_runtime_allow_list_is_fixed_and_small`). Connector tokens live only in the
OS keychain.

## Reading a connected repository's harness files

The second written exception, for Harness only:

| | |
|---|---|
| Files | root guides (`AGENTS.md`, `CLAUDE.md`, the Gemini, Cursor and GitHub Copilot guide files, the agent ignore files, `.gitignore`), one-level `<dir>/AGENTS.md`, files under `.claude/{rules,hooks,skills,agents}`, `.agents/{skills,agents}`, `.cursor/rules`, `.codex/hooks`, one-level `.githooks/*`, `.github/workflows/*.y(a)ml` |
| Returned | those files' text; from `.mcp.json`, `.claude/settings.json`, `.codex/hooks.json`, `.codex/config.toml` and the root `package.json` only server names, hook commands, permission counts, MCP headers and scripts; every other file's name, never its text |
| Never returned | any other file's text, an env or header value, settings beyond hook commands and permission counts, any secret-named path |
| Root | the opened vault's one recorded binding, inside the existing source grant; never a path the page sends |
| Direction | read only |
| Gate | `the_shared_read_scope_table_holds` and the `harness_source` tests over `tests/fixtures/harness-read-scope-cases.json` |

A new path, or any value, needs a new decision record.

## Reading the person's own agent processes

The third written exception, for Work status only:

| | |
|---|---|
| Read | the person's own processes (uid filter first): parent, start time, working folder, and the executable path of one whose kernel name looks like an agent. On macOS, every 5 s while Work status is visible and its load switch (on by default) is on: memory, CPU time and kernel name of each process under an agent program; memory, CPU time and working folder of a process named `java` outside every agent's tree; and for the whole Mac, memory in use, macOS's pressure level, CPU in use, the 1- and 5-minute load average and the GPU's "Device Utilization %" |
| How | system APIs through crates already in `Cargo.lock`; one process listing and one usage read per process under an agent per sample, never per process on the Mac; no spawned program, no file, no root; the previous sample is the only one kept |
| Returned to the page | for each worktree, the agent's pid, tool (Claude Code or Codex) and start time; per worktree, memory and CPU in cores, and every tool group with a process there, the page showing the five largest (a closed list matched by kernel name; any other name counts as other programs) with count, memory and CPU; groups outside every room; for each session pid the page sent (at most 64), the memory, CPU and groups of the processes credited to that session; the Mac's totals, with no GPU figure when none is reported; never a folder, path, unlisted program name, or a pid the page does not already hold; session figures only for pids it sent |
| Never read | arguments or environment (`KERN_PROCARGS2`, `/proc/<pid>/environ`), open files, another user's processes, a per-program GPU figure |
| Platforms | macOS and Linux for the agent processes; the load read on macOS only; Windows reads none |
| Gate | `src-tauri/src/work_status/worktrees/tests.rs`; for load, the tests under `src-tauri/src/work_status/load/` |
| Record | `87d3ada9`; load: `43842310`; per session: `635500f0` |

A new field, a signal or a send needs a new decision record.

## Reading agent settings from every scope

The fourth written exception, for Harness only:

| | |
|---|---|
| Files | the constant table in `src-tauri/src/harness_scopes/paths.rs`: `~/.claude/settings.json`, Claude Code's Local settings file where Claude Code reads it, Claude Code's managed file, `~/.codex/hooks.json`, Codex's System `hooks.json`, the connected repository's `.claude/settings.json` and `.codex/hooks.json`, and `[hooks.<Event>]` headers in `~/.codex/config.toml` and the repository's; plus a `settings.json` or `hooks.json` the person picked, held by Rust until the app closes |
| Returned | per hook, at most 500 per file: an event name from the tool's documented list, matcher, type, and for a `command` hook its command, timeout and `async`; per file: status, size, modified time, `disableAllHooks`, `allowManagedHooksOnly`, permission-rule counts, how many hooks past 500 and how many undocumented event keys; for `config.toml` documented event names only; whether Git tracks or ignores the Local file |
| Never returned | `env`, `apiKeyHelper` or any other key; an `http` hook's address or headers; a `prompt` or `agent` hook's text; permission-rule text; an undocumented event key or any `[hooks.state]` header; a parse error; `~/.claude/.credentials.json`, `~/.codex/auth.json` or any other file |
| How | fixed names, never a folder listing or a path the page sends; every component below the home, repository or system folder opened without following a link, folders opened only to search them (`O_SEARCH`, `O_PATH`); a regular file of at most 1 MiB parsed into allow-listed structs; a picked file inside a Git work tree refused unless it is that repository's own settings file |
| Direction | read only |
| Gate | `no_planted_value_leaves_any_reader_result` and the `harness_scopes` tests over `tests/fixtures/harness-scope-files.json` |

The Local settings file stays in `DENIED_NAMES` for the second exception's
text reads; only this reader opens it. A new path, or any value, needs a new
decision record.

## Running the person's Claude Code for its session list

The fifth written exception, for Work status only:

| | |
|---|---|
| Run | `claude agents --json`, the first file among `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`; never a `PATH` lookup, an argument or a path from the page |
| How | under `/usr/bin/sandbox-exec` with every network operation denied; environment `HOME` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`; working folder Atlas's app data; no input, error output discarded; its process group is killed when it ends, or after 5 s or 1 MiB |
| When | while Work status is visible, its session-list switch is on (the default) and a Claude Code process is seen: once in 10 s, or 1 s after one appears or ends; one at a time. Switched off, the page asks nothing, Rust holds the choice and refuses an ask, and the last list leaves memory |
| Returned to the page | how the read went (one word of a closed list), and for a session whose folder lies in a listed worktree: the worktree's id, its pid, one of five states and, under Name below, its name |
| Name | read with each list while the session-list switch and Show session names (on by default) are both on; only a string; control and direction-override characters removed, cut to one line of at most 60 characters, never inside a Hangul syllable; empty means no name, and the room says `{tool} {number}`. Held in Rust with the last list and dropped with it, or at once when either switch goes off; the page holds it in view state only and draws it as plain text |
| A name never reaches | a file, a log, error text, storage, a URL, an argument the page sends back to Rust, an agent session, or the network |
| Subagents | with each list, in `~/.claude`, a visible `CLAUDE_CONFIG_DIR` and Orca profile homes: `projects/<cwd>/<sessionId>/subagents/`; `agentType`, `model`, worktree and file times from `agent-*.meta.json` (another key: unknown); from the session's `.jsonl`, its `cwd` (a listed worktree, else skip) and `<task-notification>` ids and statuses; the page gets type, model, worktree id or unknown. Never `description` or other text (`67a26c36`) |
| Never read | a session's `id`; `sessionId` stays in Rust; any field outside the documented ones makes its entry unknown |
| Platforms | macOS; no other platform runs it |
| Gate | `src-tauri/src/work_status/agent_sessions/tests.rs` (`the_program_cannot_open_a_connection` and the planted-name tests); `src/shared/lib/work-status/signals/sessions.test.ts` |
| Record | `929c2179`; names: `3c8614d6` |

Another program, argument or variable, or a run without the sandbox, needs a
new decision record.

## Watching the repository's worktrees for file changes

The sixth written exception, for Work status only:

| | |
|---|---|
| Watch | the OS's file-change notices (the shipped `notify` crate) for the folder of each worktree drawn as a room; one watcher for every room; never a shelf worktree's own folder or a folder Git does not list for this repository; a notice from a worktree nested inside a watched folder is dropped, never counted |
| When | while Work status is visible and its Watch file changes switch (on by default) is on; hidden or switched off, no watcher is alive, and switched off, no count is held |
| Counted | a notice whose path is not under `.git`, not under a fixed list of dependency and build folder names, and not ignored by Git; Git gives that verdict through `runner.rs`, at most one call per worktree in 10 s, never twice for one path until that worktree's `.gitignore` changes |
| Kept in Rust memory | per worktree: the time of the last counted change, counts per 10 s step for 60 minutes (99 at most), and a one-way hash of each path Git already judged (4,096 at most) |
| Returned to the page | per worktree: that time, those counts, and whether it is watched |
| Never | a file opened or stat'ed; a name or path from a notice in a payload, log, file or the network |
| Platforms | macOS; no other platform watches |
| Gate | the tests under `src-tauri/src/work_status/file_pulse/` |
| Record | `1c163935` |

Another folder, a kept name or path, or a watch while hidden needs a new
decision record.

## Harness › Improve: agent memory and session files

The seventh and eighth, specified, not built
(`docs/specs/2026-11-27-harness-self-improvement.md`):

| | |
|---|---|
| 7: read | the repository's Claude Code memory folder by real path from config homes, and `autoMemoryDirectory` in user or managed settings only; its `.md` files |
| 7: write | after a Keep, over an unchanged file: one path or index link changed, one link appended, one note deleted; a version first, then a swap |
| 8: read | with its switch on: session lines whose `cwd` is the checkout or a listed worktree; typed text, tool name and `file_path`, the interrupt marker |
| 8: send | after Send: ids and text only, logged first, to an agent with no MCP server and no allowed tool |
| 8: write | one kept rule: a memory note, or one line appended to an existing `AGENTS.md`, `CLAUDE.md` or `.claude/rules/*.md` |
| Never | note or session text in a log or error; a folder from project settings; a new instruction file |
| Gate | the spec's criteria 2, 4, 8, 9 and 11 |
| Records | `d73dd377` (7), `4919ff56` (8: read, send), `aa764ca0` (8: write) |

Another folder, field, recipient or file needs a new decision record.

## Workshop › control tower: acting on the person's processes

The ninth, specified, not built (`docs/specs/2026-11-27-workshop-control-tower-controls.md`):

| | |
|---|---|
| Read | while visible, each minute, from the existing listing: for own processes parented by launchd, folder, terminal, any child; a leftover's memory; no spawn |
| Signal | one press on a list Rust offered: `SIGTERM` to a leftover; background priority and back for an agent's build |
| Write | `git worktree unlock` of a stale lock, then `remove` without `--force`, after a confirm; a log line first (no path, last 1,000) |
| Never | `SIGKILL`, `SIGSTOP`, group signals; agent programs, Atlas or its ancestors, pid 1, another user, a terminal's job; a pid whose start, uid, parent, name or folder changed; acting hidden or unpressed |
| Gate | the controls spec's criteria |
| Record | `ed30a160` |

Another read, signal or target needs a new record.

## Harness › Tokens: session usage figures

The tenth, specified, not built (`docs/specs/2026-11-28-harness-token-inspector.md`):

| | |
|---|---|
| Read | after Inspect token use, Claude Code session files (regular, no link below `projects/`) in folders whose name begins with this repository's encoding, counted when their first `cwd` is in it: ids, model, usage, effort, times, cache misses, compactions, `cost-state`, tool groups, sizes and call names |
| Never | message, tool or error text, a session-file path or a full session id in a payload, log or file; a stored figure |
| Gate, record | `no_planted_text_leaves_any_inspector_result`; `d55c209e` |

Another file, field or stored figure needs a new record.

## Workshop › Asked, not done

The eleventh, specified, not built (`docs/specs/2026-11-27-missed-requests.md`):

| | |
|---|---|
| When | only after Check now in Workshop, one run per repository; Stop cancels the request in flight within 1 s; no schedule, idle, power or priority read |
| Read | config homes' `projects/` folders, each by real path once; lines whose `cwd` is the checkout, a path under it by whole parts, or a worktree Git lists; never `subagents/`. From a typed message only: text (2,000 characters), time, file name, `uuid` (held once), worktree, `gitBranch` |
| Send | each message alone, quoted, to the Agents › Models runner: a loopback host resolved and pinned, `noproxy`, proxy variables removed; a model `is_cloud_name` flags or `refuse_remote_model` finds remote is refused first, then the bundled check |
| Write | app data per repository, mode 0700: requests, verdicts, commit vectors, marks; a run-log line before the first send and one after the last, never text; items past 90 days deleted |
| Never | agent text, tool fields, commands or environment values; a secret-shaped line; the vault, the repository, `llm-audit.jsonl`, any memory or instruction file, the network |
| Platforms | macOS and Windows |
| Gate, record | the spec's criteria 2, 3, 5 and 6; `19077fe5` |

Another field, recipient, schedule or file needs a new record.
