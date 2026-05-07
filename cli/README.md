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
| `oh-my-ontology init [folder]` | Scaffold a new vault (project / domain / capability / element starter .md). **R15**: also drops a wired `.mcp.json` in *both* cwd (codebase root, `OMOT_VAULT='./<vault>'`) and the vault folder (`OMOT_VAULT='.'`) — open either in an AI agent and the 16 MCP tools auto-register. Existing `.mcp.json` is preserved (`.mcp.json.example` falls back instead). |
| `oh-my-ontology list [vault]` | List ontology nodes (color table; `--kind X` filter, `--json`) |
| `oh-my-ontology validate [vault]` | Frontmatter integrity (6 issue codes incl. R14 `missing-expected-field`; `exit 1` on errors — usable as a CI gate). Same code 가 2+ file 에서 등장하면 끝에 *grouped by code* 요약 섹션이 자동으로 붙어 *어느 종류 경고가 얼마나 많은지* 한눈에 파악. |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold a new node (`--domain X --body "..." --vault path`); throws on duplicate slug. **R15**: `--auto-prefix` is now **default on** (kind→folder, e.g. `add capability foo` → `capabilities/foo.md`) for consistency with the `init` starter layout. Use `--raw-slug` (or `--no-auto-prefix`) to opt out. |
| `oh-my-ontology find <query> [vault]` | Search slug + title (case-insensitive, `--kind X --json`) |
| `oh-my-ontology import <path...>` | **R14** Import external `.md` into the vault. Reads each file's frontmatter, falls back to `--kind` when missing, derives `slug` from the filename and `title` from the first H1, then writes through the same schema as `add`. Options: `--vault path`, `--kind K`, `--auto-prefix` (R15 **default on**, kind→folder), `--raw-slug` (opt out), `--rename` (auto `-2`/`-3` on slug clash), `--dry-run` (preview only). Accepts files or directories (recursive, `.git`/`node_modules` skipped). |

### Graph-level commands (R15 follow-up)

These wrap the MCP server (`oh-my-ontology-mcp`) so the developer has the same authority as an AI agent — find backlinks, rename / merge / delete safely, run a typed filter DSL. Each spawn is ~50–100 ms one-shot; commands that mutate the graph are dry-run by default with an explicit `--confirm` flag.

| Command | What it does |
|---|---|
| `oh-my-ontology backlinks <slug>` | Lists every node referencing the target (`matches[]` from MCP `find_backlinks`, `--json` for raw). |
| `oh-my-ontology query "<filter>"` | Typed filter DSL — `kind=X AND has(Y) AND NOT domain=Z`, parens / OR / NOT supported. (`--limit N --json`) |
| `oh-my-ontology rename <oldSlug> <newSlug>` | Atomic rename — moves the `.md`, updates `slug:`, rewrites every backlink (frontmatter array entries, inline strings, body links). Default dry-run preview; `--confirm` to apply. |
| `oh-my-ontology merge <fromSlug> <intoSlug>` | Atomic merge — redirects every backlink `from → into`, then deletes `from.md`. Default dry-run; `--confirm` to apply. The `into` node's frontmatter / body are **not** auto-combined — edit by hand if needed. |
| `oh-my-ontology delete <slug>` | Permanent delete. Default refuses if any backlinks remain — preview them with the bare command, then `--confirm` to apply (or `--force` to delete anyway). |

These commands require `oh-my-ontology-mcp` (declared in `dependencies` — `npm install` pulls it in automatically).

The vault is a plain folder of `.md` files. **Frontmatter is the graph.**

## How AI agents fit in

`init` (R15) automatically writes a wired `.mcp.json` to both your codebase
root and the vault folder. Open either in an AI agent (Claude Code, Codex,
Cursor) and the agent gets **16 tools** (10 read + 6 write) to read and
write the vault — same data the developer sees.

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

16 tools (R17):
`list_concepts` / `get_concept` / `find_evidence` /
`find_backlinks` / `find_path` / `list_kinds` / `find_orphans` /
`query_concepts` / `analyze_repo_structure` / `infer_imports` (read 10) +
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
