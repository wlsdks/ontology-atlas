# oh-my-ontology

> **AI-native codebase ontology workbench** — vault scaffold + MCP setup CLI.

```bash
npx oh-my-ontology init my-vault
cd my-vault
$EDITOR project.md
```

That's it. You now have a frontmatter-based ontology vault that humans
and AI agents (Claude Code, Cursor, etc.) can read and write together.

Requires Node 20+. The CLI installs and spawns `oh-my-ontology-mcp`, which
uses the same Node floor.

## Commands (R12)

| Command | What it does |
|---|---|
| `oh-my-ontology init [folder]` | Scaffold a new vault (project / domain / capability / element starter .md). **R15+**: also drops a wired `.mcp.json` in *both* cwd (codebase root, `OMOT_VAULT='./<vault>'`) and the vault folder (`OMOT_VAULT='.'`) — open either in an AI agent and the 23 MCP tools auto-register. Existing `.mcp.json` is preserved (`.mcp.json.example` falls back instead). |
| `oh-my-ontology list [vault]` | List ontology nodes (color table; `--kind X` filter, `--json`) |
| `oh-my-ontology validate [vault]` | Frontmatter integrity (includes `missing-expected-field`, `non-canonical-graph-array`, and `dangling-graph-reference`; `exit 1` on errors — usable as a CI gate). Same code 가 2+ file 에서 등장하면 끝에 *grouped by code* 요약 섹션이 자동으로 붙어 *어느 종류 경고가 얼마나 많은지* 한눈에 파악. |
| `oh-my-ontology mcp-verify [vault]` | Runs the installed MCP package verify CLI against the resolved vault: parser smoke, server boot, 23-tool inventory, `list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`, `workspace_brief`, `health`, `compile_ontology`, `overview`, and `overview`/`project_map` query_plan. Use `--timeout-ms N` for large/slow vaults. |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold a new node (`--domain X --body "..." --vault path`); throws on duplicate slug. `slug`, `--title`, and `--domain` must be non-empty strings without leading/trailing whitespace, so bad scalar input fails before writing. Body defaults to a starter only when `--body` is omitted, so `--body=` intentionally writes an empty body. **R15**: `--auto-prefix` is now **default on** (kind→folder, e.g. `add capability foo` → `capabilities/foo.md`) for consistency with the `init` starter layout. Use `--raw-slug` (or `--no-auto-prefix`) to opt out. |
| `oh-my-ontology find <query> [vault]` | Search slug + title (case-insensitive, `--kind X --json`) |
| `oh-my-ontology import <path...>` | **R14** Import external `.md` into the vault. Reads each file's frontmatter, falls back to `--kind` when missing, derives `slug` from the filename and `title` from the first H1, then writes through the same schema as `add`. Options: `--vault path`, `--kind K`, `--auto-prefix` (R15 **default on**, kind→folder), `--raw-slug` (opt out), `--rename` (auto `-2`/`-3` on slug clash), `--dry-run` (preview only). Accepts files or directories (recursive, `.git`/`node_modules` skipped). |
| `oh-my-ontology bootstrap [rootPath]` | Analyze a repo and apply the first ontology graph in one command: project/domains/capabilities/elements plus import-derived `depends_on` edges. In a fresh `init` vault, untouched starter examples are removed before real nodes land; edited starter files are preserved. Use `analyze` first for preview-only review. |
| `oh-my-ontology analyze [rootPath]` | Preview repo-derived candidates without writing. `--apply` lands those candidates via batch MCP calls and prunes untouched `init` starter examples the same way as `bootstrap`. |
| `oh-my-ontology infer-imports [rootPath]` | Preview TS/JS import-derived module edges without writing. `--apply` lands `depends_on` edges. |
| `oh-my-ontology compile [vault]` | Compile the vault through MCP `compile_ontology` and print deterministic graph counts/hash. Use `--summary` for cheap polling, `--json` for the raw artifact, and `--fix` to apply compiler relation-array canonicalization actions. |

### Graph-level commands (R15 follow-up)

These wrap the MCP server (`oh-my-ontology-mcp`) so the developer has the same authority as an AI agent — compile the graph, find backlinks, rename / merge / delete safely, run a typed filter DSL. Each spawn is ~50–100 ms one-shot; commands that mutate the graph are dry-run by default with an explicit `--confirm` flag, except `compile --fix`, which only applies compiler-produced canonicalization patches.

| Command | What it does |
|---|---|
| `oh-my-ontology backlinks <slug>` | Lists every node referencing the target (`matches[]` from MCP `find_backlinks`, `--json` for raw). |
| `oh-my-ontology orphans [vault]` | Lists isolated nodes — docs no other node references in their frontmatter (MCP `find_orphans`). Options: `--kind X` (filter), `--exclude-kinds A,B` (skip; MCP default excludes `project,vault-readme`), `--json`. Quick "what should I clean up" surface for vault maintenance. |
| `oh-my-ontology path <from> <to> [vault]` | Shortest path (BFS, undirected) between two slugs. Each hop is annotated with the frontmatter key (`capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair, so you see *why* A and B are connected. (`--max-hops N --json`) |
| `oh-my-ontology query "<filter>"` | Typed filter DSL — `kind=X AND has(Y) AND NOT domain=Z`, parens / OR / NOT supported. (`--limit N --json`) |
| `oh-my-ontology rename <oldSlug> <newSlug>` | Atomic rename — moves the `.md`, updates `slug:`, rewrites every backlink (frontmatter array entries, inline strings, body links). Default dry-run preview; `--confirm` to apply. |
| `oh-my-ontology merge <fromSlug> <intoSlug>` | Atomic merge — redirects every backlink `from → into`, then deletes `from.md`. Default dry-run; `--confirm` to apply. The `into` node's frontmatter / body are **not** auto-combined — edit by hand if needed. |
| `oh-my-ontology delete <slug>` | Permanent delete. Default refuses if any backlinks remain — preview them with the bare command, then `--confirm` to apply (or `--force` to delete anyway). |

These commands require `oh-my-ontology-mcp` (declared in `dependencies` — `npm install` pulls it in automatically).

`oh-my-ontology mcp-verify [vault]` is the fastest installed-package sanity
check for the agent-facing surface. It resolves the vault the same way graph
commands do, then delegates to `oh-my-ontology-mcp/scripts/verify.mjs`.
`oh-my-ontology mcp-verify --help` prints the same graph-query smoke contract
to stdout, so CLI users can inspect the verify scope without starting a server.
It also checks `get_concepts` with discovered vault slugs plus one missing slug,
so installed CLI users catch batch-reader success and partial-row contract drift.
It blocks parser/server/tool inventory failures, vault validation problems,
failing health checks, and fail-severity `workspace_brief.nextActions`; warn
diagnostics still print so a fresh starter vault can verify before cleanup.
The delegated verify output includes a compact advisory nextActions list when
cleanup is recommended but not blocking, plus graph-query smoke lines for
`overview` and `overview`/`project_map` query_plan.
Use `--timeout-ms 15000` when a large vault or slow filesystem needs a longer
server wait window.

`oh-my-ontology workspace-brief [vault]` follows the same blocking distinction:
warn/advisory next actions render as guidance, but fail-severity next actions
or failing health checks return exit 1 so shell scripts do not miss broken
first-contact graph state.

The vault is a plain folder of `.md` files. **Frontmatter is the graph.**

## How AI agents fit in

`init` automatically writes a wired `.mcp.json` to both your codebase root
and the vault folder. Claude Code and Cursor pick that project config up
after restart and expose **23 tools** (15 read + 8 write).

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

When running from this source checkout before npm publish, `init` writes an
equivalent `node /absolute/path/to/mcp/src/index.js` command instead of `npx`
so Claude Code can connect immediately without hitting the npm registry.

Codex stores MCP servers in its own config, so `init` also prints the exact
one-line command to run from a clean setup:

```bash
codex mcp add oh-my-ontology --env OMOT_VAULT=/absolute/path/to/vault -- node /absolute/path/to/mcp/src/index.js
```

For a published install, the command uses `npx -y oh-my-ontology-mcp` instead
of the source-checkout `node .../mcp/src/index.js` path.

For the shortest fresh setup, run:

```bash
npx oh-my-ontology init ontology
npx oh-my-ontology bootstrap . --vault ontology
npx oh-my-ontology compile ontology --summary
```

`bootstrap` replaces the untouched starter files with repo-derived nodes. If
you already edited any starter file, that file stays on disk.

`compile` gives you the deterministic graph hash/counts after the ontology is
built. Add `--fix` to apply compiler-produced relation-array canonicalization
actions, which trims duplicates and reorders graph arrays through the same MCP
`patch_concept` write path agents use.

23 tools:
`list_concepts` / `get_concept` / `get_concepts` / `find_evidence` /
`find_backlinks` / `find_neighbors` / `find_path` / `list_kinds` /
`find_orphans` / `query_concepts` / `compile_ontology` / `query_ontology` /
`validate_vault` / `analyze_repo_structure` / `infer_imports` (read 15) +
`add_concept` / `add_concepts` /
`add_relation` / `add_relations` / `patch_concept` / `delete_concept` /
`rename_concept` / `merge_concepts` (write 8).

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
