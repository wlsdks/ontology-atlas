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

The server connects over stdio. You should now see 16 tools under the `oh-my-ontology` namespace.

### 3. Call the tools

```
"List every capability node in this project."
→ mcp__oh-my-ontology__list_concepts({ kind: 'capability' })

"What elements does capabilities/mcp-server depend on?"
→ mcp__oh-my-ontology__get_concept({ slug: 'capabilities/mcp-server' })
```

## The 16 tools (v0.7.1)

| Tool | What it does |
|---|---|
| `list_concepts` | Lists every node in the vault (any `.md` with a `kind:` frontmatter). Options: `kind`, `domain` (filter by frontmatter `domain:` slug — combine with `kind` for "all capabilities under auth" in one call), `since` (mtime-based incremental sync — only nodes with `mtime > since` ms; pair with the `mtime` returned in earlier responses for "what changed since I last looked"; strict `>` so re-passing the prior max does not double-fetch), `summary` (opt-in — when true, each row includes a prose `summary` (max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`) so agents get list + previews in one call instead of N follow-up `get_concept` calls; default off to keep payload small), `limit`. Each node row includes `mtime` (ms) — agents can sort/filter "what changed recently" without a follow-up `get_concept` call. **R11**: when the vault has frontmatter corruption, response includes `vaultWarnings: { errorCount, warningCount }` so AI agents can flag it to the user. |
| `get_concept` | Fetches a single node by `slug` (no extension): frontmatter + body excerpt (R+ — *prose-only*: heading / 표 / 코드블록 / 리스트 / 인용 skip 후 첫 단락만 — agent 가 markdown table syntax 대신 사람이 의도한 설명문을 받음, max 800 chars) + neighbors (dependencies / relates) + `mtime` (ms — pass to subsequent `patch_concept` / `delete_concept` as `expected_mtime` to detect concurrent external edits). **R11**: response includes `warnings: [...]` when this doc has frontmatter issues (unclosed-frontmatter / empty-kind / missing-kind / unknown-kind / parse-zero-keys). |
| `find_evidence` | Partial-match search by `title` — scans frontmatter title/capabilities/elements as well as body content. Each match row includes `slug, kind, title, domain, mtime, matchedIn, excerpt` (same shape as `list_concepts` / `find_backlinks` / `find_orphans` / `query_concepts` plus the `excerpt` is a prose preview, max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept`) so agents see *what the matching doc says* without a follow-up get_concept call. |
| `find_backlinks` | Finds every node that points to a given `slug`. Inspects all frontmatter array keys (capabilities / elements / dependencies / relates / …) plus body wikilinks/markdown links. Each match row includes `kind`, `title`, `domain`, `mtime` (same shape as `list_concepts`) — agents can sort/filter "which referrer is in domain X" or "which referrer was touched recently" without follow-up `get_concept` calls. |
| `find_path` | Shortest path between two slugs (BFS, undirected). Returns `{ from, to, hops, edges, hopCount, found }` where `edges[i] = { from, to, via }` and `via` is the frontmatter key (`capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair — so the agent sees not just *that* A and B are connected but *why*. Option: `maxHops` (default 5). |
| `list_kinds` | Vault kind census: `{ total, byKind: { capability: N, ... } }`. |
| `find_orphans` | **v0.5** Finds isolated nodes — docs that no other node references in its frontmatter. Options: `kind` (filter), `excludeKinds` (skip, default `['vault-readme']`). Each orphan row includes `kind`, `title`, `domain`, `mtime` (same shape as `list_concepts` / `find_backlinks`) — agents can sort/filter "old orphans in domain X" without follow-up `get_concept` calls. Useful as a starting point for cleanup or auditing unused nodes. |
| `query_concepts` | **v0.6** Typed filter DSL — `kind=X AND has(Y) AND NOT ...`. Saved-filter / smart-list use case. Each match row includes `slug, kind, title, domain, capabilities, elements, mtime` (same shape as `list_concepts` / `find_backlinks` / `find_orphans`) so agents can sort/filter staleness without follow-up calls. |
| `analyze_repo_structure` | **R16** Analyze a code repository (default cwd) and propose ontology node candidates from `package.json` / `README.md` H2 / `src/` folders. **side effect 0** — vault NOT modified. The agent (or human) reviews and selectively passes accepted candidates to `add_concept` / `add_relation`. Detects FSD vs generic layout. Use once when bootstrapping a fresh repo. |
| `infer_imports` | **R17** Walk TS/JS files and parse imports → file-level + module-level dependency edges. **side effect 0**. Resolves relative paths + `@/*` aliases (Next.js / FSD convention), classifies external (npm) separately, collapses to module edges (capability A → B with import count). The agent reviews `moduleEdges` and selectively passes accepted edges to `add_relation` as `depends_on`. Use after `analyze_repo_structure` to pull *real* dependency edges from the code. |
| `add_concept` | Creates a new `.md` node. Required: `slug`, `kind`, `title`. Optional: `domain`, `capabilities`, `elements`, `body`. **R14**: frontmatter is normalized per kind (project gets `domains/capabilities/elements: []`; capability gets `elements: []`; capability/element should set `domain` — missing extras come back in `warnings`). Body defaults to a kind-specific starter. Throws if the slug already exists. |
| `add_relation` | Adds an edge between two slugs. `type`: `depends_on` (→ dependencies), `relates` (→ relates), `contains` (→ contains), `describes` (→ describes). Appends to the appropriate frontmatter array. **R11**: optional `expected_mtime` on the source slug for conflict detection. |
| `patch_concept` | Updates an existing node's frontmatter (per-key patch — `null` deletes a key) and/or body. Use this when you need to *modify* a slug that `add_concept` would reject as duplicate. **R11**: optional `expected_mtime` for conflict detection — pass the `mtime` from `get_concept`; throws `VaultConflictError` if the file has been modified externally since you read it. |
| `delete_concept` | **v0.4 ⚠ DESTRUCTIVE** Permanently deletes a node. Two-stage safety: ① without `confirm:true`, runs as a dry-run (with a backlinks preview); ② if backlinks exist, throws unless `force:true`. The response captures the deleted frontmatter + body so you can recover from mistakes. **R11**: optional `expected_mtime` for conflict detection. |
| `rename_concept` | **v0.7 ⚠ MULTI-FILE** Atomically renames a slug — moves the .md file, updates the moved file's `slug:` key, and rewrites every backlink (frontmatter array entries, inline string keys like `domain`, body links `[[oldSlug]]` / `(oldSlug.md)`). Tail-only references (`mcp-server` for `capabilities/mcp-server`) are also redirected. Without `confirm:true`, runs as a dry-run with a full update preview. Replaces the manual loop of `find_backlinks` + N `patch_concept` calls. **R11**: optional `expected_mtime` for the source slug. |
| `merge_concepts` | **v0.7 ⚠ DESTRUCTIVE MULTI-FILE** Folds `fromSlug` into `intoSlug` — every backlink to `fromSlug` is redirected, then `fromSlug.md` is deleted. The `intoSlug` node is preserved as-is (frontmatter / body are not auto-merged — use `patch_concept` after if you want to combine descriptions). Without `confirm:true`, runs as a dry-run. **R11**: optional `expected_mtime` for `fromSlug`. |

## Frontmatter shape per kind (R14)

When `add_concept` writes a new `.md`, the frontmatter is normalized by
`mcp/src/schema.mjs` so the AI agent and the CLI always emit the same shape.
Empty arrays are kept (not stripped) so a human can see the slot and fill it
later.

| kind | required | always emitted | strongly expected |
|---|---|---|---|
| `project` | `slug`, `kind`, `title` | `domains: []`, `capabilities: []`, `elements: []` | — |
| `domain` | `slug`, `kind`, `title` | `capabilities: []` | — |
| `capability` | `slug`, `kind`, `title` | `elements: []` | `domain` |
| `element` | `slug`, `kind`, `title` | — | `domain` |
| `document` | `slug`, `kind`, `title` | — | — |

“Strongly expected” fields don’t throw — they come back in the response under
`warnings`, and the validator (`mcp:validate`) flags them with the
`missing-expected-field` issue code so users see them in the workbench banner
without breaking pre-existing vaults.

### Element slug — two valid patterns

`kind: element` allows two natural slug styles, each with different ergonomics:

| Pattern | Example slug | When to use |
|---|---|---|
| **flat** | `mcp-sdk`, `file-system-access-api` | The element is an *external library* / *abstract concept* that doesn't sit at a single path |
| **path-style** | `src/features/auth`, `scripts/build-vault.mjs` | The element is a concrete code module / file inside the codebase. Auto-prefix produces `elements/src/features/auth.md` (4 levels) — deeper but the path is self-documenting |

Both pass `vault:validate`. With `--auto-prefix` (CLI default since R15), path-style slugs nest under `elements/` exactly like flat slugs do — pick the style that matches what the element *is*, not what the file system prefers. Use `--raw-slug` to opt out of the `elements/` prefix entirely.

The same schema is mirrored at `cli/src/lib/schema.mjs`. A contract test
(`tests/contract/vault-schema.contract.test.ts`) keeps the two in lock-step;
if you change one, mirror the other.

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
✓ initialize OK — server oh-my-ontology-mcp@0.7.1
✓ tools/list 16/16 — add_concept · add_relation · analyze_repo_structure · delete_concept · find_backlinks · find_evidence · find_orphans · find_path · get_concept · infer_imports · list_concepts · list_kinds · merge_concepts · patch_concept · query_concepts · rename_concept
✓ list_concepts — vault total 25 nodes

All checks passed — register .mcp.json with Claude Code, restart, and the 16 tools are ready.
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

If those four tools respond cleanly, your read/write round-trip against the vault is working. Once an agent starts *committing* its analysis of your codebase to the ontology through these 16 tools (10 read + 6 write), the human + AI co-authoring loop is officially open.

## Design principles

- **stdin/stdout JSON-RPC** — Claude Code spawns the server as a child process. stdout is *protocol-only*; logs go to stderr.
- **Synchronous fs** — MCP call frequency is low enough that async overhead isn't worth it.
- **Frontmatter preservation** — `add_relation` keeps the existing frontmatter intact and only patches the relevant array key (idempotent — duplicates respond with `alreadyExists: true`).
- **Vault-root sandbox** — `slug` is always vault-relative. The server never writes outside `OMOT_VAULT`.

## Status

- 0.7.1 — 16 tools. Added `instructions` field on initialize response — Claude Code / Cursor see kind hierarchy + workflow + write-tool dry-run pattern + `expected_mtime` conflict guard guidance on connect, no per-session trial-and-error.
- 0.7.0 — 14 tools (8 read + 6 write). Added `rename_concept` and `merge_concepts` (graph-level write — atomic backlink redirect across all referrers).
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
