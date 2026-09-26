---
title: AppSettingsMenu
doc_type: feature
status: current
area: design-system
routes: []
---

# AppSettingsMenu

### `AppSettingsMenu` (app shell + contextual page headers)
- The sheet is a modal like every `<Dialog>` (2026-09-25): opened by a click it takes focus itself (WebKit does not focus the clicked gear), so Escape and Tab work at once, and a click on the dim beside the panel closes it and returns focus to the gear. A drag that starts in the panel and ends over the dim does not close it.
- Only the open sheet owns Escape (2026-09-26). With the sheet closed, Escape pressed on the gear reaches the page, so on the map it runs the map's own Escape order as it does from every other map control.
- Accent swatches display their own existing palette under either selected app accent. Notification kinds wrap below their full-width explanation instead of compressing that explanation beside six controls.
- The old 5-tab settings modal is now one compact settings sheet
  (`src/widgets/app-settings-menu`): screen controls, workspace, and the AI
  agent entry are scanned in one column. `LocaleSwitch` is an immediate screen
  control; the long MCP connection proof stays behind the AI agent drill-in.
- **AI Connection** (`AiConnectionPanel`, 2026-07-26; moved to Agents → Models as
  `ModelConnectionsPanel` on 2026-09-25, the sheet keeps a pointer row) — a second drill-in row for
  your own API key: store it in the operating-system credential store (desktop only), check the
  connection with a request that carries **0 vault characters**, and read the
  tail of `.ontology-atlas/llm-audit.jsonl` where every call is recorded. The
  key is written once and never readable back (only its last 4 characters);
  the Rust side refuses to send at all when the audit line cannot be appended
  (log-before-send). Audit writes reject symbolic/hard-linked and non-regular files, hold one
  exclusive reservation per vault, and recheck the reserved tail before
  finalizing; existing audit files are narrowed to owner-only `0600`. This
  native LLM path is currently enabled only on Unix/macOS;
  the public Windows beta fails closed until equivalent reparse-point and
  file-identity proof exists (the map, vault, and bundled MCP remain available).
  In the browser the key field is not rendered — the card
  explains why storage is desktop-only and links to `/download`. There is no
  chat surface: the panel says in plain words that asking your vault is still
  being shaped.
  - **Named vendors: Anthropic · OpenAI · Google Gemini — frozen at three.**
    All three share one concept (paste a key → OS credential store → last 4 → check), so
    the third costs the reader nothing new. A fourth is admitted only when it
    both (a) uses an auth protocol that a Bearer-compatible arm cannot absorb
    and (b) has demand evidence; every other vendor is meant for the
    user-typed-address arm, which ships together with the feature that
    consumes it. Gemini authenticates through the `x-goog-api-key` header —
    never the documented `?key=` query form, because a URL is a place that
    gets logged.
  - **Connect by Address — Models Running on My Computer (2026-08-01).** Below
    the three named vendors, the fourth row is not a specific vendor but a single
    **entry point** that accepts any runner (runner = the program actually executing the model). Enter the runner address
    (default `http://localhost:11434`) and press [Check Connection]; this single request
    answers three things together: "Is it alive? · Does it speak in OpenAI-compatible format? · Which models can be selected?". Installed models arrive as a list, so the user **only needs to choose** (no typos from typing names). No API key is needed — this branch bypasses the key vault entirely. Ollama · LM Studio · llama.cpp server · vLLM all enter through this single entry point (addresses use OpenAI-compatible `/v1/*`. If each runner required a unique custom API, separate conversion code would have been needed for each runner).
    - **Different messages are shown for each failure reason** — distinguishing cases where the runner is down (connection itself fails), another program is running on that port (404), or no models are installed, and noting what to do next for each.
    - **Unencrypted `http` is allowed only within this machine (loopback).**
      To point to an external machine, `https` is required, and addresses containing username/password are rejected — because the address remains in logs as-is.
    - **"Does not go out" is stated only when true.** If the address points to this computer, it writes "It does not leave this computer, and the log records the destination as `localhost:11434` — that is proof it did not leave." If the user points to another machine via `https`, this sentence is replaced with "This address is outside this computer."
    - This branch cannot be used in web browsers (browser pages cannot send requests to the user's computer localhost). Therefore, a card stating "Not available here" explains the reason **separately** from the API key vault story and links to `/download`.
  - Every recorded call names its destination host. The audit line carries
    `host` (e.g. `generativelanguage.googleapis.com`), and the screen states
    that host before you press check — the strongest claim we can prove for a
    named vendor is "it only goes to the official address compiled into the
    code". `host` was added without bumping the schema `v`, so lines written
    before it exist read back fine with a `null` destination.
  - Unregistered vendors collapse to a one-line `name · [Add key]` row that
    expands in place, one at a time — three always-open password fields would
    turn a settings sheet into a form gate.
- **Runtime** (`AcpRuntimeSettings`, 2026-08-16, desktop app only) — A section where the app finds and displays coding agents (Claude Code, Codex, etc.) already installed on this computer. The one thing this section does is **tell you what can be used right now**.
  - The list splits into two branches: "Ready to use" is expanded, while "Requires installation" is collapsed. Reasons for not being usable are split into four categories: requires installation / needs Node / needs uv / manual installation. Since the user's task differs per category, they are not lumped together as just "installed/not installed." Press [Re-check] to scan again at any time.
  - **The list comes from an ACP registry snapshot committed at build time**
    (`src-tauri/src/acp-registry.json`, `scripts/build-acp-registry.mjs`,
    updates via `pnpm acp:registry`). It does not call a CDN at runtime, so the list remains available offline, and changes are recorded in git diff. Icons are also fetched at build time and bundled in `public/acp-icons/` for the same reason (since the registry spec uses 16×16 monochrome SVGs, brand colors do not enter the app).
  - **In-app chat requires an app-owned permission gate.** Claude Agent qualifies through an isolated `CLAUDE_CONFIG_DIR` and linked existing credential. Codex qualifies through the newest upstream `@agentclientprotocol/codex-acp` adapter (1.10.0 as of 2026-09-07), isolated `approval_policy = "on-request"`, a forced `read-only` mode that since 1.8.0 is a workspace-write sandbox, and the server-owned Atlas write-consent checkpoint. Direct writes inside the vault may land without a card and are undone through Git (owner direction, 2026-09-07); Atlas MCP writes still ask, and both injected and self-registered Atlas MCP writes wait for `reject_once` or `allow_once`; every `allow_once` is consumed by one request.
  - **Atlas MCP and provider traffic are separate boundaries.** The Atlas MCP server is a local stdio child with no daemon, port, or network request. The coding agent using it may send prompts, context, and tool results to its own provider.
  - Modes measured to remove the permission gate are hidden. Unmeasured modes remain explicitly unverified; they are never treated as safe by default.
  - Processes cannot be launched in browsers. On the web, a single line explaining why it doesn't work and where it does replaces the list.
- The persistent shell mounts the rail settings trigger. Current agent work is
  exposed by `AgentActivityChip` in Topology's contextual map controls, while
  `AgentActivitySettings` controls its visibility and notifications in the
  settings sheet; neither is a navigation destination.
