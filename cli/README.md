# oh-my-ontology

> **AI-native codebase ontology workbench** — vault scaffold + MCP setup CLI.

```bash
npx oh-my-ontology init my-vault
cd my-vault
$EDITOR project.md
```

That's it. You now have a frontmatter-based ontology vault that humans
and AI agents (Claude Code, Cursor, etc.) can read and write together.

## Commands (R12)

| Command | What it does |
|---|---|
| `oh-my-ontology init [folder]` | Scaffold a new vault (project / domain / capability / element starter .md + `.mcp.json.example`) |
| `oh-my-ontology list [vault]` | List ontology nodes (color table; `--kind X` filter, `--json`) |
| `oh-my-ontology validate [vault]` | Frontmatter integrity (6 issue codes incl. R14 `missing-expected-field`; `exit 1` on errors — usable as a CI gate) |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold a new node (`--domain X --body "..." --vault path`); throws on duplicate slug |
| `oh-my-ontology find <query> [vault]` | Search slug + title (case-insensitive, `--kind X --json`) |

The vault is a plain folder of `.md` files. **Frontmatter is the graph.**

## How AI agents fit in

Register the included `.mcp.json.example` with your AI agent (Claude Code,
Cursor, Continue, etc.). The agent gets **14 tools** (8 read + 6 write) to
read and write the vault — same data the developer sees.

```jsonc
// .mcp.json (in your agent's config dir)
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": { "OMOT_VAULT": "/path/to/your/vault" }
    }
  }
}
```

14 tools (R11 v0.7.0):
`list_concepts` / `get_concept` / `find_evidence` /
`find_backlinks` / `find_path` / `list_kinds` / `find_orphans` /
`query_concepts` (read 8) +
`add_concept` / `add_relation` / `patch_concept` / `delete_concept` /
`rename_concept` / `merge_concepts` (write 6).

## See the graph

A web workbench visualizes the vault as a tree, topology (Sigma WebGL),
and ERD (xyflow):

- **Hosted demo** (read-only, our own dogfood vault):
  https://oh-my-ontology.web.app
- **Local workbench** (read/write your vault):
  ```bash
  git clone https://github.com/wlsdks/oh-my-ontology
  cd oh-my-ontology
  pnpm install
  pnpm dev   # http://localhost:3000
  ```
  Then visit `/docs` and pick your vault folder.

## Mission

> **vault frontmatter = the graph. Humans + AI agents author the same vault.**

This is for AI-native developers who want their codebase mental model to
live somewhere AI agents can read and write — not as a side artifact, but
as the canonical representation. Non-developers can read the same vault
and contribute via plain markdown.

## License

MIT — https://github.com/wlsdks/oh-my-ontology
