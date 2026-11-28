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
| **Source checkout** (fallback) | `node <checkout>/mcp/src/index.js` with `OATLAS_VAULT` set. | Clone the repo, then paste the config. |

npm publishing is retired (`docs/DECISIONS.md`, 2026-07-27) — there is no `npx` channel.

**Connecting a project to its code (2026-08-04).** `connect_project_source`
binds one project node to the local folder holding the
code it describes, measures it, and writes the source receipt that
`agent_brief` reports. Omit the folder and it infers one — the git repository
enclosing the vault, otherwise the nearest ancestor carrying a project
manifest — then tells you how many of the ontology's declared `path:` claims
actually exist inside it before anything is written. `confirm: true` binds;
`disconnect_project_source` undoes it. Until this
landed, the app could say "no code folder is connected" and name
`connect_source` as the next action while nothing outside the macOS folder
picker could perform it.

**Workflow automation** (Claude Code + Codex):

| Trigger | What | Where |
|---|---|---|
| **SessionStart hook** (implicit) | Compact vault census auto-injected into agent context on session start: total nodes, kind distribution, and only an actionable drift warning when needed. The hook deliberately avoids domains, hub lists, and full node tables to keep token use low. | `.claude/hooks/inject-ontology-summary.sh` / `.codex/hooks/inject-ontology-summary.sh` — silent in repos without a vault |
| **`/ontology-bootstrap` skill** (cold start) | Empty vault → evidence-earned first graph. `analyze_repo_structure` side-effect-zero → exact non-writing review plan → maker-independent CQ/source-hidden qualification whose claims bind to that plan with `proposalRefs` → user accepts that digest and every visible gap → only the released unchanged rows reach batch writers → validate/compile/source-connect/finalize. Missing evidence, proposal coverage, or independent evaluation stops without writes. Node count is an observation, never a target or cap. | `.claude/skills/ontology-bootstrap/SKILL.md` / `.agents/skills/ontology-bootstrap/SKILL.md` |
| **`/ontology-sync` skill** (code change) | "I'm done with this task — please sync the ontology now" loop. git diff + context → MCP write tools | `.claude/skills/ontology-sync/SKILL.md` / `.agents/skills/ontology-sync/SKILL.md` |
| **`/ontology-extract` skill** (prose ingress) | User shares prose (meeting note / PR / RFC / Notion paragraph) → `list_concepts` with `mentions` + `similar_nodes` cross-check → candidate table → user picks → land. LLM hallucination guard via prose-source citation in body | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **`/ontology-extract` skill, wiki pages** (wiki ingress, agent-mediated) | User already has a third-party wiki MCP (e.g. Atlassian's official Confluence MCP) registered in the session. That MCP reads the page (read-only); this skill feeds the returned markdown into the existing `absorb_document` tool (dry-run → user approval → `confirm:true`), then cites the source page URL in each landed node's body. Not a Confluence integration this repo ships — an *agent-mediated* path that reuses Slice 0's absorption pipeline for any structured wiki export (Confluence, Notion, on-prem wikis) once the user has wired the read side themselves. | `.claude/skills/ontology-extract/SKILL.md` / `.agents/skills/ontology-extract/SKILL.md` |
| **Agent config scaffold** | The installed app starter writes ready-to-use `.mcp.json` and `.codex/config.toml` files into the vault folder. Claude Code / Cursor attach after opening the configured folder; Codex additionally loads the project-local `.codex/config.toml` only after that canonical folder is trusted, so `codex mcp list` and `connection_info` are required proof instead of treating the file's presence as a connection. The setup panel (`VaultAgentSetupPanel`, on the **Agents** destination's MCP tab) validates and counts only those two active client files, names the next missing or invalid one, and carries the first-contact proof packet an agent pastes. From a source checkout, `node <checkout>/cli init` writes the same two files for the vault and, when the vault sits inside the repository, for the repository root; a repeated init rebinds those Atlas entries to the newly requested vault and still requires a client restart plus `connection_info` proof. | `cli/src/lib/init/run-init.mjs` · `src/entities/vault-session/lib/agent-mcp-config.ts` · `src/entities/vault-session/model/local-vault/vault-sidecars.ts` · `src/entities/vault-session/model/local-vault/vault-starter.ts` · `src/widgets/app-settings-menu/ui/agent-setup/VaultAgentSetupPanel.tsx` · `src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` · `src/views/docs-vault/ui/DocsVaultPage.tsx` · `src/views/docs-vault/model/use-docs-vault-commands.tsx` |
| **10-minute memory loop smoke** | Fresh repo `init -> bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile -> sync proposal` path is executable as a release-readiness gate, including git diff alignment before any side-effecting sync write. | `scripts/dogfood/smoke-memory-loop.mjs` · `pnpm smoke:memory-loop` |
| **`mcp__ontology-atlas__*` `instructions` field** | Server's initialize response carries kind hierarchy, first-time workflow, write safety patterns — every connecting agent gets the discipline without trial-and-error | `mcp/src/index.js` |
| **`.ontology-atlasignore`** | Vault-root gitignore-style file. **It does not exclude any file from the vault** — the name invites that reading, but nothing is hidden from `validate`, the graph, or search. Patterns match `materialize_external_element` refs in `growth_plan` / `maintenance_plan` and skip *those suggestions*. Intentional external code (e.g. `src/**`, `cli/**`) stops surfacing as noise. `externalElementRefsIgnored` count exposed for transparency | `mcp/src/vault/sidecar/ontology-atlas-ignore.mjs` (this vault has no ignore file — it needs none) |

`add_concepts` writes through a single per-kind frontmatter schema (`mcp/src/schema.mjs`) — one shape.

#### Prose / wiki absorption

Three ingress paths land the same vault, differing only by input source and
approval granularity — none of them let an agent write unreviewed nodes:

| Input | Path | Approval unit |
|---|---|---|
| Pasted prose (meeting note / PR / RFC paragraph) | `/ontology-extract` skill — `list_concepts` with `mentions` + `similar_nodes` cross-check → candidate table | Per candidate node/edge |
| Local CLAUDE.md/AGENTS.md-style file | `absorb_document` MCP tool — splits by `##` section, classifies policy vs. architecture, Tier 1 injection filter. MCP canonical paths outside `repoRoot` (including symlink escapes) need explicit `allowOutsideRepo:true` after preview | Per section (dry-run first, `confirm:true` to write) |
| Confluence/Notion/wiki page, via a third-party wiki MCP the user already registered (e.g. Atlassian's official Confluence MCP) | `/ontology-extract` skill (wiki pages) — that MCP reads the page (read-only), the returned markdown is fed into the same `absorb_document` pipeline, and the source page URL is cited in each landed node's body | Per section (dry-run first, `confirm:true` to write) |

The wiki path works identically for on-premise Confluence/wiki instances — the
absorption tool only ever reads a local markdown file; whatever gets it there
(cloud MCP, on-prem export, `curl` to a file) is out of scope for this repo.
This project does not ship a Confluence integration; it ships an absorption
pipeline that a second, user-owned MCP can feed.

### Interop — read the graph from outside

Data flows *out* the same way it flows in: as portable files, no backend.
`compile_ontology` returns the deterministic compiled artifact
(nodes/edges/`graphHash`) to any MCP client. Node identity is the stable `uid`,
while slug is the readable current address; rename/reclassify preserve the
`uid`, and merge preserves the survivor's `uid` and absorbs source identities.
Read-only MCP registration for external read consumers: set `OATLAS_READ_ONLY=1`
(`tools/list` exposes only read tools; write calls are rejected).

Staying file-only here is deliberate and matches the Obsidian precedent
(files + offline core, servers behind an opt-in localhost plugin). A live HTTP
transport is out of scope until two concrete external-tool requests prove that
the Markdown files + the local stdio MCP genuinely can't serve them.

**Vault live updates** (`/topology` + all pages):

- **Adaptive polling** (visible-only) — `useLocalVault` fingerprint check while the tab is visible; bursts to ~1.5s right after a detected change and decays to ~5s when idle, so agent writes surface fast without idle churn (generation-token poller avoids orphaned timers across hide/show)
- **Graph diff pulse** — newly appearing slugs amber-pulse for 5s on `/topology`
- **Toasts** — `Added: <slug>` (info) / `Edited: <slug>` (success, mtime change) on every page
- **Save-conflict guard** — if a file changed on disk between read and write, `/docs` editor save surfaces a localized conflict notice and keeps the buffer dirty instead of silently overwriting unsaved edits
- Effect: When files are edited via IDE · AI agent, the graph updates and toasts appear within ~1.5–5s without the user needing to click the web tab again.

#### Read tools (13)
1. **connection_info** — active vault/repo roots plus the actually advertised `readOnly`, `toolCount`, `toolNames`, and `toolsetHash`; explicit `OATLAS_REPO_ROOT` wins, otherwise repo root is auto-discovered from the active vault's Git top-level before falling back to process cwd
2. **list_concepts** `{ kind?, domain?, since?, mentions?, filter?, summary?, offset?, limit? }` — every node as `{uid, slug, …}`, optional filters, deterministic slug ordering, mtime, summary preview, explicit `{returned, limited, pagination:{offset,limit,total,returned,hasMore,nextOffset}}` metadata for lossless large-vault traversal, and on every page a whole-vault `census` `{ total, byKind, referencedOnlyTotal }` that filters and paging leave unchanged, so `limit: 1` sizes up a vault `mentions` ranks the nodes whose title, relation keys or body say a text (rows add `matchedIn`, `score` and `excerpt`; plain Markdown pages answer as `isNode:false` rows below nodes of equal score, each row with an `excerpt`, as `find_evidence` did under decision 2026-08-17 (66)) and replaces `find_evidence`; `filter` takes a typed predicate with AND/OR/NOT on `kind` / `domain` / `slug` / `title` / `created_by` / `has(arrayKey)` and replaces `query_concepts`. A zero-hit answer carries a `growthHint`.
3. **get_concepts** exactly one of `{ slugs }` or `{ uids }` — batch read (max 50), order-preserving partial results with both identities and per-node warnings
4. **find_backlinks** `{ slug }` — every referencing node as `{uid, slug, …}` (frontmatter arrays + wikilinks/markdown)
5. **compile_ontology** `{ includeIndexes?, summary?, nodesLimit?, nodesOffset?, edgesLimit?, edgesOffset? }` — deterministic graph artifact with UID-required `nodes[]`, slug-based `edges[]`, identity indexes (`uidToSlug`, `slugToUid`, `mergedUidToSlug`), graph-array canonicalization actions, semantic `graphHash`, and pagination; invalid identity fails closed
6. **query_ontology** `{ operation, ... }` — graph-engine query over the compiled artifact (`neighbors`, `path` with aligned `nodes[]`, `all_paths` with per-path `nodes[]` plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance, `query_plan` with executable run/narrow advice, filter-preserving `suggestedQuery`, and filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, `centrality`, `communities`, `similar_nodes`, `explain_relation`, `reachability`, `pattern_walk`, `impact`, `blast_radius`, `subgraph`, `builder_context`, `overview`, `schema`, `facets`, `match_nodes`, `match_edges`, `node_profile`, `domain_profile`, `domain_matrix`, `project_scope`, `project_map`, `relation_check`, `components`, `lineage`, `containment_tree`, `cycles`, `topological_order`, `recommend_relations`, `growth_plan`, `maintenance_plan`, `agent_brief`, `workspace_brief`, `health`) for graph-database-like answers without pulling the full compile payload. `builder_context` keeps its compatibility operation/response name but emits the map meaning-editor focus URL (`/topology/?p=<id>&workbench=edit`), persisted bounded neighborhood, `canvasPosition`, `expected_mtime`, and safe low-level write handoff while declaring that unsaved UI drafts are not included. Repeated read calls inside one MCP server session reuse the compiled artifact while the vault document signature is unchanged, so first-contact agent run orders do not pay the full compile cost for every graph query. `match_nodes` returns a `followUp` packet for the first returned row with ready-to-run `node_profile`, incoming/outgoing `match_edges`, and `blast_radius` MCP calls, so a graph scan can become focused evidence without another round of tool-selection guesswork. `match_edges` returns a `followUp` packet for the first returned real edge with ready-to-run `explain_relation`, `path`, and `relation_check` MCP calls, so edge scans move directly into evidence and write-preflight instead of being treated as raw proof. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` expose public names such as `depends_on` next to canonical frontmatter `types` or `via` values such as `dependencies`, so terminal and MCP clients can show the relation name users typed while keeping executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. `agent_brief` returns Claude Code/Codex handoff readiness, a copyable `handoffPrompt`, graph entrypoints, first MCP calls, structured `graphDbQueryPack` (`facets` / `schema` / `query_plan(match_nodes)` / `match_nodes` / `query_plan(match_edges)` / `match_edges` / `domain_matrix` / `query_plan(centrality)` / `centrality` / `query_plan(all_paths)` / `all_paths` / `explain_relation` / `business_questions` outcome, domain-boundary, capability-claim, and implementation-evidence scans), investigation playbooks including `graph_traversal` (`schema` → `query_plan(all_paths)` → `all_paths` → `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` → `bounded_path_evidence` → `containment_cross_check`) for plan-first bounded traversal, per-playbook `evidence[]` and `stopWhen[]` checklists, write guardrails for `add_relations` / rename-merge / post-change sync, relation preflight before `add_relations`, a `relationDecisionGuide` for the `skip_existing` / `review_inverse` / `safe_to_add` / `review_new_schema` outcomes, `resultContracts` requiring `all_paths` callers to report completeness fields and requiring `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy. `relation_check` validates relation `type` before endpoint slug resolution, so relation typos such as `depend_on` still return nearest-value hints even in empty or project-less vaults, and returns `matchingEdges`, reverse-direction `inverseEdges`, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`). Non-dependency relations may expose an `add_relations` `proposedAction`; a new `depends_on` returns no executable args and instead exposes `approvalGate.writeAllowed:false` until observable ability, rationale, explicit human approval, and nonblank `why` are present. `maintenance_plan` actions include stable `id`, cursor resume via `afterActionId`, explicit `cursor.reason` metadata, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable`, current-page `nextExecutableAction`, current-page `nextReviewAction`, plus `executableOnly` / `phases` / `severities` / `kinds` filters; ready pages report `cursor.found=true` with `cursor.reason=null`, while unknown cursors return an empty page with `cursor.found=false`, zero remaining actions, and no next actions. `phases`, `severities`, and `kinds` are enum-validated so typoed work-queue filters fail instead of returning an empty plan. Health results include a typed `relationCensus`: `summary.edges` and `compiledSummary.edges` count compiled frontmatter declarations, while the app's unavailable-to-MCP comparison unit is deduplicated normalized typed edges across the loaded ontology. `match_nodes` with `hasIncoming:false` lists the nodes nothing points to, which `find_orphans` used to do: it reads the files (so a vault with an invalid `uid:` still answers), counts a short reference several nodes share as a reference to each, leaves out `project` and `vault-readme` unless `kind` or `excludeKinds` says otherwise, and pages with `offset` and `pagination.nextOffset`.
`impact` and `blast_radius` follow only the `depends_on` relations that humans have explicitly written. Structural relationships such as what contains what are excluded from impact scope and risk calculations — for such structural questions, `reachability` and `subgraph` provide the answers. Each dependency edge is marked as either `review_required` (needs human review) or `declared_with_rationale` (reason provided), depending on whether a rationale is recorded. Until there is a current-source receipt confirming that each relationship remains factually accurate, the completeness and `risk` of this answer remain `unknown`.

7. **validate_vault** — whole-vault health check with per-file issues and grouped summary, including required/valid/unique UID claims, merge identity history, graph-array canonicality, and dangling graph references, plus the six body findings the write door reports (`definition-missing`, `boundary-missing`, `uncertainty-missing`, `epistemic-exclusion`, `slug-outside-kind-folder`, and `folder-only-evidence` where a repository root is known) — all warnings, so a thin vault reads as thin instead of as clean

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

8. **analyze_repo_structure** `{ rootPath?, maxDepth?, ignore?, sourceReads?, proposal?, qualification? }` — side-effect-free bootstrap candidates from package / README / source layout plus the executable construction lifecycle. A valid complete proposal first returns an exact non-writing `reviewPlan`, plan/source digests, eight phase states, every `requiredGapId`, and a shadow-only `admission` receipt (`self_qualified`, `partial_visible_gap`, `human_review_required`, or `hard_block`); `self_qualified` is an auto-write candidate signal, not write permission. `canWrite` remains false and `writePlan` is absent until the existing human acceptance gate is satisfied. A separately identified evaluator then measures approved executive/employee/agent CQs plus optional project-owned FDE CQs, current claims/citations, seven quality axes, the complete source-hidden task, and cold-start/prior-CQ regression. After the user sees the exact plan and accepts its digest/revision plus every visible gap, the unchanged proposal and `constructionQualification:v1` packet may release a `writePlan` exactly equal to the reviewed rows. Generated concept bodies use the parser's canonical full-body representation; after persistence every released body must full-read byte-for-byte equal before source connection or finalization. Maker-only evaluation, missing authority, `not_measured`, stale/private provenance, red mandatory axes, source/plan drift, regression failure, or an unaccepted gap fails closed. Acceptance is declared provenance, not authenticated identity or a truth certificate. Its five proposal competency answers still carry `answered` / `partial` / `visible-gap` plus typed concept, relation, evidence, and path witnesses, and the project body preserves that audit. `Excludes` is reserved for sourced product/concept boundaries: unknown or unmeasured evidence belongs in `Uncertainty` or a competency gap, and `epistemic-exclusion-boundary` blocks a proposal that would persist those unknowns as scope. Root `ARCHITECTURE.md` and classified Markdown under bounded `docs`, `site`, and `website` discovery can join the existing six-document semantic packet; archive-like paths and repository-escaping symlinks cannot. README extraction preserves purpose, responsibility/architecture, and ability blocks inside the existing 1,200-character budget instead of letting sponsor/backer/TOC sections consume it. Root package contracts remain bounded evidence, not meaning nodes: Rust reads allowlisted `Cargo.toml` package/features fields and returns separate literal `cfg`/`cfg_attr` provenance without evaluating predicates, executing code, or allowing relation writes. Python reads bounded static package evidence and import-participating boundaries; unused or unsafe inputs are skipped. Root Go modules contribute at most 24 import-participating package-directory element candidates, never path-derived capabilities. A proposal call recomputes the existing read-only import receipt so selectively proposed TS/JS/Python/Rust file endpoints and Go file/package endpoints are validated without relying on prior-call state, and import-backed `depends_on` must match observed direction. After the exact released rows land, the agent validates, compiles, connects the source, and finalizes project meaning.
9. **infer_imports** `{ rootPath?, sourceFolders?, ignore?, maxFiles?, reviewMode?, afterReviewId? }` — side-effect-free TS/JS, root-package Python, deterministic Rust, and root-module Go import evidence. Rust uses the existing file/module envelope for resolvable `use`, file-backed `mod`, and exact literal path/include forms; each file is capped at 256 KiB and 256 dependency statements. It does not expand macros, evaluate `cfg`, execute Cargo/compiler/network code, resolve symbols, or turn direct source direction into runtime/business impact. Conditional, escaped, non-literal, or otherwise ambiguous forms remain unresolved. External crate names are observed candidates only; package-contract evidence and review decide importance. Go remains separate as `packageImportEvidence` contract `goPackageImports:v1`, preserving exact importing files and repository-relative package directories without inventing target files. File and package receipts distinguish source role and usage; `value` does not claim runtime execution. Every collapsed edge includes whole-edge counts, their joint `productValueCount`, and up to five exact evidence receipts. Missing vault edges and Go package evidence are review-only, never executable write proposals. Compact and focus delivery surface Go counts plus the explicit full-evidence call instead of silently dropping a large package graph. Nothing auto-creates import endpoints or semantic `depends_on`; an agent must inspect both concepts, explain the meaning-level dependency, obtain human approval, and supply nonblank `why` before one explicit write.
10. **inspect_architecture** `{ rootPath?, profileSlug? }` — reads one reviewed `architecture-profile/v1`, scans current imports with the same bounded source analyzer, and returns the profile's governed import usages, usage-qualified role edges and receipts, violations, explicit unknowns, and the required `architectureChangePlan:v1` fields. Unknown usage stays fail-closed and cannot be declared away. Side effect 0; named architecture patterns remain declarations rather than inferred source facts.
11. **validate_wiki** — validates the separate `wiki/**.md` page contract without treating pages as ontology nodes.
12. **read_source** — reads one bounded raw source under `sources/` with format-specific citation anchors and no converted copy.
13. **get_constellation** `{ id?, offset?, limit? }` — resolves one saved constellation by stable folder UUID, preserving member UIDs and display-only last-known paths without promoting membership into ontology edges. With no `id` it lists the saved constellations (identity, purpose, counts, unresolved-member state), which `list_constellations` used to do.

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
[bootstrap workflow](../../.agents/skills/ontology-bootstrap/workflow.md)
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
an `agentBriefCompact:v3` projection: `structuredContent` and a separate handoff
text, together at most 12,000 UTF-8 bytes. Each channel stands alone (the text adds
the repair step-1 call with its guards, `Safety:` and the exact `Full:` call; the
structure adds `readerRules`), and optional units fill both identically. The
current combined two-call wire guard is 22,000 characters. It keeps
final source/meaning currentness, the meaning-repair guards and first step, the names of the repair steps it omits, and the human-approval
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
`focus.uncertainty` attributes whole `focus.unknowns` strings to the selected
project, capability and anchors, with per-document unit and omission counts;
system currentness/meaning gaps remain separate. Missing sections mean unknown,
not complete knowledge. The exact full-body read includes every scoped document,
including the project. A failed row or a capped body remains incomplete; only
`ok:true` with `bodyInfo.truncated:false` establishes a complete body read.
The same source fingerprint, revision, and graph hash are checked again after
the named reads; a mismatch detected by the exact-file guards or that final
recheck withdraws every target and downgrades outer currentness. Compact v3
sends typed facts once in `structuredContent` and
the handoff as `content[0].text`. The current `OATLAS_READ_ONLY=1` frozen-control
run reduced source reads from four to one, wall time by 23.9%, and uncached input
by 19.1%; two order-reversed blind judges preferred the treatment. The two-call
wire path measured 12,928 characters. The full read/write profile and
cross-repository coding speed remain unqualified, so compact and read-only stay
explicit choices rather than defaults.

`query_ontology({operation:"cycles"})` returns each cycle as the canonical slug
path plus aligned `nodeSummaries[]`, so dependency-cycle diagnostics are readable
without extra node lookups.

#### Write tools (11)

All destructive dry-runs (relation remove or replace, rename or reclassify,
merge, delete, absorb and disconnecting a project source) expose the same agent decision
contract: `previewReady`, `canConfirm`, `wouldChange`, and
`blockedReasons[]`. Tool-specific legacy `ok` is not the confirmation signal.

1. **add_concepts** `{ concepts }` — batch create nodes (max 50), order-preserving partial results; non-object row shape / unknown row field errors are isolated as `{ok:false, error}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field with nearest hints, and duplicate input slugs report both the failing `concepts[n]` row and first-seen `concepts[m]` via text plus structured `rowName` / `firstSeenAt`; changed batches return each row's result plus `findings`, one line per kind of finding on the rows just written, with no absolute path and no maintenance plan
   - **Validation**: title must be non-empty trimmed string (`isValidVaultTitle`)
2. **patch_concept** `{ slug, frontmatter?, body?, expected_mtime? }` — update existing; graph arrays are canonicalized, but immutable `uid` and merge-owned `merged_uids` cannot be changed by generic patch
    - **Validation**: rejects `title: null` and `title: ""`
    - **Conflict guard**: optional `expected_mtime` (from a `get_concepts` row). Throws `VaultConflictError` if file mtime differs at write time — caller re-reads and retries.
3. **add_relations** `{ relations }` — batch edge writer (max 50), idempotent per row; non-object row shape / unknown row field errors are isolated as `{ok:false, error}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field with nearest hints plus structured `rowName` / `allowedFields` / `receivedFields`, and relation type typos include structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; stored relation arrays are deduped and sorted as canonical graph sets; changed batches return each row's result plus `findings`, one line per kind of finding on the rows just written, with no absolute path and no maintenance plan
    - type enum: `depends_on` (→ `dependencies`) / `relates` / `contains` / `describes` / `domains` / `capabilities` / `elements` / `domain`
    - **Validation**: both `from` AND `to` slug must exist in vault (`vaultSlugExists`)
    - Unique tail aliases and frontmatter `slug:` aliases are resolved to canonical file slugs before write
    - Idempotent: duplicate returns `{ alreadyExists: true }`
4. **delete_concept** `{ slug, confirm?, force?, expected_mtime? }` — permanent delete; confirmed deletes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - `confirm: false` (dry-run with backlinks preview) / `true` (actual)
    - `force: false` (throw if backlinks exist) / `true` (delete anyway)
    - **Conflict guard**: optional `expected_mtime`
5. **rename_concept** `{ oldSlug, newSlug?, newKind?, domain?, body?, confirm?, overwrite?, expected_mtime? }` — atomic graph-level rename
    - Moves the .md file, updates the moved file's `slug:` key, rewrites every backlink (frontmatter array entries, inline string keys like `domain`, body links `[[oldSlug]]` / `(oldSlug.md)`)
    - Tail-only references (`mcp-server` for `capabilities/mcp-server`) also redirected to the new tail
    - `confirm: false` (dry-run with full update preview) / `true` (actual)
    - Confirmed renames return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
    - Replaces the manual `find_backlinks` + N `patch_concept` loop
    - Preserves the node UID; only the readable address and backlinks change
    - `newKind` changes the node's kind in the same call (the retired `reclassify_concept`): `newSlug` becomes optional, `domain` is required for a capability or element, `body` is optional, `overwrite` is refused; each referrer's entry moves to the new kind's list, and entries a referrer cannot keep are named in `warnings`
6. **merge_concepts** `{ fromSlug, intoSlug, confirm?, expected_mtime?, expected_into_mtime? }` — atomic graph-level merge
    - Redirects every backlink `fromSlug` → `intoSlug`, then deletes `fromSlug.md`
    - Preserves `intoSlug` UID and records source identity history in canonical `merged_uids`; prose is not auto-combined
    - For confirmed writes, pass both source and survivor mtimes so neither concurrent edit is overwritten
    - `confirm: false` (dry-run) / `true` (actual)
    - Confirmed merges return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers
7. **remove_relation** `{ from, to, type, replaceWith?, confirm?, expected_mtime? }` — one exact typed relation and its rationale, dry-run first; an absent relation is an explicit no-op blocker. With `replaceWith: { to, type, why? }` the relation is replaced in one source-file write, its rationale moving with it (the retired `replace_relation`)
8. **absorb_document** `{ filePath, confirm?, allowOutsideRepo? }` — classifies a local agent-instruction document, writes accepted policy nodes, backs up the source, then rewrites it as a slim pointer. Canonical paths outside `repoRoot`, including symlink escapes, are blocked until a reviewed dry-run is repeated with `allowOutsideRepo:true`
9. **finalize_project_meaning** `{ projectSlug, expected_mtime, answers? }` — post-write finalization for one explicit project. With `answers` (five rows, one per fixed competency question) the server writes the project body's `## Competency answers` section from them and finalizes in one call; without, it reads the section already in the project Markdown. After current vault validation and a complete project scope, it resolves every typed witness against the current graph/source inventory, measuring a cited file the stored source receipt does not cover inside the already connected folder, and stores a versioned receipt with optimistic-concurrency protection. The receipt stores no raw answers or private source coordinates; the answers themselves live in the project Markdown. `ok: true` means the writes succeeded, not that the ontology or source is verified; callers read the returned categorical `meaningAssessment` or a fresh explicit-project `agent_brief`.
10. **connect_project_source** `{ projectSlug, rootPath?, confirm?, repair? }` — dry-run/confirm binding of one project to a local source folder, with a measured source receipt; private absolute paths stay in the gitignored vault sidecar.
11. **disconnect_project_source** `{ projectSlug, confirm? }` — dry-run/confirm removal of one project's binding and receipt, without touching ontology Markdown or other projects.

#### Retired from tools/list (16)

These names are left out of `tools/list` because another tool, or the agent's own
command, does their whole job. The first seven still answer when called, so an agent
following older instructions keeps working, and each answer ends with a note naming the
replacement. The last nine no longer run: the call answers `tool_retired` with the
replacement in `replacement` and the name in `retiredTool`, and nothing is read or written.

| Retired | Call instead |
|---|---|
| `get_concept({ slug })` / `({ uid })` | `get_concepts({ slugs: [slug] })` / `({ uids: [uid] })` |
| `add_concept({ ...row })` | `add_concepts({ concepts: [row] })` |
| `add_relation({ from, to, type, why })` | `add_relations({ relations: [row] })` |
| `find_path({ from, to })` | `query_ontology({ operation: 'path', from, to })` |
| `find_neighbors({ slug })` | `query_ontology({ operation: 'neighbors', slug })` |
| `list_kinds()` | `list_concepts({ limit: 1 })`, reading its `census` |
| `index_project(...)` | `analyze_repo_structure`, then `infer_imports` and `validate_vault` |
| `git_status()` (answers `tool_retired`) | the agent's own `git -C <repoRoot> status -- <vault>`; `connection_info` names both paths |
| `git_history({ limit })` (answers `tool_retired`) | the agent's own `git log -- <vault>` |
| `git_snapshot({ confirm })` (answers `tool_retired`) | the agent's own `git add` and `git commit` of the vault folder |
| `list_constellations()` (answers `tool_retired`) | `get_constellation()` with no `id` |
| `find_evidence({ title })` (answers `tool_retired`) | `list_concepts({ mentions: title })` |
| `find_orphans()` (answers `tool_retired`) | `query_ontology({ operation: 'match_nodes', hasIncoming: false })` |
| `query_concepts({ filter })` (answers `tool_retired`) | `list_concepts({ filter })` |
| `replace_relation({ from, oldTo, oldType, newTo, newType, why })` (answers `tool_retired`) | `remove_relation({ from, to: oldTo, type: oldType, replaceWith: { to: newTo, type: newType, why } })` |
| `reclassify_concept({ slug, newKind })` (answers `tool_retired`) | `rename_concept({ oldSlug: slug, newKind })` |

