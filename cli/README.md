# oh-my-ontology

> **Repo-native memory layer CLI** — scaffold, validate, compile, query, and
> maintain the markdown ontology vault your AI coding agent reads through MCP.

```bash
npx oh-my-ontology init my-vault
cd my-vault
$EDITOR project.md
```

That's it. You now have a frontmatter-based memory vault that humans and AI
agents (Claude Code, Cursor, Codex, etc.) can read and write together.

Requires Node 20+. The CLI installs and spawns `oh-my-ontology-mcp`, which
uses the same Node floor.

## Commands (R12)

| Command | What it does |
|---|---|
| `oh-my-ontology init [folder]` | Scaffold a new vault (project / domain / capability / element starter .md). **R15+**: also drops wired `.mcp.json` and `.codex/config.toml` files in *both* cwd (codebase root, `OMOT_VAULT='./<vault>'`) and the vault folder (`OMOT_VAULT='.'`) — open either in Claude Code / Cursor / Codex and the 23 MCP tools auto-register. Existing configs are preserved (`.mcp.json.example` falls back for manual merge). |
| `oh-my-ontology list [vault]` | List ontology nodes (color table; enum-validated `--kind X` filter with closest-value hints, `--json`) |
| `oh-my-ontology validate [vault]` | Frontmatter integrity (includes `missing-expected-field`, `non-canonical-graph-array`, and `dangling-graph-reference`; `exit 1` on errors — usable as a CI gate). Same code 가 2+ file 에서 등장하면 끝에 *grouped by code* 요약 섹션이 자동으로 붙어 *어느 종류 경고가 얼마나 많은지* 한눈에 파악. `--fail-on=code,...` accepts explicit policy codes and rejects empty CSV items such as `--fail-on=empty-kind,`. |
| `oh-my-ontology mcp-verify [vault]` | Runs the installed MCP package verify CLI against the resolved vault: parser smoke, server boot, 23-tool inventory with missing/extra/duplicate/invalid name checks plus tools/list schema strictness and annotation coverage, strict runtime unknown-argument and invalid-enum checks with structured `errorCode` values, stale `patch_concept.expected_mtime` rejection with `vault_conflict`, relation filter / `relation_check` closest-value rejection, destructive dry-run smoke for `rename_concept` / `merge_concepts` / `delete_concept`, write-tool `postWriteMaintenance` `byPhase`/`bySeverity`/`byKind` buckets + `score`/`proposedAction`/next-action guidance, enum-validated `maintenance_plan` filters, ready `maintenance_plan` cursor + missing `maintenance_plan.afterActionId` cursor smoke, maintenance bucket / current-page next-action summaries, `list_concepts`, project-node `list_concepts` probe, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`, `find_path`, `find_orphans`, `list_kinds`, `validate_vault`, `workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`, `compile_ontology` summary + paginated full-artifact + indexed full-artifact smoke, `overview`, `overview`/`project_map` query_plan, and `neighbors`/`path`/`all_paths`/`project_scope` graph-query smoke. Use `--timeout-ms N` for large/slow vaults. |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold a new node (`--domain X --body "..." --vault path`); throws on duplicate slug. `kind` is enum-validated with closest-value hints before writing. `slug`, `--title`, and `--domain` must be non-empty strings without leading/trailing whitespace, so bad scalar input fails before writing. Body defaults to a starter only when `--body` is omitted, so `--body=` intentionally writes an empty body. **R15**: `--auto-prefix` is now **default on** (kind→folder, e.g. `add capability foo` → `capabilities/foo.md`) for consistency with the `init` starter layout. Use `--raw-slug` (or `--no-auto-prefix`) to opt out. |
| `oh-my-ontology find <query> [vault]` | Search slug + title (case-insensitive, enum-validated `--kind X` filter with closest-value hints, `--json`) |
| `oh-my-ontology import <path...>` | **R14** Import external `.md` into the vault. Reads each file's frontmatter, falls back to enum-validated `--kind K` when missing, derives `slug` from the filename and `title` from the first H1, then writes through the same schema as `add`. Frontmatter `kind` typos and fallback `--kind` typos fail with closest-value hints instead of silently skipping or writing the wrong shape. Options: `--vault path`, `--kind K`, `--auto-prefix` (R15 **default on**, kind→folder), `--raw-slug` (opt out), `--rename` (auto `-2`/`-3` on slug clash), `--dry-run` (preview only). Accepts files or directories (recursive, `.git`/`node_modules` skipped). |
| `oh-my-ontology bootstrap [rootPath]` | Analyze a repo and apply the first ontology graph in one command: project/domains/capabilities/elements plus import-derived `depends_on` edges. In a fresh `init` vault, untouched starter examples are removed before real nodes land; edited starter files are preserved. Batch row-level failures without `slug` / `from` / `to` / `type` still print `concepts[n]` / `relations[n]` fallback labels instead of `undefined`. Use `analyze` first for preview-only review. |
| `oh-my-ontology analyze [rootPath]` | Preview repo-derived candidates without writing. Top-level `rootPath` / `framework` / `skipped` and candidate `evidence.source` payloads are validated before JSON or human output, so MCP outputSchema drift fails closed. `--apply` lands those candidates via batch MCP calls and prunes untouched `init` starter examples the same way as `bootstrap`; batch row-level failures without identifying fields still print `concepts[n]` / `relations[n]` fallback labels instead of `undefined`. |
| `oh-my-ontology infer-imports [rootPath]` | Preview TS/JS import-derived module edges without writing. Resolves relative imports, `tsconfig.json` paths aliases, and fallback common `@/*` aliases before classifying external npm imports. Output includes a file edge kind summary and per-module `kindCounts` (`static` / `dynamic` / `require` / `reexport` / `side`) so agents can distinguish static-heavy dependencies from dynamic, require, re-export, or side-effect evidence before applying. Malformed top-level `rootPath`, unresolved `reason` enum, or `kindCounts` payloads fail closed before JSON or human output. `--apply` lands accepted `depends_on` edges and prints `relations[n]` fallback labels for row-level failures without relation fields; `--threshold N` filters weak module edges. |
| `oh-my-ontology compile [vault]` | Compile the vault through MCP `compile_ontology` and print deterministic graph counts/hash. Use `--summary` for cheap polling, `--json` for the raw artifact, and `--fix` to apply compiler relation-array canonicalization actions. Large `--json` output is safe to consume through stdout pipes. |

### Graph-level commands (R15 follow-up)

These wrap the MCP server (`oh-my-ontology-mcp`) so the developer has the same authority as an AI agent — compile the graph, find backlinks, rename / merge / delete safely, run a typed filter DSL. Each spawn is ~50–100 ms one-shot; commands that mutate the graph are dry-run by default with an explicit `--confirm` flag, except `compile --fix`, which only applies compiler-produced canonicalization patches.

| Command | What it does |
|---|---|
| `oh-my-ontology backlinks <slug>` | Lists every node referencing the target (`matches[]` from MCP `find_backlinks`, `--json` for raw). Malformed backlink-match payloads fail closed before JSON or human output. |
| `oh-my-ontology overview [vault]` | First-contact graph dashboard from MCP `query_ontology(overview)`: graph counts, kind/domain/relation buckets, and hub rows. Malformed graph/count/hub payloads fail closed before JSON or human output. (`--limit N --json`) |
| `oh-my-ontology hubs [vault]` | Centrality rankings from MCP `query_ontology(centrality)`: PageRank, bridges, authorities, and hubs. `--plan` runs `query_plan(centrality)` first and skips expensive/warning plans unless `--force` is passed; `--types A,B` narrows relation types before PageRank. Shared query-plan output now shows `totalMatches` when a planned graph scan has filter-aware match counts, so future graph DB-style wrappers can expose how much a filter narrows before execution. Malformed plan/ranking payloads fail closed before JSON or human output. (`--limit N --types A,B --plan --force --json`) |
| `oh-my-ontology blast-radius <slug> [vault]` | Refactor-safety impact view from MCP `query_ontology(blast_radius)`: risk, affected count buckets, and node/edge pages. `--plan` runs `query_plan(blast_radius)` first and skips expensive/warning plans unless `--force` is passed, so agents can preflight impact cost before traversal. Malformed plan/summary/page payloads fail closed before JSON or human output. (`--depth N --direction incoming|outgoing|both --plan --force --json`) |
| `oh-my-ontology node <slug> [vault]` | Single-node deep dive from MCP `query_ontology(node_profile)`: node header, degree, lineage, and incoming/outgoing edge groups. `--types A,B` filters relation groups before `--limit N` tunes edge/lineage/containment rows for hotspot nodes; `--no-external` / `--no-unresolved` hide noisy file refs or dangling refs from edge lists. Malformed node/degree/edge/lineage payloads fail closed before JSON or human output. (`--limit N --types A,B --no-external --no-unresolved --json`) |
| `oh-my-ontology similar "<query>" [vault]` | Duplicate-avoidance search from MCP `query_ontology(similar_nodes)`: scored matches, signals, and shared neighbors. Malformed match/score/signal payloads fail closed before JSON or human output. (`--slug X --kind K --limit N --json`) |
| `oh-my-ontology orphans [vault]` | Lists isolated nodes — docs no other node references in their frontmatter (MCP `find_orphans`). Options: enum-validated `--kind X` (filter), enum-validated `--exclude-kinds A,B` (skip; MCP default excludes `project,vault-readme`), `--json`. Malformed orphan-list payloads fail closed before JSON or human output. Quick "what should I clean up" surface for vault maintenance. |
| `oh-my-ontology path <from> <to> [vault]` | Shortest path (BFS, undirected) between two slugs. Each hop is annotated with the frontmatter key (`capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair, so you see *why* A and B are connected. Malformed hop/edge payloads fail closed before JSON output. (`--max-hops N --json`) |
| `oh-my-ontology all-paths <from> <to> [vault]` | Bounded simple path enumeration from MCP `query_ontology(all_paths)`: returns alternative paths plus `limit`, `searchBudget`, `expandedStates`, `exhaustive`, `truncatedByBudget`, `totalPathsExact`, and `evidence.pathsComplete` so agents do not treat partial traversal as proof. `--plan` runs `query_plan(all_paths)` first and skips expensive/warning enumeration unless `--force` is passed. Malformed plan/completeness/path payloads fail closed before JSON or human output. (`--max-hops N --limit N --search-budget N --types A,B --plan --force --json`) |
| `oh-my-ontology relation-check <from> <to> <type> [vault]` | Schema-aware preflight before `add_relation`, backed by MCP `query_ontology(relation_check)`. Shows whether the exact edge already exists, whether a reverse-direction edge exists, whether the kind/relation pattern is familiar, nearby schema patterns, a recommendation decision (`skip_existing`, `review_inverse`, `safe_to_add`, or `review_new_schema`), and the same `proposedAction` args an agent can pass to `add_relation`. Malformed relation-check payloads fail closed before JSON or human output. (`--json`) |
| `oh-my-ontology query "<filter>"` | Typed filter DSL — `kind=X AND has(Y) AND NOT domain=Z`, parens / OR / NOT supported. `kind` and `has(...)` graph keys fail closed with closest-value hints. MCP-style `--operation` misuse prints graph-level CLI command guidance instead of a bare unknown flag. Malformed typed-filter result payloads fail closed before JSON or human output. (`--limit N --json`) |
| `oh-my-ontology growth [vault]` | Inspect MCP `growth_plan` candidates without writing: relation recommendations, external element refs, dangling references, unassigned nodes, empty domains, and ignored external refs. Human output includes action totals, compiled graph counts, candidate reasons, and proposed tool calls. Malformed growth candidate payloads, including kind-specific `proposedAction` mismatches, fail closed before JSON or human output. (`--limit N --json`) |
| `oh-my-ontology maintenance [vault]` | Inspect MCP `maintenance_plan` cleanup/repair work queue without writing. Human output includes cursor state, active filters, compile/cycle/canonicalize/dangling/relation/external/ignored-external summary counts, phase/severity/kind bucket summaries, and current-page next action pointers with `phase/kind · severity · exec|review` detail. Supports `--limit`, `--after-action-id`, `--executable-only`, `--phases`, `--severities`, `--kinds`, and `--json` for cursor/filter dogfood. Malformed work-queue payloads, filter echo drift, pagination `limited` drift, or compiled-summary drift fail closed before JSON or human output. |
| `oh-my-ontology agent-brief [vault]` | Claude Code/Codex handoff from MCP `query_ontology(agent_brief)`: readiness score, copyable `handoffPrompt`, structured `cliFallbackCommands[]`, graph entrypoints, first MCP calls, investigation playbooks including `graph_traversal` (`schema` / `all_paths` / `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` / `bounded_path_evidence` / `containment_cross_check`), playbook evidence + stop-condition checklists, write guardrails, `relation_check` decision guide, `all_paths` result contracts, health coverage, and read-first write policy. The handoff prompt and human output include CLI fallback commands such as `oh-my-ontology hubs [vault] --plan ...` for connector-less Claude Code/Codex sessions. `--prompt` prints only the handoff prompt for direct paste into Claude Code/Codex. Malformed readiness, handoff prompt, CLI fallback, tool-call, playbook, traversal strategy, guardrail, result contract, relation decision guide, next-action, or health-check payloads fail closed before JSON or human output. (`--json` plus the same focused diagnosis tuning flags as `health` / `workspace-brief`) |
| `oh-my-ontology rename <oldSlug> <newSlug>` | Atomic rename — moves the `.md`, updates `slug:`, rewrites every backlink (frontmatter array entries, inline strings, body links). Default dry-run preview; `--confirm` to apply. Refuses an existing target slug unless `--overwrite` is passed. |
| `oh-my-ontology merge <fromSlug> <intoSlug>` | Atomic merge — redirects every backlink `from → into`, then deletes `from.md`. Default dry-run; `--confirm` to apply. The `into` node's frontmatter / body are **not** auto-combined — edit by hand if needed. |
| `oh-my-ontology delete <slug>` | Permanent delete. Default refuses if any backlinks remain — preview them with the bare command, then `--confirm` to apply (or `--force` to delete anyway). |

These commands require `oh-my-ontology-mcp` (declared in `dependencies` — `npm install` pulls it in automatically).

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
pnpm dogfood:brief
pnpm dogfood:growth
pnpm dogfood:maintenance
pnpm dogfood:status
pnpm test:dogfood:status
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
backlinks, path, all-paths, relation-check, orphans, query, overview, hubs, blast-radius, cycles, node, and similar.
`integration:cli:graph-write` runs only rename/delete/merge dry-run and confirm safety contracts.
`integration:cli:repo-analysis` runs only analyze / infer-imports / bootstrap code-to-vault contracts.
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
`OMOT_TEST_NAME_PATTERN` with `pnpm integration:cli` when the touched CLI
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
without running unrelated CLI routes. `integration:cli:diagnosis` narrows CLI health / agent-brief / workspace-brief diagnosis contracts. `integration:cli:graph-read` narrows read-only graph command contracts. `integration:cli:graph-write` narrows rename/delete/merge safety contracts. `integration:cli:repo-analysis` narrows analyze / infer-imports / bootstrap code-to-vault contracts. `integration:cli:local-vault` narrows local vault add/import/list/find/validate contracts. `integration:cli:growth` narrows the CLI growth_plan wrapper, candidate rendering, malformed payload, and argument contracts. `dogfood:compile`
is the shortest root-checkout compiler summary JSON snapshot, `dogfood:compile-fix`
runs root-checkout `compile --fix`, fails if canonicalization leaves a docs/ontology diff,
points changed-vault failures at `pnpm docs-vault:build`, and ends successful runs
with `[dogfood:compile-fix] docs/ontology unchanged`,
`test:dogfood:args` checks shared dogfood shortcut argument helpers without invoking any gate,
`test:dogfood:script-refs` checks help text and package script body `pnpm ...` references against root package scripts plus focused filter parsing and wrapper summaries,
`test:dogfood:compile-fix` checks that idempotence guard without invoking the full dogfood suite,
`dogfood:health` is the shortest root-checkout fail-closed health JSON gate, `dogfood:agent` is
the shortest Claude Code/Codex handoff JSON snapshot, `dogfood:brief` is
the shortest root-checkout first-contact JSON snapshot, `dogfood:growth` is the
shortest root-checkout growth_plan JSON snapshot, `dogfood:maintenance` is the
shortest root-checkout maintenance_plan JSON snapshot, `dogfood:status` always
runs health + workspace-brief + agent-brief + maintenance, prints `[dogfood:status] health:N · workspace-brief:N · agent-brief:N · maintenance:N`,
preserves the first failing exit before escalating, and prints failed-child focused
follow-ups (`pnpm dogfood:health`, `pnpm dogfood:brief`, `pnpm dogfood:agent`, or `pnpm dogfood:maintenance`
+ `pnpm test:mcp:maintenance`) before the `pnpm dogfood:verify` follow-up hint
on failure, `test:dogfood:status` checks
that always-run shortcut contract without the full dogfood suite, `dogfood:verify` is
the full root-checkout dogfood vault gate. `pnpm dogfood:compile-fix -- --help`
and `pnpm dogfood:status -- --help` print shortcut usage without running those
gates; unsupported shortcut arguments fail with exit 2 before any child check starts,
and close `--help` typos include a `Did you mean --help?` hint.
`dogfood:test` is the full dogfood
helper regression suite to use only when focused helper checks are not enough, and
`cli:mcp-verify` is the root-checkout shortcut for the CLI wrapper; use
`pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` when you need to pass
explicit verify args, or `pnpm cli:mcp-verify -- --help` to inspect the
installed-style verify scope without relying on a published `oh-my-ontology`
bin link. Vault arguments are passed without the extra `--`; keep `-- --help`
for the help flag.

`oh-my-ontology mcp-verify [vault]` is the fastest installed-package sanity
check for the agent-facing surface. It resolves the vault the same way graph
commands do, then delegates to `oh-my-ontology-mcp/scripts/verify.mjs`.
`oh-my-ontology mcp-verify --help` prints the same graph-query smoke contract
to stdout, so CLI users can inspect the verify scope without starting a server.
That help also names the direct read smoke set, including `get_concept`,
`get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited
`query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`,
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
retry example such as `oh-my-ontology mcp-verify --timeout-ms 15000`; when the
wrapper was called with an explicit vault, timeout retry hints preserve that
vault in the retry command as `--vault <path>`. After timeout the delegated
verifier sends `SIGTERM` and then `SIGKILL`; set `OMOT_VERIFY_KILL_GRACE_MS=N`
only when that post-timeout cleanup window needs explicit tuning. The CLI
wrapper also has its own outer timeout for `OMOT_MCP_VERIFY_PATH` overrides, so
a custom verify script that stalls cannot hang the installed sanity check. If
the delegated verify script terminates by signal before the wrapper timeout,
the CLI reports the signal instead of returning a silent exit 1.
Graph commands that call the MCP server through the shared CLI wrapper also
fail closed instead of hanging forever; set `OMOT_CLI_MCP_TIMEOUT_MS=N` if a
large or slow vault needs a longer one-shot MCP call window. After timeout the
wrapper sends `SIGTERM` and then `SIGKILL`; set `OMOT_CLI_MCP_KILL_GRACE_MS=N`
only when that post-timeout cleanup window needs explicit tuning.

`oh-my-ontology agent-brief [vault]` is the agent handoff gate. It validates
`readiness`, `entrypoints`, `firstCalls`, `playbooks`, `traversalStrategy`, `writeGuardrails`, `resultContracts`, `writePolicy`,
`nextActions`, and embedded `health.checks` before output. It exits non-zero
when readiness is not `ready`, top-level status is not `healthy`, any health
check fails, or any fail-severity nextAction is present.

`oh-my-ontology workspace-brief [vault]` follows the same blocking distinction:
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
`.omotignore`-suppressed external refs remain visible even when the vault is
healthy. `NEXT ACTIONS` labels use `id/kind` when those fields differ, so scoped
diagnostics such as `components/health_check` are not confused with ordinary
cleanup actions. It also labels project containment counts as
`PROJECT별 포함 노드 수 (project_scope)` so the human dashboard cannot be
mistaken for a loose project summary.
Both commands forward focused diagnosis tuning flags to MCP `query_ontology`:
`--dependency-types A,B`, `--component-types A,B`, `--component-limit N`,
`--cycle-limit N`, `--recommendation-limit N`, `--order-limit N`, and
`--node-limit N`. Use these when a large vault needs scoped health checks
without opening the full MCP payload.

The vault is a plain folder of `.md` files. **Frontmatter is the graph.**

## How AI agents fit in

`init` automatically writes wired agent configs to both your codebase root
and the vault folder:

- `.mcp.json` for Claude Code / Cursor
- `.codex/config.toml` for Codex

Open either folder in the agent, restart it, and it exposes **23 tools**
(15 read + 8 write).

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

Codex can also store MCP servers globally, so `init` prints the exact one-line
fallback command too:

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
`patch_concept` write path agents use. The wrapper fails closed before writing
if an action would patch anything outside compiler relation-array keys or if the
declared action keys do not match the frontmatter patch.

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
