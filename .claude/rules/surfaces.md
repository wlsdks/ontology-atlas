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
  agent. Every app address opened in a plain browser shows one page, "Ontology
  Atlas runs in the installed app", with links to the download and the sample.

## One build, thin bridges

Tauri loads the app folder, the Vite bundle without the website's `/download`
and `/sample` pages and its media (`frontendDist`, checked by
`scripts/desktop/check-app-folder.mjs`); the website
is the same bundle plus its prerendered pages, so the installed app and the
website run one bundle. A bridge calls the native ability
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

Reads, runs and writes outside the vault are written exceptions, each with its
gate and record, in `.claude/rules/surface-exceptions.md`.

### Folder watch is latency, not a missing ability

The app applies the changed paths the OS watcher's `vault-changed` event
carries (0.45–0.61 s from save to map end to end, measured 2026-11-19, most of
it the watcher's 500 ms debounce; a burst past a fifth of the vault walks it).
Underneath it a reread every 60 s and one on window focus catch network drives,
a watcher that failed to start and events the OS dropped. Gate the event-driven
invariant, never milliseconds. Never claim "instant"; prefer "updates
automatically".

## Only the vault is shared

Data that agents and other programs read lives in the vault folder, as frontmatter or
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

An ability that works on macOS only and is missing on Windows says so
honestly: a short line states why it is unavailable, where it works, and what
remains possible on Windows. "Coming soon" is not a reason, and calling an
available path unavailable is equally false.

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
