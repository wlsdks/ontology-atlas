# ontology-atlas

> **Codebase ontology CLI** — scaffold, validate, compile, query, and maintain
> the shared Markdown meaning that people inspect and coding agents use for
> task context. Recorded evidence and unknowns remain available beside the code.

```bash
node cli/src/index.mjs init my-vault
cd my-vault
$EDITOR project.md
```

This creates a starter vault people and agents can read and write together.
It does not yet establish the business meaning of your repository. Build and
review that meaning before relying on it for a task; source paths, validation,
and graph traversal do not certify code safety.

The CLI runs from a source checkout as `node cli/src/index.mjs` and needs
Node.js 24, the same floor as the MCP server in `mcp/` that it spawns. There is
no npm package, so `npx ontology-atlas` is not a channel. Users who only want
the agent connection do not need this CLI: the installed macOS app bundles the
MCP server and writes the config itself.

## Set up from a source checkout

Requires Node.js 24 and pnpm. This is the path for platforms without an
installed app, and for anyone who wants the CLI itself.

```bash
# Keep the tool outside the project you are describing.
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile   # mcp/ has its own lockfile — the line above skips it
ATLAS=~/tools/ontology-atlas/cli/src/index.mjs

cd /path/to/your/repo
node $ATLAS init ./atlas                   # scaffold a vault and its agent config
node $ATLAS index . --vault ./atlas        # analyze without writing; --apply is the write boundary
node $ATLAS agent-brief ./atlas            # the complete diagnostic handoff
node $ATLAS mcp-verify ./atlas             # after restarting your agent: prove the live connection
```

Both install commands are required — `mcp/` owns a separate lockfile, so rerun it
after each pull; the preflight rejects an unresolved or non-exact runtime
dependency and prints the exact repair. What a compact `--task` handoff will and
will not claim is documented in the [agent guide](../mcp/README.md).

> Run `init` in your own repository, not inside the Atlas clone. This clone ships
> a committed `.mcp.json` pointing at Atlas's own vault, and `init` refuses to
> overwrite it — your agent would silently answer from *our* ontology. That file
> also declares a review-only `chrome-devtools` server the design seats measure
> rendered geometry through; [AGENTS.md](../AGENTS.md) owns that contract.

Run the desktop shell from the same checkout with `pnpm desktop:dev`.
## Commands

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
| `ontology-atlas init [folder] [--locale=en\|ko] [--documents]` | Scaffold a new vault as `atlas/` — the one folder name, beside code or beside documents, that every creator makes and a person can name to another; an opener recognises a vault by its contents, not its name and mint a different fresh UID for every starter node, including the vault README. `--documents` scaffolds a folder of documents instead of a codebase: `sources/` and `wiki/` with the page template, the MCP wiring so an agent can compile pages, and none of the map — no node folders, no project file, no starter skills; the wiki stands on its own until a map is wanted. Locale variants share graph shape and titles but never fixed identities. Also writes wired agent configs and the three starter skills (`.claude/skills/` + `.agents/skills/`) in the vault and, only when the vault lies inside the current directory, in that codebase root as well; a vault created elsewhere is its own root and the current directory is left untouched. A parseable existing config keeps unrelated servers/sections while only its `ontology-atlas` binding is atomically rebound to the requested vault; malformed or duplicate Atlas config is preserved, gets an adjacent example, and makes init report `scaffolded but client binding unresolved` with a nonzero exit. With `--quick-start`, a bootstrap failure preserves the written scaffold/config files but returns nonzero, labels them unverified, suppresses completion/connection claims, and prints executable `mcp-verify` plus bootstrap retry commands. |
| `ontology-atlas agent-setup [vault]` | Check or repair agent config files for an existing vault without writing starter markdown. Dry-run reports ready/missing/review status for vault-local and codebase-root `.mcp.json` / `.codex/config.toml`; ready requires one of the two supported launch shapes (absolute bundled `ontology-atlas-mcp` with no args, or `node` with one absolute `mcp/src/index.js` arg), an existing executable/entry file, and the expected vault/repo coordinates. Retired `npx` launchers stay review-only. `--write` creates missing files or atomically merges/rebinds only the single Atlas JSON entry / TOML section pair, preserving unrelated client entries and comments. Invalid JSON, duplicate Atlas sections, and incomplete section pairs stay review-only and receive merge templates instead of being overwritten. JSON separates `written` from `repaired`. It also includes `operation:"agent_setup"`, per-file status, `docs.workflowGuide`, `docs.modeComparison` for CLI-only / MCP-connected / graph DB pack / setup gate choices, `docs.postChangeSync` after-edit sync rules, and follow-up `mcp-verify`, `agent-brief --verify-fallbacks --json --exit-zero`, and global `codex mcp add ...` commands. `--install-pre-commit-hook` installs (or appends to an existing) git pre-commit hook that runs `ontology-atlas preflight --staged`; idempotent, never overwrites an unrelated existing hook body, and the hook itself never blocks a commit (`git commit --no-verify` still skips it like any other hook). |
| `ontology-atlas install-shim [--dir <path>]` | Puts `atlas` on your PATH without a registry. Writes a one-line `exec` launcher into `~/.local/bin/atlas` pointing at this checkout — no npm, no sudo, nothing outside your home directory. The exact contents are printed before anything is written, and the launcher names this checkout's absolute path so it cannot silently start running a different copy. A file the command did not write is never replaced or deleted: it is recognised by a marker, and anything unrecognised is reported and left alone (`--force` overrides for replacement only). `--uninstall` removes a shim this command wrote. When the directory is not yet on PATH it says so and prints the export line, rather than leaving a command that exists but cannot be typed. With `--json`, stdout is one JSON document on every path (install carries the written `shim` body; `--uninstall` reports `removed`), and the pre-write preview moves to stderr. (`--dir`, `--json`) |
| `ontology-atlas list [vault]` | List ontology nodes (color table; enum-validated `--kind X` filter with closest-value hints, `--json`) |
| `ontology-atlas validate [vault]` | Frontmatter integrity, including required/valid/unique UID claims, merge identity history, expected fields, graph-array canonicality, and dangling references, **plus the six meaning findings the body carries**; `exit 1` on errors. If the same code appears in 2+ files, a *grouped by code* summary is appended. `--fail-on=code,...` accepts explicit policy codes. |
| `ontology-atlas wiki-validate [vault]` | Judges every page under `wiki/` against the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11): no `kind:`, the seven required frontmatter fields, the five sections in order, a citation on every bullet under `## Facts`, and a cited path that is both declared in `sources:` and present in the folder. Then it judges the folder as a whole and adds `dangling-wikilink`, `orphan-page`, and `shared-source-unlinked` to the page each concerns (§11.4). Prints one line per page plus each problem's code and line; `--json` returns the same per page. Exit 0 when every page fits (a folder with no wiki pages also fits), 1 when at least one does not, 2 when the vault could not be read. `wiki/_template.md` is skipped — it is the shipped template, and its citations name a placeholder. |
| `ontology-atlas wiki-index [vault]` | The wiki's index, computed from the pages each time it is asked for: title, summary, status, writer, the sources a page was compiled from, the pages it links and the pages that link it, and the problems `wiki-validate` would report. Markdown by default, `--json` as data, `--write` to also leave `wiki/_index.md` in the folder for an editor that shows files — generated, marked so, and furniture by the underscore rule (§11.4): never a page, never a second truth, rerun to refresh. The pattern this answers keeps an `index.md` a model maintains; a maintained list drifts, a computed one cannot. |
| `ontology-atlas mcp-verify [vault]` | Runs the installed MCP package verify CLI against the resolved vault (vault warnings such as a dangling reference print as `▲` and do not fail it; errors do, matching `validate`): parser smoke, server boot, live inventory exactness (missing/extra/duplicate/invalid names and initialize parity), tools/list schema strictness and annotation coverage, strict runtime unknown-argument and invalid-enum checks with structured `errorCode` values, stale `patch_concept.expected_mtime` rejection with `vault_conflict`, relation filter / `relation_check` closest-value rejection, destructive dry-run smoke for `rename_concept` / `merge_concepts` / `delete_concept`, write-tool `postWriteMaintenance` `byPhase`/`bySeverity`/`byKind` buckets + `score`/`proposedAction`/next-action guidance, enum-validated `maintenance_plan` filters, ready `maintenance_plan` cursor + missing `maintenance_plan.afterActionId` cursor smoke, maintenance bucket / current-page next-action summaries, `list_concepts`, project-node `list_concepts` probe, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `inspect_architecture`, `index_project`, `find_neighbors`, `find_path`, `find_orphans`, `list_kinds`, `validate_vault`, `workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`, `compile_ontology` summary + paginated full-artifact + indexed full-artifact smoke, `overview`, `overview`/`project_map` query_plan, and `neighbors`/`path`/`all_paths`/`project_scope` graph-query smoke. Use `--timeout-ms N` for large/slow vaults. |
| `ontology-atlas add <kind> <slug> --title="..."` | Scaffold a new node and mint a fresh immutable UID (`--domain X --body "..." --vault path`); throws on duplicate slug or UID. Bad scalar input fails before writing. Body defaults to a starter only when omitted. `--auto-prefix` is on by default; use `--raw-slug` to opt out. |
| `ontology-atlas find <query> [vault]` | Search slug + title (case-insensitive, enum-validated `--kind X` filter with closest-value hints, `--json`) |
| `ontology-atlas constellations [vault]` | Read-only saved constellation discovery through MCP `list_constellations`. Returns bounded metadata, recorded or unknown purpose, member counts, and sidecar revision/status without loading the entire graph. Corrupt or unsupported sidecars remain unavailable and are never treated as empty or repaired. (`--offset N --limit N --json`) |
| `ontology-atlas constellation <id> [vault]` | Read-only task recovery through MCP `get_constellation`. Resolves saved ontology members only by immutable UID (including a uniquely claimed merged UID), keeps missing and ambiguous identities unresolved, and presents saved membership separately from current node facts, review currentness, real typed internal relations, and direct dependencies crossing scope. The response reports pagination, edge bounds, unresolved graph references, and that transitive impact and meaning acceptance were not inferred. (`--offset N --limit N --relation-limit N --dependency-limit N --json`) |
| `ontology-atlas import <path...>` | Import external `.md` through the same schema as `add`. A valid source UID is preserved; a missing UID is minted; malformed or destination/batch-colliding identities fail instead of being replaced. `--rename` changes only the slug and never duplicates identity. Options: `--vault path`, `--kind K`, `--auto-prefix`, `--raw-slug`, `--rename`, `--dry-run`. |
| `ontology-atlas bootstrap [rootPath]` | Analyze a repo and return a **review-only** plan for project/domain/capability/element candidates and containment. Cold-start CLI never writes semantic nodes: an exact `constructionQualification:v1` packet, human acceptance, and unchanged released `writePlan` are required through the MCP lifecycle. Inferred imports are returned only as exact-evidence `rationale_review_required` candidates. When a large import result is compact, plan totals still come from the validated scan summary/review queue instead of absent full arrays. `--json` includes `writeEligible:false`, `reason:"approval_required"`, and `writes:0`; the command exits 3 in that approval-required state (1 on input errors, 2 on an MCP failure). Without `--vault`, an import graph too large to deliver against a scratch vault is reported as `imports.status:"omitted_large"` with the exact retry commands, and `plan.importRelations` becomes `null` rather than a false zero. Continue in an agent connected to the Atlas MCP server, whose instructions carry review → independent qualification → human acceptance → exact writePlan. |
| `ontology-atlas analyze [rootPath]` | Preview repo-derived candidates without writing. For root Python packages, up to 12 implementation boundaries that participate in observed imports become element/path candidates: direct modules are the base and up to two exact nested security/policy/risk endpoints may reserve slots. Unused files and ambiguous flat slugs stay out. The MCP proposal preflight may separately validate at most four other exact observed file endpoints selected for distinct change-navigation roles without adding them to this automatic list. Top-level `rootPath` / `framework` / `skipped` and candidate `evidence.source` payloads are validated before JSON or human output, so MCP outputSchema drift fails closed. `--apply` is retained only as a fail-closed compatibility wrapper: it returns `approval_required`, `writeEligible:false`, and `writes:0`; it never calls batch writers or prunes starters. An exact `constructionQualification:v1` packet, human acceptance, unchanged `writePlan`, then validate/compile/finalize remain an existing MCP lifecycle path. |
| `ontology-atlas infer-imports [rootPath]` | Preview TS/JS, bounded static Python, deterministic Rust `use` / file-backed `mod` / exact literal include dependencies, and root-module Go package imports without writing. Rust reads at most 256 KiB and 256 dependency statements per file; it does not expand macros, evaluate `cfg`, resolve symbols, or turn source direction into runtime/business impact. Go evidence remains a separate typed `goPackageImports:v1` receipt. Lines are labelled `imports`, not `depends_on`: they are code-use facts, not approved ontology relations. Every collapsed edge includes counts and up to five exact evidence receipts. Reconciliation remains review-only and never emits a write action. `--apply` is deliberately disabled: inspect both concepts, explain why the semantic dependency holds, ask the user, then write one explicit relation with `why`. `--threshold N` filters review candidates only; `--full` explicitly requests complete evidence when MCP would compact a large response. MCP agents should start the bounded approval flow with `infer_imports({reviewMode:"next"})`; a compact Go summary points to the explicit full-evidence call. |
| `ontology-atlas architecture [rootPath] --vault <path> [--profile <slug>]` | Compare one reviewed `architecture-profile/v1` with current supported source imports and print the same fail-closed `architectureBrief:v1` as MCP `inspect_architecture`. Reports governed import usages, usage-qualified role edges and receipts, violations, and unknowns; unclassified usage stays unknown and pattern names remain reviewed declarations. Side effect 0. Use before implementation, return `architectureChangePlan:v1`, then rerun after editing. (`--json`) |
| `ontology-atlas preflight [vault]` | **Commit preflight** — matches staged files against vault source references, then runs dependency-only `blast-radius` on matched nodes. Declared impact is shown, but risk/completeness remain `unknown` without relation-level source receipts; structure belongs to `reachability`/`subgraph`. Purely informational and silent when nothing matches. (`--depth N --json`) |
| `ontology-atlas snapshot [vault]` | Commits vault-scoped changes only, with a semantic commit message (kind-level add/update/remove counts + up to 3 representative slugs, e.g. `ontology snapshot: +2 concepts, ~3 updated (capabilities/foo, elements/bar, +1)`). Uses a pathspec-scoped `git commit -- <vaultRel>` (a git "partial commit") so files already staged outside the vault are left untouched — nothing outside the vault is ever `git add`ed or committed. Exits 0 with no commit when there's nothing to snapshot; exits 1 with a `git init` suggestion (never runs it for you) when the vault isn't inside a git repository. Trust-charter default is a local commit only — `--push` sends to the current branch's existing upstream and prints the remote URL, or exits 1 with `git push -u origin <branch>` guidance if no upstream is configured (never auto-configures one). `--message "..."` uses your text as the commit subject (the auto summary moves into the body); `--dry-run` previews without committing. (`--dry-run --push --message "..." --json`) |
| `ontology-atlas connect-source <projectSlug> [vault]` | **Connect the code** — binds a project node to the local folder holding the code it describes, measures it, and writes the source receipt. Mirrors MCP `connect_project_source`. Without `--root` it infers the folder: the git repository enclosing the vault wins, otherwise the nearest ancestor carrying a project manifest (`package.json`, `Cargo.toml`, `go.mod`, …). **Dry-run by default** — it prints the proposed folder, the inference confidence, and how many of the ontology's declared `path:` claims actually exist inside it; `--confirm` writes. `--root path` binds (or re-binds) a folder you choose; `--repair` discards a malformed sidecar. The binding lives in the gitignored `.ontology-atlas/project-sources.json`, so the absolute path never reaches git or any handoff. (`--root path --confirm --repair --json`) |
| `ontology-atlas disconnect-source <projectSlug> [vault]` | **Undo the connection** — removes that project's source binding and receipt; `agent-brief` returns to `source_unbound` / `connect_source`. Mirrors MCP `disconnect_project_source`. Dry-run by default, `--confirm` writes; other projects' bindings and all ontology markdown are untouched. (`--confirm --json`) |
| `ontology-atlas compile [vault]` | Compile the vault through MCP `compile_ontology` and print deterministic graph counts/hash. Use `--summary` for cheap polling, `--json` for the raw artifact, and `--fix` to apply compiler relation-array canonicalization actions. Large `--json` output is safe to consume through stdout pipes. |
| `ontology-atlas absorb <file...>` | Convert CLAUDE.md / AGENTS.md-style prose markdown into typed vault nodes. Dry-run by default — prints the conversion plan and touches nothing. `--write` lands policy/rule sections as `document` nodes and rewrites the source into a slim pointer that keeps an absorption summary plus the un-absorbed sections verbatim (the original is backed up as `.pre-absorb.bak`). Architecture/component sections are proposed only, never auto-written; injection-suspect (Tier 1) sections are excluded from absorption entirely. (`--vault path --write`) |
| `ontology-atlas export [vault]` | Export JSON-LD, GraphML, or the raw compile artifact. Stable node identity is `urn:uuid:<uid>`; slug remains an explicit readable property and edge endpoints use UID URNs. Rename therefore does not change external identity. Missing/invalid/duplicate UID claims fail closed; external/dangling refs are omitted. |
| `ontology-atlas index [rootPath]` | Long-running project indexing entrypoint that chains structure analysis, import evidence, and vault validation. It is review-only on every path; the legacy `--apply` flag is retained as a fail-closed compatibility wrapper and returns `approval_required` without writing. (`--vault path --apply --full --threshold N --skip-imports --max-depth N --max-files N --json`) |
| `ontology-atlas agent-files [--root path]` | Read-only readout of which AI agent instruction files exist and which tool reads each one (`CLAUDE.md`, `AGENTS.md`, a one-level `<dir>/AGENTS.md` that Codex merges root-down while Cursor, Antigravity CLI and Copilot resolve it by nearest ancestor, `GEMINI.md`, `.claude/rules\|skills\|agents\|hooks`, `.claude/settings.json`, `.agents/skills`, `.cursor`, `.cursorrules`, the GitHub Copilot instructions file, `.codex`, `.mcp.json`), plus drift checks: the CLAUDE.md ↔ AGENTS.md import bridge, byte diff between duplicated skill and agent trees, `@reference` existence, agent-brief MCP grants measured against each tree's own config — `.claude/agents` against `.mcp.json`, `.agents/agents` against `.codex/config.toml` — because an undeclared grant is silent and the seat runs without the tool, and the Codex 32 KiB cap measured across the merged root + nested set rather than the root alone. `--english-only` adds an opt-in check that no agent file carries Hangul, kana or Han; it is off by default because a repository or vault may legitimately be written in another language. Exit `0` = no drift, `1` = drift, `2` = error; nothing is written. Links are followed, except a link back into a folder already being walked and a dangling link, which are skipped; in `--json` a file whose real path lies outside `--root` carries `outside` with that path. (`--json`) |
| `ontology-atlas agent-activity [vault]` | Write (or read, or clear) `.ontology-atlas/agent-activity.json` — the explicit live activity heartbeat the app reads from the opened vault, so a human watching the map can see what their agent is doing right now. `--state` is one of `planning` / `editing` / `verifying` / `blocked` / `complete`; repeat `--file`, `--plan`, `--mcp`, `--source`, `--verify` for multiple entries. JSON reports `reviewMode` (`ontology-focus` with `--ontology-slug`, `business-extraction` with source files only, otherwise `none`). The exit code of `--show` says only whether the vault could be read: `--json` carries the state in `exists` (no heartbeat yet) and `valid` (a heartbeat that failed to parse), both with exit 0; an unreadable vault root is the non-zero case. (`--agent X --state S --focus "..." --show --clear --json`) |
| `ontology-atlas moment [vault]` | Print the north-star magic moment: elapsed time from `init` / `absorb --write` to the first `agent-brief` run afterwards, target ≤ 5 minutes. All data stays in `.ontology-atlas/telemetry.local.json` — local only, never transmitted. `--mark` stamps the moment manually for agents that call the read-only MCP tools directly instead of this CLI. (`--mark --json --vault path`) |

`validate` reads the body, not only the frontmatter. Beside the structural codes
it reports `definition-missing`, `boundary-missing`, `uncertainty-missing`,
`epistemic-exclusion`, `slug-outside-kind-folder`, and — with `OATLAS_REPO_ROOT`
set, so a cited `path:` can be resolved — `folder-only-evidence`. Every one is a
warning and none changes the exit code: the document is valid Markdown the graph
reads correctly, and what is missing is the half a reader needs and code cannot
supply. `--strict` fails on them like any other warning, and
`--fail-on=uncertainty-missing` hard-gates one of them on its own. They are the
same findings the MCP write door already returned to an agent, and they are here
because the person running this command could not see them: a folder could be
called clean by one reader and thin by another, with only the agent able to tell.

`analysis --vault=<dir> --history [--mode=meaning|architecture] --json` lists
versioned in-app ACP analysis records, and `--record=<UUID> --json` reads one
exact run or review. These read-only flags use the archive inside the vault;
the `analysis` writer beside the vault is unchanged. See
[analysis records](../docs/contracts/analysis-records.md) for cursor pagination
and limits.

### Graph-level commands

These wrap the MCP server so the developer has the same authority as an AI agent — compile the graph, find backlinks, rename / merge / delete safely, run a typed filter DSL. Most are one MCP call. `rename`, `merge` and `delete` preview by default and apply with `--confirm`; `relate` and `remove-relation` write unless `--dry-run` is passed, through the CLI's own guarded file writer.

| Command | What it does |
|---|---|
| `ontology-atlas backlinks <slug>` | Lists every node referencing the target (`matches[]` from MCP `find_backlinks`, `--json` for raw). A slug that names no node fails closed (exit 2, closest real slug named; `--json` prints `resolved:false`) so a typo cannot pass for "nothing references this"; a real node with no referrers still exits 0 with `total:0`. The guard is CLI-side: MCP `find_backlinks` itself still answers an unresolvable slug with `total:0`. Malformed backlink-match payloads fail closed before JSON or human output. |
| `ontology-atlas overview [vault]` | First-contact graph dashboard from MCP `query_ontology(overview)`: graph counts, kind/domain/relation buckets, and hub rows. Malformed graph/count/hub payloads fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas hubs [vault]` | Centrality rankings from MCP `query_ontology(centrality)`: PageRank, bridges, authorities, and hubs. `--plan` runs `query_plan(centrality)` first and skips expensive/warning plans unless `--force` is passed; `--types A,B` narrows relation types before PageRank. Planned scans show `totalMatches` when the plan has filter-aware match counts. Malformed plan/ranking payloads fail closed before JSON or human output. (`--limit N --types A,B --plan --force --json`) |
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
| `ontology-atlas relate <from> <to> <type> [vault]` | Writer counterpart of `relation-check` — identical argument shape and preflight (rejects a nonexistent `from`/`to` slug or an invalid `type` before touching the vault, same verdict/schema/recommendation display), then lands the relation directly on `<from>`'s frontmatter unless the exact edge already exists (idempotent, matches `add_relation`'s `alreadyExists` semantics). A new `depends_on` write requires `--why "..."`; existing legacy edges remain idempotent. Closes the gap where `relation-check` could compute the exact `add_relation` payload but nothing in the CLI could execute it — every other read/propose CLI pair (`analyze`/`infer-imports`, `growth`/`maintenance`) already has an apply path; this is the CLI-only (no MCP connector) way to add the single most common ontology edit. Writes with the CLI's own fs primitives (sorted/deduped relation arrays, `domain` as a single scalar that refuses to silently overwrite an existing value) — same on-disk shape as MCP `add_relation`. `--dry-run` previews the preflight result without writing. (`--dry-run --json`) |
| `ontology-atlas remove-relation <from> <to> <type> [vault]` | The mirror of `relate`: identical argument order and flags, opposite direction. Closes the half of relation editing the CLI never had — `relate` could create an edge and nothing could remove one, so a terminal-only user had to hand-edit frontmatter to undo a typo, which is exactly what every other write command exists to avoid. Writes through the same `expectedRevision` guard, so a removal cannot clobber a change made to that file since it was read, and it takes the edge's `relation_notes` entry with it rather than leaving a sentence explaining an edge that no longer exists. A key left without entries is removed rather than written as `[]` (an emptied `relation_notes` too), except a kind's scaffold list such as a capability's `elements`, which returns to the `[]` creating the node writes — the MCP `remove_relation` rule. Distinguishes a slug that is not in the list from a list the document does not have, because only one of those is a mistyped relation type. `--dry-run` reports what would be removed without writing. (`--json`) |
| `ontology-atlas query "<filter>"` | Typed filter DSL — `kind=X AND has(Y) AND NOT domain=Z`, parens / OR / NOT supported. `kind` and `has(...)` graph keys fail closed with closest-value hints. MCP-style `--operation` misuse prints graph-level CLI command guidance instead of a bare unknown flag. Malformed typed-filter result payloads fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas growth [vault]` | Inspect MCP `growth_plan` candidates without writing: relation recommendations, external element refs, dangling references, unassigned nodes, empty domains, ignored external refs, and `next reads` — one line per file a node's own `## Uncertainty` section says was not read, with its kind, first path, and the author's own sentence, printed even when there is nothing to write. Human output includes action totals, compiled graph counts, candidate reasons, and proposed tool calls, plus a `next growth` relation preflight loop before applying recommended edges. Malformed growth candidate payloads, including kind-specific `proposedAction` mismatches, fail closed before JSON or human output. (`--limit N --json`) |
| `ontology-atlas maintenance [vault]` | Inspect MCP `maintenance_plan` cleanup/repair work queue without writing. Human output includes cursor state, active filters, compile/cycle/canonicalize/dangling/relation/external/ignored-external summary counts, phase/severity/kind bucket summaries, current-page next action pointers with `phase/kind · severity · exec|review` detail, and a `next maintenance` command to narrow the queue before acting. Supports `--limit`, `--after-action-id`, `--executable-only`, `--phases`, `--severities`, `--kinds`, and `--json` for cursor/filter dogfood. Malformed work-queue payloads, filter echo drift, pagination `limited` drift, or compiled-summary drift fail closed before JSON or human output. |
| `ontology-atlas cycles [vault]` | Directed `depends_on` cycle detection from MCP `query_ontology(cycles)`. Any cycle exits 1 for shell/agent gates; human output prints node titles plus a `next cycle` evidence loop with bounded `path`, filtered `match-edges`, and the focused maintenance queue for `break_dependency_cycle` review. Malformed cycle rows fail closed before JSON or human output. (`--max-hops N --json`) |
| `ontology-atlas components [vault]` | Connected graph island scan from MCP `query_ontology(components)`. Use it before trusting traversal maps, onboarding maps, or graph DB-style scan coverage; human output lists island sizes, kind buckets, and node samples without requiring users to dig through `health --json`. Malformed component payloads fail closed before JSON or human output. (`--limit N --node-limit N --types A,B --json`) |
| `ontology-atlas topological-order [vault]` | Prerequisite-first dependency ordering from MCP `query_ontology(topological_order)`. Defaults to dependency edges and exits non-zero when cycles block a complete order, so connector-less agents can gate implementation sequencing without parsing `health --json`. Malformed order/blocker payloads fail closed before JSON or human output. (`--limit N --types A,B --include-isolated --json`) |
| `ontology-atlas workspace-brief [vault]` | Cheap first-contact dashboard from MCP `query_ontology(workspace_brief)`: hotspots, per-project node counts (`project_scope`), health-check coverage as `id:status:count`, and growth counts before deciding where to read deeper. Same focused diagnosis tuning flags as `health` / `agent-brief`. (`--json`) |
| `ontology-atlas analysis [rootPath]` | Writes a dated findings record beside the vault and compares it with the previous one. Derives nothing itself: it runs this CLI's own `health`, `validate`, and `architecture`, so it cannot disagree with them. Each finding carries an id built from the check and the thing it points at, never from its wording, so two runs can be compared. The record has no `kind:` and lives outside the vault, so the ontology does not count it and the vault contract is untouched. (`--vault=` `--out=` `--profile=` `--json` `--dry-run`) |
| `ontology-atlas health [vault]` | Graph health gate from MCP `query_ontology(health)`: compile issues, unresolved edges, dependency cycles, relation recommendations, and connected-component checks as `id:status:count`. Exits non-zero on blocking checks so shells / agents can gate on it. (`--json`) |
| `ontology-atlas match-nodes [vault]` | Graph DB-style node scan from MCP `query_ontology(match_nodes)`: filter by `--kind` / `--domain` / `--slug-contains` / `--min-degree`, sort by degree. `--plan` previews scan cost before execution. (`--limit N --json`) |
| `ontology-atlas match-edges [vault]` | Graph DB-style edge scan from MCP `query_ontology(match_edges)`: filter by `--from` / `--to` / `--from-kind` / `--to-kind` and relation `--types`. `--plan` previews scan cost. (`--limit N --json`) |
| `ontology-atlas pattern-walk <slug> [vault]` | Explicit relation-sequence walk from MCP `query_ontology(pattern_walk)`: follow a typed relation `--pattern` (e.g. `domains,capabilities`) from a start node in a chosen `--direction`. (`--direction outgoing\|incoming\|both --limit N --json`) |
| `ontology-atlas project-map <project> [vault]` | Domain-by-domain project map from MCP `query_ontology(project_map)`: per-project domain → capability → element breakdown. (`--limit N --item-limit N --json`) |
| `ontology-atlas reachability <slug> [vault]` | Transitive reachable-node layers from MCP `query_ontology(reachability)`: BFS layers of what a node reaches (or what reaches it) by relation `--types` and `--direction`. `--plan` previews scan cost. (`--depth N --limit N --plan --force --json`) |
| `ontology-atlas agent-brief [vault]` | Claude Code/Codex handoff from MCP `query_ontology(agent_brief)`: readiness score, categorical fail-closed `meaningAssessment`, copyable `handoffPrompt`, structured `cliFallbackCommands[]`, graph entrypoints, first MCP calls, investigation playbooks including `graph_traversal` (`schema` / `all_paths` / `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` / `bounded_path_evidence` / `containment_cross_check`), playbook evidence + stop-condition checklists, write guardrails, `relation_check` decision guide, `all_paths` result contracts, health coverage, and read-first write policy. Use `--project SLUG` to select one containment tree in a multi-project vault; it forwards the exact project to MCP. The handoff prompt and human output include directly runnable CLI fallback commands such as `ontology-atlas hubs [vault] --plan ...` for connector-less Claude Code/Codex sessions; the default `all-paths --plan` fallback starts with a low-cost direct relation/containment bound before agents widen traversal. `--prompt` prints only the handoff prompt for direct paste into Claude Code/Codex, `--graph-db-pack` prints only a shell-pasteable Graph DB-style CLI scan script with the selected vault path already inserted for connector-less sessions, and `--verify-fallbacks` executes the generated fallback command list against the selected vault with a human setup-gate line (`ok`, `performanceOk`, wall time, slow count, failed count), per-command elapsed time, and the slowest fallback summary; combine it with `--json` for a compact machine-readable timing report that Claude Code/Codex can parse in automated setup checks, with command output samples included only for failing fallback rows. Each fallback command is bounded by a 15s default timeout; use `--fallback-timeout-ms N` or `OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N` for larger vaults or slower disks, and timeout rows return `timedOut:true` plus `signal` in JSON. Passing-but-slow rows are marked with `slow:true` when they take at least the 5s default slow threshold; tune it with `--fallback-slow-ms N` or `OATLAS_AGENT_FALLBACK_SLOW_MS=N`, and JSON includes `performanceOk`, `slowThresholdMs`, plus total `slow`. Malformed readiness, meaning assessment, handoff prompt, CLI fallback, tool-call, playbook, traversal strategy, guardrail, result contract, relation decision guide, next-action, or health-check payloads fail closed before JSON or human output. **Exit code is an advisory readiness signal, not success/failure**: `0` = ready and healthy; `1` = the command ran and printed valid data, but graph readiness is `needs_attention`/`needs_shape`, a health check failed, or a fail-severity `nextAction` is present — this is advisory graph state, not a command failure; `2` = the MCP call itself failed. Naive `agent-brief && next-step` shell chaining misreads exit `1` as failure the first time a vault has any warning — pass `--exit-zero` to always exit `0` and read `status`/`readiness` from the JSON output instead (a genuine parse/MCP-call error still exits `1`/`2` even with `--exit-zero`; `--verify-fallbacks --exit-zero` also still exits `1` when a generated fallback command itself fails to run). (`--project SLUG`; `--json` plus the same focused diagnosis tuning flags as `health` / `workspace-brief`; `--exit-zero`) |
| `ontology-atlas rename <oldSlug> <newSlug>` | Atomic rename — moves the `.md`, updates `slug:`, rewrites every backlink (frontmatter array entries, inline strings, body links). Default dry-run preview; `--confirm` to apply. Refuses an existing target slug unless `--overwrite` is passed. |
| `ontology-atlas merge <fromSlug> <intoSlug>` | Atomic merge — redirects every backlink `from → into`, then deletes `from.md`. Default dry-run; `--confirm` to apply. The `into` node's frontmatter / body are **not** auto-combined — edit by hand if needed. |
| `ontology-atlas delete <slug>` | Permanent delete. Default refuses if any backlinks remain — preview them with the bare command, then `--confirm` to apply (or `--force` to delete anyway). |

When a coding task is already known, add `--compact --task "..."` to `agent-brief`. This opt-in
v2 mode returns one selected-project handoff capped at 12,000 UTF-8 JSON bytes:
final source and meaning currentness, one broad capability selected only when
its persisted Definition/Includes/Excludes are compatible with the task, cited
element/path anchors, explicit impact and verification unknowns, a bounded
full-body next read, and an exact full-detail follow-up. A desired/negative
boundary conflict, an unsupported claim, or a tied top claim returns no
capability. Definition prose describes what a capability touches, so it
corroborates but never selects on its own: at least one desired word must reach
the capability's own title, slug, path, or `Includes`, and one shared word is
never enough.
When the selected element's Markdown contains reviewed `Primary
implementation`, `Supporting implementation`, and `Focused test` Evidence
coordinates and the bound source is current, `taskNavigation` verifies only
those named files and prints the exact current symbol/test lines plus the
reviewed non-exhaustive IN/OUT boundary before the trust diagnostics. Stale,
missing, ambiguous, outside-root, symlinked, or unrecorded coordinates return no
exact target. The same source fingerprint/revision/graph is checked again after
the reads. Human output includes the verified runner/manifest and the
non-overlapping verification policy: separately named positive/negative
regressions, exact observable output, one focused check, and one full check.
Compact never searches the repository or infers a symbol from the task.
The task text is request-local and is not persisted; claim compatibility selects
evidence but never proves source behavior or approves ontology meaning. The
complete response remains the default. `--compact` cannot be combined with
`--graph-db-pack` or `--verify-fallbacks`, whose full manuals are deliberately
behind the complete response. A multi-project vault requires `--project` rather
than silently choosing its first project.
For a known task, run this compact command directly after checking the MCP
connection. When task navigation is `ready`, read its primary, supporting, and
focused-test coordinates together before broad search. Otherwise preserve the
unknown and use the returned full-body/source follow-up. A preceding
`workspace-brief` or full inventory is redundant unless the question really
needs whole-vault health.

These commands spawn the MCP server from the sibling `mcp/` package in the same checkout; `pnpm install` at the repo root wires it up.

## Verify

`ontology-atlas mcp-verify [vault]` is the fastest sanity check for the
agent-facing surface. It resolves the vault the same way graph commands do and
delegates to the checkout's `mcp/scripts/verify.mjs`, which checks the parser,
server boot, the exact `tools/list` inventory with its schemas and annotations,
strict argument and enum rejection, write-safety guards and destructive
dry-runs, batch caps, read and graph-query smokes against the live vault, and
the `maintenance_plan` cursor contract. `ontology-atlas mcp-verify --help`
prints that scope without starting a server. It blocks on parser, server or
inventory failures, vault validation errors, failing health checks, and
fail-severity `workspace_brief.nextActions`; warnings still print, so a fresh
starter vault can verify before cleanup. An empty vault folder fails at once
with a recovery hint rather than passing against the wrong folder.

Use `--timeout-ms 15000` when a large vault or slow filesystem needs a longer
server wait. Graph commands share a one-shot MCP call timeout; set
`OATLAS_CLI_MCP_TIMEOUT_MS=N` for a slower vault, and
`OATLAS_VERIFY_KILL_GRACE_MS=N` or `OATLAS_CLI_MCP_KILL_GRACE_MS=N` only when the
post-timeout `SIGTERM`→`SIGKILL` window needs tuning.

`agent-brief`, `workspace-brief` and `health` validate their payload shape
before output and treat a malformed diagnosis as an error, never as a clean
vault. `workspace-brief` and `health` exit 1 on fail-severity next actions or
failing health checks; `agent-brief` exit codes are advisory as described in
its table row, so automation passes `--exit-zero` and reads `status` from the
JSON. Human output prints health coverage as `id:status:count` rows. All three
forward the focused diagnosis flags `--dependency-types A,B`,
`--component-types A,B`, `--component-limit N`, `--cycle-limit N`,
`--recommendation-limit N`, `--order-limit N`, and `--node-limit N` (`health`
and `workspace-brief` also accept `--limit N` for `--node-limit N`;
`agent-brief` does not).

When editing the CLI from this repository, `pnpm checks:changed` names the
focused checks for the touched files; the usual ones are:

```bash
pnpm test:cli:args
pnpm test:cli:lib
pnpm integration:cli:entry
pnpm integration:cli:diagnosis
pnpm integration:cli:graph-read
pnpm integration:cli:graph-write
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
pnpm dogfood:verify
```

[docs/DEVELOPMENT-CHECKS.md](../docs/DEVELOPMENT-CHECKS.md) owns the full gate
list.

The vault is a plain folder of `.md` files. **Frontmatter is the graph.**


## How AI agents fit in

`init` automatically writes wired agent configs to the vault folder and, when
the vault sits inside the directory you ran it from, to that codebase root:

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
node cli/src/index.mjs bootstrap . --vault ontology --json
```

`bootstrap` is review-only: it returns `reason: "approval_required"`,
`writeEligible: false`, and `writes: 0`; it never replaces starter files.
Large compact import receipts preserve candidate and unresolved totals in the
approval plan without requesting the multi-megabyte full arrays.
Continue in an agent connected to the Atlas MCP server; its instructions carry
independent qualification, human acceptance, and the exact released
`writePlan`.

After that accepted plan is written, `compile` gives you the deterministic
graph hash/counts. Add `--fix` to apply compiler-produced relation-array canonicalization
actions, which trims duplicates and reorders graph arrays through the same MCP
`patch_concept` write path agents use. The wrapper fails closed before writing
if an action would patch anything outside compiler relation-array keys or if the
declared action keys do not match the frontmatter patch.

The running server's `tools/list` is the exact read and write inventory, and
[mcp/README.md](../mcp/README.md) owns each tool's contract.
`finalize_project_meaning` stores provenance only, never raw answers or a
private absolute source root; `ok: true` does not mean `meaningAssessment` is
verified.

## See the graph

The map is a custom canvas-2D `ontology-map` renderer; Graphology supplies
only the ForceAtlas2 layout.

- **Hosted website** (intro, download, read-only dogfood demo):
  https://ontologyatlas.com/
- **Local workbench** (read and write your vault): install the macOS app and
  open your vault folder.

## License

MIT — https://github.com/wlsdks/ontology-atlas
