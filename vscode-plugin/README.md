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

## Install (development)

The plugin is not yet on the VSCode Marketplace. To run it locally:

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

## Commands

| Command | Title |
|---|---|
| `ohMyOntology.pickVault` | Pick vault folder |
| `ohMyOntology.refresh` | Refresh |
| `ohMyOntology.openNode` | Open node .md (invoked when you click a tree item) |

## Auto-detection

If you open this repo (or any project that has `docs/ontology/`) in
VSCode, the plugin auto-loads that folder as the vault. Pick a
different folder via the Activity Bar header to override.

## Status

**v0.1.0 — minimal viable plugin.** Working features:

- Activity Bar entry + TreeView grouped by `kind`
- Auto-detect `docs/ontology/` in workspace
- Pick-vault dialog (persisted across sessions)
- Click node → open `.md`

**Not yet:**

- File-link backlinks (open the source file an element points at)
- Add-concept / patch-concept commands (write surface)
- MCP server connection (use raw filesystem read for now)
- Marketplace publishing

The frontmatter parser is the same lenient one shared across CLI / MCP
/ web workbench (the [4-way contract test](../tests/contract/parse-frontmatter.contract.test.ts)
gates drift). So any vault produced by the rest of the suite renders here
without conversion.

## License

MIT — see [`../LICENSE`](../LICENSE).
