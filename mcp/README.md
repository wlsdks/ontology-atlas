# oh-my-ontology-mcp

> An MCP server that lets AI agents (Claude Code, Cursor, …) read and write the
> ontology stored in an oh-my-ontology vault. The AI-side surface for the mission
> "a codebase ontology that humans and AI agents author together."

## Quick start

### 1. Register with Claude Code

Create a `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "node",
      "args": ["./mcp/src/index.js"],
      "env": {
        "OMOT_VAULT": "./docs/ontology"
      }
    }
  }
}
```

Or, once published to npm, via `npx`:

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": {
        "OMOT_VAULT": "./docs/ontology"
      }
    }
  }
}
```

If `OMOT_VAULT` is not set, the current working directory is used as the vault root.

### 2. Restart Claude Code

The server connects over stdio. You should now see 12 tools under the `oh-my-ontology` namespace.

### 3. Call the tools

```
"List every capability node in this project."
→ mcp__oh-my-ontology__list_concepts({ kind: 'capability' })

"What elements does capabilities/mcp-server depend on?"
→ mcp__oh-my-ontology__get_concept({ slug: 'capabilities/mcp-server' })
```

## The 12 tools (v0.6.0)

| Tool | What it does |
|---|---|
| `list_concepts` | Lists every node in the vault (any `.md` with a `kind:` frontmatter). Options: `kind`, `limit`. |
| `get_concept` | Fetches a single node by `slug` (no extension): frontmatter + body excerpt + neighbors (dependencies / relates). |
| `find_evidence` | Partial-match search by `title` — scans frontmatter title/capabilities/elements as well as body content. |
| `find_backlinks` | Finds every node that points to a given `slug`. Inspects all frontmatter array keys (capabilities / elements / dependencies / relates / …) plus body wikilinks/markdown links. |
| `find_path` | Shortest path between two slugs (BFS, undirected). Option: `maxHops` (default 5). |
| `list_kinds` | Vault kind census: `{ total, byKind: { capability: N, ... } }`. |
| `find_orphans` | **v0.5** Finds isolated nodes — docs that no other node references in its frontmatter. Options: `kind` (filter), `excludeKinds` (skip, default `['vault-readme']`). Useful as a starting point for cleanup or auditing unused nodes. |
| `query_concepts` | **v0.6** Typed filter DSL — `kind=X AND has(Y) AND NOT ...`. Saved-filter / smart-list use case. |
| `add_concept` | Creates a new `.md` node. Required: `slug`, `kind`, `title`. Optional: `domain`, `capabilities`, `elements`, `body`. Throws if the slug already exists. |
| `add_relation` | Adds an edge between two slugs. `type`: `depends_on` (→ dependencies), `relates` (→ relates), `contains` (→ contains), `describes` (→ describes). Appends to the appropriate frontmatter array. |
| `patch_concept` | Updates an existing node's frontmatter (per-key patch — `null` deletes a key) and/or body. Use this when you need to *modify* a slug that `add_concept` would reject as duplicate. |
| `delete_concept` | **v0.4 ⚠ DESTRUCTIVE** Permanently deletes a node. Two-stage safety: ① without `confirm:true`, runs as a dry-run (with a backlinks preview); ② if backlinks exist, throws unless `force:true`. The response captures the deleted frontmatter + body so you can recover from mistakes. |

## Local verification (UX-3)

### One-line verify CLI

```bash
cd mcp && npm install
OMOT_VAULT=../docs/ontology npm run verify
```

A successful run looks like this:

```
[oh-my-ontology-mcp verify]
· step 1 — parser smoke test
✓ result: 7 passed, 0 failed
· step 2 — server boot + tools/list + list_concepts
✓ initialize OK — server oh-my-ontology-mcp@0.6.0
✓ tools/list 12/12 — add_concept · add_relation · delete_concept · find_backlinks · find_evidence · find_orphans · find_path · get_concept · list_concepts · list_kinds · patch_concept · query_concepts
✓ list_concepts — vault total 23 nodes

All checks passed — register .mcp.json with Claude Code, restart, and the 12 tools are ready.
```

On failure, it tells you which step blocked progress and prints a diagnostic message.

### Manual verification (reference)

```bash
# parser smoke
node src/parser.test.mjs

# Real server over stdin/stdout JSON-RPC
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_concepts","arguments":{"limit":5}}}' \
  | OMOT_VAULT=../docs/ontology node src/index.js
```

## First call after registering with Claude Code (sample prompt)

After you add `.mcp.json` and restart Claude Code, try the following with your LLM:

> **First exploration — confirm the vault's ontology is visible**
> 1. Call `mcp__oh-my-ontology__list_concepts` to list every node in the vault.
> 2. Call `get_concept({ slug: "project" })` to see the root node's frontmatter and neighbors.
> 3. Call `find_backlinks({ slug: "capabilities/mcp-server" })` to find what depends on that capability.
> 4. (Optional) Call `add_concept` to create a new capability node — `slug`, `kind`, and `title` are required.

If those four tools respond cleanly, your read/write round-trip against the vault is working. Once an agent starts *committing* its analysis of your codebase to the ontology through these 12 tools (8 read + 4 write), the human + AI co-authoring loop is officially open.

## Design principles

- **stdin/stdout JSON-RPC** — Claude Code spawns the server as a child process. stdout is *protocol-only*; logs go to stderr.
- **Synchronous fs** — MCP call frequency is low enough that async overhead isn't worth it.
- **Frontmatter preservation** — `add_relation` keeps the existing frontmatter intact and only patches the relevant array key (idempotent — duplicates respond with `alreadyExists: true`).
- **Vault-root sandbox** — `slug` is always vault-relative. The server never writes outside `OMOT_VAULT`.

## Status

- 0.6.0 — 12 tools (8 read + 4 write). Added `query_concepts` (typed filter DSL).
- 0.5.0 — 7 read + 4 write. Added `find_orphans`.
- 0.4.0 — 10 tools (6 read + 4 write). Added `delete_concept` (dry-run + backlinks guard).
- 0.3.0 — 9 tools. Added `find_path` (BFS) and `list_kinds` (census).
- 0.2.0 — 7 tools.
- 0.1.0 — 5 tools.

## Troubleshooting

- **Tools don't show up**: Restart Claude Code. Validate `.mcp.json` syntax with `jq . .mcp.json`.
- **Vault appears empty**: Try an absolute path for `OMOT_VAULT`, or run `pwd` to confirm the actual working directory.
- **`Doc already exists`**: `add_concept` won't overwrite an existing file. Edit the file directly, or use `patch_concept` to update frontmatter or body in place.
