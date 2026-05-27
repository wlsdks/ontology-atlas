# Agent Graph Workflow

> Current as of 2026-05-28. This is the user-facing guide for running
> `oh-my-ontology` as a local PC graph memory: CLI-only, MCP-connected, and web
> workbench flows over the same markdown vault.

`oh-my-ontology` is not a hosted graph database. It is a local-first graph
workbench where markdown frontmatter is the graph, git is the audit log, and AI
agents can read or write through MCP when they are connected.

## Choose The Right Mode

Use this table before setup. The modes share the same vault files, so switching
between them does not migrate data.

| Situation | Start here | What you get |
|---|---|---|
| You only want to inspect a local vault from Terminal | CLI-only | Validation, workspace summaries, graph scans, path/explain queries, and graph DB packs without any MCP client |
| Claude Code, Codex, or Cursor is connected to MCP | MCP-connected | The agent can call read/write tools directly, receive structured repair fields, and update the markdown vault after validation |
| You want graph-database-style exploration but not a database server | Graph DB pack | Bounded query plans, node/edge scans, domain matrix, paths, relation explanations, and follow-up evidence commands |
| Setup is unclear or you opened the agent from another codebase root | Agent setup gate | Config repair commands, restart guidance, JSON readiness checks, and fallback timing before edits |

For non-developers, the safest sequence is: install the macOS app, open a vault
folder there, use the AI agent setup card, restart the agent, run the JSON
gate, and only then ask the agent to write ontology updates.

Read the JSON gate in three states:

- `ok: false` means setup or fallback command execution is broken. Fix the
  config before asking the agent to edit ontology files.
- `ok: true` with `performanceOk: false` means the local graph path works, but
  fallback latency is slow enough to inspect before relying on it heavily.
- `ok: true` with `performanceOk: true` means the setup and fallback graph path
  are ready for read-first agent work.

For humans, `agent-brief --verify-fallbacks` prints the same setup gate summary
before the row list: `ok=true performanceOk=true wall=... slow=0/N failed=0`.
That line is the fastest way to tell whether a connector-less Claude Code/Codex
session can trust the local CLI graph path before scanning or writing.

## What Works Without MCP Connected

You can use the product without connecting Claude Code, Codex, Cursor, or any
MCP client.

The CLI reads the same local vault and can run graph-database-style queries:

```bash
oh-my-ontology validate docs/ontology
oh-my-ontology workspace-brief docs/ontology
oh-my-ontology match-nodes docs/ontology --kind capability --limit 10
oh-my-ontology match-edges docs/ontology --type depends_on --limit 10
oh-my-ontology domain-matrix docs/ontology --types depends_on,relates
oh-my-ontology agent-brief docs/ontology --graph-db-pack
```

This mode is useful when an agent has no MCP connector available. The CLI still
uses the same local graph engine and the same vault files; it just prints the
answers in terminal form instead of returning JSON-RPC tool results to an agent.

Use `agent-setup` when the vault already exists and you only want to repair
agent config files:

```bash
oh-my-ontology agent-setup /absolute/path/to/vault --root /absolute/path/to/codebase --write
```

That command creates missing `.mcp.json` and `.codex/config.toml` files without
adding starter markdown and without overwriting stale existing configs.
Its terminal and JSON output also point back to this guide
(`docs/AGENT-GRAPH-WORKFLOW.md`), so CLI-only setup logs still tell a human
where to read the MCP, graph DB, and verification differences.
The same guide path is included in `agent-brief --prompt` and
`agent-brief --graph-db-pack`, so the agent handoff and connector-less graph
query script carry the explanation forward after setup. The normal
`agent-brief` terminal view and the shell-pasteable `--graph-db-pack` header now
also render the same mode guide directly, so a human can tell when to stay
CLI-only, when MCP adds value, when to use the graph DB pack, and when to run the
setup gate without opening JSON first.
The `/ontology/insights` graph DB query pack card shows the same mode guide
before its copy buttons, and the copied UI CLI pack includes the guide too, so
the explanation survives when a non-developer passes only the runbook into a
fresh Claude Code or Codex session.
`agent-setup --json` also includes `docs.modeComparison`, a machine-readable
version of the CLI-only / MCP-connected / graph DB pack / setup gate choice, so
an AI agent can explain the right path without scraping this Markdown table.
For automation, `agent-brief --json` and MCP `query_ontology({operation:
"agent_brief"})` expose the same location as `docs.workflowGuide`, so an AI
tool does not need to parse the human prompt to find the guide.
They also expose this page's mode chooser as `docs.modeComparison` and the
scan-to-proof rules as `docs.graphScanProofChecklist`, so an AI tool can inspect
the CLI-only / MCP-connected / graph DB pack / setup gate choice and the
required `totalMatches` / follow-up / `evidence.pathsComplete` steps without
parsing Markdown.

## What MCP Adds

MCP is the agent interface. When Claude Code, Codex, or Cursor has the
`oh-my-ontology` MCP server registered, the agent can call 23 local tools:

- 15 read tools: node listing, evidence search, backlinks, paths, validation,
  compile, repo analysis, import inference, and graph queries.
- 8 write tools: add, patch, relation write, rename, merge, and delete with
  dry-run or conflict safety where needed.

MCP adds three things that terminal-only use does not provide as naturally:

1. The agent can fetch precise context on demand instead of asking the user to
   paste terminal output.
2. The agent can write back to the same markdown vault after it has read,
   validated, and preflighted the change.
3. Tool responses include structured repair fields, result contracts, and
   write guardrails so the agent can recover from bad inputs without guessing.

The first MCP calls should be read-only:

```json
{ "tool": "validate_vault", "arguments": {} }
{ "tool": "query_ontology", "arguments": { "operation": "workspace_brief" } }
{ "tool": "query_ontology", "arguments": { "operation": "agent_brief" } }
{ "tool": "query_ontology", "arguments": { "operation": "health" } }
```

Only after those checks are clean should an agent propose writes.

## How This Differs From A Graph Database

`oh-my-ontology` deliberately borrows graph DB query habits, but optimizes for a
different job.

| Need | Graph DB | oh-my-ontology |
|---|---|---|
| Storage | Server/database files | Plain markdown files in your repo or local folder |
| Setup | Database service, schema, credentials | Pick or create a folder; no login or backend |
| Query language | Cypher/Gremlin/SPARQL style | CLI commands and MCP `query_ontology` operations |
| Source of truth | Database state | Git-tracked markdown frontmatter |
| Human readability | Usually requires UI/export | Every node is an editable `.md` document |
| Agent use | Agent needs DB tooling and schema context | Agent gets MCP tools, first-call guidance, result contracts, and write guardrails |
| Write safety | Transaction/schema constraints | dry-runs, `relation_check`, `expected_mtime`, validation, maintenance queues |
| Best scale | Large transactional graphs | Codebase/team memory graphs that need explainable local context |

So the claim is not "faster than every graph DB at every graph workload." The
claim is narrower and more useful for this product: for a developer's local
codebase memory, it is more practical because the graph is inspectable, editable,
git-reviewable, and directly available to AI coding agents.

## Graph-DB-Style Query Pack

For agent or terminal sessions, start with a plan-first scan instead of pulling
the full graph:

```bash
oh-my-ontology facets docs/ontology --limit 10
oh-my-ontology schema docs/ontology --limit 10
oh-my-ontology match-nodes docs/ontology --kind capability --limit 10
oh-my-ontology match-edges docs/ontology --type depends_on --limit 10
oh-my-ontology domain-matrix docs/ontology --types depends_on,relates
oh-my-ontology all-paths capabilities/cli-developer-entry capabilities/mcp-server docs/ontology --plan --force --max-hops 3 --types depends_on,relates
oh-my-ontology explain capabilities/cli-developer-entry capabilities/mcp-server docs/ontology --types depends_on,relates
```

Important rule: scan rows are candidates, not proof. Before using a node or edge
for an onboarding, refactor, or write decision, follow up with `node`,
`match-edges`, `blast-radius`, `explain`, or `relation-check`.

Use this scan-to-proof checklist:

1. Report `totalMatches`, `limited`, and returned row count from `match-nodes`
   or `match-edges`.
2. For a node row, run `node` / `node_profile` or `blast-radius` before using it
   as onboarding or refactor evidence.
3. For an edge row, run `explain`, `path`, and `relation-check` before using it
   as coupling or write evidence.
4. For path evidence, report `evidence.pathsComplete`; if it is false, narrow
   the query before writing or making an architecture claim.

## Actual Verification Snapshot

These checks were run against this repository's dogfood vault on 2026-05-28.

CLI-only checks:

- `node cli/src/index.mjs agent-setup docs/ontology --json`
  - `operation: "agent_setup"`
  - `sideEffect: false`
  - `summary: { total: 4, ready: 2, missing: 2, review: 0, written: 0, examples: 0 }`
  - `modeIds: ["cli_only", "mcp_connected", "graph_db_pack", "setup_gate"]`
- `node cli/src/index.mjs match-nodes docs/ontology --kind capability --min-degree 2 --sort degree --limit 8 --json`
  - `operation: "match_nodes"`
  - `totalMatches: 25`
  - `returned: 8`
  - `limited: true`
  - `followUp.focusSlug: "capabilities/cli-developer-entry"`
- `node cli/src/index.mjs agent-brief docs/ontology --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`
  - `operation: "agent_fallback_check"`
  - `ok: true`
  - `performanceOk: true`
  - `total: 25`
  - `passed: 25`
  - `failed: 0`
  - `slow: 0`
  - `wallMs: 1332`
  - `totalMs: 5161`
  - slowest fallback: `blast-radius capabilities/cli-developer-entry --plan --depth 2`
    at `361ms`
- Human terminal view for the same gate printed:
  - `setup gate ok=true performanceOk=true wall=1341ms slow=0/25 failed=0`
- `node scripts/perf-graph.mjs --json --check --n=1000`
  - budgets: `compileMs <= 750`, `queryMs <= 750`
  - failures: `0`
  - 1000 generated nodes, 3867 generated edges
  - `compile.fullMs: 17.69`
  - `agent_brief: 20.67ms`
  - `graph_db_pack: 37.17ms`
  - `project_map: 9.26ms`
  - graph DB pack replayed 10 calls:
    `query_plan`, `match_nodes`, `query_plan`, `match_edges`,
    `domain_matrix`, `query_plan`, `centrality`, `query_plan`, `all_paths`,
    `explain_relation`
  - graph DB pack diagnostics: `totalMatches: [719, 718]`,
    `allPathsEvidenceStatus: "complete"`, and
    `explainRelationHasShortestPath: true`

MCP-connected checks from this Codex session:

- `compile_ontology({ summary: true })` returned graph hash
  `ee65046d93839487ae14f81663a1a06e65ffe3e8d27320f30db66cc47853fe94`,
  54 nodes, 372 edges, 190 resolved edges, 182 external edges, 0 unresolved
  edges, 0 issues, and 0 canonicalization actions.
- `validate_vault` scanned 54 files with 0 problem files.
- `workspace_brief` returned `status: "healthy"`, 1 project, 6 domains, 25
  capabilities, 21 elements, 0 unresolved edges, 0 issues, and 0 growth
  actions.
- `health` returned `status: "healthy"`, 190 resolved edges, 182 external
  edges, 1 connected component, 0 dependency cycles, 0 relation
  recommendations, and all five checks passing:
  `compile_issues`, `unresolved_edges`, `dependency_cycles`,
  `relation_recommendations`, and `components`.
- `match_nodes` over capabilities with `minDegree: 2` returned 25 total
  matches, 5 rows in the MCP sample, and the same
  `followUp.focusSlug: "capabilities/cli-developer-entry"` evidence contract.
- `domain_matrix` over `depends_on`, `relates`, and `describes` returned 6
  domains, 52 assigned nodes, 41 cross-domain edges, 29 self-domain edges, and
  0 unresolved edges.

Installed MCP verifier:

- `node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000`
  - passed parser, server boot, 23-tool inventory, strict argument/enum checks,
    destructive dry-runs, batch no-write checks, health/workspace/agent briefs,
    graph query smokes, and structured content checks.
  - compiled graph hash: `ee65046d9383`
  - graph size: 54 nodes, 372 edges, 0 issues.

## Recommended First User Flow

For a non-developer or a first-time AI-agent session:

1. Install the macOS app and open the local vault folder there.
2. Open the Docs vault tools menu and check the AI agent setup card.
3. Read the root execution contract: `vault folder` sessions can use `.` as the
   vault path, while separate `codebase root` sessions must pass the ontology
   vault as an explicit absolute path.
4. If the agent opens at a separate codebase root, copy the `agent-setup`
   command before copying manual templates.
5. Restart Claude Code, Codex, or Cursor.
6. Run the read-first verification prompt or the JSON setup gate.
7. Only then ask the agent to answer architecture questions or write ontology
   updates.

For a developer terminal session:

1. Run `oh-my-ontology validate <vault>`.
2. Run `oh-my-ontology agent-brief <vault> --verify-fallbacks --json`.
3. Run `oh-my-ontology agent-brief <vault> --graph-db-pack`.
4. Use follow-up commands before treating graph scans as evidence.
