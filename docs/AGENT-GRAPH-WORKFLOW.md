# Agent Graph Workflow

> Current as of 2026-05-24. This is the user-facing guide for running
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

For non-developers, the safest sequence is: open a vault folder in the web UI,
use the AI agent setup card, restart the agent, run the JSON gate, and only then
ask the agent to write ontology updates.

Read the JSON gate in three states:

- `ok: false` means setup or fallback command execution is broken. Fix the
  config before asking the agent to edit ontology files.
- `ok: true` with `performanceOk: false` means the local graph path works, but
  fallback latency is slow enough to inspect before relying on it heavily.
- `ok: true` with `performanceOk: true` means the setup and fallback graph path
  are ready for read-first agent work.

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
query script carry the explanation forward after setup.
For automation, `agent-brief --json` and MCP `query_ontology({operation:
"agent_brief"})` expose the same location as `docs.workflowGuide`, so an AI
tool does not need to parse the human prompt to find the guide.

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

These checks were run against this repository's dogfood vault on 2026-05-24.

CLI-only checks:

- `node cli/src/index.mjs agent-setup docs/ontology --json`
  - `operation: "agent_setup"`
  - `sideEffect: false`
  - `summary: { total: 4, ready: 2, missing: 2, review: 0 }`
- `node cli/src/index.mjs match-nodes docs/ontology --kind capability --limit 3 --json`
  - `operation: "match_nodes"`
  - `totalMatches: 19`
  - `limited: true`
  - `followUp: true`
- `node cli/src/index.mjs agent-brief docs/ontology --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`
  - `operation: "agent_fallback_check"`
  - `ok: true`
  - `performanceOk: true`
  - `total: 25`
  - `passed: 25`
  - `failed: 0`
  - `slow: 0`

MCP-connected checks from this Codex session:

- `list_kinds` returned 31 nodes: 19 capabilities, 6 domains, 4 elements, 1
  project, 1 vault README.
- `validate_vault` scanned 31 files and found 0 problem files.
- `list_concepts({ kind: "capability", limit: 5, summary: true })` returned
  capability summaries including `agent-config-onboarding` and
  `cli-developer-entry`.

Installed MCP verifier:

- `node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000`
  - passed parser, server boot, 23-tool inventory, strict argument/enum checks,
    destructive dry-runs, batch no-write checks, health/workspace/agent briefs,
    graph query smokes, and structured content checks.
  - compiled graph hash: `0d31ec737ff4`
  - graph size: 31 nodes, 296 edges, 0 issues.

## Recommended First User Flow

For a non-developer or a first-time AI-agent session:

1. Open the local vault folder in the web workbench.
2. Open the Docs vault tools menu and check the AI agent setup card.
3. If the agent opens at a separate codebase root, copy the `agent-setup`
   command before copying manual templates.
4. Restart Claude Code, Codex, or Cursor.
5. Run the read-first verification prompt or the JSON setup gate.
6. Only then ask the agent to answer architecture questions or write ontology
   updates.

For a developer terminal session:

1. Run `oh-my-ontology validate <vault>`.
2. Run `oh-my-ontology agent-brief <vault> --verify-fallbacks --json`.
3. Run `oh-my-ontology agent-brief <vault> --graph-db-pack`.
4. Use follow-up commands before treating graph scans as evidence.
