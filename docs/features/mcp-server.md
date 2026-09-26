---
title: MCP server
doc_type: feature
status: current
area: mcp
routes: []
---

# MCP server

## 3. MCP server (current runtime inventory)

AI agents read/write the same vault as humans. Two ways to get the server running, and only two:

| Channel | How the agent starts it | What the user does |
|---|---|---|
| **Installed desktop app** (primary; macOS 2026-07-27, Windows beta 2026-08-01) | The app ships a compiled MCP server inside its own bundle (`Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp` on macOS, `ontology-atlas-mcp.exe` beside the Windows executable). The agent client spawns that binary directly, so it keeps serving while the app is closed. | Open the vault folder in the app and press **Connect agent**. The app writes `.mcp.json` / `.codex/config.toml` with the bundled binary's absolute path and the vault's real path already filled in — no terminal, no Node, no install step. |
| **Source checkout** (fallback) | `node <checkout>/mcp/src/index.js` with `OATLAS_VAULT` set. | Clone the repo, then either paste the config or let `node <checkout>/cli/src/index.mjs init` / `agent-setup --write` write it. |

npm publishing is retired (`docs/DECISIONS.md`, 2026-07-27) — there is no `npx` channel.

**Connecting a project to its code (2026-08-04).** `connect_project_source`
(CLI `connect-source`) binds one project node to the local folder holding the
code it describes, measures it, and writes the source receipt that
`agent_brief` reports. Omit the folder and it infers one — the git repository
enclosing the vault, otherwise the nearest ancestor carrying a project
manifest — then tells you how many of the ontology's declared `path:` claims
actually exist inside it before anything is written. `confirm: true` binds;
`disconnect_project_source` (CLI `disconnect-source`) undoes it. Until this
landed, the app could say "no code folder is connected" and name
`connect_source` as the next action while nothing outside the macOS folder
picker could perform it.

**R14 — workflow automation** (Claude Code + Codex):

| Trigger | What | Where |
|---|---|---|
| **SessionStart hook** (implicit) | Compact vault census auto-injected into agent context on session start: total nodes, kind distribution, and only an actionable drift warning when needed. The hook deliberately avoids domains, hub lists, and full node tables to keep token use low. | `.claude/hooks/inject-ontology-summary.sh` / `.codex/hooks/inject-ontology-summary.sh` — silent in repos without a vault |
| **Explicit live activity CLI** | Agents or humans can still publish `.ontology-atlas/agent-activity.json` through `ontology-atlas agent-activity` when a handoff needs it. The automatic PreToolUse heartbeat hooks were removed during the token-budget pass; routine shell commands no longer update the sidecar implicitly. | `cli/src/commands/agent-activity.mjs` · `src/entities/vault-session/model/agent-activity-status.ts` |
| **`/ontology-bootstrap` skill** (cold start) | Empty vault → evidence-earned first graph. `analyze_repo_structure` side-effect-zero → exact non-writing review plan → maker-independent CQ/source-hidden qualification whose claims bind to that plan with `proposalRefs` → user accepts that digest and every visible gap → only the released unchanged rows reach batch writers → validate/compile/source-connect/finalize. Missing evidence, proposal coverage, or independent evaluation stops without writes. Node count is an observation, never a target or cap. | `.claude/skills/ontology-bootstrap/SKILL.md` / `.agents/skills/ontology-bootstrap/SKILL.md` |
| **`/ontology-sync` skill** (code change) | "I'm done with this task — please sync the ontology now" loop. git diff + context → MCP write tools | `.claude/skills/ontology-sync/SKILL.md` / `.agents/skills/ontology-sync/SKILL.md` |
| **`/ontology-extract` skill** (prose ingress, R+) | User shares prose (meeting note / PR / RFC / Notion paragraph) → `find_evidence` + `similar_nodes` cross-check → candidate table → user picks → land. LLM hallucination guard via prose-source citation in body | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **`/ontology-absorb-confluence` skill** (wiki ingress, agent-mediated) | User already has a third-party wiki MCP (e.g. Atlassian's official Confluence MCP) registered in the session. That MCP reads the page (read-only); this skill feeds the returned markdown into the existing `absorb_document` tool (dry-run → user approval → `confirm:true`), then cites the source page URL in each landed node's body. Not a Confluence integration this repo ships — an *agent-mediated* path that reuses Slice 0's absorption pipeline for any structured wiki export (Confluence, Notion, on-prem wikis) once the user has wired the read side themselves. | `.claude/skills/ontology-absorb-confluence/SKILL.md` / `.agents/skills/ontology-absorb-confluence/SKILL.md` |
| **Agent config scaffold** | CLI `init` and the installed app starter write ready-to-use `.mcp.json` and `.codex/config.toml` files into the vault folder. Claude Code / Cursor attach after opening the configured folder; Codex additionally loads the project-local `.codex/config.toml` only after that canonical folder is trusted, so `codex mcp list` and `connection_info` are required proof instead of treating the file's presence as a connection. The empty-vault CTA previews the agent verification path before creation, both empty and existing-vault CTAs include a copyable prompt for Claude Code/Codex that falls back to the CLI setup gate when MCP is unavailable, CLI proof packet, and automation JSON gate, the Workspace palette exposes the same prompt whenever a local vault is loaded, and the local vault tools menu validates and counts only the two active client files, `.mcp.json` and `.codex/config.toml`; `.mcp.json.example` remains a copy/merge template outside the readiness denominator; it summarizes how many active setup files are ready, names the next missing or invalid config, shows a three-step non-developer checklist (config files → agent restart → JSON gate before edits), and offers a repair action that creates missing files or atomically rebinds only the single parseable Atlas entry while preserving unrelated servers/sections. Invalid or duplicate active Atlas config stays untouched and returns a review state. Parseable review templates preserve unrelated content while only Atlas is rebound; malformed templates are preserved and receive a `.ontology-atlas-current.example` sidecar carrying the current binding. Grouped copy buttons provide a complete setup packet (preferred `agent-setup <vault> --root <codebase> --write` repair command + MCP/Codex templates + restart guidance + verification prompt + CLI fallback + automation JSON gate), the same read-first verification prompt (this whole setup panel is now the `VaultAgentSetupPanel` merged into **App Settings → MCP/Agents**, B2 2026-07 — the old docs-header vault tools dropdown was retired to remove the duplicate surface; the local vault picker moved to **App Settings → Workspace**), matching installed-CLI graph runbook (`validate` → `workspace-brief` → `agent-brief --prompt` → `agent-brief --graph-db-pack` → `agent-brief --verify-fallbacks` → `cycles` → `growth` → `maintenance` → `hubs --plan` → `hubs` → `mcp-verify`), a separate one-click automation gate (`agent-brief --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`) with visible command preview, the visible first-contact proof contract (`config_state` → `mcp_verify` → `json_gate` → `graph_briefs`), a separate codebase-root `agent-setup` repair command copy button, codebase-root `.mcp.json.example` template, codebase-root Codex `.codex/config.toml` template, and a one-line `codex mcp add ...` command for users who prefer Codex CLI registration; the starter README gives the same first-contact verification loop plus the `agent-setup /absolute/path/to/this-vault --root . --write` existing-vault repair path before any agent edit. `agent-setup --json` includes `docs.modeComparison` for the CLI-only, MCP-connected, graph DB pack, and setup gate modes, so AI tools can explain the right setup path without scraping Markdown. `agent-brief --verify-fallbacks` runs fallback commands through a bounded parallel queue, prints a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count) before per-command elapsed time plus the slowest fallback, and `agent-brief --verify-fallbacks --json --exit-zero` emits the same check as a compact machine-readable timing report for Claude Code/Codex automation with output samples only on failed rows, so local graph query latency is visible without flooding connector-less setup checks. Each fallback command has a 15s default timeout, configurable with `--fallback-timeout-ms N` or `OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N`, and timeout rows report `timedOut:true` for fail-closed setup automation. Passing-but-slow rows are counted under `slow`, marked with `slow:true`, and summarized by `performanceOk:false` when they exceed the 5s default `slowThresholdMs`, tunable with `--fallback-slow-ms N` or `OATLAS_AGENT_FALLBACK_SLOW_MS=N`; fallback concurrency defaults to 4 and is tunable with `--fallback-concurrency N` or `OATLAS_AGENT_FALLBACK_CONCURRENCY=N`, so automation can distinguish broken setup from local graph latency drift without making the setup gate unnecessarily slow. Root-level CLI init writes matching cwd configs for codebase-root sessions; a repeated init rebinds those root-local Atlas entries to the newly requested active vault and still requires a client restart plus `connection_info` proof. | `cli/src/index.mjs` · `src/entities/vault-session/lib/ontology-starter.ts` · `src/entities/vault-session/model/use-local-vault.ts` · `src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx` · `src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` · `src/views/docs-vault/ui/DocsVaultPage.tsx` |
| **10-minute memory loop smoke** | Fresh repo `init -> bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile -> sync proposal` path is executable as a release-readiness gate, including git diff alignment before any side-effecting sync write. | `scripts/smoke-memory-loop.mjs` · `pnpm smoke:memory-loop` |
| **`mcp__ontology-atlas__*` `instructions` field** (R13 v0.7.1) | Server's initialize response carries kind hierarchy, first-time workflow, write safety patterns — every connecting agent gets the discipline without trial-and-error | `mcp/src/index.js` |
| **`.ontology-atlasignore`** (R+) | Vault-root gitignore-style file. **It does not exclude any file from the vault** — the name invites that reading, but nothing is hidden from `validate`, the graph, or search. Patterns match `materialize_external_element` refs in `growth_plan` / `maintenance_plan` and skip *those suggestions*. Intentional external code (e.g. `src/**`, `cli/**`) stops surfacing as noise. `externalElementRefsIgnored` count exposed for transparency | `mcp/src/ontology-atlas-ignore.mjs` (this vault has no ignore file — it needs none) |

R14 also unified `add_concept` / CLI `add` / CLI `import` to a single per-kind frontmatter schema (`mcp/src/schema.mjs` ↔ `cli/src/lib/schema.mjs`) — three entry points, one shape.

#### Prose / wiki absorption

Three ingress paths land the same vault, differing only by input source and
approval granularity — none of them let an agent write unreviewed nodes:

| Input | Path | Approval unit |
|---|---|---|
| Pasted prose (meeting note / PR / RFC paragraph) | `/ontology-extract` skill — `find_evidence` + `similar_nodes` cross-check → candidate table | Per candidate node/edge |
| Local CLAUDE.md/AGENTS.md-style file | `absorb_document` MCP tool / CLI `ontology-atlas absorb` — splits by `##` section, classifies policy vs. architecture, Tier 1 injection filter. MCP canonical paths outside `repoRoot` (including symlink escapes) need explicit `allowOutsideRepo:true` after preview | Per section (dry-run first, `confirm:true` to write) |
| Confluence/Notion/wiki page, via a third-party wiki MCP the user already registered (e.g. Atlassian's official Confluence MCP) | `/ontology-absorb-confluence` skill — that MCP reads the page (read-only), the returned markdown is fed into the same `absorb_document` pipeline, and the source page URL is cited in each landed node's body | Per section (dry-run first, `confirm:true` to write) |

The wiki path works identically for on-premise Confluence/wiki instances — the
absorption tool only ever reads a local markdown file; whatever gets it there
(cloud MCP, on-prem export, `curl` to a file) is out of scope for this repo.
This project does not ship a Confluence integration; it ships an absorption
pipeline that a second, user-owned MCP can feed.

### Interop — export to a standard graph format

Data flows *out* the same way it flows in: as portable files, no backend. The
CLI `ontology-atlas export [vault] --format jsonld|graphml|json` compiles the
vault (the deterministic `compile_ontology` artifact) and writes a standard
interchange format to stdout (status to stderr, so it pipes cleanly):

- `jsonld` — RDF 1.1 JSON-LD; loads in rdflib / Protégé / any triplestore
  (`g.parse('atlas.jsonld', format='json-ld')`).
- `graphml` — XML graph; opens in Gephi / Cytoscape, loads via NetworkX
  (`nx.read_graphml`) or Neo4j APOC (`apoc.import.graphml`).
- `json` — the raw compile artifact unchanged (nodes/edges/`graphHash`).

The CLI `export` command emits JSON-LD/GraphML from this *same* serializer, kept
byte-identical by a contract test. (The web ERD builder that also consumed it was
retired 2026-07-24 with the rest of `/ontology/edit`.) Node identity is the stable
`urn:uuid:<uid>` (both the JSON-LD `@id` and the GraphML node id), while slug is
exported as the readable current address. Contract: **an export is a snapshot**,
the compiler `graphHash` is its **version**, rename/reclassify preserve the URN,
merge preserves the survivor URN and absorbs source identities, and
external/dangling refs are omitted
(never phantom nodes). Full loading recipes live in `mcp/README.md` → *Interop*.
Read-only MCP registration for external read consumers: set `OATLAS_READ_ONLY=1`
(`tools/list` exposes only read tools; write calls are rejected).

Staying file-only here is deliberate and matches the Obsidian precedent
(files + offline core, servers behind an opt-in localhost plugin). A live HTTP
transport is out of scope until two concrete external-tool requests prove that
file export + the local stdio MCP genuinely can't serve them.

**R14 — vault live updates** (`/topology` + all pages):

- **Adaptive polling** (visible-only) — `useLocalVault` fingerprint check while the tab is visible; bursts to ~1.5s right after a detected change and decays to ~5s when idle, so agent / CLI writes surface fast without idle churn (generation-token poller avoids orphaned timers across hide/show)
- **Graph diff pulse** — newly appearing slugs amber-pulse for 5s on `/topology`
- **Toasts** — `Added: <slug>` (info) / `Edited: <slug>` (success, mtime change) on every page
- **Save-conflict guard** — if a file changed on disk between read and write, `/docs` editor save surfaces a localized conflict notice and keeps the buffer dirty instead of silently overwriting unsaved edits
- Effect: When files are edited via IDE · AI agent · CLI, the graph updates and toasts appear within ~1.5–5s without the user needing to click the web tab again.

#### Read tools (24)
1. **connection_info** — active vault/repo roots plus the actually advertised `readOnly`, `toolCount`, `toolNames`, and `toolsetHash`; explicit `OATLAS_REPO_ROOT` wins, otherwise repo root is auto-discovered from the active vault's Git top-level before falling back to process cwd
2. **git_status** — vault-scoped working-tree state and risk; no writes or remote transport
3. **git_history** `{ limit? }` — newest-first commits that touched the active vault pathspec only (default 20, max 100), with `limited` / `hasMore`, shallow-repository state, and `historyComplete` so truncated evidence is not mistaken for complete history
4. **list_concepts** `{ kind?, domain?, since?, summary?, offset?, limit? }` — every node as `{uid, slug, …}`, optional filters, deterministic slug ordering, mtime, summary preview, and explicit `{returned, limited, pagination:{offset,limit,total,returned,hasMore,nextOffset}}` metadata for lossless large-vault traversal
5. **get_concept** exactly one of `{ slug }` or `{ uid }` — full detail with both identities, frontmatter, prose, neighbors, edges, and `mtime`; UID lookup survives rename and never falls back to fuzzy matching
6. **get_concepts** exactly one of `{ slugs }` or `{ uids }` — batch read (max 50), order-preserving partial results with both identities and per-node warnings
7. **find_evidence** `{ title }` — partial-match across title / capabilities / elements / body; each match carries `{uid, slug}`, `domain`, `mtime`, and prose excerpt
8. **find_backlinks** `{ slug }` — every referencing node as `{uid, slug, …}` (frontmatter arrays + wikilinks/markdown)
9. **find_neighbors** `{ slug, direction?, types?, includeNodes?, limit? }` — one-hop local graph around a node, with canonical incoming/outgoing `edges[]` and `{uid, slug}` neighbor summaries (`includeNodes` defaults true, `limit` defaults 100/max 500); public relation type aliases like `depends_on` are normalized to stored graph keys
10. **find_path** `{ from, to, maxHops? }` — shortest undirected BFS across graph frontmatter, including `domains` / `domain` containment (default 5 hops, includes aligned `{uid, slug}` `nodes[]` summaries plus `edges[]` of `{from, to, via, rationale?}`, the rationale being the stored `relation_notes` sentence when one exists)
11. **list_kinds** — vault kind census `{ total, byKind: { capability: N, … } }`
12. **find_orphans** `{ kind?, excludeKinds? }` — isolated `{uid, slug}` nodes across graph frontmatter, including `domains` / `domain` containment (defaults exclude `project` and `vault-readme`; pass `excludeKinds: []` to include every kind)
13. **query_concepts** `{ filter, limit? }` — typed filter DSL with AND/OR/NOT on `kind` / `domain` / `slug` / `title` / `has(arrayKey)`; match rows carry `{uid, slug}`
14. **compile_ontology** `{ includeIndexes?, summary?, nodesLimit?, nodesOffset?, edgesLimit?, edgesOffset? }` — deterministic graph artifact with UID-required `nodes[]`, slug-based `edges[]`, identity indexes (`uidToSlug`, `slugToUid`, `mergedUidToSlug`), graph-array canonicalization actions, semantic `graphHash`, and pagination; invalid identity fails closed
15. **query_ontology** `{ operation, ... }` — graph-engine query over the compiled artifact (`neighbors`, `path` with aligned `nodes[]`, `all_paths` with per-path `nodes[]` plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance, `query_plan` with executable run/narrow advice, filter-preserving `suggestedQuery`, and filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, `centrality`, `communities`, `similar_nodes`, `explain_relation`, `reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`, `builder_context`, `overview`, `schema`, `facets`, `match_nodes`, `match_edges`, `node_profile`, `domain_profile`, `domain_matrix`, `project_scope`, `project_map`, `relation_check`, `components`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `recommend_relations`, `growth_plan`, `maintenance_plan`, `agent_brief`, `workspace_brief`, `health`) for graph-database-like answers without pulling the full compile payload. `builder_context` keeps its compatibility operation/response name but emits the current Workshop focus URL, persisted bounded neighborhood, `canvasPosition`, `expected_mtime`, and safe low-level write handoff while declaring that unsaved UI drafts are not included. Repeated read calls inside one MCP server session reuse the compiled artifact while the vault document signature is unchanged, so first-contact agent run orders do not pay the full compile cost for every graph query. `match_nodes` returns a `followUp` packet for the first returned row with ready-to-run `node_profile`, incoming/outgoing `match_edges`, and `blast_radius` MCP calls plus CLI fallback commands, so a graph scan can become focused evidence without another round of tool-selection guesswork. `match_edges` returns a `followUp` packet for the first returned real edge with ready-to-run `explain_relation`, `path`, and `relation_check` MCP calls plus CLI fallback commands, so edge scans move directly into evidence and write-preflight instead of being treated as raw proof. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` expose public names such as `depends_on` next to canonical frontmatter `types` or `via` values such as `dependencies`, so terminal and MCP clients can show the relation name users typed while keeping executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. `agent_brief` returns Claude Code/Codex handoff readiness, a copyable `handoffPrompt` (also printable via `ontology-atlas agent-brief --prompt`), graph entrypoints, first MCP calls, structured `graphDbQueryPack` (`facets` / `schema` / `query_plan(match_nodes)` / `match_nodes` / `query_plan(match_edges)` / `match_edges` / `domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(all_paths)` / `all_paths` / `explain_relation` / `business_questions` outcome, domain-boundary, capability-claim, and implementation-evidence scans), investigation playbooks including `graph_traversal` (`schema` → `query_plan(all_paths)` → `all_paths` → `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`) for plan-first bounded traversal, per-playbook `evidence[]` and `stopWhen[]` checklists, write guardrails for `add_relation` / rename-merge / post-change sync, relation preflight before `add_relation`, a `relationDecisionGuide` for the `skip_existing` / `review_inverse` / `safe_to_add` / `review_new_schema` outcomes, `resultContracts` requiring `all_paths` callers to report completeness fields and requiring `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy. The CLI companion `ontology-atlas agent-brief [vault] --graph-db-pack` turns that pack into a shell-pasteable graph scan script for sessions without MCP. `relation_check` validates relation `type` before endpoint slug resolution, so relation typos such as `depend_on` still return nearest-value hints even in empty or project-less vaults, and returns `matchingEdges`, reverse-direction `inverseEdges`, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`). Non-dependency relations may expose an `add_relation` `proposedAction`; a new `depends_on` returns no executable args and instead exposes `approvalGate.writeAllowed:false` until observable ability, rationale, explicit human approval, and nonblank `why` are present. `maintenance_plan` actions include stable `id`, cursor resume via `afterActionId`, explicit `cursor.reason` metadata, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable`, current-page `nextExecutableAction`, current-page `nextReviewAction`, plus `executableOnly` / `phases` / `severities` / `kinds` filters; ready pages report `cursor.found=true` with `cursor.reason=null`, while unknown cursors return an empty page with `cursor.found=false`, zero remaining actions, and no next actions. `phases`, `severities`, and `kinds` are enum-validated so typoed work-queue filters fail instead of returning an empty plan. Health results include a typed `relationCensus`: `summary.edges` and `compiledSummary.edges` count compiled frontmatter declarations, while the app's unavailable-to-MCP comparison unit is deduplicated normalized typed edges across the loaded ontology.
`impact` and `blast_radius` follow only the `depends_on` relations that humans have explicitly written. Structural relationships such as what contains what are excluded from impact scope and risk calculations — for such structural questions, `reachability` and `subgraph` provide the answers. Each dependency edge is marked as either `review_required` (needs human review) or `declared_with_rationale` (reason provided), depending on whether a rationale is recorded. Until there is a current-source receipt confirming that each relationship remains factually accurate, the completeness and `risk` of this answer remain `unknown`.

16. **validate_vault** — whole-vault health check with per-file issues and grouped summary, including required/valid/unique UID claims, merge identity history, graph-array canonicality, and dangling graph references, plus the six body findings the write door reports (`definition-missing`, `boundary-missing`, `uncertainty-missing`, `epistemic-exclusion`, `slug-outside-kind-folder`, and `folder-only-evidence` where a repository root is known) — all warnings, so a thin vault reads as thin instead of as clean

Optional explicit `sourceReads` return bounded implementation lines in a separate
`sourceEvidence` packet with exact file/range hashes, byte limits, continuation
and refusal state. Proposal/release replay checks those bytes again; source
access does not promote semantic authority or grant writes. The
[MCP source-read contract](../../mcp/README.md#bounded-implementation-source-evidence)
owns the limits and evidence boundary.

`analyze_repo_structure`'s semantic discovery scans only up to 200 Markdown files and 1,000 directory entries across all three roots. General semantic documents stop reading at 256 KiB before being read. Visited real directories, archives, broken symlinks, or symlinks outside the repository do not expand the scan.

The portable Markdown/RST evidence row prefers the document-title section plus
explicitly classified purpose, architecture, and ability sections; documents
without a named semantic category use the same bounded eligible-section
fallback. Its risk scan consumes only that model-visible selection, so an
unrelated unselected peer section cannot taint the selected claim. If one selected row mixes current evidence with
future, negated, or deprecated prose, the current excerpt remains candidate
evidence and the policy unit stays beside it as typed, line-scoped
`reviewRequiredEvidence`. That unit is visible counterevidence but cannot support
a proposal claim. Hostile instructions still taint the whole row, and a split
that cannot fit the bounded packet falls back to row-wide review. The validator
also blocks definitions, boundaries, relation rationales, and completed
competency answers that overlap a review unit without a different current
claim-aligned semantic source.

The same fixed 1,200-character excerpt gives every selected safe section an
initial deterministic share before unused short-section capacity returns by
semantic priority and source order. No packet cap grows. One exact current
semantic unit plus a matching implementation witness may form only a
sub-0.8-confidence capability review proposal; implementation is not a second
semantic authority and grants no domain, completeness, answered-CQ,
qualification, approval, or write authority.

Semantic evidence also preserves exact repository path case. A lowercase root
or workspace `readme.md` remains that exact address through proposals and source
receipts instead of inheriting the analyzer seed spelling. Exact entries win;
ambiguous folds, missing entries, non-files, and symlink escapes fail closed,
while package contracts still require exact conventional names.

Direct workspace members of `apps/*` and `packages/*` also become candidates for the same 6-document packet, including their static name+description `package.json` and package `README.md`. Only up to 48 members per conventional root are scanned; scripts/dependencies are not read, nor are package names automatically promoted to business meaning.

Business capability candidates follow the same principle. They are proposed only when bounded outcome prose and implementation evidence are both confirmed; implementation-oriented folder names like UI, transport, policy, or telemetry are not automatically promoted to business meaning. Without evidence, they remain implementation review targets, and the analyzer does not write to the vault.

17. **analyze_repo_structure** `{ rootPath?, maxDepth?, ignore?, sourceReads?, proposal?, qualification? }` — side-effect-free bootstrap candidates from package / README / source layout plus the executable construction lifecycle. A valid complete proposal first returns an exact non-writing `reviewPlan`, plan/source digests, eight phase states, every `requiredGapId`, and a shadow-only `admission` receipt (`self_qualified`, `partial_visible_gap`, `human_review_required`, or `hard_block`); `self_qualified` is an auto-write candidate signal, not write permission. `canWrite` remains false and `writePlan` is absent until the existing human acceptance gate is satisfied. A separately identified evaluator then measures approved executive/employee/agent CQs plus optional project-owned FDE CQs, current claims/citations, seven quality axes, the complete source-hidden task, and cold-start/prior-CQ regression. After the user sees the exact plan and accepts its digest/revision plus every visible gap, the unchanged proposal and `constructionQualification:v1` packet may release a `writePlan` exactly equal to the reviewed rows. Generated concept bodies use the parser's canonical full-body representation; after persistence every released body must full-read byte-for-byte equal before source connection or finalization. Maker-only evaluation, missing authority, `not_measured`, stale/private provenance, red mandatory axes, source/plan drift, regression failure, or an unaccepted gap fails closed. Acceptance is declared provenance, not authenticated identity or a truth certificate. Its five proposal competency answers still carry `answered` / `partial` / `visible-gap` plus typed concept, relation, evidence, and path witnesses, and the project body preserves that audit. `Excludes` is reserved for sourced product/concept boundaries: unknown or unmeasured evidence belongs in `Uncertainty` or a competency gap, and `epistemic-exclusion-boundary` blocks a proposal that would persist those unknowns as scope. Root `ARCHITECTURE.md` and classified Markdown under bounded `docs`, `site`, and `website` discovery can join the existing six-document semantic packet; archive-like paths and repository-escaping symlinks cannot. README extraction preserves purpose, responsibility/architecture, and ability blocks inside the existing 1,200-character budget instead of letting sponsor/backer/TOC sections consume it. Root package contracts remain bounded evidence, not meaning nodes: Rust reads allowlisted `Cargo.toml` package/features fields and returns separate literal `cfg`/`cfg_attr` provenance without evaluating predicates, executing code, or allowing relation writes. Python reads bounded static package evidence and import-participating boundaries; unused or unsafe inputs are skipped. Root Go modules contribute at most 24 import-participating package-directory element candidates, never path-derived capabilities. A proposal call recomputes the existing read-only import receipt so selectively proposed TS/JS/Python/Rust file endpoints and Go file/package endpoints are validated without relying on prior-call state, and import-backed `depends_on` must match observed direction. After the exact released rows land, the agent validates, compiles, connects the source, and finalizes project meaning.
18. **infer_imports** `{ rootPath?, sourceFolders?, ignore?, maxFiles?, reviewMode?, afterReviewId? }` — side-effect-free TS/JS, root-package Python, deterministic Rust, and root-module Go import evidence. Rust uses the existing file/module envelope for resolvable `use`, file-backed `mod`, and exact literal path/include forms; each file is capped at 256 KiB and 256 dependency statements. It does not expand macros, evaluate `cfg`, execute Cargo/compiler/network code, resolve symbols, or turn direct source direction into runtime/business impact. Conditional, escaped, non-literal, or otherwise ambiguous forms remain unresolved. External crate names are observed candidates only; package-contract evidence and review decide importance. Go remains separate as `packageImportEvidence` contract `goPackageImports:v1`, preserving exact importing files and repository-relative package directories without inventing target files. File and package receipts distinguish source role and usage; `value` does not claim runtime execution. Every collapsed edge includes whole-edge counts, their joint `productValueCount`, and up to five exact evidence receipts. Missing vault edges and Go package evidence are review-only, never executable write proposals. Compact and focus delivery surface Go counts plus the explicit full-evidence call instead of silently dropping a large package graph; CLI bootstrap approval plans derive candidate and unresolved totals from that validated compact summary rather than treating omitted full arrays as zero. CLI `infer-imports --apply` is disabled, and bootstrap/index cannot auto-create import endpoints or semantic `depends_on`; an agent must inspect both concepts, explain the meaning-level dependency, obtain human approval, and supply nonblank `why` before one explicit write.
19. **index_project** `{ rootPath?, maxFiles?, threshold?, skipImports? }` — side-effect-free project indexing checkpoint that combines repo structure analysis, file-import and Go package-import indexing, and vault validation. It reuses one full import receipt for analyzer evidence, reports file and package relation counts separately, and preserves coverage instead of reducing uncertainty to one count. `plan.conceptDelta` separates raw candidates into existing, ambiguous-alias review, and genuinely new buckets, and `next.reviewCalls` gives exact calls for retrieving full rows before applying anything.
20. **inspect_architecture** `{ rootPath?, profileSlug? }` — reads one reviewed `architecture-profile/v1`, scans current imports with the same bounded source analyzer, and returns the profile's governed import usages, usage-qualified role edges and receipts, violations, explicit unknowns, and the required `architectureChangePlan:v1` fields. Unknown usage stays fail-closed and cannot be declared away. Side effect 0; named architecture patterns remain declarations rather than inferred source facts.
21. **validate_wiki** — validates the separate `wiki/**.md` page contract without treating pages as ontology nodes.
22. **read_source** — reads one bounded raw source under `sources/` with format-specific citation anchors and no converted copy.
23. **list_constellations** — returns the compatible saved-constellation inventory as bounded read-only task context, including identity, purpose, counts, and unresolved-member state.
24. **get_constellation** `{ id }` — resolves one saved constellation by stable folder UUID, preserving member UIDs and display-only last-known paths without promoting membership into ontology edges.

For first-pass construction, an `unqualified-project-exclusion` is an exact
human-acceptance gap rather than a qualification-time hidden block.
Source-hidden review keeps unverifiable raw-source detail partial until
source-aware citation checking. After persistence, health does not recommend a
duplicate direct-domain edge for an element whose `domain` membership and
resolved containment owner already exist; genuinely unowned elements and
missing capability containment remain review work.
Mandatory proposal warnings that are not human-gap eligible block the first
review plan before qualification work begins, so a pass-shaped analyzer result
with unsafe citation/evidence warnings is a rejected draft rather than a
candidate release.

The first candidate's exact claim ids, statements, and `proposalRefs` can be
sealed once and handed to isolated source-hidden and source-aware review lanes
in parallel. The lanes do not share source or answers, any manifest mutation
blocks their join, and human acceptance remains after that join; this is an
agent orchestration receipt rather than a new server permission or schema.
In source checkouts, the mirrored bootstrap guidance investigates bounded source
predicates, state changes, attempted effects, failure paths and verification
before declaring meaning unavailable from a structural index. Exact range
citations remain partial evidence; code does not establish historical owner
intent or authorize accepted meaning or a write. Role-diverse behavioral
evidence can support a tentative responsibility or capability hypothesis under
the existing authority thresholds, with sourced counter-boundaries and explicit
uncertainty. Its conditions and effects belong in the candidate body so they
can be independently reviewed. Unsupported assignments remain in the external
construction report; a lower confidence score never substitutes for evidence. The
[source-first workflow](../../.agents/skills/ontology-bootstrap/guides/meaning-extraction.md#source-first-hypothesis-workflow)
is an investigation method, not a measured general reconstruction guarantee.
The mirrored bootstrap skill also provides a deterministic
scratch helper for those receipt stages. Agents still decide every meaning,
answer, evidence mapping, and citation verdict; the helper only removes repeated
JSON/digest/witness projection and emits non-executing writer-call data after an
exact executable release.
The complete qualification contract is read from one file-backed `schema.json`,
not a potentially truncated display. It publishes exact hidden and audit input
schemas; coverage refs are derived before material claims, payload witness
digests are derived during seal without mutating caller input, and recorded
analyzer responses pass directly without hand-authored wrappers.
Purpose-authority arrays advertise the existing nonempty runtime requirement.
Auditors accept or reject frozen quantifier classifications; accepted rows retain
their exact rationale and source-reference order instead of being rewritten.
The helper requires one human-owned purpose/CQ set whose approval predates the
source-hidden lane, keeps that owner distinct from all construction actors, and
binds the full question projection into the post-join acceptance request. The
same owner must accept the plan; this is declared provenance, not identity
authentication, and it adds no MCP or vault field.
The helper also blocks a failed CQ before join. Required witness kinds come from
the sealed witnesses actually cited by that answer; only measured
partial/unknown results can become exact human gaps.
Several qualification claims may share a concept ref so its material
Definition, Includes, Excludes, and Uncertainty assertions are checked
independently. Source-use wording and analyzer/packet measurement qualifiers
remain exact; neither may be widened into a broader product claim or absolute
absence.
An exact production/value import may verify a reviewed direct
element-to-element source dependency when both roles and paths resolve and the
direction matches. It does not prove runtime, reverse, transitive,
capability/business, or complete impact; the impact competency answer remains
partial without separate current meaning evidence.
Project-source receipts preserve safe explicit repository-root directory paths
from frontmatter and persisted competency Evidence/Paths rows, including literal
repository root `.`, not only paths with a slash or extension. The root witness
proves the bound root rather than a canonical child file. App and MCP derivation
stay aligned; absolute, parent-escaping, malformed, embedded-dot, and
relation-slug lookalikes do not become source witnesses or erase valid siblings.

Agent handoff preserves measurement scope at atomic-claim granularity. When a
body says bounded/static packet, bounded excerpt, or selected evidence, any
`only`, `one`, `none`, `unmeasured`, or absence claim keeps that qualifier in the
same sentence instead of widening a packet-local gap into a source-wide fact.

For `agent_brief`, structural readiness is not meaning confidence. A fresh call
for an explicit project derives `meaningAssessment:v1` from three independent
dimensions: the current graph structure, the versioned competency receipt and
its typed witness inventory, and project-source provenance/currentness. The
overall result is categorical (`verified_current`, `needs_evidence`,
`review_required`, or `invalid`); Atlas emits no combined score or percentage
that could hide a stale source or unresolved witness.

An explicit project now scopes every handoff count, hub, entrypoint, and graph
pack to that project's containment tree; a multi-project vault fails closed
until `project` is supplied. The complete response remains the default. For a
known coding task, opt-in `detail:"compact"` plus a request-local `task` returns
an `agentBriefCompact:v2` projection capped at 12,000 UTF-8 bytes of the complete
serialized JSON object, including its handoff prompt. Display indentation is
excluded; the combined two-call wire guard remains 20,000 characters. It keeps
final source/meaning currentness, the compact meaning-repair and human-approval
guards, a broad persisted capability only when its Definition/Includes/Excludes
agree with the desired work and explicit non-goals, cited element/path evidence,
explicit impact/verification unknowns, bounded full-body reads, and an exact
full-detail follow-up. A conflicting, unsupported, or tied claim returns no
capability instead of a noun-overlap winner. When reviewed
implementation/supporting/test coordinates exist in
the selected element and the bound source is current, `taskNavigation:v1`
verifies only those named files and returns exact current line locators plus the
reviewed non-exhaustive IN/OUT boundary. Stale, missing, ambiguous, unsafe, or
unrecorded evidence returns no exact target; claim-compatible task selection
never searches source, proves code behavior, persists raw task text, or creates
a narrow capability.
The same source fingerprint, revision, and graph hash are checked again after
the named reads; a mismatch detected by the exact-file guards or that final
recheck withdraws every target and downgrades outer currentness. Compact v2
sends typed facts once in `structuredContent` and
the handoff prompt as human text. The current `OATLAS_READ_ONLY=1` frozen-control
run reduced source reads from four to one, wall time by 23.9%, and uncached input
by 19.1%; two order-reversed blind judges preferred the treatment. The two-call
wire path measured 12,928 characters. The full read/write profile and
cross-repository coding speed remain unqualified, so compact and read-only stay
explicit choices rather than defaults.

`query_ontology({operation:"cycles"})` returns each cycle as the canonical slug
path plus aligned `nodeSummaries[]`, so dependency-cycle diagnostics are readable
without extra node lookups.

#### Write tools (16)

All destructive dry-runs (`git_snapshot`, relation remove/replace,
rename/reclassify/merge/delete, and absorb) expose the same agent decision
contract: `previewReady`, `canConfirm`, `wouldChange`, and
`blockedReasons[]`. Tool-specific legacy `ok` is not the confirmation signal.

1. **add_concept** `{ slug, kind, title, domain?, capabilities?, elements?, body? }` — create new `.md`; graph arrays are trimmed, deduped, and sorted on write (throws on existing slug); changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
   - **R6 validation**: title must be non-empty trimmed string (`isValidVaultTitle`)
2. **add_concepts** `{ concepts }` — batch create nodes (max 50), order-preserving partial results; non-object row shape / unknown row field errors are isolated as `{ok:false, error}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field with nearest hints, and duplicate input slugs report both the failing `concepts[n]` row and first-seen `concepts[m]` via text plus structured `rowName` / `firstSeenAt`; changed batches return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers for the final graph
3. **patch_concept** `{ slug, frontmatter?, body?, expected_mtime? }` — update existing; graph arrays are canonicalized, but immutable `uid` and merge-owned `merged_uids` cannot be changed by generic patch
    - **R6 validation**: rejects `title: null` and `title: ""`
    - **R11 conflict guard**: optional `expected_mtime` (from get_concept response). Throws `VaultConflictError` if file mtime differs at write time — caller re-reads and retries.
4. **add_relation** `{ from, to, type }` — append to source frontmatter graph key; invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint plus structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - type enum: `depends_on` (→ `dependencies`) / `relates` / `contains` / `describes` / `domains` / `capabilities` / `elements` / `domain`
    - **R7 validation**: both `from` AND `to` slug must exist in vault (`vaultSlugExists`)
    - Unique tail aliases and frontmatter `slug:` aliases are resolved to canonical file slugs before write
    - Idempotent: duplicate returns `{ alreadyExists: true }`
5. **add_relations** `{ relations }` — batch edge writer (max 50), idempotent per row; non-object row shape / unknown row field errors are isolated as `{ok:false, error}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field with nearest hints plus structured `rowName` / `allowedFields` / `receivedFields`, and relation type typos include structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; stored relation arrays are deduped and sorted as canonical graph sets; changed batches return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers for the final graph
6. **delete_concept** `{ slug, confirm?, force?, expected_mtime? }` — permanent delete; confirmed deletes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - `confirm: false` (dry-run with backlinks preview) / `true` (actual)
    - `force: false` (throw if backlinks exist) / `true` (delete anyway)
    - **R11 conflict guard**: optional `expected_mtime`
7. **rename_concept** `{ oldSlug, newSlug, confirm?, overwrite? }` — **R11** atomic graph-level rename
    - Moves the .md file, updates the moved file's `slug:` key, rewrites every backlink (frontmatter array entries, inline string keys like `domain`, body links `[[oldSlug]]` / `(oldSlug.md)`)
    - Tail-only references (`mcp-server` for `capabilities/mcp-server`) also redirected to the new tail
    - `confirm: false` (dry-run with full update preview) / `true` (actual)
    - Confirmed renames return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - Replaces the manual `find_backlinks` + N `patch_concept` loop
    - Preserves the node UID; only the readable address and backlinks change
8. **merge_concepts** `{ fromSlug, intoSlug, confirm?, expected_mtime?, expected_into_mtime? }` — **R11** atomic graph-level merge
    - Redirects every backlink `fromSlug` → `intoSlug`, then deletes `fromSlug.md`
    - Preserves `intoSlug` UID and records source identity history in canonical `merged_uids`; prose is not auto-combined
    - For confirmed writes, pass both source and survivor mtimes so neither concurrent edit is overwritten
    - `confirm: false` (dry-run) / `true` (actual)
    - Confirmed merges return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
9. **remove_relation** `{ from, to, type, confirm?, expected_mtime? }` — one exact typed relation and its rationale, dry-run first; an absent relation is an explicit no-op blocker
10. **replace_relation** `{ from, oldTo, oldType, newTo, newType, why?, confirm?, expected_mtime? }` — relation target/type/rationale replacement in one source-file write
11. **reclassify_concept** `{ slug, newKind, newSlug?, domain?, body?, confirm?, expected_mtime? }` — kind/slug/domain transition with backlink redirect and generated-starter handling
12. **absorb_document** `{ filePath, confirm?, allowOutsideRepo? }` — classifies a local agent-instruction document, writes accepted policy nodes, backs up the source, then rewrites it as a slim pointer. Canonical paths outside `repoRoot`, including symlink escapes, are blocked until a reviewed dry-run is repeated with `allowOutsideRepo:true`
13. **git_snapshot** `{ confirm?, expectedHead?, message? }` — validates and commits only the active vault pathspec locally; blocks stale HEAD, detached HEAD, Git operations in progress, and validator errors; never pushes
14. **finalize_project_meaning** `{ projectSlug, expected_mtime }` — post-write finalization for one explicit project. It reads the five competency answers from the current project Markdown; after current vault validation and a complete project scope, it resolves every typed witness against the current graph/source inventory and stores a versioned receipt with optimistic-concurrency protection. It stores no raw answers or private source coordinates. `ok: true` means the receipt write succeeded, not that the ontology or source is verified; callers read the returned categorical `meaningAssessment` or a fresh explicit-project `agent_brief`.
15. **connect_project_source** `{ projectSlug, rootPath?, confirm?, repair? }` — dry-run/confirm binding of one project to a local source folder, with a measured source receipt; private absolute paths stay in the gitignored vault sidecar.
16. **disconnect_project_source** `{ projectSlug, confirm? }` — dry-run/confirm removal of that binding and receipt without touching ontology Markdown or other projects.
