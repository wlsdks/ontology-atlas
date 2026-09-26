---
paths:
  - "src/shared/lib/tauri-*.ts"
  - "src/entities/vault-session/**"
  - "src/features/docs-vault-local/**"
  - "src-tauri/**"
  - "tests/e2e/web-surface-smoke.spec.ts"
  - "tests/e2e/responsive-overflow-audit.spec.ts"
  - "src/shared/config/mcp-server-launch.ts"
  - ".github/workflows/e2e.yml"
---

# Surface contract — web and app

Authority: `docs/DECISIONS.md`, 2026-07-27, "web and app do not promise
identical screens"; narrative in `docs/ARCHITECTURE.md`, "Surface contract".
This file owns the bridge roster and the rules for adding to it.

## Jobs

- **App:** the vault's home. A person reads and judges the map, connects in-app
  ACP agents and external MCP agents, and reviews their work.
- **Web:** first the no-install gateway (demo, first minutes, shared link);
  second a fallback workbench where the app is unavailable. It reads and edits
  the same folder and never installs an agent.

## One build, thin bridges

Tauri loads the same static export (`frontendDist: "../out"`). Surfaces differ
only at capability bridges: a bridge calls the native ability in the app and
returns absence on the web, and the UI then removes the action or shows a
degradation card. Every new desktop capability uses `getInvoke()`/`isTauri()`;
never a parallel router or surface fork.

| Capability | Bridge | Web behaviour |
|---|---|---|
| Vault absolute path | `src/shared/lib/tauri-vault-fs.ts` | FSA handle; no absolute path |
| Git | `src/shared/lib/tauri-git.ts` | degradation card |
| Keychain | `src/shared/lib/tauri-secrets.ts` | degradation card |
| Jev evidence check (experimental) | `src/shared/lib/tauri-jev.ts`, `src-tauri/src/jev.rs` | covered by the models tab's degradation card |
| LLM call | `src/shared/lib/tauri-llm.ts` | action not rendered |
| Agent setup | `src/shared/lib/tauri-agent-setup.ts` | degradation card; no absolute path to write a config |
| ACP runtime | `src/shared/lib/tauri-acp.ts`, `src-tauri/src/acp.rs` | degradation card; an externally launched agent can still attach |
| Connector discovery | `src/shared/lib/tauri-connectors.ts`, `src-tauri/src/connectors.rs` | degradation card; adding one by hand works and the list lives in the vault |
| Connector secrets | `src/shared/lib/tauri-connector-secrets.ts`, `src-tauri/src/connector_secrets.rs` | degradation card; Rust resolves the token into the outgoing ACP line, so the WebView never holds it |
| Connector runtimes | `src/shared/lib/tauri-connector-runtimes.ts`, `resolve_connector_runtimes` in `src-tauri/src/connectors.rs` | typed absolute path; **not** a degradation card, because only a convenience is missing |
| Folder watch | `start_vault_watch` in `src-tauri/src/lib.rs`, `TauriVaultWatchBridge.tsx` | periodic reread (`poll-cadence.ts`); delayed, not unavailable |
| Library sources | `src/shared/lib/tauri-vault-fs.ts`, `src-tauri/src/library.rs` | same ability by other means (`showOpenFilePicker`, `crypto.subtle`); Rust hashes whole scans so files do not cross IPC |
| Discovery outside the folder | `discover_source_candidates` in `src-tauri/src/library.rs` | degradation card `find-documents-web-limit`; a bound project root is an absolute path |
| Reveal a file in Finder | `reveal_vault_file` in `src-tauri/src/library.rs` | hands over the granted file; reveal, never launch |

### Reading the person's agent config files

The one written exception to `local-first.md`'s rule against reads outside the
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

### Folder watch is latency, not degradation

The app refreshes on the OS watcher's `vault-changed` event (1.6–2.0 s end to
end, measured); the web rereads the folder (1.5 s after activity, 5 s idle,
paused in hidden tabs). Gate the event-driven invariant, never milliseconds. Do
not add folder watch to `DEGRADED_SURFACES`, never claim "instant" on the web,
and prefer "updates automatically" for the app.

## Only the vault is shared

Cross-surface data lives in the vault folder, as frontmatter or
`.ontology-atlas/*.jsonl`; `patch_concept(expected_mtime)` guards concurrent
writes. The last-opened folder handle (IndexedDB), API keys (app keychain) and
display preferences (localStorage) are per surface; never describe them as
shared. FSA works in Chrome, Edge, Safari 18.2+ and Opera; Firefox gets an
honest unsupported state.

## Do not backfill app abilities onto the web

An app capability creates no web obligation. Rejected: browser BYOK (keys
exposed to any injected script) and writing agent config from the web (no
absolute path; `WebManualConnectPanel.tsx` renders the config locally instead).

A degradation card states why the ability is unavailable, where it works
(usually `/download/` or one CLI command), and what remains possible here, as
in `atlas-git-web-get-app` and `ai-connection-web-degraded`. "Coming soon" is
not a reason, and calling an available path unavailable is equally false.

## Web smoke and the degradation registry

`tests/e2e/web-surface-smoke.spec.ts` is the web's only standing signal: the
gateway renders a real map with facts and two live next actions; the fallback
workbench reads a fake folder with correct counts; every `DEGRADED_SURFACES`
entry gives a reason and a destination that opens. Add every new app-only
ability to `DEGRADED_SURFACES`. Its CI job runs for any runtime change,
including `src-tauri/**`.

`DEGRADED_SURFACES` holds only web-versus-app absence. Absence below a viewport
breakpoint belongs to `tests/e2e/responsive-overflow-audit.spec.ts`, and a
direct URL must still answer. Proof per surface: `testing.md`, "Verify web and
app separately".

## Two distribution channels only

The app bundle, whose connect button writes absolute paths, or a source checkout
run as `node <checkout>/cli/src/index.mjs`. Neither `ontology-atlas` nor
`ontology-atlas-mcp` exists on npm; `npx ontology-atlas init` is a 404. Code
authority: `src/shared/config/mcp-server-launch.ts`. Gate:
`tests/contract/npm-channel-retired.contract.test.ts`.

### Installing an agent tool for the user

The one installation `forbidden.md` allows. All four conditions must hold: the
user initiates it, sees the exact command first, it installs into an app-owned
location, and the version is pinned. Downloading a Node runtime was approved in
decision (89); any other runtime family needs a new record.
