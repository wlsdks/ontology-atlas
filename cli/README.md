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
| `oh-my-ontology list [vault]` | List ontology nodes (color table; enum-validated `--kind X` filter with closest-value hints, `--json`) |
| `oh-my-ontology validate [vault]` | Frontmatter integrity (includes `missing-expected-field`, `non-canonical-graph-array`, and `dangling-graph-reference`; `exit 1` on errors — usable as a CI gate). Same code 가 2+ file 에서 등장하면 끝에 *grouped by code* 요약 섹션이 자동으로 붙어 *어느 종류 경고가 얼마나 많은지* 한눈에 파악. |
| `oh-my-ontology mcp-verify [vault]` | Runs the installed MCP package verify CLI against the resolved vault: parser smoke, server boot, 23-tool inventory with missing/extra/duplicate/invalid name checks plus tools/list schema strictness and annotation coverage, strict runtime unknown-argument and invalid-enum checks, relation filter / `relation_check` closest-value rejection, destructive dry-run smoke for `rename_concept` / `merge_concepts` / `delete_concept`, write-tool `postWriteMaintenance` `byPhase`/`bySeverity`/`byKind` buckets + `score`/`proposedAction`/next-action guidance, enum-validated `maintenance_plan` filters, ready `maintenance_plan` cursor + missing `maintenance_plan.afterActionId` cursor smoke, maintenance bucket / current-page next-action summaries, `list_concepts`, project-node `list_concepts` probe, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`, `find_path`, `find_orphans`, `list_kinds`, `validate_vault`, `workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`, `compile_ontology` summary + paginated full-artifact + indexed full-artifact smoke, `overview`, `overview`/`project_map` query_plan, and `neighbors`/`path`/`project_scope` graph-query smoke. Use `--timeout-ms N` for large/slow vaults. |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold a new node (`--domain X --body "..." --vault path`); throws on duplicate slug. `slug`, `--title`, and `--domain` must be non-empty strings without leading/trailing whitespace, so bad scalar input fails before writing. Body defaults to a starter only when `--body` is omitted, so `--body=` intentionally writes an empty body. **R15**: `--auto-prefix` is now **default on** (kind→folder, e.g. `add capability foo` → `capabilities/foo.md`) for consistency with the `init` starter layout. Use `--raw-slug` (or `--no-auto-prefix`) to opt out. |
| `oh-my-ontology find <query> [vault]` | Search slug + title (case-insensitive, `--kind X --json`) |
| `oh-my-ontology import <path...>` | **R14** Import external `.md` into the vault. Reads each file's frontmatter, falls back to `--kind` when missing, derives `slug` from the filename and `title` from the first H1, then writes through the same schema as `add`. Options: `--vault path`, `--kind K`, `--auto-prefix` (R15 **default on**, kind→folder), `--raw-slug` (opt out), `--rename` (auto `-2`/`-3` on slug clash), `--dry-run` (preview only). Accepts files or directories (recursive, `.git`/`node_modules` skipped). |
| `oh-my-ontology bootstrap [rootPath]` | Analyze a repo and apply the first ontology graph in one command: project/domains/capabilities/elements plus import-derived `depends_on` edges. In a fresh `init` vault, untouched starter examples are removed before real nodes land; edited starter files are preserved. Batch row-level failures without `slug` / `from` / `to` / `type` still print `concepts[n]` / `relations[n]` fallback labels instead of `undefined`. Use `analyze` first for preview-only review. |
| `oh-my-ontology analyze [rootPath]` | Preview repo-derived candidates without writing. `--apply` lands those candidates via batch MCP calls and prunes untouched `init` starter examples the same way as `bootstrap`; batch row-level failures without identifying fields still print `concepts[n]` / `relations[n]` fallback labels instead of `undefined`. |
| `oh-my-ontology infer-imports [rootPath]` | Preview TS/JS import-derived module edges without writing. Resolves relative imports, `tsconfig.json` paths aliases, and fallback common `@/*` aliases before classifying external npm imports. Output includes a file edge kind summary and per-module `kindCounts` (`static` / `dynamic` / `require` / `reexport` / `side`) so agents can distinguish static-heavy dependencies from dynamic, require, re-export, or side-effect evidence before applying. `--apply` lands accepted `depends_on` edges and prints `relations[n]` fallback labels for row-level failures without relation fields; `--threshold N` filters weak module edges. |
| `oh-my-ontology compile [vault]` | Compile the vault through MCP `compile_ontology` and print deterministic graph counts/hash. Use `--summary` for cheap polling, `--json` for the raw artifact, and `--fix` to apply compiler relation-array canonicalization actions. |

### Graph-level commands (R15 follow-up)

These wrap the MCP server (`oh-my-ontology-mcp`) so the developer has the same authority as an AI agent — compile the graph, find backlinks, rename / merge / delete safely, run a typed filter DSL. Each spawn is ~50–100 ms one-shot; commands that mutate the graph are dry-run by default with an explicit `--confirm` flag, except `compile --fix`, which only applies compiler-produced canonicalization patches.

| Command | What it does |
|---|---|
| `oh-my-ontology backlinks <slug>` | Lists every node referencing the target (`matches[]` from MCP `find_backlinks`, `--json` for raw). |
| `oh-my-ontology orphans [vault]` | Lists isolated nodes — docs no other node references in their frontmatter (MCP `find_orphans`). Options: `--kind X` (filter), `--exclude-kinds A,B` (skip; MCP default excludes `project,vault-readme`), `--json`. Quick "what should I clean up" surface for vault maintenance. |
| `oh-my-ontology path <from> <to> [vault]` | Shortest path (BFS, undirected) between two slugs. Each hop is annotated with the frontmatter key (`capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair, so you see *why* A and B are connected. (`--max-hops N --json`) |
| `oh-my-ontology query "<filter>"` | Typed filter DSL — `kind=X AND has(Y) AND NOT domain=Z`, parens / OR / NOT supported. `kind` and `has(...)` graph keys fail closed with closest-value hints. (`--limit N --json`) |
| `oh-my-ontology maintenance [vault]` | Inspect MCP `maintenance_plan` cleanup/repair work queue without writing. Human output includes cursor state, active filters, compile/cycle/canonicalize/dangling/relation/external/ignored-external summary counts, phase/severity/kind bucket summaries, and current-page next action pointers. Supports `--limit`, `--after-action-id`, `--executable-only`, `--phases`, `--severities`, `--kinds`, and `--json` for cursor/filter dogfood. |
| `oh-my-ontology rename <oldSlug> <newSlug>` | Atomic rename — moves the `.md`, updates `slug:`, rewrites every backlink (frontmatter array entries, inline strings, body links). Default dry-run preview; `--confirm` to apply. Refuses an existing target slug unless `--overwrite` is passed. |
| `oh-my-ontology merge <fromSlug> <intoSlug>` | Atomic merge — redirects every backlink `from → into`, then deletes `from.md`. Default dry-run; `--confirm` to apply. The `into` node's frontmatter / body are **not** auto-combined — edit by hand if needed. |
| `oh-my-ontology delete <slug>` | Permanent delete. Default refuses if any backlinks remain — preview them with the bare command, then `--confirm` to apply (or `--force` to delete anyway). |

These commands require `oh-my-ontology-mcp` (declared in `dependencies` — `npm install` pulls it in automatically).

### Source-checkout verification

When editing the CLI package from the monorepo, start with the focused root
checks that match the touched surface:

```bash
pnpm test:cli:lib
pnpm test:contracts
pnpm integration:cli:mcp-verify
pnpm integration:cli:maintenance
pnpm test:mcp:docs
pnpm test:mcp:maintenance
pnpm test:mcp:package
pnpm test:mcp:verify
pnpm test:mcp:verify:first-contact
pnpm test:mcp:verify:timeout
pnpm dogfood:verify
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
pnpm cli:mcp-verify -- --help
```

`test:cli:lib` checks shared CLI helper contracts for argument parsing,
command registry metadata, MCP response unwrapping, package metadata, and
graph result fail-closed handling without spawning the full CLI.
`test:contracts` checks cross-package parser, writer, schema, and validator
parity without running unrelated UI or E2E gates.
`integration:cli:mcp-verify` runs only the installed MCP verification wrapper
subset inside the spawn-heavy CLI integration file.
`integration:cli:maintenance` runs only the CLI maintenance command and
maintenance-related installed verify integration cases. `test:mcp:docs` checks
README and dogfood ontology documentation drift. `test:mcp:package` checks
package-script and tarball contract drift without running unrelated UI or E2E
gates. `test:mcp:maintenance` checks maintenance_plan filter, cursor, resume,
work-queue shape, and bucket / next-action formatter contracts without the full
verify or dogfood suites.
`test:mcp:verify` checks the shared MCP verify helper contract, including
missing/extra/duplicate/invalid `tools/list` names, and
`test:mcp:verify:first-contact` narrows that to first-contact initialize
safety/recovery guidance, read smoke, vault warning / `validate_vault`,
health summary / advisory / next-action gates, and `workspace_brief.nextActions[].sample`
shape drift.
`test:mcp:verify:timeout` narrows timeout parsing, startup failure retry
guidance, usage, and retry diagnostics that `mcp-verify` exposes through the CLI. Use
`OMOT_TEST_NAME_PATTERN` or Node `--test-name-pattern` with
`pnpm integration:cli` when the touched CLI integration case has a different
name. `dogfood:verify` is the shortest root-checkout dogfood vault gate, and
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
rejection, graph-query operation enums, and write-tool `postWriteMaintenance` `byPhase` / `bySeverity` /
`byKind` bucket summaries plus `score` / executable `proposedAction` /
current-page next action pointer guidance. The same gate checks write relation
type enums for `add_relation` / `add_relations`, so installed clients can offer
valid edge choices instead of discovering typos only after a failed write.
It also verifies batch writer row isolation guidance for `add_concepts` and
`add_relations`, including non-object row shape, unknown row field, and
duplicate `add_concepts` slug failures surfacing as row-level `ok:false`
results instead of top-level tool errors, with no `postWriteMaintenance`.
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
validated before the path is treated as usable. Vaults without a `kind: project`
node skip only the containment-specific `project_scope` smoke; empty vault
folders skip node-targeted graph smoke until a first node exists.
Use `--timeout-ms 15000` when a large vault or slow filesystem needs a longer
server wait window. Invalid timeout values print the received value and a
retry example such as `oh-my-ontology mcp-verify --timeout-ms 15000`; when the
wrapper was called with an explicit vault, timeout retry hints preserve that
vault in the retry command as `--vault <path>`.

`oh-my-ontology workspace-brief [vault]` follows the same blocking distinction:
warn/advisory next actions render as guidance, but fail-severity next actions
or failing health checks return exit 1 so shell scripts do not miss broken
first-contact graph state. `health --json` and `workspace-brief --json` also
require top-level diagnosis `status` to be `healthy` or `needs_attention`, so
unknown status strings are treated as malformed payloads rather than clean
vaults. Non-JSON `health` and `workspace-brief` output prints health-check
coverage as `id:status:count` rows (`compile_issues:pass:0`,
`components:pass:1`) so agents can see which probes actually ran without
parsing JSON. Non-JSON `workspace-brief` also prints a `GROWTH` line with
`actions`, `relations`, `dangling`, `external`, and `ignoredExternal` counts so
`.omotignore`-suppressed external refs remain visible even when the vault is
healthy.
Both commands forward focused diagnosis tuning flags to MCP `query_ontology`:
`--dependency-types A,B`, `--component-types A,B`, `--component-limit N`,
`--cycle-limit N`, `--recommendation-limit N`, `--order-limit N`, and
`--node-limit N`. Use these when a large vault needs scoped health checks
without opening the full MCP payload.

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
