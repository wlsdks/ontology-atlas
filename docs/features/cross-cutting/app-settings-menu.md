---
title: AppSettingsMenu
doc_type: feature
status: current
area: design-system
routes: []
---

# AppSettingsMenu

### `AppSettingsMenu` (app shell + contextual page headers)
- One 880×672 modal sheet (`src/widgets/app-settings-menu`); there is no `/settings` route.
  The left list holds places only, grouped by **where each value lives** (2026-10-02):

  | Group | Panes |
  |---|---|
  | This computer | Screen · language, Map, Expansion, The path you walked, Notifications, Agents, Privacy · data |
  | This folder | Ontology folder |
  | App | About |

  Each pane head ends with where its values live ("Saved on this computer; every folder uses
  it", or "Files in `.ontology-atlas/` move with the folder; Git leaves them out by default").
  Search results carry the same scope word. Retired pane ids map forward (`background` → `map`,
  `update` → `about`). Group labels in the left list use secondary ink at weight 510 above a
  hairline, so they read apart from the rows they head.
- Every pane keeps one start line: the head (title and sentence), group labels, card edges and
  any caption outside a card share the card's left edge; row text sits inside the card
  (`tests/e2e/settings-reading.spec.ts`, at 1040 and 1440).
- **Panes** (`ui/panes/`): Screen · language (language, view mode on every screen, text size
  Default / Large / Larger, concept icons, Motion status, screen guides); Map (background,
  drag and zoom speed, INDEX default only where the map injects it, frame meter On · Off);
  Agents (When an agent writes a wiki page, app only; door rows to Coding tools, Models · API
  keys with the Keychain key count, and MCP); Privacy · data (what can leave this computer
  as aligned columns: when it happens, whether it carries folder content, whether Atlas records
  it, and every destination host as a chip, with the audit log path once below the list;
  allowances on this computer, recent folders, each forget behind a two-press `ArmedChip`);
  Ontology folder (folder, path, shape, documents, import, and what the folder keeps: agent
  connections (MCP), schedules, Git, project sources); About (current app or website version,
  automatic update check On · Off, what's new, keyboard shortcuts, source, licences, copy
  diagnostics, show log folder).
- **Search** sits at the head of the left list. Typing replaces the pane with results grouped
  by pane; ↑ ↓ move, Enter opens, Escape clears the query before it closes the sheet. A setting
  result opens its pane, scrolls to the row and focuses its control; a door result leaves in one
  press (typing "API", or the Korean word for key, then Enter reaches Agents → Models). Ranking: label start, a word
  start in the label, the label anywhere, keywords, then the pane name; Hangul-aware, catalog
  order within a tier, at most 30 results. The web never offers an app-only row.
- **⌘,** (Ctrl+, off macOS) asks a visible settings trigger to open the sheet
  (`requestSettingsOpen`); on an open sheet it focuses search. The shortcut sheet lists it.
- The sheet is a modal like every `<Dialog>` (2026-09-25): opened by a click it takes focus itself, so Escape and Tab work at once, and a click on the dim beside the panel closes it and returns focus to the gear. Only the open sheet owns Escape (2026-09-26).
- Drag speed and zoom speed are five-step segmented rows (0.5×–2×, default 1×), stored per machine (`atlas.appearance.map-drag-speed`, `atlas.appearance.map-zoom-speed`); what each speed changes is in [Canvas](../map/canvas.md).

#### Adding a setting

1. Decide the scope. A computer-scoped value is a `definePreference` in
   `src/shared/lib/preferences/<name>.ts` (key `atlas.<area>.<name>`). A folder-scoped value is a
   file under `.ontology-atlas/` through an entity store that calls `ensureSidecarIgnore`. A
   secret goes in Keychain through a `tauri-*` bridge. Never IndexedDB, which holds the folder
   handle only.
2. Register the key in `tests/contract/scope-registry.contract.test.ts`.
3. Render the row with `settingId` (it becomes `data-setting-id`) in its pane under `ui/panes/`,
   and add a catalog entry in `model/catalog/<section>.ts`. Copy goes in the pane's message
   namespace. `tests/contract/settings-catalog.contract.test.ts` fails when the two disagree.
4. If the setting changes what can leave the computer, add or update the row in
   `model/outbound-paths.ts`; the outbound contract fails otherwise.
5. App-only rows set `surface: 'desktop'` and are not drawn on the web.
6. Update this page. Add a decision record when the setting moves a boundary (transfer, agent
   write) or a design spec.

- **AI Connection** (`AiConnectionPanel`, 2026-07-26; moved to Agents → Models as
  `ModelConnectionsPanel` on 2026-09-25, the sheet keeps a door row in its Agents pane) — a second drill-in row for
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
- **Runtime** (`AcpRuntimeSettings`, 2026-08-16, desktop app only; it lives on the Agents destination) — A section where the app finds and displays coding agents (Claude Code, Codex, etc.) already installed on this computer. The one thing this section does is **tell you what can be used right now**.
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
