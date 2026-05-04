# oh-my-ontology — VSCode plugin

> View and navigate your codebase ontology vault from inside VSCode.
> Sibling of the [CLI](../cli) and the [MCP server](../mcp).

[![oh-my-ontology vault](https://img.shields.io/badge/companion-CLI%20%7C%20MCP-5e6ad2)](https://github.com/wlsdks/oh-my-ontology)

## What this plugin does

Adds an **oh-my-ontology** Activity Bar entry that lists every node in
your vault grouped by `kind` (project / domain / capability / element /
document). Click a node to open its `.md` file directly in the editor.

This is the **developer-primary IDE entry** the project's mission has
always promised. Same vault, same `.md` files, same git repo as the CLI
and MCP — just rendered next to your code.

## Install (pre-marketplace verification)

The plugin is not yet on the VSCode Marketplace. Two ways to try it:

### Option A — install the packaged `.vsix` (recommended for verification)

This is the closest thing to "what the marketplace would deliver":

```bash
cd vscode-plugin
npm install
npx @vscode/vsce package --no-yarn
code --install-extension oh-my-ontology-vscode-0.4.0.vsix
```

Restart VSCode. The extension is now installed across **every** VSCode window the same as a marketplace extension would be. Uninstall via Extensions panel or `code --uninstall-extension wlsdks.oh-my-ontology-vscode`.

### Option B — Extension Development Host (faster iteration)

```bash
cd vscode-plugin
npm install
npm run compile
```

Then in VSCode:

1. Open the `vscode-plugin/` folder.
2. Press <kbd>F5</kbd> to launch the **Extension Development Host** with the plugin loaded.
3. In the dev host window, click the network-graph icon in the Activity Bar.
4. Click "Open vault folder" and pick a folder containing `.md` files with `kind:` frontmatter (e.g. this repo's own `docs/ontology/`).

You should see a tree like:

```
domain (6)
  ├─ AI Agent Partner          domains/ai-agent-partner
  ├─ Vault — Local-First       domains/vault-local-first
  └─ …
capability (10)
  ├─ MCP Server (14 tools)     capabilities/mcp-server
  └─ …
element (4)
  └─ …
```

Click any node to open its `.md` in the editor.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `oh-my-ontology.vaultPath` | `""` | Absolute path to the vault folder. Leave empty to pick interactively or auto-detect `docs/ontology/` in the workspace. |
| `oh-my-ontology.useMcp` | `true` | Use the `oh-my-ontology-mcp` server for richer queries (currently: backlinks). When false (or when the server fails to start), the plugin falls back to an in-process filesystem scan. |
| `oh-my-ontology.mcpServerPath` | `""` | Absolute path to `mcp/src/index.js`. Leave empty to auto-detect `<workspace>/mcp/src/index.js`. |

## Commands

| Command | Title |
|---|---|
| `ohMyOntology.pickVault` | Pick vault folder |
| `ohMyOntology.refresh` | Refresh |
| `ohMyOntology.addConcept` | **Add concept (v0.3.0)** — kind picker → slug → title → optional domain → writes `<vault>/<auto-prefix>/<slug>.md` |
| `ohMyOntology.openNode` | Open node .md (invoked when you click a tree item) |
| `ohMyOntology.openMatchedNode` | Open the node matching the active editor (status bar click) |

## Auto-detection

If you open this repo (or any project that has `docs/ontology/`) in
VSCode, the plugin auto-loads that folder as the vault. Pick a
different folder via the Activity Bar header to override.

## Status

**v0.6.0 — informative status bar.** Working features:

- Activity Bar entry + Ontology TreeView grouped by `kind`
- **Backlinks panel (v0.4.0)** — second TreeView under Activity Bar, populated by `find_backlinks` against the node matching the current editor.
- Auto-detect `docs/ontology/` in workspace
- Pick-vault dialog (persisted across sessions)
- Click node → open `.md`
- Status bar match — active editor's file → owning ontology node, click to jump (v0.2.0)
- Add concept command — Command Palette / TreeView `+` button (v0.3.0)
- **MCP server spawn (v0.4.0)** — plugin spawns `mcp/src/index.js` on activate, sends JSON-RPC over stdio to populate the backlinks panel. **Falls back to in-process scan** when the server is unavailable, so the plugin still works in offline / standalone mode. Same wire protocol as Claude Code uses.
- **Self-match (v0.5.0)** — when you open an ontology node's `.md` file directly (e.g. `docs/ontology/elements/sigma-graphology.md`), the plugin recognizes that as the node and the **Backlinks panel auto-populates with who points to that node**. Status bar also shows the node title. The natural reading flow now works.
- **Headless e2e harness (v0.5.0)** — `npm run test:e2e` downloads VSCode (cached in `.vscode-test/`) and runs the plugin in a real extension host. Verifies activation, command registration, configuration schema, and contributes. CI runs the same suite under `xvfb-run` so future PRs that break the integration get caught automatically.
- **Informative status bar (v0.6.0)** — the status bar is no longer hidden when no node owns the active file. Four states surface the plugin's state: (a) no workspace, (b) no vault picked → click to pick, (c) vault loaded · no editor or no match → dim hint with node count, (d) match → kind icon + title (clickable). The plugin always lets you know it's alive.

**Not yet:**

- patch-concept / rename-concept / merge-concepts (other write tools)
- Marketplace publishing

The frontmatter parser is the same lenient one shared across CLI / MCP
/ web workbench (the [4-way contract test](../tests/contract/parse-frontmatter.contract.test.ts)
gates drift). So any vault produced by the rest of the suite renders here
without conversion.

## License

MIT — see [`../LICENSE`](../LICENSE).
