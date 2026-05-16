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

The server connects over stdio. You should now see 23 tools under the `oh-my-ontology` namespace.

### 3. Call the tools

```
"List every capability node in this project."
→ mcp__oh-my-ontology__list_concepts({ kind: 'capability' })

"What elements does capabilities/mcp-server depend on?"
→ mcp__oh-my-ontology__get_concept({ slug: 'capabilities/mcp-server' })
```

## The 23 tools

| Tool | What it does |
|---|---|
| `list_concepts` | Lists every node in the vault (any `.md` with a `kind:` frontmatter). Options: `kind`, `domain` (filter by frontmatter `domain:` slug — combine with `kind` for "all capabilities under auth" in one call), `since` (mtime-based incremental sync — only nodes with `mtime > since` ms; pair with the `mtime` returned in earlier responses for "what changed since I last looked"; strict `>` so re-passing the prior max does not double-fetch), `summary` (opt-in — when true, each row includes a prose `summary` (max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`) so agents get list + previews in one call instead of N follow-up `get_concept` calls; default off to keep payload small), `limit`. Each node row includes `mtime` (ms) — agents can sort/filter "what changed recently" without a follow-up `get_concept` call. **R11+**: when the vault has frontmatter corruption or whole-vault graph-reference drift, response includes `vaultWarnings: { errorCount, warningCount }` so AI agents can flag it to the user. |
| `get_concept` | Fetches a single node by `slug` (no extension): frontmatter + body excerpt (R+ — *prose-only*: heading / 표 / 코드블록 / 리스트 / 인용 skip 후 첫 단락만 — agent 가 markdown table syntax 대신 사람이 의도한 설명문을 받음, max 800 chars) + graph `neighbors` (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) + `outgoingEdges[]` (`{to, via}`) + `mtime` (ms — pass to subsequent `patch_concept` / `delete_concept` as `expected_mtime` to detect concurrent external edits). **R11+**: response includes `warnings: [...]` when this doc has frontmatter issues, graph-array canonicality drift, or dangling outgoing graph references. |
| `get_concepts` | **R+** Batch reader — accepts an array of slugs (max 50), returns `concepts[]` with the same per-row shape as `get_concept` (frontmatter + excerpt + neighbors + mtime + warnings?). Order of `concepts[]` matches input `slugs[]`. Missing slugs return `{ slug, ok: false, error }` rather than aborting the batch. Replaces N×`get_concept` round-trips when an agent already has K specific slugs (e.g. from `list_concepts` / `find_path` / `find_orphans`) and needs full bodies for all of them. |
| `find_evidence` | Partial-match search by `title` — scans frontmatter title/capabilities/elements as well as body content. Each match row includes `slug, kind, title, domain, mtime, matchedIn, excerpt` (same shape as `list_concepts` / `find_backlinks` / `find_orphans` / `query_concepts` plus the `excerpt` is a prose preview, max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept`) so agents see *what the matching doc says* without a follow-up get_concept call. |
| `find_backlinks` | Finds every node that points to a given `slug`. Inspects all frontmatter array keys (capabilities / elements / dependencies / relates / …) plus body wikilinks/markdown links. Each match row includes `kind`, `title`, `domain`, `mtime` (same shape as `list_concepts`) — agents can sort/filter "which referrer is in domain X" or "which referrer was touched recently" without follow-up `get_concept` calls. |
| `find_neighbors` | **R+** One-hop graph neighborhood around a node. Accepts `slug`, optional `direction` (`outgoing` / `incoming` / `both`, default both), optional `types` relation filter (`depends_on` is normalized to stored `dependencies`), `includeNodes`, and `limit`. Returns canonical `edges[]` (`{direction, from, to, via, ref, resolved}`) plus neighbor node summaries so agents can inspect a local graph subview without combining `get_concept` + `find_backlinks` manually. |
| `find_path` | Shortest path between two slugs (BFS, undirected). Returns `{ from, to, hops, edges, hopCount, found }` where `edges[i] = { from, to, via }` and `via` is the frontmatter key (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair — so the agent sees not just *that* A and B are connected but *why*. Option: `maxHops` (default 5). |
| `list_kinds` | Vault kind census: `{ total, byKind: { capability: N, ... } }`. |
| `find_orphans` | **v0.5** Finds isolated nodes — docs that no other node references through graph frontmatter (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`). Options: `kind` (filter), `excludeKinds` (skip, default `['vault-readme']`). Each orphan row includes `kind`, `title`, `domain`, `mtime` (same shape as `list_concepts` / `find_backlinks`) — agents can sort/filter "old orphans in domain X" without follow-up `get_concept` calls. Useful as a starting point for cleanup or auditing unused nodes. |
| `query_concepts` | **v0.6** Typed filter DSL — `kind=X AND has(Y) AND NOT ...`. Saved-filter / smart-list use case. Each match row includes `slug, kind, title, domain, capabilities, elements, mtime` (same shape as `list_concepts` / `find_backlinks` / `find_orphans`) so agents can sort/filter staleness without follow-up calls. |
| `compile_ontology` | **R+** Compiler-style graph artifact for database-like use. Compiles the whole vault into deterministic `nodes[]`, canonical `edges[]`, alias tables, graph issues, graph-array canonicalization actions, stable semantic `graphHash`, `maxMtime`, and optional query indexes (`out`, `in`, `byKind`, `byDomain`, `edgeById`, `aliasToSlug` with `includeIndexes:true`). Use before advanced reasoning, export, caching, or non-developer graph views. side effect 0. <br>**Large-vault opts (R+):** `summary: true` returns counts + `graphHash` + `byKind`/`byDomain` aggregates (no arrays) — cheap polling for cache invalidation. `nodesLimit`/`nodesOffset` and `edgesLimit`/`edgesOffset` slice arrays with `nodesPagination` / `edgesPagination` meta (`{offset, limit, total, returned, hasMore, nextOffset}`). 100+ 노드 vault 에서 토큰 한도 초과 회피. |
| `query_ontology` | **R+** Graph-engine query over the compiled artifact. Operations: `neighbors` (local graph neighborhood), `path` (one compiled-edge route), `all_paths` (bounded simple paths between two nodes), `query_plan` (EXPLAIN-style cost/index estimate before a target operation), `centrality` (PageRank-style core-node ranking plus bridge/authority/hub lists), `communities` (label-propagation graph clusters), `similar_nodes` (duplicate/overlap candidates before writes), `explain_relation` (direct edges + shortest path + shared-neighbor explanation), `reachability` (transitive graph closure from a start node), `pattern_walk` (explicit relation-sequence paths), `impact` (incoming by default: what depends on this?), `blast_radius` (impact grouped by kind/domain with cross-domain edge risk), `subgraph` (bounded N-hop graph slice), `overview` (counts, relation distribution, hubs), `schema` (`kind → relation → kind` patterns), `facets` (filter/dashboard aggregates), `match_nodes` (graph DB-style node rows with degree filters), `match_edges` (graph DB-style edge pattern rows), `node_profile` (single node detail dashboard), `domain_profile` (domain detail dashboard), `domain_matrix` (domain-to-domain coupling), `project_scope` (project-contained graph slice), `project_map` (domain-by-domain project map), `relation_check` (schema-aware preflight before `add_relation`), `components` (connected graph islands), `lineage` and `containment_tree` (project/domain/capability containment), `cycles` (directed dependency-cycle checks), `topological_order` (prerequisite-first dependency ordering), `recommend_relations` (safe domain-containment suggestions), `growth_plan` (side-effect-free ontology expansion candidates), `maintenance_plan` (ordered post-write graph cleanup/repair actions with stable action `id`, cursor resume via `afterActionId`, executable graph-array canonicalization, `byKind` action breakdown, `executable` flags, `nextExecutableAction` / `nextReviewAction`, and `executableOnly` / `phases` / `severities` / `kinds` filters), `workspace_brief` (first-contact status + next actions), and `health` (one-shot graph integrity dashboard). Accepts canonical slugs or unique aliases. Use for graph-database-like answers without pulling the full compile payload. side effect 0. |
| `validate_vault` | **R+** Validate every doc in the vault, return `{ scanned, problems: [{slug, issues}], summary: { problemFiles, errorFiles, warningFiles, byCode } }`. 8 issue codes (`unclosed-frontmatter`, `parse-zero-keys`, `missing-kind`, `empty-kind`, `unknown-kind`, `missing-expected-field`, `non-canonical-graph-array`, `dangling-graph-reference`). One round-trip whole-vault health check — use before / after a batch write, or to surface issues. Replaces the K-roundtrip pattern of `list_concepts` then per-doc `get_concept` (whose `warnings: [...]` is per-file). |
| `analyze_repo_structure` | **R16** Analyze a code repository (default cwd) and propose ontology node candidates from `package.json` / `README.md` H2 / `src/` folders. **side effect 0** — vault NOT modified. Emits folder-prefixed slugs (`domains/*`, `capabilities/*`, `elements/src/...`) so candidates match the starter layout and CLI `add` defaults. The agent (or human) reviews and selectively passes accepted candidates to `add_concept` / `add_relation`. Detects FSD vs generic layout. Use once when bootstrapping a fresh repo. |
| `infer_imports` | **R17** Walk TS/JS files and parse imports → file-level + module-level dependency edges. **side effect 0**. Resolves relative paths + `@/*` aliases (Next.js / FSD convention), classifies external (npm) separately, collapses to module edges (folder-prefixed capability/element slug A → B with import count). The agent reviews `moduleEdges` and selectively passes accepted edges to `add_relation` as `depends_on`. Use after `analyze_repo_structure` to pull *real* dependency edges from the code. |
| `add_concept` | Creates a new `.md` node. Required: `slug`, `kind`, `title`. Optional: `domain`, `capabilities`, `elements`, `body`. **R14**: frontmatter is normalized per kind (project gets `domains/capabilities/elements: []`; capability gets `elements: []`; capability/element should set `domain` — missing extras come back in `warnings`). Graph arrays are canonicalized as sets (trimmed, deduped, sorted) on creation/import. Body defaults to a kind-specific starter. Throws if the slug already exists. Changed writes return compact `postWriteMaintenance` so agents can immediately continue graph cleanup. |
| `add_concepts` | **R+** Batch writer — accepts `{concepts: [{slug, kind, title, ...}, ...]}` (max 50), returns `{concepts: [{slug, ok: true, filePath, warnings?} | {slug, ok: false, error}, ...]}` plus one compact `postWriteMaintenance` when at least one row changes the vault. Each row processed independently — existing-slug / invalid-kind / missing-required surface as `ok:false` rows; the rest still land. Order preserved. Pre-checks duplicate slugs *within the input batch* and fails the second occurrence with a clear "duplicate slug in input batch" error. **No atomic rollback** — for all-or-nothing semantics use single `add_concept` calls. Use after `analyze_repo_structure` / `infer_imports` (or any bootstrap flow) when the agent has K accepted candidates. |
| `add_relation` | Adds an edge between two slugs. `type`: `depends_on` (→ dependencies), `relates`, `contains`, `describes`, `domains`, `capabilities`, `elements`, or `domain` (inline parent). Direct slugs, unique tail aliases, and frontmatter `slug:` aliases are resolved to the canonical file slug before write. Array-backed types are stored as canonical sets (trimmed, deduped, sorted); `domain` is idempotent when already equal and otherwise refuses to replace an existing domain without `patch_concept`. **R11**: optional `expected_mtime` on the source slug for conflict detection. Changed writes return compact `postWriteMaintenance` so agents can immediately continue graph cleanup. |
| `add_relations` | **R+** Batch edge writer — accepts `{relations: [{from, to, type}, ...]}` (max 50), returns `{relations: [{ok: true, from, to, type, alreadyExists?: bool} | {ok: false, from, to, type, error}, ...]}` plus one compact `postWriteMaintenance` when at least one row changes the vault. Each row processed independently and idempotently — same edge twice in batch returns `alreadyExists: true` on the second; missing source/target slugs / unknown type surface as `ok:false` rows; the rest still land. Response rows preserve input order; stored frontmatter arrays are canonicalized as graph sets. Use after `analyze_repo_structure` (suggestedRelations) / `infer_imports` (moduleEdges), or to wire project/domain/capability/element containment without manual `patch_concept`. Tip: avoid `expected_mtime` in batch when multiple rows share the same `from` slug — the first row mutates that file so the second would see a stale mtime. **No atomic rollback** — for all-or-nothing semantics use single `add_relation` calls. |
| `patch_concept` | Updates an existing node's frontmatter (per-key patch — `null` deletes a key) and/or body. Graph arrays patched through this tool are canonicalized as sets (trimmed, deduped, sorted), matching `add_concept` / `add_relation` write behavior. Use this when you need to *modify* a slug that `add_concept` would reject as duplicate. **R11**: optional `expected_mtime` for conflict detection — pass the `mtime` from `get_concept`; throws `VaultConflictError` if the file has been modified externally since you read it. Changed writes return compact `postWriteMaintenance`. |
| `delete_concept` | **v0.4 ⚠ DESTRUCTIVE** Permanently deletes a node. Two-stage safety: ① without `confirm:true`, runs as a dry-run (with a backlinks preview); ② if backlinks exist, throws unless `force:true`. The response captures the deleted frontmatter + body so you can recover from mistakes. **R11**: optional `expected_mtime` for conflict detection. Confirmed deletes return compact `postWriteMaintenance`. |
| `rename_concept` | **v0.7 ⚠ MULTI-FILE** Atomically renames a slug — moves the .md file, updates the moved file's `slug:` key, and rewrites every backlink (frontmatter array entries, inline string keys like `domain`, body links `[[oldSlug]]` / `(oldSlug.md)`). Tail-only references (`mcp-server` for `capabilities/mcp-server`) are also redirected. Without `confirm:true`, runs as a dry-run with a full update preview. Replaces the manual loop of `find_backlinks` + N `patch_concept` calls. **R11**: optional `expected_mtime` for the source slug. Confirmed renames return compact `postWriteMaintenance`. |
| `merge_concepts` | **v0.7 ⚠ DESTRUCTIVE MULTI-FILE** Folds `fromSlug` into `intoSlug` — every backlink to `fromSlug` is redirected, then `fromSlug.md` is deleted. The `intoSlug` node is preserved as-is (frontmatter / body are not auto-merged — use `patch_concept` after if you want to combine descriptions). Without `confirm:true`, runs as a dry-run. **R11**: optional `expected_mtime` for `fromSlug`. Confirmed merges return compact `postWriteMaintenance`. |

Read/query numeric options are intentionally strict. `tools/list` exposes the same
integer / minimum / maximum constraints that the runtime enforces for
`list_concepts.limit`, `find_neighbors.limit`, `find_path.maxHops`,
`query_concepts.limit`, `compile_ontology` pagination, and `query_ontology`
limit/depth/iteration controls, so MCP clients and agents can correct invalid
arguments before the tool call instead of relying on silent fallback.
Batch arrays expose the same runtime cap as schema too: `get_concepts.slugs`,
`add_concepts.concepts`, and `add_relations.relations` all advertise
`maxItems: 50`.

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
# Larger/slower vaults can raise the child-process wait window:
OMOT_VERIFY_TIMEOUT_MS=15000 OMOT_VAULT=../docs/ontology npm run verify
```

A successful run looks like this:

```
[oh-my-ontology-mcp verify]
· step 1 — parser smoke test
✓ result: 7 passed, 0 failed
· step 2 — server boot + tools/list + list_concepts (vault=../docs/ontology, timeout=8000ms)
✓ initialize OK — server oh-my-ontology-mcp@0.12.0
✓ tools/list 23/23 — add_concept · add_concepts · add_relation · add_relations · analyze_repo_structure · compile_ontology · delete_concept · find_backlinks · find_evidence · find_neighbors · find_orphans · find_path · get_concept · get_concepts · infer_imports · list_concepts · list_kinds · merge_concepts · patch_concept · query_concepts · query_ontology · rename_concept · validate_vault
✓ list_concepts — vault total 28 nodes (vaultRoot /path/to/docs/ontology)
✓ validate_vault — 28 files, problemFiles 0
✓ workspace_brief — healthy (28 nodes, nextActions 1)
✓ health — healthy (5 checks, issues 0)

All passed — register .mcp.json with Claude Code and restart to use the 23 tools.
```

On failure, it tells you which step blocked progress and prints a diagnostic message. The
verify path exercises and gates the same first-contact graph diagnosis an agent should run:
`tools/list`, `list_concepts`, `validate_vault`,
`query_ontology({operation:"workspace_brief"})`, and
`query_ontology({operation:"health"})`. `list_concepts` vault warnings,
`validate_vault` problem files, or failing health checks fail the command; advisory
`needs_attention` states still print so starter vaults can
verify before cleanup. The default wait window is 8 seconds; set
`OMOT_VERIFY_TIMEOUT_MS` to a positive integer millisecond value if your vault
is large or on a slow filesystem.

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
> 3. Call `find_neighbors({ slug: "capabilities/mcp-server" })` to inspect the local graph around that capability.
> 4. (Optional) Call `add_concept` to create a new capability node — `slug`, `kind`, and `title` are required.

If those four tools respond cleanly, your read/write round-trip against the vault is working. Once an agent starts *committing* its analysis of your codebase to the ontology through these 23 tools (15 read + 8 write), the human + AI co-authoring loop is officially open.

## Design principles

- **stdin/stdout JSON-RPC** — Claude Code spawns the server as a child process. stdout is *protocol-only*; logs go to stderr.
- **Synchronous fs** — MCP call frequency is low enough that async overhead isn't worth it.
- **Frontmatter preservation** — `add_relation` keeps the existing frontmatter intact and only patches the relevant array key (idempotent — duplicates respond with `alreadyExists: true`).
- **Vault-root sandbox** — `slug` is always vault-relative. The server never writes outside `OMOT_VAULT`.

## Status

- 0.10.0 — 23 tools. Added `get_concepts`, `add_concepts`, `add_relations`, `validate_vault`, `find_neighbors`, `compile_ontology`, and `query_ontology` (`neighbors` / `path` / `all_paths` / `query_plan` / `centrality` / `communities` / `similar_nodes` / `explain_relation` / `reachability` / `pattern_walk` / `impact` / `blast_radius` / `subgraph` / `overview` / `schema` / `facets` / `match_nodes` / `match_edges` / `node_profile` / `domain_profile` / `domain_matrix` / `project_scope` / `project_map` / `relation_check` / `components` / `lineage` / `containment_tree` / `cycles` / `topological_order` / `recommend_relations` / `growth_plan` / `maintenance_plan` / `workspace_brief` / `health`); current split is 15 read + 8 write.
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
