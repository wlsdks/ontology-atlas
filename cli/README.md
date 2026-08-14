# ontology-atlas

> **Repo-native memory layer CLI** — scaffold, validate, compile, query, and
> maintain the markdown ontology vault your AI coding agent reads through MCP.

```bash
node cli/src/index.mjs init my-vault
cd my-vault
$EDITOR project.md
```

That's it. You now have a frontmatter-based memory vault that humans and AI
agents (Claude Code, Cursor, Codex, etc.) can read and write together.

Requires Node 24+ (Active LTS as of 2026-07). The CLI spawns the MCP server in
`mcp/`, which uses the same Node floor.

> **How this CLI ships:** from a source checkout, invoked as
> `node cli/src/index.mjs`. npm publishing is retired
> (`docs/DECISIONS.md`, 2026-07-27), so `npx ontology-atlas` is not a channel.
> Users who only want the agent connection do not need this CLI at all — the
> installed macOS app bundles the MCP server and writes the config itself.

## Commands (R12)

Every ontology node carries an immutable lowercase UUIDv4 `uid` and a mutable,
human-readable `slug`. Writers mint the UID locally; callers do not choose it.
Relations, file paths, URLs, and graph-command arguments remain slug-based.
Exact identity, handoff/provenance, compiler indexes, and interop exports use UID.
Rename/reclassify preserve it; merge retains the target UID and absorbs source
identities into merge-owned `merged_uids`.

Vaults created before this v2 identity contract migrate explicitly from the
source checkout: `pnpm vault:migrate 2026-08-02-add-node-uids --vault <dir>`
previews and the same command with `--write` applies. It preserves valid UIDs,
validates all claims before writing, and inherits the dirty-Markdown guard.

| Command | What it does |
|---|---|
| `ontology-atlas init [folder] [--locale=en\|ko]` | Scaffold a new vault and mint a different fresh UID for every starter node, including the vault README. Locale variants share graph shape and titles but never fixed identities. Also writes wired agent configs in both codebase and vault roots. A parseable existing config keeps unrelated servers/sections while only its `ontology-atlas` binding is atomically rebound to the requested vault; malformed or duplicate Atlas config is preserved, gets an adjacent example, and makes init report `scaffolded but client binding unresolved` with a nonzero exit. With `--quick-start`, a bootstrap failure preserves the written scaffold/config files but returns nonzero, labels them unverified, suppresses completion/connection claims, and prints executable `mcp-verify` plus bootstrap retry commands. |
| `ontology-atlas agent-setup [vault]` | Check or repair agent config files for an existing vault without writing starter markdown. Dry-run reports ready/missing/review status for vault-local and codebase-root `.mcp.json` / `.codex/config.toml`; ready requires one of the two supported launch shapes (absolute bundled `ontology-atlas-mcp` with no args, or `node` with one absolute `mcp/src/index.js` arg), an existing executable/entry file, and the expected vault/repo coordinates. Retired `npx` launchers stay review-only. `--write` creates missing files or atomically merges/rebinds only the single Atlas JSON entry / TOML section pair, preserving unrelated client entries and comments. Invalid JSON, duplicate Atlas sections, and incomplete section pairs stay review-only and receive merge templates instead of being overwritten. JSON separates `written` from `repaired`. It also includes `operation:"agent_setup"`, per-file status, `docs.workflowGuide`, `docs.modeComparison` for CLI-only / MCP-connected / graph DB pack / setup gate choices, `docs.postChangeSync` after-edit sync rules, and follow-up `mcp-verify`, `agent-brief --verify-fallbacks --json`, and global `codex mcp add ...` commands. `--install-pre-commit-hook` installs (or appends to an existing) git pre-commit hook that runs `ontology-atlas preflight --staged`; idempotent, never overwrites an unrelated existing hook body, and the hook itself never blocks a commit (`git commit --no-verify` still skips it like any other hook). |
| `ontology-atlas list [vault]` | List ontology nodes (color table; enum-validated `--kind X` filter with closest-value hints, `--json`) |
| `ontology-atlas validate [vault]` | Frontmatter integrity, including required/valid/unique UID claims, merge identity history, expected fields, graph-array canonicality, and dangling references; `exit 1` on errors. Same code가 2+ file에 등장하면 *grouped by code* 요약이 붙습니다. `--fail-on=code,...` accepts explicit policy codes. |
| `ontology-atlas mcp-verify [vault]` | Runs the installed MCP package verify CLI against the resolved vault: parser smoke, server boot, live inventory exactness (missing/extra/duplicate/invalid names and initialize parity), tools/list schema strictness and annotation coverage, strict runtime unknown-argument and invalid-enum checks with structured `errorCode` values, stale `patch_concept.expected_mtime` rejection with `vault_conflict`, relation filter / `relation_check` closest-value rejection, destructive dry-run smoke for `rename_concept` / `merge_concepts` / `delete_concept`, write-tool `postWriteMaintenance` `byPhase`/`bySeverity`/`byKind` buckets + `score`/`proposedAction`/next-action guidance, enum-validated `maintenance_plan` filters, ready `maintenance_plan` cursor + missing `maintenance_plan.afterActionId` cursor smoke, maintenance bucket / current-page next-action summaries, `list_concepts`, project-node `list_concepts` probe, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `index_project`, `find_neighbors`, `find_path`, `find_orphans`, `list_kinds`, `validate_vault`, `workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`, `compile_ontology` summary + paginated full-artifact + indexed full-artifact smoke, `overview`, `overview`/`project_map` query_plan, and `neighbors`/`path`/`all_paths`/`project_scope` graph-query smoke. Use `--timeout-ms N` for large/slow vaults. |
| `ontology-atlas add <kind> <slug> --title="..."` | Scaffold a new node and mint a fresh immutable UID (`--domain X --body "..." --vault path`); throws on duplicate slug or UID. Bad scalar input fails before writing. Body defaults to a starter only when omitted. `--auto-prefix` is on by default; use `--raw-slug` to opt out. |
| `ontology-atlas find <query> [vault]` | Search slug + title (case-insensitive, enum-validated `--kind X` filter with closest-value hints, `--json`) |
| `ontology-atlas import <path...>` | Import external `.md` through the same schema as `add`. A valid source UID is preserved; a missing UID is minted; malformed or destination/batch-colliding identities fail instead of being replaced. `--rename` changes only the slug and never duplicates identity. Options: `--vault path`, `--kind K`, `--auto-prefix`, `--raw-slug`, `--rename`, `--dry-run`. |
| `ontology-atlas bootstrap [rootPath]` | Analyze a repo and return a **review-only** plan for project/domain/capability/element candidates and containment. Cold-start CLI never writes semantic nodes: an exact `constructionQualification:v1` packet, human acceptance, and unchanged released `writePlan` are required through the MCP lifecycle. Inferred imports are returned only as exact-evidence `rationale_review_required` candidates. `--json` includes `writeEligible:false`, `reason:"approval_required"`, and `writes:0`. Use a connected agent with `/ontology-bootstrap` to continue review → independent qualification → human acceptance → exact writePlan. |
| `ontology-atlas analyze [rootPath]` | Preview repo-derived candidates without writing. For root Python packages, up to 12 implementation boundaries that participate in observed imports become element/path candidates: direct modules are the base and up to two exact nested security/policy/risk endpoints may reserve slots. Unused files and ambiguous flat slugs stay out. The MCP proposal preflight may separately validate at most four other exact observed file endpoints selected for distinct change-navigation roles without adding them to this automatic list. Top-level `rootPath` / `framework` / `skipped` and candidate `evidence.source` payloads are validated before JSON or human output, so MCP outputSchema drift fails closed. `--apply` lands those candidates via batch MCP calls and prunes untouched `init` starter examples the same way as `bootstrap`; batch row-level failures without identifying fields still print `concepts[n]` / `relations[n]` fallback labels instead of `undefined`. |
| `ontology-atlas infer-imports [rootPath]` | Preview TS/JS and bounded static Python import-derived module edges without writing. Lines are labelled `imports`, not `depends_on`: they are code-use facts, not approved ontology relations. Every collapsed module edge includes `count`, `kindCounts`, and up to five exact file-edge evidence receipts. Reconciliation emits `rationale_review_required`, never a write action. `--apply` is deliberately disabled: inspect both concepts, explain why the semantic dependency holds, ask the user, then write one explicit relation with `why`. `--threshold N` filters review candidates only; `--full` explicitly requests complete module-edge arrays when MCP would compact a large response. MCP agents should start the bounded approval flow with `infer_imports({reviewMode:"next"})`. |
| `ontology-atlas preflight [vault]` | **Commit preflight** — matches staged files against vault source references, then runs dependency-only `blast-radius` on matched nodes. Declared impact is shown, but risk/completeness remain `unknown` without relation-level source receipts; structure belongs to `reachability`/`subgraph`. Purely informational and silent when nothing matches. (`--depth N --json`) |
| `ontology-atlas snapshot [vault]` | **Atlas Git slice 1** — commits vault-scoped changes only, with a semantic commit message (kind-level add/update/remove counts + up to 3 representative slugs, e.g. `ontology snapshot: +2 concepts, ~3 updated (capabilities/foo, elements/bar, +1)`). Uses a pathspec-scoped `git commit -- <vaultRel>` (a git "partial commit") so files already staged outside the vault are left untouched — nothing outside the vault is ever `git add`ed or committed. Exits 0 with no commit when there's nothing to snapshot; exits 1 with a `git init` suggestion (never runs it for you) when the vault isn't inside a git repository. Trust-charter default is a local commit only — `--push` sends to the current branch's existing upstream and prints the remote URL, or exits 1 with `git push -u origin <branch>` guidance if no upstream is configured (never auto-configures one). `--message "..."` uses your text as the commit subject (the auto summary moves into the body); `--dry-run` previews without committing. (`--dry-run --push --message "..." --json`) |
| `ontology-atlas connect-source <projectSlug> [vault]` | **Connect the code** — binds a project node to the local folder holding the code it describes, measures it, and writes the source receipt. Mirrors MCP `connect_project_source`. Without `--root` it infers the folder: the git repository enclosing the vault wins, otherwise the nearest ancestor carrying a project manifest (`package.json`, `Cargo.toml`, `go.mod`, …). **Dry-run by default** — it prints the proposed folder, the inference confidence, and how many of the ontology's declared `path:` claims actually exist inside it; `--confirm` writes. `--root path` binds (or re-binds) a folder you choose; `--repair` discards a malformed sidecar. The binding lives in the gitignored `.ontology-atlas/project-sources.json`, so the absolute path never reaches git or any handoff. (`--root path --confirm --repair --json`) |
| `ontology-atlas disconnect-source <projectSlug> [vault]` | **Undo the connection** — removes that project's source binding and receipt; `agent-brief` returns to `source_unbound` / `connect_source`. Mirrors MCP `disconnect_project_source`. Dry-run by default, `--confirm` writes; other projects' bindings and all ontology markdown are untouched. (`--confirm --json`) |
| `ontology-atlas compile [vault]` | Compile the vault through MCP `compile_ontology` and print deterministic graph counts/hash. Use `--summary` for cheap polling, `--json` for the raw artifact, and `--fix` to apply compiler relation-array canonicalization actions. Large `--json` output is safe to consume through stdout pipes. |
| `ontology-atlas absorb <file...>` | Convert CLAUDE.md / AGENTS.md-style prose markdown into typed vault nodes. Dry-run by default — prints the conversion plan and touches nothing. `--write` lands policy/rule sections as `document` nodes and rewrites the source into a slim pointer that keeps an absorption summary plus the un-absorbed sections verbatim (the original is backed up as `.pre-absorb.bak`). Architecture/component sections are proposed only, never auto-written; injection-suspect (Tier 1) sections are excluded from absorption entirely. (`--vault path --write`) |
| `ontology-atlas export [vault]` | Export JSON-LD, GraphML, or the raw compile artifact. Stable node identity is `urn:uuid:<uid>`; slug remains an explicit readable property and edge endpoints use UID URNs. Rename therefore does not change external identity. Missing/invalid/duplicate UID claims fail closed; external/dangling refs are omitted. |
| `ontology-atlas index [rootPath]` | Long-running project indexing entrypoint that chains structure analysis, import evidence, and vault validation. It is review-only on every path; the legacy `--apply` flag is retained as a fail-closed compatibility wrapper and returns `approval_required` without writing. (`--vault path --apply --full --threshold N --skip-imports --max-depth N --max-files N --json`) |
| `ontology-atlas agent-files [--root path]` | Read-only readout of which AI agent instruction files exist and which tool reads each one (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.claude/rules\|skills\|agents`, `.agents/skills`, `.cursor`, `.cursorrules`, the GitHub Copilot instructions file, `.codex`, `.mcp.json`), plus four drift checks: the CLAUDE.md ↔ AGENTS.md import bridge, byte diff between duplicated skill trees, `@reference` existence, and the AGENTS.md 32 KiB Codex cap. Exit `0` = no drift, `1` = drift, `2` = error; nothing is written. (`--json`) |
| `ontology-atlas agent-activity [vault]` | Write (or read, or clear) `.ontology-atlas/agent-activity.json` — the explicit live activity heartbeat the app reads from the opened vault, so a human watching the map can see what their agent is doing right now. `--state` is one of `planning` / `editing` / `verifying` / `blocked` / `complete`; repeat `--file`, `--plan`, `--mcp`, `--source`, `--verify` for multiple entries. JSON reports `reviewMode` (`ontology-focus` with `--ontology-slug`, `business-extraction` with source files only, otherwise `none`). (`--agent X --state S --focus "..." --show --clear --json`) |
| `ontology-atlas moment [vault]` | Print the north-star magic moment: elapsed time from `init` / `absorb --write` to the first `agent-brief` run afterwards, target ≤ 5 minutes. All data stays in `.ontology-atlas/telemetry.local.json` — local only, never transmitted. `--mark` stamps the moment manually for agents that call the read-only MCP tools directly instead of this CLI. (`--mark --json --vault path`) |

### Graph-level commands (R15 follow-up)

These wrap the MCP server (`ontology-atlas-mcp`) so the developer has the same authority as an AI agent — compile the graph, find backlinks, rename / merge / delete safely, run a typed filter DSL. Each spawn is ~50–100 ms one-shot; commands that mutate the graph are dry-run by default with an explicit `--confirm` flag, except `compile --fix`, which only applies compiler-produced canonicalization patches.

| Command | What it does |
|---|---|
| `ontology-atlas backlinks <slug>` | Lists every node referencing the target (`matches[]` from MCP `find_backlinks`, `--json` for raw). Malformed backlink-match payloads fail closed before JSON or human output. |
| `ontology-atlas overview [vault]` | First-contact graph dashboard from MCP `query_ontology(overview)`: graph counts, kind/domain/relation buckets, and hub rows. Malformed graph/count/hub payloads fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas hubs [vault]` | Centrality rankings from MCP `query_ontology(centrality)`: PageRank, bridges, authorities, and hubs. `--plan` runs `query_plan(centrality)` first and skips expensive/warning plans unless `--force` is passed; `--types A,B` narrows relation types before PageRank. Shared query-plan output now shows `totalMatches` when a planned graph scan has filter-aware match counts, so future graph DB-style wrappers can expose how much a filter narrows before execution. Malformed plan/ranking payloads fail closed before JSON or human output. (`--limit N --types A,B --plan --force --json`) |
| `ontology-atlas blast-radius <slug> [vault]` | Dependency-impact view from MCP `query_ontology(blast_radius)`. It follows only declared `depends_on`; structural relations are rejected and belong to `reachability`/`subgraph`. Output reports `risk: unknown`, declared/rationale/source-backed counts, and edge qualification until relation-level source receipts establish completeness. (`--depth N --direction incoming|outgoing|both --plan --force --json`) |
| `ontology-atlas node <slug> [vault]` | Single-node deep dive from MCP `query_ontology(node_profile)`: node header, degree, lineage, and incoming/outgoing edge groups. `--types A,B` filters relation groups before `--limit N` tunes edge/lineage/containment rows for hotspot nodes; `--no-external` / `--no-unresolved` hide noisy file refs or dangling refs from edge lists. Malformed node/degree/edge/lineage payloads fail closed before JSON or human output. (`--limit N --types A,B --no-external --no-unresolved --json`) |
| `ontology-atlas similar "<query>" [vault]` | Duplicate-avoidance search from MCP `query_ontology(similar_nodes)`: scored matches, signals, and shared neighbors. Malformed match/score/signal payloads fail closed before JSON or human output. (`--slug X --kind K --limit N --json`) |
| `ontology-atlas domain-matrix [vault]` | Domain-to-domain coupling matrix from MCP `query_ontology(domain_matrix)`: domain in/out/self/external summaries, cross-domain connection rows, relation buckets, and example edges. `--types A,B` narrows the matrix to semantic relation families such as `depends_on,relates,describes`, matching the UI's reproducible coupling audit. Useful for running coupling audit playbooks without an MCP connector. Malformed summary/domain/connection/example payloads fail closed before JSON or human output. (`--project SLUG --types A,B --limit N --json`) |
| `ontology-atlas facets [vault]` | Graph dashboard facets from MCP `query_ontology(facets)`: node kind/domain/degree buckets, edge relation/resolution buckets, top-degree nodes, and top schema patterns. Useful as the first connector-less graph scan before narrowing into `match-nodes`, `match-edges`, `node`, or `schema`. Malformed graph bucket / top node / pattern payloads fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas schema [vault]` | Relation schema pattern scan from MCP `query_ontology(schema)`: from-kind, relation, to-kind, resolved/external/unresolved counts, and examples. Useful before traversal or `add_relation` because it shows which graph shapes already exist without needing an MCP connector. Malformed schema pattern payloads fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas orphans [vault]` | Lists isolated nodes — docs no other node references in their frontmatter (MCP `find_orphans`). Options: enum-validated `--kind X` (filter), enum-validated `--exclude-kinds A,B` (skip; MCP default excludes `project,vault-readme`), `--json`. Malformed orphan-list payloads fail closed before JSON or human output. Quick "what should I clean up" surface for vault maintenance. |
| `ontology-atlas path <from> <to> [vault]` | Shortest path (BFS, undirected) between two slugs. Each hop is annotated with the frontmatter key (`capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair, so you see *why* A and B are connected. Malformed hop/edge payloads fail closed before JSON output. (`--max-hops N --json`) |
| `ontology-atlas explain <from> <to> [vault]` | Relationship explanation from MCP `query_ontology(explain_relation)`: direct edges, shortest path, domain comparison, and shared common-neighbor evidence in one terminal view. Human output adds a `next relation` evidence loop with bounded `path`, filtered `match-edges`, and `relation-check` preflight so a developer or connector-less agent can verify before changing graph structure. Malformed direct-edge/path/common-neighbor payloads fail closed before JSON or human output. (`--direction incoming\|outgoing\|both\|undirected --max-hops N --types A,B --limit N --json`) |
| `ontology-atlas all-paths <from> <to> [vault]` | Bounded simple path enumeration from MCP `query_ontology(all_paths)`: returns alternative paths plus `limit`, `searchBudget`, `expandedStates`, `exhaustive`, `truncatedByBudget`, `totalPathsExact`, and `evidence.pathsComplete` so agents do not treat partial traversal as proof. `--plan` runs `query_plan(all_paths)` first and skips expensive/warning enumeration unless `--force` is passed. Malformed plan/completeness/path payloads fail closed before JSON or human output. (`--max-hops N --limit N --search-budget N --types A,B --plan --force --json`) |
| `ontology-atlas relation-check <from> <to> <type> [vault]` | Schema-aware preflight before `add_relation`, backed by MCP `query_ontology(relation_check)`. Shows whether the exact edge already exists, whether a reverse-direction edge exists, whether the kind/relation pattern is familiar, nearby schema patterns, and a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`). Non-dependency relations may expose ready `proposedAction` args. A new `depends_on` never does: it prints a non-writing semantic approval gate requiring an observable-ability explanation, rationale, explicit human approval, and `why`. Malformed relation-check payloads fail closed before JSON or human output. (`--json`) |
| `ontology-atlas relate <from> <to> <type> [vault]` | **R+** Writer counterpart of `relation-check` — identical argument shape and preflight (rejects a nonexistent `from`/`to` slug or an invalid `type` before touching the vault, same verdict/schema/recommendation display), then lands the relation directly on `<from>`'s frontmatter unless the exact edge already exists (idempotent, matches `add_relation`'s `alreadyExists` semantics). A new `depends_on` write requires `--why "..."`; existing legacy edges remain idempotent. Closes the gap where `relation-check` could compute the exact `add_relation` payload but nothing in the CLI could execute it — every other read/propose CLI pair (`analyze`/`infer-imports`, `growth`/`maintenance`) already has an apply path; this is the CLI-only (no MCP connector) way to add the single most common ontology edit. Writes with the CLI's own fs primitives (sorted/deduped relation arrays, `domain` as a single scalar that refuses to silently overwrite an existing value) — same on-disk shape as MCP `add_relation`. `--dry-run` previews the preflight result without writing. (`--dry-run --json`) |
| `ontology-atlas query "<filter>"` | Typed filter DSL — `kind=X AND has(Y) AND NOT domain=Z`, parens / OR / NOT supported. `kind` and `has(...)` graph keys fail closed with closest-value hints. MCP-style `--operation` misuse prints graph-level CLI command guidance instead of a bare unknown flag. Malformed typed-filter result payloads fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas growth [vault]` | Inspect MCP `growth_plan` candidates without writing: relation recommendations, external element refs, dangling references, unassigned nodes, empty domains, and ignored external refs. Human output includes action totals, compiled graph counts, candidate reasons, and proposed tool calls, plus a `next growth` relation preflight loop before applying recommended edges. Malformed growth candidate payloads, including kind-specific `proposedAction` mismatches, fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas maintenance [vault]` | Inspect MCP `maintenance_plan` cleanup/repair work queue without writing. Human output includes cursor state, active filters, compile/cycle/canonicalize/dangling/relation/external/ignored-external summary counts, phase/severity/kind bucket summaries, current-page next action pointers with `phase/kind · severity · exec|review` detail, and a `next maintenance` command to narrow the queue before acting. Supports `--limit`, `--after-action-id`, `--executable-only`, `--phases`, `--severities`, `--kinds`, and `--json` for cursor/filter dogfood. Malformed work-queue payloads, filter echo drift, pagination `limited` drift, or compiled-summary drift fail closed before JSON or human output. |
| `ontology-atlas cycles [vault]` | Directed `depends_on` cycle detection from MCP `query_ontology(cycles)`. Any cycle exits 1 for shell/agent gates; human output prints node titles plus a `next cycle` evidence loop with bounded `path`, filtered `match-edges`, and the focused maintenance queue for `break_dependency_cycle` review. Malformed cycle rows fail closed before JSON or human output. (`--max-hops N --json`) |
| `ontology-atlas components [vault]` | Connected graph island scan from MCP `query_ontology(components)`. Use it before trusting traversal maps, onboarding maps, or graph DB-style scan coverage; human output lists island sizes, kind buckets, and node samples without requiring users to dig through `health --json`. Malformed component payloads fail closed before JSON or human output. (`--limit N --node-limit N --types A,B --json`) |
| `ontology-atlas topological-order [vault]` | Prerequisite-first dependency ordering from MCP `query_ontology(topological_order)`. Defaults to dependency edges and exits non-zero when cycles block a complete order, so connector-less agents can gate implementation sequencing without parsing `health --json`. Malformed order/blocker payloads fail closed before JSON or human output. (`--limit N --types A,B --include-isolated --json`) |
| `ontology-atlas workspace-brief [vault]` | Cheap first-contact dashboard from MCP `query_ontology(workspace_brief)`: hotspots, per-project node counts (`project_scope`), health-check coverage as `id:status:count`, and growth counts before deciding where to read deeper. Same focused diagnosis tuning flags as `health` / `agent-brief`. (`--json`) |
| `ontology-atlas health [vault]` | Graph health gate from MCP `query_ontology(health)`: compile issues, unresolved edges, dependency cycles, relation recommendations, and connected-component checks as `id:status:count`. Exits non-zero on blocking checks so shells / agents can gate on it. (`--json`) |
| `ontology-atlas match-nodes [vault]` | Graph DB-style node scan from MCP `query_ontology(match_nodes)`: filter by `--kind` / `--domain` / `--slug-contains` / `--min-degree`, sort by degree. `--plan` previews scan cost before execution. (`--limit N --json`) |
| `ontology-atlas match-edges [vault]` | Graph DB-style edge scan from MCP `query_ontology(match_edges)`: filter by `--from` / `--to` / `--from-kind` / `--to-kind` and relation `--types`. `--plan` previews scan cost. (`--limit N --json`) |
| `ontology-atlas pattern-walk <slug> [vault]` | Explicit relation-sequence walk from MCP `query_ontology(pattern_walk)`: follow a typed relation `--pattern` (e.g. `domains,capabilities`) from a start node in a chosen `--direction`. (`--direction outgoing\|incoming\|both --limit N --json`) |
| `ontology-atlas project-map <project> [vault]` | Domain-by-domain project map from MCP `query_ontology(project_map)`: per-project domain → capability → element breakdown. (`--limit N --item-limit N --json`) |
| `ontology-atlas reachability <slug> [vault]` | Transitive reachable-node layers from MCP `query_ontology(reachability)`: BFS layers of what a node reaches (or what reaches it) by relation `--types` and `--direction`. `--plan` previews scan cost. (`--depth N --limit N --plan --force --json`) |
| `ontology-atlas agent-brief [vault]` | Claude Code/Codex handoff from MCP `query_ontology(agent_brief)`: readiness score, categorical fail-closed `meaningAssessment`, copyable `handoffPrompt`, structured `cliFallbackCommands[]`, graph entrypoints, first MCP calls, investigation playbooks including `graph_traversal` (`schema` / `all_paths` / `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` / `bounded_path_evidence` / `containment_cross_check`), playbook evidence + stop-condition checklists, write guardrails, `relation_check` decision guide, `all_paths` result contracts, health coverage, and read-first write policy. Use `--project SLUG` to select one containment tree in a multi-project vault; it forwards the exact project to MCP. The handoff prompt and human output include directly runnable CLI fallback commands such as `ontology-atlas hubs [vault] --plan ...` for connector-less Claude Code/Codex sessions; the default `all-paths --plan` fallback starts with a low-cost direct relation/containment bound before agents widen traversal. `--prompt` prints only the handoff prompt for direct paste into Claude Code/Codex, `--graph-db-pack` prints only a shell-pasteable Graph DB-style CLI scan script with the selected vault path already inserted for connector-less sessions, and `--verify-fallbacks` executes the generated fallback command list against the selected vault with a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count), per-command elapsed time, and the slowest fallback summary; combine it with `--json` for a compact machine-readable timing report that Claude Code/Codex can parse in automated setup checks, with command output samples included only for failing fallback rows. Each fallback command is bounded by a 15s default timeout; use `--fallback-timeout-ms N` or `OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N` for larger vaults or slower disks, and timeout rows return `timedOut:true` plus `signal` in JSON. Passing-but-slow rows are marked with `slow:true` when they take at least the 5s default slow threshold; tune it with `--fallback-slow-ms N` or `OATLAS_AGENT_FALLBACK_SLOW_MS=N`, and JSON includes `performanceOk`, `slowThresholdMs`, plus total `slow`. Malformed readiness, meaning assessment, handoff prompt, CLI fallback, tool-call, playbook, traversal strategy, guardrail, result contract, relation decision guide, next-action, or health-check payloads fail closed before JSON or human output. **Exit code is a readiness signal, not success/failure**: `0` = ready and healthy; `1` = the command ran and printed valid data, but graph readiness is `needs_attention`/`needs_shape`, a health check failed, or a fail-severity `nextAction` is present — this is advisory graph state, not a command failure; `2` = the MCP call itself failed. Naive `agent-brief && next-step` shell chaining misreads exit `1` as failure the first time a vault has any warning — pass `--exit-zero` to always exit `0` and read `status`/`readiness` from the JSON output instead (a genuine parse/MCP-call error still exits `1`/`2` even with `--exit-zero`; `--verify-fallbacks --exit-zero` also still exits `1` when a generated fallback command itself fails to run). (`--project SLUG`; `--json` plus the same focused diagnosis tuning flags as `health` / `workspace-brief`; `--exit-zero`) |
| `ontology-atlas rename <oldSlug> <newSlug>` | Atomic rename — moves the `.md`, updates `slug:`, rewrites every backlink (frontmatter array entries, inline strings, body links). Default dry-run preview; `--confirm` to apply. Refuses an existing target slug unless `--overwrite` is passed. |
| `ontology-atlas merge <fromSlug> <intoSlug>` | Atomic merge — redirects every backlink `from → into`, then deletes `from.md`. Default dry-run; `--confirm` to apply. The `into` node's frontmatter / body are **not** auto-combined — edit by hand if needed. |
| `ontology-atlas delete <slug>` | Permanent delete. Default refuses if any backlinks remain — preview them with the bare command, then `--confirm` to apply (or `--force` to delete anyway). |

These commands spawn the MCP server from the sibling `mcp/` package in the same checkout; `pnpm install` at the repo root wires it up.

### Source-checkout verification

When editing the CLI package from the monorepo, start with the focused root
checks that match the touched surface:

```bash
pnpm test:cli:args
pnpm test:cli:lib
pnpm test:cli:mcp-call
pnpm test:contracts
pnpm test:mcp:unit
pnpm integration:cli:entry
pnpm integration:cli:mcp-verify
pnpm integration:cli:diagnosis
pnpm integration:cli:graph-read
pnpm integration:cli:graph-write
pnpm integration:cli:repo-analysis
pnpm integration:cli:local-vault
pnpm integration:cli:growth
pnpm integration:cli:maintenance
pnpm test:mcp:docs
pnpm test:mcp:registration
pnpm test:mcp:maintenance
pnpm test:mcp:package
pnpm test:mcp:verify
pnpm test:mcp:verify:first-contact
pnpm test:mcp:verify:timeout
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

`test:cli:args` checks only the narrow CLI argument parser contract. Use it
first when the change is limited to flag, positional, integer, or CSV parsing.
`test:cli:lib` checks shared CLI helper contracts for argument parsing,
command registry metadata, MCP response unwrapping, package metadata, graph
result fail-closed handling, and batch post-write maintenance metadata without
spawning the full CLI. If `pnpm checks:changed` prints a direct
`pnpm exec node --test cli/src/lib/<name>.test.mjs` command for a touched CLI
helper, run that first before the aggregate lib gate.
`test:contracts` checks cross-package parser, writer, schema, and validator
parity without running unrelated UI or E2E gates.
`test:mcp:unit` runs MCP core parser, vault, compiler, query, import-analysis,
ignore-file, and JSON-RPC line helper unit contracts without spawning the full
MCP integration suite. If `pnpm checks:changed` prints a direct `pnpm exec node
--test mcp/src/<name>.test.mjs` command for a touched MCP core file, run that
first before the aggregate unit gate.
`integration:cli:entry` narrows CLI entrypoint, help, command inventory, and init contracts.
`integration:cli:mcp-verify` runs only the installed MCP verification wrapper
subset inside the spawn-heavy CLI integration file.
`integration:cli:diagnosis` narrows CLI health / agent-brief / workspace-brief diagnosis contracts.
`integration:cli:graph-read` runs only read-only graph command contracts for
backlinks, path, explain, all-paths, relation-check, orphans, query, overview, hubs, blast-radius, cycles, node, and similar.
`integration:cli:graph-write` runs only rename/delete/merge dry-run and confirm safety contracts.
`integration:cli:repo-analysis` runs only index / analyze / infer-imports / bootstrap code-to-vault contracts.
`integration:cli:local-vault` runs only add/import/list/find/validate local vault and frontmatter contracts.
`integration:cli:growth` runs only the CLI growth_plan wrapper, candidate rendering, malformed payload, and argument-contract cases.
`integration:cli:maintenance` runs only the CLI maintenance command and
maintenance-related installed verify integration cases. `test:mcp:docs` checks
README and dogfood ontology documentation drift. `test:mcp:registration` checks
only the tracked source-checkout `.mcp.json`, `.mcp.json.example`, and
`.codex/config.toml` templates.
`test:mcp:package` checks
package-script, CLI entrypoint, and tarball contract drift without running
unrelated UI or E2E gates. `test:mcp:maintenance` checks maintenance_plan filter, cursor, resume,
work-queue shape, and bucket / next-action formatter contracts without the full
verify or dogfood suites.
`test:mcp:verify` checks the shared MCP verify helper contract, including
missing/extra/duplicate/invalid `tools/list` names, and
`test:mcp:verify:first-contact` narrows that to first-contact initialize
safety/recovery guidance, unknown-tool recovery, read smoke, destructive dry-run /
`patch_concept` conflict guard write-safety smoke, vault warning / `validate_vault`, health
summary / advisory / next-action gates, and `workspace_brief.nextActions[].sample`
shape drift.
`test:mcp:verify:timeout` narrows timeout parsing, startup failure retry
guidance, usage, empty-vault fail-fast, and retry diagnostics that `mcp-verify` exposes through the CLI. Use
`test:cli:mcp-call` checks MCP response unwrapping, spawn failure mapping, and
the one-shot MCP call timeout guard used by graph commands without starting the
full verification suite. Use
`OATLAS_TEST_NAME_PATTERN` with `pnpm integration:cli` when the touched CLI
integration case has a different name. For Node's `--test-name-pattern`, use
`pnpm exec node --test --test-name-pattern "..." cli/src/integration.test.mjs`
instead of appending the flag after `pnpm integration:cli --`.
From the repo root, focused integration subset and `test:mcp:*` shortcuts use
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
`integration:cli:entry` narrows CLI entrypoint, help, command inventory, and init contracts. `integration:cli:compile` narrows CLI compile / `--fix` canonicalization contracts
without running unrelated CLI routes. `integration:cli:diagnosis` narrows CLI health / agent-brief / workspace-brief diagnosis contracts. `integration:cli:graph-read` narrows read-only graph command contracts. `integration:cli:graph-write` narrows rename/delete/merge safety contracts. `integration:cli:repo-analysis` narrows index / analyze / infer-imports / bootstrap code-to-vault contracts. `integration:cli:local-vault` narrows local vault add/import/list/find/validate contracts. `integration:cli:growth` narrows the CLI growth_plan wrapper, candidate rendering, malformed payload, and argument contracts. `dogfood:compile`
is the shortest root-checkout compiler summary JSON snapshot, `dogfood:compile-fix`
runs root-checkout `compile --fix`, fails if canonicalization leaves a docs/ontology diff,
points changed-vault failures at `pnpm docs-vault:build`, and ends successful runs
with `[dogfood:compile-fix] docs/ontology unchanged`,
`test:dogfood:args` checks shared dogfood shortcut argument helpers without invoking any gate,
`test:dogfood:script-refs` checks help text and package script body `pnpm ...` references against root package scripts plus focused filter parsing and wrapper summaries,
`test:dogfood:compile-fix` checks that idempotence guard without invoking the full dogfood suite,
`dogfood:health` is the shortest root-checkout fail-closed health JSON gate, `dogfood:agent` is
the shortest Claude Code/Codex handoff JSON snapshot, `dogfood:agent-graph-db-pack` prints
the shell-pasteable graph DB pack for docs/ontology, including the machine-readable fallback self-check before the scan commands, `dogfood:graph-db` runs the root-checkout graph DB pack runtime gate over docs/ontology, `dogfood:agent-setup-gate` prints the machine-readable agent setup gate for docs/ontology with `ok` and `performanceOk`, `dogfood:agent-fallbacks` runs
the generated handoff CLI fallback commands against docs/ontology, `dogfood:brief` is
the shortest root-checkout first-contact JSON snapshot, `dogfood:growth` is the
shortest root-checkout growth_plan JSON snapshot, `dogfood:maintenance` is the
shortest root-checkout maintenance_plan JSON snapshot, `dogfood:status` always
runs health + workspace-brief + agent-brief + maintenance, prints `[dogfood:status] health:N · workspace-brief:N · agent-brief:N · maintenance:N`,
preserves the first failing exit before escalating, and prints failed-child focused
follow-ups (`pnpm dogfood:health`, `pnpm dogfood:brief`, `pnpm dogfood:agent`, or `pnpm dogfood:maintenance`
+ `pnpm test:mcp:maintenance`) before the `pnpm dogfood:verify` follow-up hint
on failure, `test:dogfood:status` checks
that always-run shortcut contract without the full dogfood suite, `test:dogfood:graph-db`
checks the graph DB pack runner contract without invoking the live CLI pack, `dogfood:verify` is
the full root-checkout dogfood vault gate. `pnpm dogfood:compile-fix -- --help`
and `pnpm dogfood:status -- --help` print shortcut usage without running those
gates; unsupported shortcut arguments fail with exit 2 before any child check starts,
and close `--help` typos include a `Did you mean --help?` hint.
`dogfood:test` is the full dogfood
helper regression suite to use only when focused helper checks are not enough, and
`cli:mcp-verify` is the root-checkout shortcut for the CLI wrapper; use
`pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` when you need to pass
explicit verify args, or `pnpm cli:mcp-verify -- --help` to inspect the
installed-style verify scope without relying on a published `ontology-atlas`
bin link. Vault arguments are passed without the extra `--`; keep `-- --help`
for the help flag.

`ontology-atlas mcp-verify [vault]` is the fastest sanity check for the
agent-facing surface. It resolves the vault the same way graph commands do,
then delegates to the checkout's `mcp/scripts/verify.mjs`.
`ontology-atlas mcp-verify --help` prints the same graph-query smoke contract
to stdout, so CLI users can inspect the verify scope without starting a server.
That help also names the direct read smoke set, including `get_concept`,
`get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited
`query_concepts`, `analyze_repo_structure`, `infer_imports`, `index_project`, `find_neighbors`,
`find_path`, and `find_orphans`, so single-node, batch, search/backlink,
limit-semantics, bootstrap/import analysis, neighborhood, shortest-path, and
orphan coverage is visible before the server starts.
The delegated verifier also checks the installed `tools/list` inventory names,
schema contract, and annotation coverage (`title` / `read` / `write` / `destructive` /
`idempotent` / `local-only`), including strict unknown-argument / invalid-enum
rejection with structured `errorCode` values (`unknown_argument` / `invalid_arguments`),
graph-query operation enums, stale `patch_concept.expected_mtime` rejection with
`vault_conflict`, and write-tool `postWriteMaintenance` `byPhase` / `bySeverity` /
`byKind` bucket summaries plus `score` / executable `proposedAction` /
current-page next action pointer guidance. The same gate checks write relation
type enums for `add_relation` / `add_relations`, so installed clients can offer
valid edge choices instead of discovering typos only after a failed write.
It also verifies batch reader/writer cap and row-isolation guidance for
`get_concepts`, `add_concepts`, and `add_relations`, including non-object row shape, unknown row field reporting,
all offending unknown fields, duplicate `add_concepts` slug failures surfacing as row-level `ok:false`
results instead of top-level tool errors, with no `postWriteMaintenance`, plus
51-row batch cap rejection as structured `invalid_arguments`.
It also verifies destructive writer dry-runs for `rename_concept`,
`merge_concepts`, and `delete_concept` against live vault slugs, requiring every
planned response to be present and return an `ok:false` / `dryRun:true` preview
with no `changed` or `postWriteMaintenance`.
It also performs runtime negative smokes with invalid `list_concepts.lmit` and
`query_ontology.operation="overveiw"` inputs, so CLI users catch schema/runtime
strictness drift in the installed MCP package.
The same help and verifier name `list_concepts.kind`, `query_concepts.kind` / `query_concepts.has-key`, `find_neighbors.types`,
`find_orphans.kind` / `find_orphans.excludeKinds`, `match_nodes.kind` /
`match_nodes.sort`, `recommend_relations.kind`, and `match_edges.type` /
`match_edges.fromKind` / `match_edges.toKind`
typo and unsupported-kind rejection, so graph filter misspellings, invalid sort
keys, relation type typos, and operation-specific kind mismatches fail with
diagnostics instead of silently returning empty node or edge sets.
It also verifies the `maintenance_plan` cursor contract: the ready page must
report `cursor.found=true` with `cursor.reason=null`, `nextAfterActionId`
matching the last returned action, and `hasMore` matching the remaining page
state, while a missing `afterActionId` must report `cursor.found=false`, include
the cursor miss reason, return zero remaining actions, expose
`nextAfterActionId=null` / `hasMore=false`, and expose no next action.
When the ready page has actions, verify resumes from the first returned action
id and fails if the resumed page repeats that cursor action or leaves
`remainingActions` unadvanced.
For ready pages it also verifies `nextExecutableAction` / `nextReviewAction`
point only at the first executable/review action in the current returned page.
Successful maintenance cursor lines also print bucket summaries and
current-page executable/review next-action summaries, so CLI users can see the
next cleanup shape without parsing the JSON payload.
The wrapper help mirrors that contract too, including enum-validated
`maintenance_plan.phases` / `maintenance_plan.severities` /
`maintenance_plan.kinds` filters, so a user can inspect the strict work-queue
checks before starting the MCP server.
Batch tool caps for `get_concepts`, `add_concepts`, and `add_relations` are
checked against the runtime 50-row contract too.
Write-safety schema for `expected_mtime` conflict guards and destructive
`confirm` dry-run switches is checked as part of the same installed verify.
It also probes `kind: project` directly before graph smoke, so `project_scope`
does not get skipped just because the project node was outside the first
`list_concepts` sample.
The project probe also verifies returned rows are `kind: project` and that its
total matches `list_kinds.byKind.project`.
It also checks `get_concept` for one discovered node, `get_concepts` with discovered vault slugs plus one missing slug,
and `find_evidence` / `find_backlinks` / `query_concepts` / limited `query_concepts` / `analyze_repo_structure` / `infer_imports` / `find_neighbors` / `find_path` / `find_orphans` with live vault results,
so installed CLI users catch batch-reader success, partial-row contract drift, search/backlink/filter/local-graph read-tool drift, bootstrap/import analysis payload drift, orphan-cleanup drift, and `limited:true` query semantics.
Node census totals are cross-checked across `list_kinds`, `list_concepts`,
`compile_ontology`, and `overview`; `validate_vault.scanned` remains file-level
health so a file-count issue is not mistaken for graph node-count drift.
Successful output prints a `read census consistency` line too, so CLI users can
see that listing, compiler, and overview read surfaces agree without inferring
it from silent success.
It also calls paginated `compile_ontology({nodesLimit:1, edgesLimit:1})` and
`compile_ontology({nodesLimit:1, edgesLimit:1, includeIndexes:true})` so the
installed package proves the full-artifact node/edge row shape, pagination
metadata, graph index payloads, index membership, and edge breakdown counts,
not only the cheap summary path.
It blocks parser/server/tool inventory failures, vault validation problems,
failing health checks, and fail-severity `workspace_brief.nextActions`; warn
diagnostics still print so a fresh starter vault can verify before cleanup.
The delegated verify output includes a compact non-blocking advisory
nextActions list when cleanup is recommended, validates both default and tuned
`workspace_brief.health.checks`, and prints tuned `workspace_brief` output
beside `health` / tuned `health`. The health lines include
`issues/unresolved/cycles/checks` plus check `id:status:count` coverage, so CLI
users can read the verified health scope without opening the raw MCP payload.
It also prints graph-query smoke lines for
`overview`, `overview`/`project_map` query_plan, and actual `neighbors` /
node-to-project `path` / `project_scope` calls, with `path` hop/edge alignment
validated before the path is treated as usable. Malformed `cycles` and `path`
payloads fail closed before machine output. Standalone `overview`, `hubs`, and
`blast-radius` commands also validate graph/count/ranking/page payloads before
machine or human output. Vaults without a `kind: project`
node skip only the containment-specific `project_scope` smoke; empty vault
folders fail immediately after the `list_concepts` census with a populated-vault
recovery hint, so the wrapper does not report a green MCP wiring check against
the wrong folder.
Use `--timeout-ms 15000` when a large vault or slow filesystem needs a longer
server wait window. Invalid timeout values print the received value and a
retry example such as `ontology-atlas mcp-verify --timeout-ms 15000`; when the
wrapper was called with an explicit vault, timeout retry hints preserve that
vault in the retry command as `--vault <path>`. After timeout the delegated
verifier sends `SIGTERM` and then `SIGKILL`; set `OATLAS_VERIFY_KILL_GRACE_MS=N`
only when that post-timeout cleanup window needs explicit tuning. The CLI
wrapper also has its own outer timeout for `OATLAS_MCP_VERIFY_PATH` overrides, so
a custom verify script that stalls cannot hang the installed sanity check. If
the delegated verify script terminates by signal before the wrapper timeout,
the CLI reports the signal instead of returning a silent exit 1.
Graph commands that call the MCP server through the shared CLI wrapper also
fail closed instead of hanging forever; set `OATLAS_CLI_MCP_TIMEOUT_MS=N` if a
large or slow vault needs a longer one-shot MCP call window. After timeout the
wrapper sends `SIGTERM` and then `SIGKILL`; set `OATLAS_CLI_MCP_KILL_GRACE_MS=N`
only when that post-timeout cleanup window needs explicit tuning.

`ontology-atlas agent-brief [vault]` is the agent handoff gate. It validates
`readiness`, `entrypoints`, `firstCalls`, `playbooks`, `traversalStrategy`, `writeGuardrails`, `resultContracts`, `writePolicy`,
`nextActions`, and embedded `health.checks` before output. It exits non-zero
when readiness is not `ready`, top-level status is not `healthy`, any health
check fails, or any fail-severity nextAction is present. `--graph-db-pack`
narrows the same validated payload to an executable CLI-only queue for
`match-nodes`, `match-edges`, `domain-matrix`, `hubs`, `all-paths`, and
`explain`, with the resolved vault path already inserted and labels rendered as
shell comments. It also prints each pack item's intent plus an evidence rule
that scan rows are candidates until follow-up detail is cited, so a terminal-only
agent can paste the block into a shell without parsing MCP JSON or replacing
placeholders. The pack also prints a proof checklist: report
`totalMatches`/`limited`/row count, inspect node rows with `node` or
`blast-radius`, inspect edge rows with `explain` / `path` / `relation-check`,
and report `evidence.pathsComplete` before making path-based claims.

`ontology-atlas workspace-brief [vault]` follows the same blocking distinction:
warn/advisory next actions render as guidance, but fail-severity next actions
or failing health checks return exit 1 so shell scripts do not miss broken
first-contact graph state. `health --json`, `agent-brief --json`, and
`workspace-brief --json` validate diagnosis payload shape before writing machine
output: top-level `status` must be `healthy` or `needs_attention`, health checks
need `id`/`status`/`count`, and workspace next actions need a valid severity.
Unknown or malformed diagnosis payloads are treated as errors rather than clean vaults. Non-JSON `health` and
`workspace-brief` output prints health-check
coverage as `id:status:count` rows (`compile_issues:pass:0`,
`components:pass:1`) so agents can see which probes actually ran without
parsing JSON. Non-JSON `workspace-brief` also prints a `GROWTH` line with
`actions`, `relations`, `dangling`, `external`, and `ignoredExternal` counts so
`.ontology-atlasignore`-suppressed external refs remain visible even when the vault is
healthy. `NEXT ACTIONS` labels use `id/kind` when those fields differ, so scoped
diagnostics such as `components/health_check` are not confused with ordinary
cleanup actions. It also labels project containment counts as
`PROJECT별 포함 노드 수 (project_scope)` so the human dashboard cannot be
mistaken for a loose project summary.
Both commands forward focused diagnosis tuning flags to MCP `query_ontology`:
`--dependency-types A,B`, `--component-types A,B`, `--component-limit N`,
`--cycle-limit N`, `--recommendation-limit N`, `--order-limit N`, and
`--node-limit N`. Use these when a large vault needs scoped health checks
without opening the full MCP payload. `health` and `workspace-brief` both
accept `--limit N` as a first-contact alias for `--node-limit N`, matching the
`agent_brief` CLI fallback commands.

The vault is a plain folder of `.md` files. **Frontmatter is the graph.**

## How AI agents fit in

`init` automatically writes wired agent configs to both your codebase root
and the vault folder:

- `.mcp.json` for Claude Code / Cursor
- `.codex/config.toml` for Codex

Open either folder in the agent and restart it. The running server advertises
its exact current read/write inventory through `tools/list`; use `mcp-verify`
to prove the inventory and vault connection.

Codex ignores a project-scoped `.codex/config.toml` until the folder is
**trusted**. Approve Codex's trust prompt, then run `codex mcp list` from that
folder and confirm `ontology-atlas` appears. A generated file on its own is not
connection proof.

```jsonc
// .mcp.json (in your agent's config dir)
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "node",
      "args": ["/absolute/path/to/ontology-atlas/mcp/src/index.js"],
      "env": { "OATLAS_VAULT": "/path/to/your/vault" }
    }
  }
}
```

`init` fills that absolute path in from the checkout it is running out of, so
Claude Code connects immediately.

Codex can also store MCP servers globally, so `init` prints the exact one-line
fallback command too:

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/vault -- node /absolute/path/to/mcp/src/index.js
```

Users of the installed macOS app do not need any of this: that app carries the
MCP server in its own bundle, and its connect button writes the config with the
bundled binary's absolute path.

For the shortest fresh setup from this checkout, run:

```bash
node cli/src/index.mjs init ontology
node cli/src/index.mjs bootstrap . --vault ontology
node cli/src/index.mjs compile ontology --summary
```

`bootstrap` replaces the untouched starter files with repo-derived nodes. If
you already edited any starter file, that file stays on disk.

`compile` gives you the deterministic graph hash/counts after the ontology is
built. Add `--fix` to apply compiler-produced relation-array canonicalization
actions, which trims duplicates and reorders graph arrays through the same MCP
`patch_concept` write path agents use. The wrapper fails closed before writing
if an action would patch anything outside compiler relation-array keys or if the
declared action keys do not match the frontmatter patch.

Current tool contracts (exact advertised set: `tools/list`):
`connection_info` / `git_status` / `git_history` / `list_concepts` / `get_concept` / `get_concepts` / `find_evidence` /
`find_backlinks` / `find_neighbors` / `find_path` / `list_kinds` /
`find_orphans` / `query_concepts` / `compile_ontology` / `query_ontology` /
`validate_vault` / `analyze_repo_structure` / `infer_imports` / `index_project` (read 19) +
`add_concept` / `add_concepts` /
`add_relation` / `add_relations` / `remove_relation` / `replace_relation` /
`patch_concept` / `reclassify_concept` / `delete_concept` /
`rename_concept` / `merge_concepts` / `absorb_document` / `git_snapshot` /
`finalize_project_meaning` (write 14). The finalizer stores provenance only,
never raw answers or a private absolute source root;
`ok: true` does not mean `meaningAssessment` is verified.

## See the graph

The macOS app visualizes the vault as a tree, topology (Sigma WebGL),
and ERD (xyflow):

- **Hosted website** (intro, download, read-only dogfood demo):
  https://ontology-atlas.web.app
- **Local workbench** (read/write your vault): install the macOS app, then
  open `/docs` and pick your vault folder.

## Mission

> **vault frontmatter = the graph. Humans + AI agents author the same vault.**

This is for AI-native developers who want their codebase mental model to
live somewhere AI agents can read and write — not as a side artifact, but
as the canonical representation. Non-developers can read the same vault
and contribute via plain markdown.

## License

MIT — https://github.com/wlsdks/ontology-atlas
