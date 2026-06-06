# ontology-atlas-mcp

> The MCP server for a repo-native AI-agent memory layer. It lets Claude Code,
> Cursor, Codex, and other MCP clients read, query, and maintain the markdown
> ontology vault stored beside the code.

The vault is still plain markdown. The graph-database-like behavior comes from
`compile_ontology` and `query_ontology`, which build and query a deterministic
runtime graph artifact without introducing a backend database. During one MCP
server session, repeated `query_ontology` calls reuse the compiled artifact
while the vault document signature is unchanged, so agent run orders avoid
recompiling the same graph over and over.

## Quick start

### 1. Register with an agent

The shortest path is to let the CLI or installed app starter write the agent configs:

```bash
npx ontology-atlas init ./ontology
```

That creates the starter markdown vault plus ready-to-use MCP config files:

- `.mcp.json` for Claude Code / Cursor
- `.codex/config.toml` for Codex

Open either the codebase root or the vault folder in the agent and restart it.
The generated root config points at `./ontology`; the vault-local config uses
`OATLAS_VAULT=.` so the folder stays portable.

For an existing vault, run `ontology-atlas agent-setup ./ontology --write` from
the codebase root. It checks or creates only `.mcp.json` and
`.codex/config.toml`, preserving existing configs and writing merge templates
when manual review is needed.

For manual Claude Code / Cursor registration, create a `.mcp.json` at your
project root:


```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "node",
      "args": ["./mcp/src/index.js"],
      "env": {
        "OATLAS_VAULT": "./docs/ontology"
      }
    }
  }
}
```

Or, once published to npm, via `npx`:

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "npx",
      "args": ["-y", "ontology-atlas-mcp"],
      "env": {
        "OATLAS_VAULT": "./docs/ontology"
      }
    }
  }
}
```

For manual Codex registration, either use the generated `.codex/config.toml` or
add a global server:

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/vault -- npx -y ontology-atlas-mcp
```

If `OATLAS_VAULT` is not set, the current working directory is used as the vault root.

### Source-checkout verification

When editing this MCP package from the monorepo, prefer the focused root checks
before escalating to the full integration suite:

```bash
pnpm test:contracts
pnpm test:mcp:unit
pnpm integration:mcp:surface
pnpm integration:mcp:repo-analysis
pnpm integration:mcp:graph
pnpm integration:mcp:vault-read
pnpm integration:mcp:read
pnpm integration:mcp:write
pnpm integration:mcp:readme
pnpm test:mcp:docs
pnpm test:mcp:registration
pnpm test:mcp:dogfood
pnpm test:mcp:dogfood:timeout
pnpm test:mcp:maintenance
pnpm test:mcp:package
pnpm test:mcp:suggestions
pnpm test:mcp:verify
pnpm test:mcp:verify:first-contact
pnpm test:mcp:verify:timeout
pnpm integration:cli:compile
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm test:dogfood:args
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:agent
pnpm dogfood:agent-graph-db-pack
pnpm dogfood:graph-db
pnpm dogfood:agent-setup-gate
pnpm dogfood:agent-fallbacks
pnpm dogfood:brief
pnpm dogfood:growth
pnpm dogfood:maintenance
pnpm dogfood:status
pnpm test:dogfood:status
pnpm test:dogfood:graph-db
pnpm dogfood:verify
pnpm dogfood:test
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
pnpm cli:mcp-verify -- --help
```

`integration:mcp:surface` narrows the JSON-RPC `tools/list`, `initialize`, and
`tools/call` server surface. `integration:mcp:repo-analysis` narrows code-to-vault analysis
handler contracts. `integration:mcp:graph` narrows graph artifact/query handler contracts.
`integration:mcp:vault-read` narrows list/get/find/path/orphans/validate vault read contracts.
`integration:mcp:read` narrows `query_concepts` and shared read/query validation
contracts without duplicating graph or repo-analysis subsets.
`integration:mcp:write` narrows write tool handler contracts.
`integration:mcp:readme` runs the documented
first-contact read-only MCP flow only. `test:mcp:unit` runs the MCP core parser, vault, compiler, query,
import-analysis, ignore-file, and JSON-RPC line helper unit contracts without
spawning the full integration suite; when `pnpm checks:changed` prints a direct
`pnpm exec node --test mcp/src/<name>.test.mjs` command, run that first for the
smallest matching MCP core check. `test:mcp:docs` checks README and dogfood ontology documentation drift.
`test:mcp:registration` checks only the tracked source-checkout `.mcp.json`,
`.mcp.json.example`, and `.codex/config.toml` templates.
`test:mcp:dogfood` covers the dogfood helper's structuredContent output,
indexed `compile_ontology` gate, tools/list inventory names + annotation coverage, batch writer
row-label guidance summary, vault warning / `validate_vault` problem gates,
first-contact health summary / advisory / next-action gates, `workspace_brief.nextActions[].sample`
shape drift, maintenance_plan malformed payload and work-queue formatter drift,
initialize tool-inventory + safety/recovery guidance gate, destructive dry-run request/gate
contract, help output, unsupported-argument rejection, strict relation filter
rejection, strict add_relation type-preflight rejection + no-write metadata
evidence, strict closest-value summary, stderr warning filtering, and gate
contract without running the live MCP walk.
`test:mcp:dogfood:timeout` narrows that to dogfood argument rejection,
timeout parsing, missing response labels, and retry help.
`test:mcp:maintenance` narrows maintenance_plan filter enums, ready/missing
cursor handling, resume-cursor behavior, dogfood work-queue shape gates, and
bucket / next-action formatter checks.
`test:mcp:package` checks package-script, CLI entrypoint, dependency, and
tarball contract drift without running unrelated UI or E2E gates.
`test:mcp:suggestions` covers strict enum / argument suggestion behavior.
`test:mcp:verify` covers the MCP verify helper contract, including
missing/extra/duplicate/invalid `tools/list` names, without spawning the
full integration suite. `test:mcp:verify:first-contact` narrows that to
initialize tool-inventory + safety/recovery guidance, unknown-tool recovery, read-smoke request
inventory, destructive dry-run / `patch_concept` conflict guard helper gates,
vault warning / `validate_vault`, first-contact health summary / advisory / next-action gates, and
`workspace_brief.nextActions[].sample` shape drift.
`test:mcp:verify:timeout` narrows verify timeout parsing, startup failure
retry guidance, usage, empty-vault fail-fast, and retry diagnostics.
`integration:cli:compile` narrows CLI compile / `--fix` canonicalization
contracts without running unrelated CLI routes.
`dogfood:compile` prints the dogfood vault `compile_ontology` summary JSON
snapshot without running the full installed-style MCP verify walk.
`dogfood:health` prints the dogfood vault fail-closed `health` JSON gate
without running the full installed-style MCP verify walk.
`dogfood:agent-graph-db-pack` prints the dogfood vault shell-pasteable graph DB pack
without running the full installed-style MCP verify walk.
`dogfood:graph-db` runs the dogfood vault graph DB pack runtime gate without
running the full installed-style MCP verify walk.
`dogfood:agent-setup-gate` prints the dogfood vault machine-readable agent setup gate with `ok` and `performanceOk` so agent automation can separate broken setup from slow local fallback latency.
`dogfood:brief` prints the dogfood vault `workspace_brief` JSON snapshot
without running the full installed-style MCP verify walk.
`dogfood:growth` prints the dogfood vault `growth_plan` JSON snapshot
without running the full installed-style MCP verify walk.
`dogfood:maintenance` prints the dogfood vault `maintenance_plan` JSON snapshot
without running the full installed-style MCP verify walk.
`dogfood:status` always runs health + workspace-brief + agent-brief + maintenance, prints `[dogfood:status] health:N · workspace-brief:N · agent-brief:N · maintenance:N`, preserves the first failing exit before escalating, and prints failed-child focused follow-ups (`pnpm dogfood:health`, `pnpm dogfood:brief`, `pnpm dogfood:agent`, or `pnpm dogfood:maintenance` + `pnpm test:mcp:maintenance`) before the `pnpm dogfood:verify` follow-up hint on failure.
`test:dogfood:status` checks that always-run shortcut contract without the full dogfood suite.
`test:dogfood:graph-db` checks the graph DB pack runner contract without invoking the live CLI pack.
Use `OATLAS_TEST_NAME_PATTERN` with `pnpm integration:mcp` when the touched MCP
integration case has a different name. For Node's `--test-name-pattern`, use
`pnpm exec node --test --test-name-pattern "..." mcp/src/integration.test.mjs`
instead of appending the flag after `pnpm integration:mcp --`. From the repo root,
focused integration subset and `test:mcp:*` shortcuts use
`scripts/run-focused-node-test.mjs` so typoed patterns fail when they match 0
tests instead of silently passing as all skipped, and signal-killed `node --test`
subprocesses report the signal plus target path. The wrapper requires an
explicit pattern and at least one test target; use `node --test` directly for an
intentional full run. Node test option values such as `--test-concurrency 1`
or `--test-timeout 1000` are not counted as targets, and a missing split option
value cannot leak the following option value into the target list. Focused runs
with TAP summaries end with `matched=N` before file-level `tests=N`, even when a
matched test fails, so the exact scoped test count is visible without
subtracting skipped tests. File setup/import failures are reported separately as
`setupFailures=N` instead of inflating the matched-test count.
`pnpm dogfood:compile` is the shortest dogfood vault compiler snapshot.
`pnpm dogfood:compile-fix` runs dogfood `compile --fix`, fails if canonicalization leaves a docs/ontology diff, tells you to run `pnpm docs-vault:build`, and ends successful runs with `[dogfood:compile-fix] docs/ontology unchanged`.
`pnpm test:dogfood:args` checks shared dogfood shortcut argument helpers without invoking any gate.
`pnpm test:dogfood:script-refs` checks help text and package script body `pnpm ...` references against root package scripts plus focused filter parsing and wrapper summaries.
`pnpm test:dogfood:compile-fix` checks that idempotence guard without the full dogfood suite.
`pnpm dogfood:health` is the shortest dogfood vault health gate.
`pnpm dogfood:agent-graph-db-pack` is the shortest dogfood vault graph DB pack snapshot.
`pnpm dogfood:graph-db` is the shortest dogfood vault graph DB pack runtime gate.
`pnpm dogfood:agent-setup-gate` is the shortest dogfood vault machine-readable setup gate with `ok` and `performanceOk`.
`pnpm dogfood:brief` is the shortest dogfood vault first-contact snapshot.
`pnpm dogfood:growth` is the shortest dogfood vault growth candidate snapshot.
`pnpm dogfood:maintenance` is the shortest dogfood vault maintenance queue snapshot. Use
`pnpm dogfood:status` for the cheap human-readable health + first-contact + agent handoff + maintenance queue;
it still prints the brief, agent handoff, and maintenance after health fails, preserves the first failing exit,
and prints failed-child focused follow-ups before the `pnpm dogfood:verify`
follow-up hint on failure. Use
`pnpm dogfood:compile-fix -- --help` / `pnpm dogfood:status -- --help`
for shortcut usage without running those gates; unsupported shortcut arguments fail
with exit 2 before starting the underlying checks, and close `--help` typos include
a `Did you mean --help?` hint. Use
`pnpm dogfood:verify` for the full installed-style dogfood vault gate, or
`pnpm dogfood:test` only when the dogfood helper itself needs the full
regression suite beyond the focused `test:mcp:dogfood` gate. Use
`pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` when you need
the explicit CLI wrapper arguments without changing into `mcp/`; use
`pnpm cli:mcp-verify -- --help` only for the help flag.

### 2. Restart the agent

The server connects over stdio. You should now see 24 tools under the `ontology-atlas` namespace.

### 3. Call the tools

```
"List every capability node in this project."
→ mcp__ontology-atlas__list_concepts({ kind: 'capability' })

"What elements does capabilities/mcp-server depend on?"
→ mcp__ontology-atlas__get_concept({ slug: 'capabilities/mcp-server' })
```

## The 24 tools

| Tool | What it does |
|---|---|
| `list_concepts` | Lists every node in the vault (any `.md` with a `kind:` frontmatter). Options: enum-validated `kind` (project/domain/capability/element/document/vault-readme; typos fail with nearest-value hints instead of empty lists), `domain` (filter by frontmatter `domain:` slug — combine with `kind` for "all capabilities under auth" in one call), `since` (mtime-based incremental sync — only nodes with `mtime > since` ms; pair with the `mtime` returned in earlier responses for "what changed since I last looked"; strict `>` so re-passing the prior max does not double-fetch), `summary` (opt-in — when true, each row includes a prose `summary` (max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`) so agents get list + previews in one call instead of N follow-up `get_concept` calls; default off to keep payload small), `limit` (default 100, max 500). Each node row includes `mtime` (ms) — agents can sort/filter "what changed recently" without a follow-up `get_concept` call. **R11+**: when the vault has frontmatter corruption or whole-vault graph-reference drift, response includes `vaultWarnings: { errorCount, warningCount }` so AI agents can flag it to the user. |
| `get_concept` | Fetches a single node by `slug` (no extension): frontmatter + body excerpt (R+ — *prose-only*: heading / 표 / 코드블록 / 리스트 / 인용 skip 후 첫 단락만 — agent 가 markdown table syntax 대신 사람이 의도한 설명문을 받음, max 800 chars) + graph `neighbors` (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) + `outgoingEdges[]` (`{to, via}`) + `mtime` (ms — pass to subsequent `patch_concept` / `delete_concept` as `expected_mtime` to detect concurrent external edits). **R11+**: response includes `warnings: [...]` when this doc has frontmatter issues, graph-array canonicality drift, or dangling outgoing graph references. |
| `get_concepts` | **R+** Batch reader — accepts an array of slugs (max 50), returns `concepts[]` with the same per-row shape as `get_concept` (frontmatter + excerpt + neighbors + mtime + warnings?). Order of `concepts[]` matches input `slugs[]`. Missing or invalid slug rows return `{ slug, ok: false, error }` rather than aborting the batch, so later valid slugs still resolve. Replaces N×`get_concept` round-trips when an agent already has K specific slugs (e.g. from `list_concepts` / `find_path` / `find_orphans`) and needs full bodies for all of them. |
| `find_evidence` | Partial-match search by `title` — scans frontmatter title/capabilities/elements as well as body content. Each match row includes `slug, kind, title, domain, mtime, matchedIn, score, excerpt` (same shape as `list_concepts` / `find_backlinks` / `find_orphans` / `query_concepts` plus the `excerpt` is a prose preview, max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept`) so agents see *what the matching doc says* without a follow-up get_concept call. Matches are **ranked** by a deterministic relevance `score` (title match > frontmatter ref > body, + a title token-overlap tiebreaker) and returned best-first, so `matches[0]` is the most relevant node instead of walk-order; pass `limit` for the top-N. Inclusion is unchanged (a node matches iff a substring hit, exactly as before) — ranking only reorders. |
| `find_backlinks` | Finds every node that points to a given `slug`. Inspects all frontmatter array keys (capabilities / elements / dependencies / relates / …) plus body wikilinks/markdown links. Each match row includes `kind`, `title`, `domain`, `mtime` (same shape as `list_concepts`) — agents can sort/filter "which referrer is in domain X" or "which referrer was touched recently" without follow-up `get_concept` calls. |
| `find_neighbors` | **R+** One-hop graph neighborhood around a node. Accepts `slug`, optional `direction` (`outgoing` / `incoming` / `both`, default both), optional enum-validated `types` relation filter (`depends_on` is normalized to stored `dependencies`; typos fail with nearest-value hints), `includeNodes`, and `limit`. Returns canonical `edges[]` (`{direction, from, to, via, ref, resolved}`) plus neighbor node summaries so agents can inspect a local graph subview without combining `get_concept` + `find_backlinks` manually. |
| `find_path` | Shortest path between two slugs (BFS, undirected). Returns `{ from, to, hops, nodes, edges, hopCount, found }` where `nodes[i] = { slug, kind, title, domain? }`, `edges[i] = { from, to, via }`, and `via` is the frontmatter key (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair — so the agent sees not just *that* A and B are connected but *which nodes* and *why*. Option: `maxHops` (default 5, max 20). |
| `list_kinds` | Vault kind census: `{ total, byKind: { capability: N, ... } }`. |
| `find_orphans` | **v0.5** Finds isolated nodes — docs that no other node references through graph frontmatter (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`). Options: enum-validated `kind` (filter) and `excludeKinds` (skip, default `['project', 'vault-readme']`; pass `[]` to include every kind); typos fail with nearest-value hints. Each orphan row includes `kind`, `title`, `domain`, `mtime` (same shape as `list_concepts` / `find_backlinks`) — agents can sort/filter "old orphans in domain X" without follow-up `get_concept` calls. Useful as a starting point for cleanup or auditing unused nodes. |
| `query_concepts` | **v0.6** Typed filter DSL — `kind=X AND has(Y) AND NOT ...`. Saved-filter / smart-list use case. `kind` values and `has(...)` graph keys are enum-validated with nearest-value hints, and `has(depends_on)` is canonicalized to `dependencies`, so typos do not silently return empty match sets. `limit` defaults to 100 and is capped at 500. Each match row includes `slug, kind, title, domain, capabilities, elements, mtime` (same shape as `list_concepts` / `find_backlinks` / `find_orphans`) so agents can sort/filter staleness without follow-up calls. |
| `compile_ontology` | **R+** Compiler-style graph artifact for database-like use. Compiles the whole vault into deterministic `nodes[]`, canonical `edges[]`, alias tables, graph issues, graph-array canonicalization actions, stable semantic `graphHash`, `maxMtime`, and optional query indexes (`out`, `in`, `byKind`, `byDomain`, `edgeById`, `aliasToSlug` with `includeIndexes:true`). Canonicalization action `keys` are schema-bound to relation-array frontmatter keys, and action `frontmatter` is relation-array-only so agents can distinguish safe reordering patches from arbitrary frontmatter mutation. Use before advanced reasoning, export, caching, or non-developer graph views. side effect 0. <br>**Large-vault opts (R+):** `summary: true` returns counts + `graphHash` + `byKind`/`byDomain` aggregates (no arrays) — cheap polling for cache invalidation. `nodesLimit`/`nodesOffset` and `edgesLimit`/`edgesOffset` slice arrays with `nodesPagination` / `edgesPagination` meta (`{offset, limit, total, returned, hasMore, nextOffset}`); page-size limits are capped at 500. 100+ 노드 vault 에서 토큰 한도 초과 회피. |
| `query_ontology` | **R+** Graph-engine query over the compiled artifact. Operations: `neighbors` (local graph neighborhood), `path` (one compiled-edge route with aligned `nodes[]` summaries), `all_paths` (bounded simple paths between two nodes with per-path `nodes[]` summaries plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance), `query_plan` (EXPLAIN-style cost/index estimate plus `execution.shouldRun`, `nextStep`, filter-preserving `suggestedQuery`, filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, and safer narrowed payload guidance before a target operation), `centrality` (PageRank-style core-node ranking plus bridge/authority/hub lists), `communities` (label-propagation graph clusters), `similar_nodes` (duplicate/overlap candidates before writes), `explain_relation` (direct edges + shortest path + shared-neighbor explanation), `reachability` (transitive graph closure from a start node), `pattern_walk` (explicit relation-sequence paths), `impact` (incoming by default: what depends on this?), `blast_radius` (impact grouped by kind/domain with cross-domain edge risk), `subgraph` (bounded N-hop graph slice), `overview` (counts, relation distribution, hubs), `schema` (`kind → relation → kind` patterns), `facets` (filter/dashboard aggregates), `match_nodes` (graph DB-style node rows with degree filters plus a `followUp` packet for the first returned row: `node_profile`, incoming/outgoing `match_edges`, `blast_radius`, and CLI fallback commands), `match_edges` (graph DB-style edge pattern rows plus a `followUp` packet for the first returned real edge: `explain_relation`, `path`, `relation_check`, and CLI fallback commands), `node_profile` (single node detail dashboard), `domain_profile` (domain detail dashboard), `domain_matrix` (domain-to-domain coupling), `project_scope` (project-contained graph slice), `project_map` (domain-by-domain project map), `relation_check` (schema-aware preflight before `add_relation`), `components` (connected graph islands), `lineage` and `containment_tree` (project/domain/capability containment), `cycles` (directed dependency-cycle checks), `topological_order` (prerequisite-first dependency ordering), `recommend_relations` (safe domain-containment suggestions), `growth_plan` (side-effect-free ontology expansion candidates), `maintenance_plan` (ordered post-write graph cleanup/repair actions with stable action `id`, cursor resume via `afterActionId`, ready pages with `cursor.found=true` / `cursor.reason=null`, cursor miss `reason`, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable` flags, current-page `nextExecutableAction` / `nextReviewAction`, and `executableOnly` / `phases` / `severities` / `kinds` filters; `phases`, `severities`, and `kinds` are enum-validated), `agent_brief` (Claude Code/Codex handoff prompt, structured `graphDbQueryPack` for graph DB-style node scan / edge scan / graph facets / domain coupling / path evidence, structured `cliFallbackCommands[]` for connector-less sessions, recipes, graph entrypoints, playbook `evidence[]` and `stopWhen[]` checklists, `traversalStrategy` for plan-first bounded path evidence, write guardrails including post-change `health` / `cycles` / `growth_plan` / `maintenance_plan` / `validate_vault`, `relation_check` decision guide, `resultContracts` for interpreting `all_paths` completeness and `match_nodes` / `match_edges` followUp evidence, and read-first write policy; `agent-brief --graph-db-pack` and the UI copyable CLI pack include intent, evidence-rule, and proof-checklist comments so connector-less sessions see that scan rows are candidates until `totalMatches`/`limited`/row count, node or edge follow-up detail, and `evidence.pathsComplete` are cited), `workspace_brief` (first-contact status + next actions), and `health` (one-shot graph integrity dashboard; raw `components` are still reported, but vault README-only components are ignored for actionable health/nextActions). `match_nodes.kind` and `match_edges.fromKind` use the ontology node-kind enum; `match_edges.type` uses the relation-type enum; `match_edges.toKind` also accepts `external` and `unresolved` target kinds. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` include public names such as `depends_on` alongside canonical frontmatter `types` or `via` values such as `dependencies`, so CLIs and agents can show user-facing relation names without losing executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. Typoed values return nearest-value hints instead of empty result sets. `health` / `workspace_brief` / `agent_brief` can tune their internal probes with `componentLimit`, `cycleLimit`, `recommendationLimit`, `orderLimit`, `nodeLimit`, `dependencyTypes`, and `componentTypes`; `agent_brief` forwards the same probe tuning into its embedded readiness checks. Accepts canonical slugs or unique aliases. Use for graph-database-like answers without pulling the full compile payload. side effect 0. |

`agent_brief` also exposes guide metadata under `docs.workflowGuide`, the setup mode chooser under `docs.modeComparison`, and the graph scan proof steps under `docs.graphScanProofChecklist`, so agents can read the same mode and proof contracts without parsing Markdown or prompt prose.
| `validate_vault` | **R+** Validate every doc in the vault, return `{ scanned, problems: [{slug, issues}], summary: { problemFiles, errorFiles, warningFiles, byCode }, pathDrift }`. 8 issue codes (`unclosed-frontmatter`, `parse-zero-keys`, `missing-kind`, `empty-kind`, `unknown-kind`, `missing-expected-field`, `non-canonical-graph-array`, `dangling-graph-reference`); `outputSchema` restricts both `issues[].code` and `summary.byCode` keys to that set. `pathDrift` = vault→code path drift: frontmatter `path:` / `elements:` source paths missing on disk, resolved against `repoRoot` (input param, default server cwd) → `{ repoRoot, nodesScanned, pathsChecked, drifts: [{slug, kind, key, missingPath, suggestedPath?}], hint }`; ontology-slug refs are never flagged; fix via `patch_concept` or remove the stale entry. `suggestedPath` (optional, Track A #3) appears when exactly one existing repo source file shares the missing file's basename — a likely reconcile target ("the source moved here"); ambiguous (>1) or absent matches yield no suggestion. One round-trip whole-vault health check — use for first-contact before writes, before / after a batch write, or to surface issues. Replaces the K-roundtrip pattern of `list_concepts` then per-doc `get_concept` (whose `warnings: [...]` is per-file). |
| `analyze_repo_structure` | **R16** Analyze a code repository (default cwd) and propose ontology node candidates from `package.json` / `README.md` H2 / `src/` folders. **side effect 0** — vault NOT modified. Emits folder-prefixed slugs (`domains/*`, `capabilities/*`, `elements/src/...`) so candidates match the starter layout and CLI `add` defaults. The agent (or human) reviews and selectively passes accepted candidates to `add_concept` / `add_relation`. Detects FSD vs generic layout. Use once when bootstrapping a fresh repo. |
| `infer_imports` | **R17** Walk TS/JS files and parse imports → file-level + module-level dependency edges. **side effect 0**. Resolves relative imports, `tsconfig.json` `compilerOptions.paths` aliases, then fallback common `@/*` aliases; unresolved imports use schema-bound `reason` values: `empty`, `relative-not-found`, or `alias-not-found`. Classifies external (npm) separately, collapses to module edges (folder-prefixed capability/element slug A → B with import count plus `kindCounts`). The agent reviews `moduleEdges` and selectively passes accepted edges to `add_relation` as `depends_on`, using `kindCounts` to distinguish static-heavy edges from dynamic / require / re-export / side-effect evidence; the `outputSchema` restricts `kindCounts` to `static`, `dynamic`, `require`, `reexport`, and `side` positive-integer keys. Unless `reconcile:false`, also returns `reconciliation` (+ `reconciliationSummary` counts): the module edges diffed against the vault's compiled `depends_on` (stored key `dependencies`) edges, alias-normalized, into `inBoth` / `inCodeMissingFromVault` (both endpoints already vault nodes → directly landable, each with an `add_relation` `proposedAction`) / `inCodeMissingEndpointAbsent` (an endpoint is not yet a vault node — create it first) / `inVaultNotInCode` (vault dependency edges with no code import — review for stale) — i.e. *exactly what to sync* toward code↔vault drift 0, not a raw firehose. Use after `analyze_repo_structure` to pull *real* dependency edges from the code. |
| `index_project` | **R+** One read-only project ontology indexing checkpoint for large repos. Combines `analyze_repo_structure`, `infer_imports`, and `validate_vault` into counts, phases, validation status, and next write actions. **side effect 0** — it never writes markdown. Land reviewed candidates through `add_concepts` / `add_relations`, or use `ontology-atlas index [rootPath] --apply --vault [vault]` when the human explicitly accepts the batch. |
| `add_concept` | Creates a new `.md` node. Required: `slug`, `kind`, `title`. Optional: `domain`, `capabilities`, `elements`, `body`. **R14**: frontmatter is normalized per kind (project gets `domains/capabilities/elements: []`; capability gets `elements: []`; capability/element should set `domain` — missing extras come back in `warnings`). If an existing node already has the same title (normalized), a near-duplicate `warning` is added so the agent can `patch_concept` instead of forking a duplicate (the #1 growing-vault failure mode); batch `add_concepts` skips this scan for throughput. Graph arrays are canonicalized as sets (trimmed, deduped, sorted) on creation/import. Body defaults to a kind-specific starter only when omitted; an explicit empty string is preserved. Throws if the slug already exists. Changed writes return compact `postWriteMaintenance` so agents can immediately continue graph cleanup; the compact block preserves `operation:"maintenance_plan"`, `sideEffect:false`, `filters`, `limited`, cursor metadata, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, current-page next action pointers, and compact action rows with `score` and executable `proposedAction`. |
| `add_concepts` | **R+** Batch writer — accepts `{concepts: [{slug, kind, title, ...}, ...]}` (max 50), returns `{concepts: [{slug, ok: true, filePath, warnings?} | {slug, ok: false, error, errorCode?, ...repairFields}, ...]}` plus one compact `postWriteMaintenance` when at least one row changes the vault. Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`. Compact maintenance includes `byPhase` / `bySeverity` / `byKind` queue buckets, row `score`, executable `proposedAction`, and current-page next action pointers. Each row processed independently — existing-slug / invalid-kind / missing-required / non-object row shape / unknown row fields surface as `ok:false` rows whose `error` includes the `concepts[n]` row label; row failures also carry structured repair fields such as `errorCode`, `rowName`, `conflictSlug`, `firstSeenAt`, `receivedField`, `unknownFields`, `allowedFields`, and `receivedFields` when applicable. Single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints and `Received fields: ...`; the rest still land. Order preserved. Pre-checks duplicate slugs *within the input batch* and fails the later row with a `concepts[n] duplicate slug in input batch; first seen at concepts[m]` error plus structured `rowName` / `firstSeenAt`. A row whose normalized *title* matches an earlier landed row in the same batch still lands but carries a near-duplicate `warning` (patch the earlier node instead of forking the same concept) — no vault scan, in-batch comparison only. **No atomic rollback** — for all-or-nothing semantics use single `add_concept` calls. Use after `analyze_repo_structure` / `infer_imports` (or any bootstrap flow) when the agent has K accepted candidates. |
| `add_relation` | Adds an edge between two slugs. `type`: `depends_on` (→ dependencies), `relates`, `contains`, `describes`, `domains`, `capabilities`, `elements`, or `domain` (inline parent). Invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint plus structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`, and no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata. Direct slugs, unique tail aliases, and frontmatter `slug:` aliases are resolved to the canonical file slug before write. Array-backed types are stored as canonical sets (trimmed, deduped, sorted); `domain` is idempotent when already equal and otherwise refuses to replace an existing domain without `patch_concept`. **R11**: optional `expected_mtime` on the source slug for conflict detection. Changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers so agents can immediately continue graph cleanup. |
| `add_relations` | **R+** Batch edge writer — accepts `{relations: [{from, to, type}, ...]}` (max 50), where each row `type`: `depends_on` (→ dependencies), `relates`, `contains`, `describes`, `domains`, `capabilities`, `elements`, or `domain`; returns `{relations: [{ok: true, from, to, type, alreadyExists?: bool} | {ok: false, from, to, type, error, errorCode?, ...repairFields}, ...]}` plus one compact `postWriteMaintenance` when at least one row changes the vault. Invalid-only batches return no row-level `changed` / `alreadyExists` write metadata and no top-level `postWriteMaintenance`. Compact maintenance includes `byPhase` / `bySeverity` / `byKind` queue buckets, row `score`, executable `proposedAction`, and current-page next action pointers. Each row processed independently and idempotently — same edge twice in batch returns `alreadyExists: true` on the second; missing source/target slugs / unknown type / non-object row shape / unknown row fields surface as `ok:false` rows whose `error` includes the `relations[n]` row label; row failures also carry structured repair fields such as `errorCode`, `rowName`, `missingSlug`, `similarSlugs`, `createTool`, `valueName`, `receivedValue`, `suggestion`, `allowedValues`, `receivedField`, `unknownFields`, `allowedFields`, and `receivedFields` when applicable. Unknown type errors include a closest-value hint plus structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`. Single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and `Received fields: ...`; the rest still land. Response rows preserve input order; stored frontmatter arrays are canonicalized as graph sets. Use after `analyze_repo_structure` (suggestedRelations) / `infer_imports` (moduleEdges), or to wire project/domain/capability/element containment without manual `patch_concept`. Tip: avoid `expected_mtime` in batch when multiple rows share the same `from` slug — the first row mutates that file so the second would see a stale mtime. **No atomic rollback** — for all-or-nothing semantics use single `add_relation` calls. |
| `patch_concept` | Updates an existing node's frontmatter (per-key patch — `null` deletes optional keys) and/or body. Graph arrays patched through this tool must be clean string arrays and are canonicalized as sets (deduped, sorted); core scalar fields are strict too (`kind` must stay one of project/domain/capability/element/document, `domain`/frontmatter `slug` must be clean strings when present, and `body` must be a string). Use this when you need to *modify* a slug that `add_concept` would reject as duplicate. **R11**: optional `expected_mtime` for conflict detection — pass the `mtime` from `get_concept`; throws `VaultConflictError` if the file has been modified externally since you read it. Changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |
| `delete_concept` | **v0.4 ⚠ DESTRUCTIVE** Permanently deletes a node. Two-stage safety: ① without `confirm:true`, runs as a dry-run (with a backlinks preview); ② if backlinks exist, throws unless `force:true`. The response captures the deleted frontmatter + body so you can recover from mistakes. **R11**: optional `expected_mtime` for conflict detection. Confirmed deletes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |
| `rename_concept` | **v0.7 ⚠ MULTI-FILE** Atomically renames a slug — moves the .md file, updates the moved file's `slug:` key, and rewrites every backlink (frontmatter array entries, inline string keys like `domain`, body links `[[oldSlug]]` / `(oldSlug.md)`). Tail-only references (`mcp-server` for `capabilities/mcp-server`) are also redirected. Without `confirm:true`, runs as a dry-run with a full update preview; each `backlinkUpdates.updates[]` row includes the referrer `slug`, `title`, changed frontmatter keys, and `bodyChanged`. Throws if `newSlug` already exists unless `overwrite:true` is passed. Replaces the manual loop of `find_backlinks` + N `patch_concept` calls. **R11**: optional `expected_mtime` for the source slug. Confirmed renames return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |
| `merge_concepts` | **v0.7 ⚠ DESTRUCTIVE MULTI-FILE** Folds `fromSlug` into `intoSlug` — every backlink to `fromSlug` is redirected, then `fromSlug.md` is deleted. The `intoSlug` node is preserved as-is (frontmatter / body are not auto-merged — use `patch_concept` after if you want to combine descriptions). Without `confirm:true`, runs as a dry-run; each `backlinkUpdates.updates[]` row includes the referrer `slug`, `title`, changed frontmatter keys, and `bodyChanged`. **R11**: optional `expected_mtime` for `fromSlug`. Confirmed merges return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |

`query_ontology({operation:"cycles"})` keeps the slug path in each
`cycles[].nodes` array and also returns aligned `cycles[].nodeSummaries`
(`slug` / `kind` / `title` / `domain?`) so agents can read a dependency cycle
without issuing follow-up `get_concept` calls.

Read/query numeric options are intentionally strict. `tools/list` exposes the same
integer / minimum / maximum constraints that the runtime enforces for
`list_concepts.limit`, `find_neighbors.limit`, `find_path.maxHops`,
`query_concepts.limit`, `compile_ontology` pagination, and `query_ontology`
limit/depth/iteration/health controls, so MCP clients and agents can correct invalid
arguments before the tool call instead of relying on silent fallback. The
top-level `tools/call.arguments` value defaults to `{}` when omitted; null,
arrays, and scalar values are rejected by the MCP SDK or the server before tool
dispatch. Unknown top-level argument keys are rejected too, and `tools/list`
marks each input schema with `additionalProperties:false`, so typos like
`lmit` do not silently fall back to default behavior. Query limits above 500
and traversal caps above 20 are rejected instead of silently clamped by the
graph engine.
Unknown tool names fail closed too. The runtime keeps the `unknown_tool`
structured error code, adds the nearest tool-name hint when one is available
(for example `Did you mean "list_concepts"?`), and prints the allowed tool list
so an agent can repair a misspelled `tools/call.params.name` without an extra
`tools/list` round trip. The same repair data is present in
`structuredContent` as `receivedTool`, `suggestion`, and `allowedTools`, so MCP
clients do not need to parse the human-readable error text.
Unknown argument errors likewise include `toolName`, `receivedArgument`,
`unknownArguments`, `receivedArguments`, `suggestion`, and `allowedArguments`
when those fields apply, so single-argument and multi-argument typos can share
one structured repair path.
Row-level unknown field errors follow the same pattern: single-field errors
include both `receivedField` and a one-row `unknownFields` array, while
multi-field errors include every offending field plus nearest hints.
Invalid enum / filter / type values include the same structured repair shape
as `valueName`, `receivedValue`, `suggestion`, and `allowedValues`, so clients
can correct `operation:"overveiw"` without scraping the text form.
Missing node errors include `missingSlug`, `similarSlugs`, `recoveryTools`, and
optional `createTool`, so clients can choose between lookup, search, or
`add_concept` without parsing prose.
Slug conflict errors include `conflictSlug`, `recoveryTools`, and optional
`overwriteOption`, so clients can choose `patch_concept`, `rename_concept`, or
an explicit overwrite retry without scraping prose.
String-array options are strict too: relation filters such as
`find_neighbors.types` / `query_ontology.types`, `query_ontology.pattern`,
`maintenance_plan` filters, and analysis scan lists such as
`infer_imports.sourceFolders` / `ignore` reject non-string array items instead
of silently dropping them; blank, whitespace-padded, and null-byte items are
rejected at the MCP boundary as well. `list_concepts.kind` and `query_concepts`
validate `kind` values before scanning the vault, so `kind:"capabilty"` and
`kind=capabilty` fail with `capability` hints instead of returning empty result
sets. `query_concepts` also validates `has(...)` graph keys before scanning, so
`has(capabilties)` fails with a `capabilities` hint. `find_neighbors.types` is relation-type
enum validated before slug resolution, so `types:["depend_on"]` fails with a
`depends_on` hint instead of returning an empty neighborhood. `find_orphans.kind`
and `find_orphans.excludeKinds` are node-kind enum validated too, so
`kind:"capabilty"` fails with a `capability` hint instead of returning an empty
cleanup list. `maintenance_plan.phases` is additionally
limited to `validate` / `repair` / `link` / `materialize` / `review`, and
`maintenance_plan.severities` is limited to `fail` / `warn` / `info`, so typoed
agent work-queue filters cannot silently return an empty plan. `maintenance_plan.kinds`
is limited to `inspect_compile_issue` / `break_dependency_cycle` /
`canonicalize_graph_arrays` / `resolve_dangling_reference` /
`add_missing_relation` / `materialize_external_element` / `unassigned_node` /
`empty_domain` for the same reason.
`health` / `workspace_brief` / `agent_brief` relation filters expose the same enum schema for
`dependencyTypes` and `componentTypes` (`domains` / `domain` / `capabilities` /
`elements` / `dependencies` / `depends_on` / `relates` / `contains` /
`describes`), so clients can catch typos like `depend_on` before the call.
Scalar string options follow the same boundary across read and write tools:
slugs, repo paths, filters, titles, relation types, query targets, and cursor
ids reject blank, whitespace-padded, or null-byte values before graph
resolution, repo walking, or disk writes. `tools/list` exposes the same
`minLength` and pattern hints for those scalar strings and strict string-array
items so MCP clients can catch bad calls before sending them.
For `query_ontology({ operation: "relation_check" })`, relation `type` is
validated before endpoint slug resolution, so typoed values such as
`depend_on` still return the nearest-value hint even in empty or project-less
vaults where the requested endpoints do not exist. A clean `relation_check`
also returns `matchingEdges`, reverse-direction `inverseEdges`, nearby schema
patterns, and a `recommendation` decision (`skip_existing`, `review_inverse`,
`safe_to_add`, or `review_new_schema`). When the edge does not already exist it
also includes a ready-to-run `proposedAction` for `add_relation` so agents can
verify before they write.
Boolean options are also validated explicitly, including read/query flags and
destructive write safety switches such as `confirm`, `overwrite`, and `force`.
Write conflict guards are strict as well: every `expected_mtime` field must be
a non-negative finite number, so malformed values cannot silently disable the
concurrent-edit check.
Batch arrays expose the same runtime cap as schema too: `get_concepts.slugs`,
`add_concepts.concepts`, and `add_relations.relations` all advertise
`maxItems: 50`.
`query_ontology.targetOperation` also exposes the supported `query_plan`
targets as an enum so clients can offer valid choices instead of discovering
the subset through failed calls. The enum is sourced from the graph engine's
runtime allow-list, so schema and execution stay aligned when query support
changes. `query_ontology.operation` follows the same shared enum contract and
is rejected at the MCP boundary when omitted or unknown, instead of falling
through to an empty result. `query_plan` responses also include an `execution`
block with `shouldRun`, `nextStep`, `suggestedQuery`, and, when the plan should
be narrowed, a `saferQuery` the agent can run instead of guessing lower-cost
arguments. `centrality` plans use a PageRank-specific estimate with
`iterations`, resolved edge count, dangling node count, and `rankingWorkUnits`
instead of a generic aggregate scan, so coupling-audit agents can explain
ranking cost before running graph centrality. For `all_paths`, `limit` and
`searchBudget` are schema-advertised too, so agents can cap path enumeration
and inspect `evidence.status`, `evidence.pathsComplete`, `exhaustive`, and
`truncatedByBudget` before treating returned paths or `totalPaths` as complete
evidence.

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
# From the repo root, prefer the CLI wrapper for the dogfood vault:
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:agent
pnpm dogfood:agent-graph-db-pack
pnpm dogfood:graph-db
pnpm dogfood:agent-setup-gate
pnpm dogfood:agent-fallbacks
pnpm dogfood:brief
pnpm dogfood:growth
pnpm dogfood:maintenance
pnpm dogfood:status
pnpm test:dogfood:graph-db
pnpm dogfood:verify
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
# Inside mcp/, the package-local verifier has the same smoke scope:
OATLAS_VAULT=../docs/ontology npm run verify
npm run verify -- ../docs/ontology
npm run verify -- --vault ../docs/ontology
npm run verify -- ../docs/ontology --timeout-ms 15000
npm run verify -- --help
pnpm --filter ./mcp verify -- ../docs/ontology --timeout-ms 15000
pnpm --filter ./mcp verify -- --help
# Larger/slower vaults can raise the child-process wait window:
OATLAS_VERIFY_TIMEOUT_MS=15000 OATLAS_VAULT=../docs/ontology npm run verify
```

When both are present, an explicit positional vault or `--vault` argument takes
precedence over `OATLAS_VAULT`.
`npm run verify -- --help` and `pnpm --filter ./mcp verify -- --help` print the same first-contact scope; the direct verifier normalizes the leading pnpm separator before parsing flags. Filtered package invocations run from `mcp/`, so the repo dogfood vault is `../docs/ontology`; missing vault paths fail before server startup and empty vault folders fail before later read smokes with that recovery hint.
The scope includes
direct read smokes for `list_concepts` project probe / `get_concept` /
`get_concepts` / `find_evidence` / `find_backlinks` / `query_concepts` /
limited `query_concepts` / `analyze_repo_structure` / `infer_imports` /
`index_project` / `find_neighbors` / `find_path` / `find_orphans`,
strict unknown-tool / unknown-argument / invalid-enum rejection with structured
`errorCode` values (`unknown_tool` / `unknown_argument` / `invalid_arguments`), enum-validated
`maintenance_plan` filters, stale `patch_concept.expected_mtime` rejection with
`vault_conflict`, batch row isolation for non-object row shape,
unknown row field inputs with single-field structured repair plus all offending fields reported, reader/writer 50-row batch cap
rejection with `invalid_arguments`, invalid `add_relations` type hints, and duplicate
`add_concepts` slugs with `concepts[n]` / `relations[n]` error labels, and
maintenance_plan cursor handling (ready page +
missing `afterActionId`): the ready page must keep `cursor.found=true`,
`cursor.reason=null`, and the missing cursor still reports `cursor.found=false`,
reason, empty page, `cursor.nextAfterActionId=null`, and `cursor.hasMore=false`.
Ready pages also verify cursor metadata: `nextAfterActionId` must match the last
returned action, and `hasMore` must match the remaining page state.
When the ready page has at least one action, verify sends a valid
`afterActionId` resume request from the first returned action id and fails if
the resumed page repeats that cursor action or `remainingActions` does not
advance.
Ready pages also verify `nextExecutableAction` /
`nextReviewAction` point only at the first executable/review action in the
current returned page, including the action id, executable flag, `phase`, `kind`,
and `severity`.
This help path does not start the MCP server.

A successful run looks like this:

```
[ontology-atlas-mcp verify]
· step 1 — parser smoke test
✓ result: 7 passed, 0 failed
· step 2 — server boot + tools/list + list_concepts/project probe/get_concept/get_concepts/find_evidence/find_backlinks/query_concepts/limited query_concepts/analyze_repo_structure/infer_imports/index_project/find_neighbors/find_path/find_orphans/list_kinds/destructive dry-runs (vault=../docs/ontology, timeout=8000ms)
✓ initialize OK — server ontology-atlas-mcp@0.12.0
✓ initialize instructions — tool inventory plus first-contact safety and recovery guidance present
✓ tools/list 24/24 (24/24 titled; 16/16 read; 8/8 write; 3/3 destructive; 2/2 idempotent; 24/24 local-only) — add_concept · add_concepts · add_relation · add_relations · analyze_repo_structure · compile_ontology · delete_concept · find_backlinks · find_evidence · find_neighbors · find_orphans · find_path · get_concept · get_concepts · index_project · infer_imports · list_concepts · list_kinds · merge_concepts · patch_concept · query_concepts · query_ontology · rename_concept · validate_vault
✓ tools/list inventory names — missing/extra/duplicate/invalid checks passed
✓ tools/list schema contract — strict arguments + annotations + graph-query enums + graph kind enums/descriptions + write relation enums + health tuning + post-write maintenance schema
✓ strict arguments — unknown tool argument rejected at runtime
✓ strict arguments — multiple unknown tool arguments reported together
✓ strict tool names — unknown tool rejected with closest-name hint
✓ add_concepts — non-object, single/multi unknown-field repair, Received fields, duplicate-slug rows isolated with input indexes, and invalid-only batches return no write metadata
✓ add_relations — non-object, single/multi unknown-field repair, Received fields, invalid-type rows isolated with input indexes and closest-value hints, and invalid-only batches return no write metadata
✓ batch caps — get_concepts/add_concepts/add_relations reject 51 rows with invalid_arguments
✓ destructive dry-runs — rename_concept · merge_concepts · delete_concept preview without write-maintenance
✓ patch_concept conflict guard — stale expected_mtime rejected with vault_conflict
✓ strict enums — invalid query operation rejected with closest-value hint
✓ strict maintenance filters — invalid phase/severity/kind rejected at runtime (phases=validate/repair/link/materialize/review; severities=fail/warn/info; kinds=inspect_compile_issue/break_dependency_cycle/canonicalize_graph_arrays/resolve_dangling_reference/add_missing_relation/materialize_external_element/unassigned_node/empty_domain)
✓ strict relation filters — invalid dependencyTypes rejected with closest-value hint
✓ strict list_concepts filters — invalid kind rejected with closest-value hint
✓ strict query_concepts filters — invalid kind/has-key rejected with closest-value hints
✓ strict find_neighbors filters — invalid relation types rejected before slug resolution with closest-value hint
✓ strict find_orphans filters — invalid kind/excludeKinds rejected with closest-value hints
✓ strict relation_check — invalid type rejected before endpoint resolution with closest-value hint and structured repair
✓ strict add_relation — invalid type rejected before endpoint resolution with structured repair and no write metadata
✓ strict graph filters — invalid match_nodes.kind/sort, match_edges.type, and recommend_relations.kind rejected with narrowed diagnostics
✓ strict graph edge kind filters — invalid match_edges.fromKind/toKind rejected with closest-value hints
✓ maintenance cursor — missing afterActionId reported (afterActionId not found in filtered maintenance actions; phase none; severity none; kind none; executable none; review none)
✓ maintenance cursor — ready page stable (0 remaining actions; phase none; severity none; kind none; executable none; review none)
· maintenance cursor — resume skipped (ready page has no actions)
✓ list_concepts — vault total 94 nodes (vaultRoot /path/to/docs/ontology)
✓ get_concept — project (6 outgoing edges)
✓ get_concepts — 2 ok rows, 1 partial row
✓ find_evidence — 54 evidence results for "project"
✓ find_backlinks — project (1 backlink)
✓ query_concepts — 1 query result / 1 total query result
✓ query_concepts limited — 1 query result / 93 total query results (limited true)
✓ analyze_repo_structure — fsd (4 domain candidates, 20 capability candidates, 29 element candidates)
✓ infer_imports — 626 files scanned, 469 module edges (elements/src/widgets/docs-vault->capabilities/docs-vault x14 (static:14), elements/src/views/docs-vault->elements/src/widgets/docs-vault x13 (static:12/dynamic:1), +467 more)
✓ index_project — 54 concept candidates, 469 import relations, validation 0 problem files
✓ find_neighbors — src/widgets/bottom-tab-bar (4/4 edges, limited false)
✓ find_path — src/widgets/bottom-tab-bar → project (2 hops, 2 edges)
✓ find_orphans — 0 orphans (root/sentinel defaults excluded)
✓ list_kinds — 94 nodes (capability:32, document:1, domain:6, element:53, project:1, vault-readme:1)
✓ validate_vault — 94 files, 0 problem files
✓ project probe — 1 project node
✓ workspace_brief — healthy (94 nodes, 0 next actions, 5 health checks, growth actions:0 external:0 ignoredExternal:195)
✓ agent_brief — healthy (ready 100/100, 3 entrypoints, 5 first calls, 5 graph DB pack items, 4 playbooks, 3 write guardrails, 3 result contracts)
✓ workspace_brief_tuned — healthy (94 nodes, 1 next action, 5 health checks, growth actions:0 external:0 ignoredExternal:195; dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies; nodeLimit=3)
· workspace_brief_tuned non-blocking advisory nextActions — components/health_check:info:2 - The scoped ontology graph has disconnected actionable islands.
✓ health — healthy (issues:0, unresolved:0, cycles:0, 5 checks: compile_issues:pass:0, unresolved_edges:pass:0, dependency_cycles:pass:0, relation_recommendations:pass:0, components:pass:1)
✓ health_tuned — healthy (issues:0, unresolved:0, cycles:0, 5 checks: compile_issues:pass:0, unresolved_edges:pass:0, dependency_cycles:pass:0, relation_recommendations:pass:0, components:info:2; dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies)
· health_tuned non-blocking advisory checks — components:info:2 - The scoped ontology graph has disconnected actionable islands.
✓ compile_ontology — graph 26b74f2aaa1c (94 nodes, 543 edges, issues 0)
✓ compile_ontology page — 1/94 nodes, 1/543 edges
✓ compile_ontology indexes — out 94, in 93, edgeById 543, aliases 187, edges 348/195/0
✓ overview — graph 26b74f2aaa1c (94 nodes, 543 edges, hubs 5)
✓ overview query_plan — aggregate_scan (medium, nodes 94, edges 543)
✓ project_map query_plan — aggregate_scan (medium, nodes 94, edges 543)
✓ neighbors — src/widgets/bottom-tab-bar (4/4 edges, limited false)
✓ path — src/widgets/bottom-tab-bar → project (2 hops, 2 edges)
✓ all_paths — src/widgets/bottom-tab-bar → project (5/16 paths, budget 1000, expanded 1000, exhaustive false, evidence partial)
✓ project_scope — project (92 nodes, internalEdges 342)
✓ read census consistency — 94 nodes across list_kinds/list_concepts/compile_ontology/overview, 6 kinds
✓ structuredContent — direct 16/16, write 5/5 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 3/3), maintenance 2/2 (resume skipped: no actions), graph 13/13

All passed — register .mcp.json with your MCP client and restart to use the 24 tools.
```

On failure, it tells you which step blocked progress and prints a diagnostic message. The
verify path exercises and gates the same first-contact graph diagnosis an agent should run:
`tools/list`, `list_concepts`, a project-node `list_concepts` probe,
`get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`,
`query_concepts`, limited `query_concepts`, `analyze_repo_structure`,
`infer_imports`, `index_project`, `find_neighbors`, `find_path`, `find_orphans`,
`list_kinds`, `validate_vault`,
`query_ontology({operation:"workspace_brief"})`, tuned
`query_ontology({operation:"workspace_brief"})`,
`query_ontology({operation:"health"})`, and tuned
`query_ontology({operation:"health"})`, plus `compile_ontology({summary:true})`
and paginated `compile_ontology({nodesLimit:1, edgesLimit:1})`,
`compile_ontology({nodesLimit:1, edgesLimit:1, includeIndexes:true})`,
`query_ontology({operation:"overview"})`, and
`query_ontology({operation:"query_plan", targetOperation:"overview"})` /
`query_ontology({operation:"query_plan", targetOperation:"project_map"})`,
plus actual `query_ontology({operation:"neighbors"})`,
`query_ontology({operation:"path"})`, and
`query_ontology({operation:"all_paths"})`, and
`query_ontology({operation:"project_scope"})` smoke calls.
The indexed compile smoke verifies index shape, count alignment, edge membership,
known-slug references, and resolved/external/unresolved edge breakdowns.
It also requires every exercised direct read, write row-isolation smoke,
destructive dry-run smoke, maintenance cursor, and
`query_ontology` graph-query response to include `structuredContent`, and
compares that payload with the text JSON payload, so agents can consume MCP
results without reparsing text. Successful verify output summarizes the
direct-read, write, maintenance-cursor, and graph-query `structuredContent` coverage
that was enforced in the run.
Destructive dry-run smoke calls `rename_concept`, `merge_concepts`, and
`delete_concept` against live vault slugs without writing, and fails if the
preview is missing or includes `changed` or `postWriteMaintenance`.
The `tools/list` gate also checks that every tool rejects unknown arguments via
`additionalProperties:false`, that every tool exposes the expected
`annotations.title` display name, `annotations.readOnlyHint` read/write split,
`annotations.destructiveHint` for destructive multi-file/delete tools, and
`annotations.openWorldHint:false` for the local vault-only boundary. It also checks `annotations.idempotentHint`
for retry-safe relation writers (`add_relation` / `add_relations`), and that required `query_ontology.operation` plus
the `query_ontology.operation` / `query_ontology.targetOperation` enums match
the graph engine's runtime allow-lists. It also checks the `list_kinds`
`outputSchema` and matching `structuredContent` census payload, the `validate_vault`
`outputSchema` and matching `structuredContent` health payload, the `list_concepts`
`outputSchema` and matching `structuredContent` node table payload, the `get_concept`
`outputSchema` for single-node detail payloads, the `get_concepts`
`outputSchema` and matching `structuredContent` batch payload, the `find_evidence`
`outputSchema` and matching `structuredContent` evidence-match payload, the `find_backlinks`
`outputSchema` and matching `structuredContent` backlink-match payload, the `find_neighbors`
`outputSchema` and matching `structuredContent` local-neighborhood payload, the `find_path`
`outputSchema` and matching `structuredContent` shortest-path payload, the `find_orphans`
`outputSchema` and matching `structuredContent` orphan-list payload, the `query_concepts`
`outputSchema` and matching `structuredContent` typed-filter payload, the `compile_ontology`
`outputSchema` and matching `structuredContent` graph-summary / full-artifact payload, the `analyze_repo_structure`
`outputSchema` and matching `structuredContent` bootstrap-candidate payload, the `infer_imports`
`outputSchema` and matching `structuredContent` import-graph payload, the `add_concept`,
`add_relation`, and `patch_concept` single writer `outputSchema` contracts, the `add_concepts`
and `add_relations` batch writer `outputSchema` row contracts, the `rename_concept`,
`merge_concepts`, and `delete_concept` destructive writer dry-run/confirm `outputSchema`
contracts, the installed batch
input schemas for the same 50-row cap used by `get_concepts`, `add_concepts`,
and `add_relations` at runtime, the `find_orphans.kind` / `find_orphans.excludeKinds`
node-kind enum schemas and root/sentinel default description, plus write-safety schemas for
`expected_mtime` conflict guards, destructive-tool `confirm` dry-run switches,
`rename_concept.overwrite`, and `delete_concept.force`. It also verifies write
tool descriptions keep compact `postWriteMaintenance` bucket summaries
(`byPhase` / `bySeverity` / `byKind`), action `score`, executable
`proposedAction`, and current-page next action pointer guidance, so
installed MCP clients can infer cleanup priority and next write intent from
`tools/list` alone.
The `initialize.instructions` gate fails if first-contact guidance loses the
read-only diagnosis flow, `expected_mtime`, `rename_concept` existing
`newSlug` / `overwrite: true` safety, or `delete_concept.force` / dangling
referrers safety. It also gates strict-input typo recovery guidance, including
unknown argument rejection plus nearest argument/value hints such as
`Did you mean "limit"?` and `Did you mean "overview"?`. Unknown-argument
errors also include `Received arguments: ...` so an agent can repair the exact
submitted key set instead of guessing from allowed fields alone. Invalid enum
errors expose `valueName`, `receivedValue`, `suggestion`, and `allowedValues`
in `structuredContent` for the same reason. Missing node errors expose
`missingSlug`, `similarSlugs`, `recoveryTools`, and optional `createTool`.
Slug conflict errors expose `conflictSlug`, `recoveryTools`, and optional
`overwriteOption`.
Batch repair
guidance is gated as well: duplicate `add_concepts` input slugs must surface
`concepts[n] duplicate slug in input batch; first seen at concepts[m]` in
first-contact instructions, so an agent knows which later row to remove or
rename before retrying. Maintenance work-queue
guidance is gated too: `initialize.instructions` must mention enum-validated
`maintenance_plan` filters, ready cursor pages with `cursor.found=true` plus
`cursor.reason=null`, and unknown `afterActionId` cursor misses with
`cursor.found=false` plus `cursor.reason`.
The dogfood walk reuses the same initialize-instruction gate, so the live
agent simulation fails when first-contact guidance loses the read-only flow,
strict input hints, or relation-filter enum guidance.
The verify path also makes runtime negative calls with `list_concepts.lmit`,
`list_concepts.lmit` plus `list_concepts.summry`,
`query_ontology.operation="overveiw"`, typoed `maintenance_plan.phases`, and
typoed `maintenance_plan.severities` / `maintenance_plan.kinds`,
and fails unless the server rejects them with the closest argument/value hint,
reports multiple unknown tool arguments together, or returns the allowed
maintenance filter enum. Successful verify output prints the
accepted `phases` / `severities` / `kinds` enum lists beside the strict-filter
runtime smoke, so installed logs show which work-queue contract was tested.
It also calls `add_concepts` and `add_relations` with non-object rows,
unknown row fields, an invalid `add_relations` type, and duplicate `add_concepts` slugs, and fails unless those
inputs return row-level `ok:false` results whose errors include the failing
input index, all offending unknown fields, and closest-value hints for invalid relation types, instead of a
top-level tool error, without `postWriteMaintenance`.
The single-row `add_relation` negative smoke uses missing endpoints plus a
typoed relation type and must fail on the type enum before slug resolution, so
installed logs prove the failed write stayed preflight-only.
It also calls
`maintenance_plan.afterActionId="maint_missing"` and fails unless the response
reports `cursor.found=false`, the cursor miss reason, zero remaining actions,
`cursor.nextAfterActionId=null`, `cursor.hasMore=false`, and no next actions. A companion ready-page smoke calls `maintenance_plan`
without `afterActionId` and fails unless the response keeps the stable cursor
shape, including `cursor.found=true`, explicit `cursor.reason=null`,
`startIndex=0`, `remainingActions`, cursor `nextAfterActionId`/`hasMore`
alignment, and next-action pointers. Those pointers
must match the current page action `id`, `executable`, `phase`, `kind`, and
`severity`. Both cursor
smokes also validate the maintenance summary counts (`totalActions`,
`filteredActions`, `remainingActions`, `executableActions`, `reviewActions`)
and their count relationships, plus the `byPhase` / `bySeverity` / `byKind`
bucket totals against `remainingActions`, so installed verify catches
work-queue drift before an agent follows stale cleanup guidance. Successful
verify logs print the same bucket summary and current-page executable/review
next-action summary so agents can see the next cleanup shape without re-parsing
the JSON payload.
`project_scope` is a hard gate when the vault has a `kind: project` node. The
verify path probes `kind: project` directly before graph smoke, so containment
checks are not skipped just because the project node was outside the first
`list_concepts` sample. The probe also verifies that returned rows are
`kind: project` and that its total matches `list_kinds.byKind.project`. Valid project-less vaults skip that one
containment-specific check while still gating `neighbors` and `path`. Empty
vault folders fail immediately after the `list_concepts` census with a
populated-vault recovery hint, so the verifier does not report a green MCP
wiring check against the wrong folder. The `path` smoke also validates hop/edge alignment, so an installed
package cannot report a usable path when the edge payload no longer explains the
hop sequence.
`get_concepts` reuses up to two slugs from `list_concepts` plus one missing slug
so batch success rows and partial rows are verified during installation checks. `list_concepts` vault warnings,
`list_kinds` / `compile_ontology` / `overview`
census shape/count mismatches, `validate_vault` problem files, failing health checks, or fail-severity
`workspace_brief.nextActions` fail the command; advisory `needs_attention` states still print so starter vaults can
verify before cleanup. Missing or malformed first-contact diagnosis payloads
such as top-level `status`, `workspace_brief.nextActions`,
`workspace_brief.health.checks`, `health.checks`, tuned `workspace_brief.health.checks`, and tuned `health.checks` also fail the command instead of being treated as clean; top-level diagnosis `status` must be `healthy` or `needs_attention`, every
`workspace_brief.nextActions` row must include non-empty `id` and `kind` plus
`severity` in `info` / `warn` / `fail`, and every health check row must include
non-empty `id` plus `status` in `pass` / `warn` / `fail` / `info`; optional
`count` fields must be non-negative integers before they are printed. When
`workspace_brief.nextActions[].sample` includes executable examples, installed
verify also checks `add_missing_relations` samples are `add_relation` calls with
`from` / `to` / `type`, and `materialize_external_elements` samples are
`add_concept` calls for `kind:"element"`, while `resolve_dangling_references`
samples must keep the `resolve_dangling_reference` row shape with score and reason.
Non-blocking `workspace_brief.nextActions` are printed as a short
advisory list with action label, severity, optional count, and message. The
`workspace_brief` / `workspace_brief_tuned` success lines include the
`workspace_brief.health.checks` count plus `growth actions/external/ignoredExternal`
counts. Tuned diagnosis lines also print
`dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies`
so scoped dependency and project/domain/capability connectivity warnings are
not confused with the full-graph component count. The
`health` / `health_tuned` lines include the `issues/unresolved/cycles/checks`
summary plus check `id:status:count` coverage that the verify gate validated. The default wait window is 8 seconds; set
`OATLAS_VERIFY_TIMEOUT_MS` to a positive integer millisecond value if your vault
is large or on a slow filesystem. Real timeout failures suggest the same
retry shape, and invalid timeout values fail before the server starts and print
the received value plus a concrete retry example, for example
`npm run verify -- --timeout-ms 15000`. When the verifier is called with an
explicit vault, timeout retry hints preserve that vault, for example
`npm run verify -- --vault <path> --timeout-ms 15000`; the repo-root CLI wrapper
uses the same pattern with `ontology-atlas mcp-verify --vault <path>
--timeout-ms 15000`. After timeout the verifier sends `SIGTERM` and then
`SIGKILL`; set `OATLAS_VERIFY_KILL_GRACE_MS=N` only when that post-timeout cleanup
window needs explicit tuning. Server startup failures before `initialize` keep stderr
diagnostics and include the same vault-preserving retry example. If the server
terminates by signal before first-contact completes, verify reports that signal
separately from timeout and startup failures.

### Manual verification (reference)

```bash
# parser smoke
node src/parser.test.mjs

# Real server over stdin/stdout JSON-RPC
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_concepts","arguments":{"limit":5}}}' \
  | OATLAS_VAULT=../docs/ontology node src/index.js
```

## First call after registering with Claude Code (sample prompt)

After you add `.mcp.json` / `.codex/config.toml` and restart the agent, try the following with your LLM:

> **First exploration — confirm the vault's ontology is visible**
> 1. Call `mcp__ontology-atlas__list_kinds` to confirm the kind census.
> 2. Call `mcp__ontology-atlas__list_concepts` to list every node in the vault.
> 3. Call `get_concept({ slug: "project" })` to see the root node's frontmatter and neighbors.
> 4. Call `find_neighbors({ slug: "capabilities/mcp-server" })` to inspect the local graph around that capability.
> 5. Call `validate_vault({})` to check frontmatter and graph-reference integrity before writing.
> 6. Call `query_ontology({ operation: "agent_brief" })` when you want a Claude Code/Codex handoff: readiness, graph entrypoints, recommended MCP calls, `graphDbQueryPack` (`facets` / `schema` / `match_nodes` / `match_edges` / `domain_matrix` / `centrality` / `all_paths` / `explain_relation` with `query_plan` gates), `graph_traversal` (`schema` / `all_paths` / `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` / `bounded_path_evidence` / `containment_cross_check`) for performance-aware traversal, write guardrails, `relationDecisionGuide` for relation preflight decisions, `resultContracts` that require `all_paths` callers to report completeness fields and `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy in one response. Use `query_ontology({ operation: "workspace_brief" })` when you only need the first-contact graph diagnosis.
> 7. Call `query_ontology({ operation: "overview", limit: 5 })` to confirm graph-query summaries work without fetching the full compile artifact.
> 8. Call `query_ontology({ operation: "query_plan", targetOperation: "overview" })` and `query_ontology({ operation: "query_plan", targetOperation: "project_map" })` before heavier graph exploration so the agent sees the cost/index contract across more than one operation.

If those read-only calls respond cleanly, the agent can see the vault and its graph health. Once an agent starts *committing* its analysis of your codebase to the ontology through these 24 tools (16 read + 8 write), the human + AI co-authoring loop is officially open.

## Design principles

- **stdin/stdout JSON-RPC** — Claude Code spawns the server as a child process. stdout is *protocol-only*; logs go to stderr.
- **Synchronous fs** — MCP call frequency is low enough that async overhead isn't worth it.
- **Frontmatter preservation** — `add_relation` keeps the existing frontmatter intact and only patches the relevant array key (idempotent — duplicates respond with `alreadyExists: true`).
- **Vault-root sandbox** — `slug` is always vault-relative. The server never writes outside `OATLAS_VAULT`.

## Status

- 0.10.0 — 23 tools. Added `get_concepts`, `add_concepts`, `add_relations`, `validate_vault`, `find_neighbors`, `compile_ontology`, and `query_ontology` (`neighbors` / `path` / `all_paths` / `query_plan` with executable run/narrow advice / `centrality` / `communities` / `similar_nodes` / `explain_relation` / `reachability` / `pattern_walk` / `impact` / `blast_radius` / `subgraph` / `overview` / `schema` / `facets` / `match_nodes` / `match_edges` / `node_profile` / `domain_profile` / `domain_matrix` / `project_scope` / `project_map` / `relation_check` / `components` / `lineage` / `containment_tree` / `cycles` / `topological_order` / `recommend_relations` / `growth_plan` / `maintenance_plan` / `agent_brief` / `workspace_brief` / `health`); current split was 15 read + 8 write in that release.
- 0.7.1 — 16 tools. Added `instructions` field on initialize response — Claude Code / Cursor see kind hierarchy + workflow + write-tool dry-run pattern + `expected_mtime` conflict guard guidance on connect, no per-session trial-and-error.
- Current initialize instructions also surface destructive-write safety: `rename_concept` refuses an existing `newSlug` unless `overwrite: true`, and `delete_concept` needs `force: true` only after accepting dangling referrers.
- Current initialize instructions also state that tool schemas are strict, unknown arguments are rejected with a nearest-argument hint, invalid enum values surface a nearest-value hint when possible, row-level repair fields include `rowName` / `receivedField` / `unknownFields` / `allowedFields` / `receivedFields` / `firstSeenAt`, `add_relations` unknown type row errors include a closest-value hint such as `Did you mean "depends_on"?`, and `add_concepts` duplicate input slugs report `concepts[n] duplicate slug in input batch; first seen at concepts[m]`, so typo and batch repair are explicit at first contact.
- Runtime `unknown_tool` errors include the closest tool-name hint, such as `Did you mean "list_concepts"?`, plus the allowed tool list.
- 0.7.0 — 14 tools (8 read + 6 write). Added `rename_concept` and `merge_concepts` (graph-level write — atomic backlink redirect across all referrers).
- 0.6.0 — 12 tools (8 read + 4 write). Added `query_concepts` (typed filter DSL).
- 0.5.0 — 7 read + 4 write. Added `find_orphans`.
- 0.4.0 — 10 tools (6 read + 4 write). Added `delete_concept` (dry-run + backlinks guard).
- 0.3.0 — 9 tools. Added `find_path` (BFS) and `list_kinds` (census).
- 0.2.0 — 7 tools.
- 0.1.0 — 5 tools.

## Troubleshooting

- **Tools don't show up**: Restart the agent. Validate `.mcp.json` syntax with `jq . .mcp.json`; for Codex, inspect `.codex/config.toml` or `codex mcp list`.
- **Vault appears empty**: Try an absolute path for `OATLAS_VAULT`, or run `pwd` to confirm the actual working directory.
- **`Doc already exists`**: `add_concept` won't overwrite an existing file. Edit the file directly, or use `patch_concept` to update frontmatter or body in place.
