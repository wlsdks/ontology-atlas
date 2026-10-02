---
title: Agents
doc_type: feature
status: current
area: agents
routes: [/agents]
---

# Agents

### `/agents` — Agents (the default tab)

The page's tabs are Agents, Models and MCP, in the order of
`src/views/agents/lib/agents-tab-state.ts`. `?tab=` selects one; a missing or unknown value opens Agents.

**One sentence on what this screen does**: **Get · install · attach · fix · and start conversation with** the AI coding tool on this computer.

Opening a conversation preserves the selected runner across the quick detection and subsequent login scan. A temporarily empty usable-runner list does not replace the requested tool with the first later result. The existing readiness and isolation checks still apply.

- **List** — Tools actually verified on this device are shown first, others are collapsed.
- **Connection check** — Re-evaluate eight steps (does tool exist · can it launch · does it ask outside folder · is downloaded item intact · app-side settings · credential link · old login records · login). **Fixable things are fixed right there.** For unfixable ones, write what the human needs to do.
- **App-specific installation** — Downloads Node and tools only inside the app folder. Fixes versions, and after downloading Node, **compares hashes** (if mismatched, delete and stop). Shows the original text before executing anything. Progress and completion remain on screen — even if you close and reopen the window.
- **Reconnection** — Deletes only what the app created and recreates it. This is not "logout": this app has no app-side login, and links to the login the user did in the terminal, using it as-is.

**Why it came out of settings**: Settings is **where you choose values**, and this is **an operational task with progress state**. A modal blocks the background and owns Esc, preventing you from seeing the map while receiving 52MB. **Workspaces remain in settings** (the axis a vault answers is different). API keys live in the Models tab below.

**On the web**: The screen still appears, but states why it can't do what the browser can't (launching programs on this computer) along with the reason. It's not "Connection unavailable" — MCP is **attached to the folder**, not the screen, so web users are also connected. That row names the place: the MCP tab on the same strip, one press away, so the sentence carries no link (the settings sheet, which has no strip, still does).

The page wears `PAGE_FRAME_FORM`, and the frame carries the desktop bottom breath itself.

The folder's own MCP connection and the connectors live in the MCP tab. This tab keeps the runner list, the connection checks, the app-only install and repair, and opening a conversation.

Only the tools Atlas confirmed on this machine are listed inline. The rest open in a dialog with a search field and a scrolling list — the same dialog primitives the connector dialog uses, so setting up a coding tool and attaching an MCP server feel like one product.

### `/agents?tab=models` — Models

**One sentence on what this screen does**: which model the conversation beside the map calls,
and with whose key. The strip reads Agents | Models | MCP. Decision:
`docs/records/decisions/2026-09-25-agents-models-tab-1935d5cf-3a40-4a69-b8f0-f62b4eb4b3ff.md`.

- **Local models** — Ollama (`localhost:11434`), LM Studio (`localhost:1234`), llama.cpp
  (`localhost:8080`) and a typed address, one row each. The conversation uses one saved runner
  (`local-endpoint.ts`); the row in use names its model beside its address and reads "saved"
  in grey until a check turns it green. Nothing is probed on arrival: a row nobody checked says
  "not connected", and after Check it says the runner answered with N models, answered with
  none, answered as another program, or did not answer. A check belongs to the address it asked,
  and checking any address other than the saved one saves nothing until a model is picked there,
  so the working runner keeps answering.
- **API keys** — Anthropic, OpenAI and Gemini in the Keychain: add, check (a request with 0
  folder characters to the named host, offered only when a folder is open to record it),
  replace, and a two-press remove. Only the last four characters are ever drawn (a screen
  reader hears "key ending …"); a pasted draft lives only while its row is open.
- **External check** — the Jev evidence check, labelled experimental: a separate Keychain key,
  a pasted claim and passage (held read-only while a request is out), the exact JSON request on
  screen before the one press that sends it to `api.typesafe.ai` (the Rust bridge refuses any
  other shape and runs off the main thread), an audit line reserved first that counts pasted
  characters, never folder data, and an advisory answer that writes nothing. Guide:
  `docs/guide/external-judgment.md`.
- **Sent log** — one line with the whole count of Atlas's own transfers in
  `.ontology-atlas/llm-audit.jsonl` (coding agents talk to their providers themselves and are not
  in it), the newest five transfers, and a Finder button that selects the file once it exists.
  Native connection checks, model replies and Jev checks capture at most 4 MiB of
  response output and 64 KiB of diagnostics per request. Larger outputs fail;
  a truncated reply is never returned as a successful answer. Credentials and
  request content still travel to curl through stdin, with an audit reservation
  before sending.
- **Web** — the tab exists and shows the desktop-only card (why, and the app download); no
  sample rows. Settings keeps a single "Models · API keys" pointer row, and the map dock's
  no-key button opens this tab. Every way a row closes returns focus to its opener, and results
  are announced once through one polite live region.

### `/agents?tab=mcp` — MCP

**One sentence on what this screen does**: everything MCP — the folder's own server
(share this folder with a coding tool) and the external connectors an in-app agent may
reach — as the third tab of the Agents page, in two groups stacked under one strip.
The strip is the page's own, under the title, so one question is on screen at a time.
`?tab=mcp` selects the tab and `?mcp=connectors` scrolls to the
connectors group; `/mcp/` and `/mcp/?tab=connectors` redirect in with every parameter
kept, so the installed app's `ontology-atlas://mcp?install=…` deep link still opens the
connectors dialog. The rail has no MCP tile; `g c` lands here.

- **Share this folder** — one row per tool: the tool's mark, its name, the file it writes, and on the right
  the one control in that tool's own state (connect, copy, or ready). A row whose file exists
  but belongs to another tool says so in warning tone instead of its path. What Atlas cannot
  know on its own — did you restart it, did it attach — opens from the group heading as one
  dialog holding the restart step, the connection status those files add up to, the
  first-contact proof packet an agent pastes to prove it attached, and the former
  "Not working?" fold (file status, CLI verification, connecting from another code folder).
  The server-lifetime sentence and the folder-root note wait in a hint beside the heading.
- **Connectors** — the attached list: one line per connector carrying the service mark, the name,
  what will actually run, the switch, and one more-actions button; that button's dialog holds the
  keychain fields and removal, and removal confirms first because forgetting a token cannot be
  undone. Adding opens one blocking dialog that searches what this machine already registers and
  takes a by-hand entry.
  A row wears a service's own mark **only where that service's published brand guideline was read
  and permits monochrome use to show an integration** — GitHub. Simple Icons is CC0, but CC0
  waives copyright and not trademark, so every other service falls back to the generic connector
  glyph rather than to an assumption that nobody would mind.

**On the web**: the whole screen works, because MCP attaches to **the folder**, not to
an Atlas screen. Two halves are app-only and each says so where it is missing — reading
what this machine already registers, and keeping a token in the OS keychain.

#### Connectors — the external MCP servers a folder may reach

**One sentence**: attach an outside MCP server — Notion, GitHub, Atlassian, or one
somebody wrote themselves — so the in-app conversation's agent can use it beside the
vault server.

- **Atlas runs none of them.** The descriptor is passed into the ACP handshake and the
  coding agent spawns the process or opens the connection. This is the extension
  mechanism `.claude/rules/forbidden.md` allows: MCP inside a program the person
  already trusts, never third-party code inside Atlas.
- **Found for you, in the app.** The already-registered servers in `~/.claude.json`,
  the folder's `.mcp.json`, `~/.codex/config.toml`, and `~/.cursor/mcp.json` are read
  **read-only**, and only their names, transports, commands, addresses and
  environment/header **key names** — never a value.
- **Off until switched on**, one at a time. Before the switch, the row states what will
  actually run (the command and its arguments, or the address), where the traffic goes,
  and that `.ontology-atlas/llm-audit.jsonl` records Atlas's own model calls only and
  does not cover it.
- **The list lives in the folder**, at `.ontology-atlas/connectors.json`, which carries
  its own ignore rule. **No token is ever written there**: a credential-shaped variable
  holds a keychain reference, and the writer refuses a literal.
- **The folder's switch is not this Mac's consent.** A folder can arrive switched on (a
  clone, a synced drive, a pull), so in the app a connector attaches only when the folder
  has it on **and** this Mac allowed it exactly as it now reads: its name, command and
  arguments or address, and every variable and header with its value or keychain
  reference. Switching it on here allows it; anything else the folder switched on is
  listed as on in this folder, not on this Mac, with what it would pass and one press to
  allow it, and it asks again whenever the folder changes it. The allowances live in this
  app's own storage, keyed by the folder's path, never in the folder.
- **A reference is the connector's own.** A variable pointing at another connector's
  keychain entry keeps the connector off and says why, and removing it never deletes the
  other connector's token.
- **The token stays out of the browser process too.** The reference becomes a value in
  Rust, one line before it leaves for the agent.
- **Name collisions are called out first.** Codex silently drops an ACP-supplied server
  whose name a config layer already holds.

**One list under one search.** The add dialog is one scroll: *Already on this
computer* (this machine's own config files), *Ready to attach* (the catalogue, its capture
date beside the heading), and *Not in the list? Add it by hand*, a folded row at the bottom
that unfolds the full form. One search box narrows every group at once, because somebody
typing "notion" does not yet know which of them will answer. Close is the corner control
and Escape. The record is in `docs/DECISIONS.md` (one list).

- **One rule for the button.** A press attaches what asks nothing and whose line its row
  already shows — a hosted OAuth address, a local program with no required variable — and
  the row lands in the folder switched off. Anything else unfolds a panel under the row: the
  command written out, one password field per required variable with a link to where it is
  issued, and the press. A chip for another way in names only its runtime, so it always
  unfolds that panel rather than attaching. Where there is no keychain the field is not
  offered and the sentence says what to do.
- **The whole line before the press.** Every line a press writes or switches on is shown
  verbatim and wrapped, never truncated, before that press: the catalogue row, the row found
  on this computer (a program by its command, even when its entry also names an address),
  the by-hand form's *What runs*, and an attached row beside its switch.
- **The catalogue is a committed file**, `src/shared/config/mcp-catalogue.generated.ts`,
  written by `pnpm mcp:catalogue` from the official MCP Registry (whose metadata is
  CC0-1.0) plus vendor pages a person read on a stated date. **Nothing is fetched while
  the app runs** — the same rule `scripts/build-acp-registry.mjs` already follows. It
  carries no download count, no ranking and no "recommended", and the screen states its
  size, its capture date, that Atlas has audited none of it, and that *By hand* reaches
  everything it does not list.
- **A program runs the version that was checked.** Each program is pinned to the release
  current on its row's check date (`npx -y <package>@<version>`, an image by tag and
  digest), and the row says which, so a session never starts whatever was published last.
  `pnpm mcp:catalogue -- --from-snapshot` rebuilds the file from the committed capture
  without the network.
- **Only what the press can make work.** A hosted address that signs in with OAuth
  (Notion's, Atlassian's, GitHub's, and the rest) is **not** offered: measured
  against claude-agent-acp 0.75.0, such an address handed to the in-app session
  reports "requires authentication", the adapter says the session cannot open the sign-in
  window, and no tool registers; a token earned in the terminal for the same name and
  address did not carry over. The generator refuses that shape. What remains is a **local
  program** that asks for exactly one credential, with a link to the page that issues it,
  and an **address that asks nothing** (Context7). The entries are the generated file
  named above. The hosted rows return when an adapter is measured running the
  flow.
- **The program is chosen, not typed.** `resolve_connector_runtimes` resolves a fixed
  allow-list — `npx`, `node`, `uvx`, `python3`, `docker` — to absolute paths on this
  machine and shows them. It opens no file, lists no directory and executes nothing. This
  replaces a field that asked a person to type a full path, which existed because the
  agent's child inherits no `PATH`.
- **A variable is a name and a value on one row.** Marked secret, the value goes to the
  keychain and the folder's file gets the name; a credential-shaped name cannot be
  unmarked.
- **Where a row came from is recorded.** `origin` holds `catalogue:<id>@<capture date>`,
  so the folder can say which entry and which capture produced it.
- **An install link only pre-fills.** `ontology-atlas://mcp?install=<base64>` — registered
  with macOS by the installed app, and reachable as `?install=` on `/mcp` in any browser —
  opens the dialog filled in and waits for the press. An unknown field refuses the whole
  payload, no value survives, and every argument is rendered verbatim — the lesson of
  CVE-2025-54133, recorded with its sources in `docs/benchmark/MCP-ONE-CLICK-2026-09-07.md`.
  The app answers that one address and nothing else, a second press routes the window
  already open, and a refused link is logged and dropped rather than followed.

**On the web**: adding, editing and removing connectors work (the list is in the folder,
which a browser holds), and the catalogue and the by-hand form work unchanged; a catalogue
row that needs a token offers no field there and says so. Finding
what is already registered, resolving a runtime path, and keeping a token are app-only,
and the panel says so with somewhere to go.
