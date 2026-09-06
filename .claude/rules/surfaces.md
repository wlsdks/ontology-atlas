---
paths:
  - "src/shared/lib/tauri-*.ts"
  - "src/entities/vault-session/**"
  - "src/features/docs-vault-local/**"
  - "src-tauri/**"
  - "tests/e2e/**"
  - "src/shared/config/mcp-server-launch.ts"
  - ".github/workflows/**"
---

# Surface contract — web and app

> Conditionally loaded for desktop bridges, Tauri source, and e2e. Authority:
> `docs/DECISIONS.md`, 2026-07-27, “web and app do not promise identical
> screens.” Architecture: `docs/ARCHITECTURE.md`, “Surface contract.”

## One job per surface

A **surface** is a place where someone meets the product: the installed macOS
app or the website. The **workbench** is where daily work happens; the
**gateway** is the no-install entrance for a first look.

- **App:** the vault's home. A person reads and judges the map, connects in-app
  ACP agents and external MCP agents, and reviews their work.
- **Web:** first the gateway—a demo, first five minutes, or shared link. Second,
  a fallback workbench on systems without an app or where installation is
  blocked. It reads and edits the same folder; it does not install an agent.

Gateway comes first. In the 14 days measured on 2026-07-27, all 35 unique
visitors arrived through the web and no Windows user was observed. Calling web
only a Windows substitute deprioritizes the sole observed entrance. A future
Windows app may reduce the fallback-workbench job, but cannot replace links and
no-install access.

## One build, not two codebases

Tauri loads the same static export from `out/`
(`src-tauri/tauri.conf.json`, `frontendDist: "../out"`). The surfaces differ at
thin capability bridges, not copied route trees. A bridge invokes the native
ability in the app and returns absence on the web; the UI then removes the
action or renders an honest degradation card stating why and where it works.

| Capability | Bridge | Web behaviour |
|---|---|---|
| Vault absolute path | `src/shared/lib/tauri-vault-fs.ts` | FSA handle instead; no absolute path |
| Git | `src/shared/lib/tauri-git.ts` | unavailable; degradation card |
| Keychain | `src/shared/lib/tauri-secrets.ts` | impossible in a browser; degradation card |
| LLM call | `src/shared/lib/tauri-llm.ts` | impossible; action not rendered |
| Agent setup | `src/shared/lib/tauri-agent-setup.ts` | cannot write a ready config without an absolute path; degradation card |
| ACP runtime | `src/shared/lib/tauri-acp.ts`, `src-tauri/src/acp.rs` | cannot spawn a process; degradation card. A user may still attach an externally launched agent to the folder |
| Connector discovery | `src/shared/lib/tauri-connectors.ts`, `src-tauri/src/connectors.rs` | cannot read `~/.claude.json` or `~/.codex/config.toml`; degradation card. Adding a connector by hand still works, and the list lives in the vault folder |
| Connector secrets | `src/shared/lib/tauri-connector-secrets.ts`, `src-tauri/src/connector_secrets.rs` | no keychain in a browser; degradation card. The reference is resolved into the outgoing ACP line in Rust, so the WebView never holds a token |
| Connector runtimes | `src/shared/lib/tauri-connector-runtimes.ts`, `resolve_connector_runtimes` in `src-tauri/src/connectors.rs` | cannot look at `/opt/homebrew/bin`; the by-hand form falls back to the typed absolute path it always had, with its hint. **Not a degradation card** — the ability is unchanged, only the convenience is missing, and a card would claim the browser cannot attach a program when it can |
| Folder watch | `start_vault_watch` in `src-tauri/src/lib.rs`, `TauriVaultWatchBridge.tsx` | periodic reread: 1,500 ms after a burst, 5,000 ms while idle; delayed, not unavailable |
| Library sources | `src/shared/lib/tauri-vault-fs.ts`, `src-tauri/src/library.rs` | different means, same ability: `showOpenFilePicker` picks and the vault handle writes, `crypto.subtle` hashes. Not a degradation — the app path exists because `read_vault_binary_file` would move a whole document across IPC to produce 64 characters |
| Discovery outside the folder | `discover_source_candidates` in `src-tauri/src/library.rs` | the open folder is walked either way; a **bound project root** is an absolute path a browser does not have. Degradation card `find-documents-web-limit` states the narrower claim and links to `/download/` |
| Reveal a file in Finder | `reveal_vault_file` in `src-tauri/src/library.rs` | no Finder; the browser hands over the file it was granted instead. Reveal, never launch — Atlas starts no program on somebody's behalf |

Every new desktop capability uses the existing `getInvoke()`/`isTauri()`
convention. Do not create a parallel router or surface fork.

### Reading the person's agent config files (2026-09-05)

`.claude/rules/local-first.md` refuses reads outside the vault and names this as
its one written exception. Attaching an external MCP server means naming a
command, its arguments and its environment, and almost everyone who wants that
has typed it once already — so the app reads what they registered rather than
asking them to retype it, which is how a connector ends up pointing at a path
that does not exist.

The exception is exactly this, and nothing wider:

| | |
|---|---|
| Files | `~/.claude.json` (user scope plus **only** the open folder's `projects[<path>]` block), `~/.codex/config.toml`, `~/.cursor/mcp.json`, and the open folder's `.mcp.json` |
| Returned | server name, transport, command and arguments or URL, and environment/header **key names** |
| Never returned | any `env` or `headers` **value**, and any other file |
| Direction | read only; `discovery_never_writes_anything` fails the build if a writer appears in that module |
| Gate | `no_env_value_survives_serialization` in `src-tauri/src/connectors.rs`, asserted against the serialized payload rather than the struct |

Those files hold API tokens in plain text, which is why the boundary is drawn at
key names and pinned by a test rather than by care. A fifth file, or a value,
needs a new decision record — not an edit here.

`resolve_connector_runtimes` (2026-09-07) sits beside that exception without
widening it. It answers a **fixed five-name allow-list** — `npx`, `node`, `uvx`,
`python3`, `docker` — with an absolute path or nothing, reusing `acp.rs`'s own
search order. It opens no file, enumerates no directory, takes no name from the
caller, and **executes nothing**: running `npx --version` to prettify a row would
be Atlas starting somebody else's program on its own initiative, which is a
different act from a person pressing a button. `discovery_never_writes_anything`
and `the_runtime_allow_list_is_fixed_and_small` in that module pin both halves.

A connector's own token never joins them. It lives in the OS keychain
(`src-tauri/src/connector_secrets.rs`) and becomes a value inside Rust one line
before it leaves for the agent, so neither the WebView nor
`.ontology-atlas/connectors.json` ever holds one.

### Folder watch is latency, not degradation

The web eventually sees file changes; only timing differs.

| | App | Web |
|---|---|---|
| Detection | OS `notify` watcher, 500 ms debounce | periodic folder reread |
| Visible update | 1.6–2.0 s on a measured 71-file vault | 1.5 s just after activity, 5 s while idle |
| Hidden tab | continues watching | pauses rereads |

The old “about 0.5 seconds” claim named only the debounce, not the subsequent
full reread and compile. Installed-app measurement on 2026-08-08 remained at 71
documents after 0.7, 1.2, and 1.6 seconds, and reached 72 at 2.0 seconds twice.
The app is event-driven rather than uniformly faster: it avoids the quiet
five-second interval and watches hidden tabs.

Do not gate milliseconds across machines. Gate the invariant that the app
refreshes from `vault-changed`, not polling. Large-vault latency belongs in
incremental rereading, not marketing copy.

Do not add folder watch to `DEGRADED_SURFACES`; every row there means the browser
cannot perform the ability and `/download/` is the remedy. That claim is false
for delayed updates. Never put “instant” over a web demonstration, and prefer
“updates automatically” over an app claim the measured 1.6–2.0 seconds refutes.

## Only the data is shared

**Contractually shared:**

| Item | Guarantee |
|---|---|
| Source data | Web and app read and write the physically same Markdown folder |
| Parsing | Web, MCP, and scripts agree through contract tests; `mcp/src/schema.mjs` owns the schema |
| Agent records | `.ontology-atlas/activity.jsonl` and `llm-audit.jsonl` remain plain text inside the vault |
| Overwrite protection | `patch_concept(expected_mtime)` rejects a write after another surface changed the file |

**Deliberately not shared:**

- The last-opened folder handle lives in each surface's IndexedDB. It is a
  convenience, not source data. `/download` step 02 explains the app's first
  folder prompt.
- API keys stay in the app keychain; display preferences stay in localStorage.
- Browser support differs. FSA works in Chrome, Edge, Safari 18.2+, and Opera;
  Firefox receives an honest unsupported state.
- Concurrent-editing ergonomics are not promised. The mtime guard protects data,
  not a smooth multi-person workflow.

> Data that must cross surfaces lives inside the vault folder, as frontmatter or
> `.ontology-atlas/*.jsonl`.

Do not claim cross-surface state is shared when it lives in browser- or app-only
storage.

## Do not backfill every app ability onto web

An app capability creates no automatic obligation to build a web copy. That
obligation was retired in 2026-07-27 after four app-only deliveries: keychain,
bundled MCP, updater, and Git.

Explicitly rejected:

- **Browser BYOK.** Browser storage exposes keys to one injected script, and the
  provider header itself calls direct browser access dangerous. Revisit only if
  providers make direct browser calls an officially supported path.
- **Writing agent config from web.** A browser lacks the absolute path and cannot
  safely write `.mcp.json`. This does not mean web users cannot connect agents:
  MCP attaches to the folder, not the Atlas screen. `WebManualConnectPanel.tsx`
  asks for the path and renders config locally without sending or saving it.

A degradation card states:

1. why the ability is unavailable;
2. where it works, usually `/download/` or one CLI command;
3. what remains possible on the current surface.

Good examples: `atlas-git-web-get-app`, `ai-connection-web-degraded`, and
`first-run-starter-unsupported`. “Coming soon” is not an explanation. Saying an
available path is unavailable is the opposite but equal lie.

## Verification matrix

| Target | Proof |
|---|---|
| Shared map, docs, insights, and project screens | Browser proof covers the common bundle. Recheck the installed app only for font rendering, scrolling, or window chrome |
| App-only keychain, Git, updater, and path abilities | Installed-app evidence only |
| Web surface | The three cases in `tests/e2e/web-surface-smoke.spec.ts` |

Links between surfaces are useful but do not promise identical reconstruction.

## The three web smoke cases

`tests/e2e/web-surface-smoke.spec.ts` proves:

1. **Gateway:** a vault-less first visit renders a real map, non-zero facts, and
   two live next actions.
2. **Fallback workbench:** selecting a fake folder actually reads it and reports
   the right node/edge counts; unsupported FSA explains why and where to go.
3. **Honest degradation:** every registered app-only ability gives a reason and
   a destination that opens; no dead button remains.

The `Web surface smoke` job in `.github/workflows/e2e.yml` runs under a broader
condition than the rest of e2e: any runtime change, including `src-tauri/**`,
triggers it. Add every new app-only ability to `DEGRADED_SURFACES`.

### Capability absence and viewport absence are different

`DEGRADED_SURFACES` contains only web-versus-app absence. A feature hidden below
a viewport breakpoint still exists on wide web and belongs to responsive tests,
not that registry. Mixing them would falsely claim the web cannot perform it.

`tests/e2e/responsive-overflow-audit.spec.ts` owns viewport absence. The same
“why + where” rule applies, but the remedy may be widening the window or using a
neighbouring screen rather than `/download/`. Navigation removal alone is not
sufficient: a direct URL must also provide an answer instead of becoming a trap.

## Two distribution channels only

Authority: the 2026-07-27 decision that bundled MCP in the app and retired npm
publication. Code authority: `src/shared/config/mcp-server-launch.ts`.

Users obtain Atlas through the app bundle, whose connect button writes absolute
paths, or a source checkout using `node <checkout>/cli/src/index.mjs`. Neither
`ontology-atlas` nor `ontology-atlas-mcp` exists on npm. `npx ontology-atlas init`
is a 404, not a future path.

### Installing an agent tool for the user (2026-08-20)

`.claude/rules/forbidden.md` prohibits a plugin marketplace inside Atlas, and
this is the one installation it does allow. The app may install
an agent CLI only when all four conditions hold: the user initiates it, sees the
exact command first, installation stays in an app-owned location, and the version
is pinned. Missing any condition forbids the action. Downloading a Node runtime
was separately approved in decision (89); later runtime families need a new
record. Evidence and losing dissent: ledger 2026-08-20 (88) and (89).

### Contract beyond lint

| Rule | Gate | Why lint cannot see it |
|---|---|---|
| Human-facing current docs contain no dead npm command | `tests/contract/npm-channel-retired.contract.test.ts` | Violations live in Markdown, issue-template YAML, and release drafts outside JS/TS lint |

The gate scans current instruction surfaces, not archived history. In strict
surfaces, any dead command is forbidden; in explanatory docs it is forbidden
only inside code blocks, where readers are invited to run it. Self-probes cover
six violations plus valid live paths and honest explanations.

## Falsifiers

- If web smoke remains red for two weeks or a visitor reports a broken web
  surface, widen its three cases.
- If visits rise but downloads stay zero specifically because a capability is
  missing on web, reconsider the web's job rather than polishing degradation copy.
- When Windows traffic or support requests appear, put a Windows app on the
  roadmap instead of restoring browser BYOK.
