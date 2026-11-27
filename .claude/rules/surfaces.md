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

# Surface contract — the app and the website

Authority: `docs/records/decisions/2026-11-27-browser-workbench-removed-ce69837e-d990-42fe-8566-460052231c0a.md`
(Atlas opens a folder only in the installed app; it narrows 2026-07-27, "web and
app do not promise identical screens"); narrative in `docs/ARCHITECTURE.md`,
"Surface contract". This file owns the bridge roster and the rules for adding
to it.

## Jobs

- **App:** the vault's home. A person reads and judges the map, connects in-app
  ACP agents and external MCP agents, and reviews their work. It is the only
  place a folder is opened.
- **Website:** introduces Atlas and hands over the app: the gateway (`/` and
  `/download`), the guide, the changelog, and `/sample`, a read-only map of a
  sample project. It opens, reads and remembers no folder and never installs an
  agent. Any other address opened in a plain browser shows one page, "Ontology
  Atlas runs in the installed app", with links to the download and the sample.

## One build, thin bridges

Tauri loads the same static export minus website-only pages and media
(`frontendDist`, staged by `scripts/desktop/stage-desktop-frontend.mjs`), so the
installed app and the website run one bundle. A bridge calls the native ability
and answers "no runtime" when there is none, which only a test browser without
the faked app runtime (`installDesktopRailRuntime`) or `pnpm dev` ever sees; no
screen offers a web substitute or an explanatory card. Every new desktop
capability uses `getInvoke()`/`isTauri()`; never a parallel router or surface
fork.

| Capability | Bridge | In the app |
|---|---|---|
| Vault absolute path | `src/shared/lib/vault-folder/native-vault/tauri-vault-handle.ts` | the folder-handle shape over native commands; the remembered record carries the absolute path |
| Git | `src/shared/lib/git/tauri-git.ts` | runs Git for the vault's history and snapshots |
| Keychain | `src/shared/lib/llm-connection/tauri-secrets.ts` | API keys live only in the OS keychain |
| Gray-area evidence | `src/shared/lib/project-source/tauri-gray-area.ts`, `src-tauri/src/gray_area.rs` | local folder confirmation and secure bounded reads are macOS-only |
| Source-folder read grant | `pickTauriSourceDirectory` in `src/shared/lib/vault-folder/native-vault/tauri-project-source.ts`, `src-tauri/src/project_source/access.rs` | the native picker grants read-only source access, not vault write access |
| Harness source read | `src/shared/lib/project-source/tauri-harness-source.ts`, `src-tauri/src/harness_source/` | reads allow-listed harness files, dot directories included (second exception below) |
| Code reader | `src/shared/lib/project-source/tauri-code-reader.ts`, `src-tauri/src/code_reader/` | reads the bound code folder, which lies outside the vault folder |
| Agent settings scopes | `src/shared/lib/harness-scopes/tauri-harness-scopes.ts`, `src-tauri/src/harness_scopes/` | opens home and dot folders (fourth exception below) |
| Jev evidence check (experimental) | `src/shared/lib/llm-connection/tauri-jev.ts`, `src-tauri/src/jev.rs` | sits on the models tab |
| LLM call | `src/shared/lib/llm-connection/tauri-llm.ts` | the user's own key or local model, opt-in, each send in the local audit log |
| Agent setup | `src/shared/lib/desktop-shell/tauri-bundled-mcp-server.ts` | writes the absolute path of the bundled server into the agent's config |
| ACP runtime | `src/shared/lib/agent-chat/tauri-acp.ts`, `src-tauri/src/acp/` | launches the agent program; an externally launched agent can still attach |
| Connector discovery | `src/shared/lib/connectors/tauri-connectors.ts`, `src-tauri/src/connectors.rs` | reads the person's agent config files (first exception below); adding one by hand also works and the list lives in the vault |
| Connector secrets | `src/shared/lib/connectors/tauri-connector-secrets.ts`, `src-tauri/src/connectors/secrets.rs` | Rust resolves the token into the outgoing ACP line, so the WebView never holds it |
| Connector runtimes | `src/shared/lib/connectors/tauri-connector-runtimes.ts`, `resolve_connector_runtimes` in `src-tauri/src/connectors/runtimes.rs` | typed absolute path of a fixed allow-list of runtimes |
| Folder watch | `start_vault_watch` in `src-tauri/src/vault/watch.rs`, `TauriVaultWatchBridge.tsx` | the OS watcher reports changed paths; a slow reread (`APP_SAFETY_POLL`) catches what it misses |
| Library sources | `src/shared/lib/vault-folder/native-vault/tauri-library-sources.ts`, `src-tauri/src/library/` | Rust hashes whole scans so files do not cross IPC; Planning's Add files uses the same import with its `planning` destination |
| Discovery outside the folder | `discover_source_candidates` in `src-tauri/src/library/source_discovery.rs` | a bound project root is an absolute path |
| Reveal a file in Finder | `reveal_vault_file` in `src-tauri/src/library/reveal.rs` | hands over the granted file; reveal, never launch |
| Work status | `src/shared/lib/work-status/tauri-work-status.ts`, `src-tauri/src/work_status/` | runs Git and reads the lock holder's start time, which no page could |

### Reading the person's agent config files

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

### Reading a connected repository's harness files

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

### Reading the person's own agent processes

The third written exception, for Work status only:

| | |
|---|---|
| Read | the person's own processes (uid filter first): parent, start time, working folder, and the executable path of one whose kernel name looks like an agent. On macOS, every 5 s while Work status is visible and its load switch (on by default) is on: memory, CPU time and kernel name of each process under an agent program; memory, CPU time and working folder of a process named `java` outside every agent's tree; and for the whole Mac, memory in use, macOS's pressure level, CPU in use and the GPU's "Device Utilization %" |
| How | system APIs through crates already in `Cargo.lock`; one process listing and one usage read per process under an agent per sample, never per process on the Mac; no spawned program, no file, no root; the previous sample is the only one kept |
| Returned to the page | for each worktree, the agent's pid, tool (Claude Code or Codex) and start time; per worktree, memory and CPU in cores, and every tool group with a process there, the page showing the five largest (a closed list matched by kernel name; any other name counts as other programs) with count, memory and CPU; groups outside every room; for each session pid the page sent (at most 64), the memory, CPU and groups of the processes credited to that session; the Mac's totals, with no GPU figure when none is reported; never a folder, path, unlisted program name, or a pid the page does not already hold; session figures only for pids it sent |
| Never read | arguments or environment (`KERN_PROCARGS2`, `/proc/<pid>/environ`), open files, another user's processes, a per-program GPU figure |
| Platforms | macOS and Linux for the agent processes; the load read on macOS only; Windows reads none |
| Gate | `src-tauri/src/work_status/worktrees/tests.rs`; for load, the tests under `src-tauri/src/work_status/load/` |
| Record | `docs/records/decisions/2026-11-22-work-status-agent-processes-87d3ada9-4740-430a-8cee-a580ce7e638e.md`; load: `docs/records/decisions/2026-11-25-work-status-load-read-43842310-f121-42ab-973d-4b72806a0f94.md`; per session: `docs/records/decisions/2026-11-25-work-status-session-load-635500f0-5355-46c2-a37f-93d4cac16afc.md` |

A new field, a signal or a send needs a new decision record.

### Reading agent settings from every scope

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

### Running the person's Claude Code for its session list

The fifth written exception, for Work status only:

| | |
|---|---|
| Run | `claude agents --json`, the first file among `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`; never a `PATH` lookup, an argument or a path from the page |
| How | under `/usr/bin/sandbox-exec` with every network operation denied; environment `HOME` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`; working folder Atlas's app data; no input, error output discarded; its process group is killed when it ends, or after 5 s or 1 MiB |
| When | while Work status is visible, its session-list switch is on (the default) and a Claude Code process is seen: once in 10 s, or 1 s after one appears or ends; one at a time. Switched off, the page asks nothing, Rust holds the choice and refuses an ask, and the last list leaves memory |
| Returned to the page | how the read went (one word of a closed list), and for a session whose folder lies in a listed worktree: the worktree's id, its pid, one of five states and, under Name below, its name |
| Name | read with each list while the session-list switch and Show session names (on by default) are both on; only a string; control and direction-override characters removed, cut to one line of at most 60 characters, never inside a Hangul syllable; empty means no name, and the room says `{tool} {number}`. Held in Rust with the last list and dropped with it, or at once when either switch goes off; the page holds it in view state only and draws it as plain text |
| A name never reaches | a file, a log, error text, storage, a URL, an argument the page sends back to Rust, an agent session, or the network |
| Never read | a session's `sessionId` or `id`; any field outside the documented ones makes its entry unknown |
| Platforms | macOS; no other platform runs it |
| Gate | `src-tauri/src/work_status/agent_sessions/tests.rs` (`the_program_cannot_open_a_connection`, and the planted-name tests of criterion 2 in `docs/specs/2026-11-25-work-status-live.md`); `src/shared/lib/work-status/signals/sessions.test.ts` |
| Record | `docs/records/decisions/2026-11-23-work-status-session-list-no-network-929c2179-7882-4c40-a4bc-83cfbb2612cf.md`; names: `docs/records/decisions/2026-11-25-work-status-session-names-3c8614d6-9b02-4b18-9e12-95d935c9434c.md` |

Another program, argument or variable, or a run without the sandbox, needs a
new decision record.

### Watching the repository's worktrees for file changes

The sixth written exception, for Work status only:

| | |
|---|---|
| Watch | the OS's file-change notices, through the `notify` crate the app already ships, for the folder of each worktree drawn as a room; one watcher for every room; never a shelf worktree's own folder or a folder Git does not list for this repository; a notice from a worktree nested inside a watched folder is dropped, never counted |
| When | while Work status is visible and its Watch file changes switch (on by default) is on; hidden or switched off, no watcher is alive, and switched off, no count is held |
| Counted | a notice whose path is not under `.git`, not under a fixed list of dependency and build folder names, and not ignored by Git; Git gives that verdict through `runner.rs`, at most one call per worktree in 10 s, never twice for one path until that worktree's `.gitignore` changes |
| Kept in Rust memory | per worktree: the time of the last counted change, counts per 10 s step for 60 minutes (99 at most), and a one-way hash of each path Git already judged (4,096 at most) |
| Returned to the page | per worktree: that time, those counts, and whether it is watched |
| Never | a file opened or stat'ed; a name or path from a notice in a payload, log, file or the network |
| Platforms | macOS; no other platform watches |
| Gate | the tests under `src-tauri/src/work_status/file_pulse/` |
| Record | `docs/records/decisions/2026-11-25-work-status-file-change-notices-1c163935-120b-4f73-9c2e-9cf11f023ee3.md` |

Another folder, a kept name or path, or a watch while hidden needs a new
decision record.

### Folder watch is latency, not a missing ability

The app applies the changed paths the OS watcher's `vault-changed` event
carries (0.45–0.61 s from save to map end to end, measured 2026-11-19, most of
it the watcher's 500 ms debounce; a burst past a fifth of the vault walks it).
Underneath it a reread every 60 s and one on window focus catch network drives,
a watcher that failed to start and events the OS dropped. Gate the event-driven
invariant, never milliseconds. Never claim "instant"; prefer "updates
automatically".

## Only the vault is shared

Data that must outlast a session lives in the vault folder, as frontmatter or
`.ontology-atlas/*.jsonl`; `patch_concept(expected_mtime)` guards concurrent
writes. The last-opened folder record (IndexedDB), API keys (app keychain) and
display preferences (localStorage) belong to the installed app alone; never
describe them as part of the vault. The website opens, reads and remembers no
folder and stores no choice; a browser that held a remembered folder from the
old browser workbench has that database (`demo-kv`) deleted at its next visit,
and the folder on disk is not touched.

## Do not build app abilities into the website

An app capability creates no website obligation: no folder picker, key, agent
launch or config write goes onto a public page. Rejected: browser BYOK (keys
exposed to any injected script) and writing agent config from a page (no
absolute path).

An address that is not public answers with the app-only page (`appOnly.*`
messages, `data-testid="app-only-page"`): it says the screen lives in the
installed app, links the download and the sample map, and names the computers
that have an app. It never offers a folder in the browser, and a CSS rule keyed on
`data-shell="desktop"` keeps it from ever painting inside the app.

## Web smoke

`tests/e2e/web-surface-smoke.spec.ts` is the website's only standing signal:
the gateway renders a real map with facts and two live next actions, `/sample`
draws the sample map and "Get the app" opens `/download`, and every app route
shows the app-only page with working links and no rail. It runs in every
nightly browser run and before every stable release; a planned dispatch runs it
for any runtime change, including `src-tauri/**`.

Absence below a viewport breakpoint belongs to
`tests/e2e/design-audits/responsive-overflow-audit.spec.ts`, and a direct URL
must still answer. Proof per surface: `testing.md`, "Verify the app and the
website separately".

## Two distribution channels only

The app bundle, whose connect button writes absolute paths, or a source checkout
whose MCP server runs as `node <checkout>/mcp/src/index.js` and whose only
command, `node <checkout>/cli init`, scaffolds a vault. Neither `ontology-atlas` nor
`ontology-atlas-mcp` exists on npm; `npx ontology-atlas init` is a 404. Code
authority: `src/shared/config/mcp/mcp-server-launch.ts`. Gate:
`tests/contract/release/npm-channel-retired.contract.test.ts`.

### Installing an agent tool for the user

The one installation `forbidden.md` allows. All four conditions must hold: the
user initiates it, sees the exact command first, it installs into an app-owned
location, and the version is pinned. Downloading a Node runtime was approved in
decision (89); any other runtime family needs a new record.
The pinned npx adapter a conversation start fetches into npx's own cache is not
such an install: it is the session launch's own download moved ahead of the
session, for chat-eligible runtimes only
(`docs/records/decisions/2026-11-24-acp-adapter-download-app-owned-d4b27660-5946-4463-a9d1-71f4f65a17da.md`).
