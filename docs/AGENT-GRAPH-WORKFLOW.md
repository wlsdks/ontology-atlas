# Agent Graph Workflow

> Current as of 2026-08-02. This is the user-facing guide for running
> `ontology-atlas` as a local meaning graph: CLI-only, MCP-connected, and web
> workbench flows over the same markdown vault.

`ontology-atlas` is not a hosted graph database. It is a local-first graph
workbench where markdown frontmatter is the graph, git is the audit log, and AI
agents can read or write through MCP when they are connected.

> **How the server reaches you (decided 2026-07-27, `docs/DECISIONS.md`):**
> npm publishing is retired. There is no `ontology-atlas` or
> `ontology-atlas-mcp` package to install, and there never will be. Two live
> paths instead:
>
> - **Installed app** — open the vault folder and press **Connect agent**. The app carries a compiled MCP server in its own bundle,
>   shows you the config it is about to write, writes it, then spawns the
>   server and round-trips `get_concept` before reporting success.
> - **Source checkout** — register the server as
>   `node /absolute/path/to/ontology-atlas/mcp/src/index.js` and run CLI proofs
>   as `node cli/src/index.mjs <command>`.
>
> A config still holding `command: "npx"` predates the bundled server and
> cannot start.
>
> Command examples below are written as `ontology-atlas <command>` for
> readability — that is the CLI's name, not a global binary. From a source
> checkout, run each as `node cli/src/index.mjs <command>`.

## Official Client Contract

Checked against official docs on 2026-06-04:

- Codex supports MCP servers in the CLI and IDE extension, stores MCP server
  configuration in Codex `config.toml`, and exposes `codex mcp list` plus the
  `/mcp` TUI panel for checking active servers.
  Project-scoped `.codex/config.toml` is ignored until Codex marks that project
  trusted; `codex mcp list` from the trusted folder and `connection_info` are
  therefore required connection evidence, not optional diagnostics.
  Source: https://developers.openai.com/codex/mcp
- Claude Code configures MCP servers with `claude mcp`, checks connected
  servers with `claude mcp list` and `/mcp`, and supports local stdio servers
  for tools that need direct system access.
  Source: https://code.claude.com/docs/en/mcp

Atlas keeps the Codex boundary machine-readable too: `agent-setup --json`
reports `clientStatus.codex.projectTrust: "unknown"` and
`registration: "unverified"` until a fresh Codex session passes the trust
prompt, `codex mcp list`, and Atlas `connection_info`. If the project config is
ignored, use the generated global `codex mcp add ...` fallback, restart Codex,
and repeat those checks. Atlas cannot inspect Codex credentials or trust
directly, so config readiness never becomes a live-connection claim.

Ontology Atlas therefore does not reimplement Claude Code, Codex, or Cursor chat
inside the app — it does not own an agent loop, model routing, API keys, or
billing. It prepares the local MCP files, root-specific commands, restart
guidance, and verification gates so those agents can connect from their own app,
terminal, or IDE session and work against the same vault.

**Reversal record, 2026-07-26 — the embedded terminal is gone.** Earlier that
same day this section said the desktop app *may host a terminal*, and a bottom
dock shipped that ran your already-installed `claude` / `codex` CLI. The owner
reversed it within the week, and the reasoning is kept here rather than deleted.

Why it was removed: the dock's own trust contract made it a strict subset of the
terminal you already use — one login shell with no arguments, no tabs, no
splits, no shell profiles, the session ending when you collapsed it, and about
thirteen visible rows on a 14-inch screen. Every one of those was the right
call, and together they meant long agent loops, resumed sessions, and parallel
worktrees belonged somewhere else. The synergy that seemed to justify embedding
— *the agent edits the vault and the map reacts immediately* — turned out to be
position-independent: the vault watcher observes the folder on disk, so an agent
running in iTerm moves the map exactly the same way. Polishing the window did
not change the comparison, and sunk cost is not a reason to keep a surface.

**Atlas does not host a terminal; it hands off to yours.** The bridge between a
person and an agent is a protocol, not a window: the MCP tools, the CLI, the
`agent-brief` handoff prompt, and the vault watcher. The vault agent panel gives
you a copy block — `cd <your vault>` plus the sentence to paste — and you run it
where your session already lives. What you change out there comes back through
the watcher and the recent-change lens on the map.

**Nothing runs on its own.** Atlas never issues a command, spawns a process, or
starts an agent on your behalf. It prepares files and text you choose to run.

## Choose The Right Mode

Use this table before setup. The modes share the same vault files, so switching
between them does not migrate data.

| Situation | Start here | What you get |
|---|---|---|
| You only want to inspect a local vault from Terminal | CLI-only | Validation, workspace summaries, graph scans, path/explain queries, and graph DB packs without any MCP client |
| Claude Code, Codex, or Cursor is connected to MCP | MCP-connected | The agent can call read/write tools directly, receive structured repair fields, and update the markdown vault after validation |
| You want graph-database-style exploration but not a database server | Graph DB pack | Bounded query plans, node/edge scans, domain matrix, paths, relation explanations, and follow-up evidence commands |
| Setup is unclear or you opened the agent from another codebase root | Agent setup gate | Config repair commands, restart guidance, JSON readiness checks, and fallback timing before edits |

The installed app *does* claim a one-click agent connection, because it carries
the server it is connecting you to. Press **Connect agent**: the
app shows the config it is about to write, writes it after you approve, then
spawns the bundled binary and round-trips `get_concept` — a green light means
your vault is readable, not that a process started. Source-checkout contributors
register the local MCP entry point instead, restart their agent, run the JSON
gate, and only then ask the agent to write ontology updates. A browser surface
has no absolute path to write, so it stays honestly demoted to the
source-checkout instructions rather than emitting a config that cannot boot.

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

The CLI currently exposes 54 commands over the same local vault, including
graph-database-style queries:

```bash
node $ATLAS/cli/src/index.mjs validate docs/ontology
node $ATLAS/cli/src/index.mjs workspace-brief docs/ontology
node $ATLAS/cli/src/index.mjs match-nodes docs/ontology --kind capability --limit 10
node $ATLAS/cli/src/index.mjs match-edges docs/ontology --type depends_on --limit 10
node $ATLAS/cli/src/index.mjs domain-matrix docs/ontology --types depends_on,relates
node $ATLAS/cli/src/index.mjs agent-brief docs/ontology --graph-db-pack
```

This mode is useful when an agent has no MCP connector available. The CLI still
uses the same local graph engine and the same vault files; it just prints the
answers in terminal form instead of returning JSON-RPC tool results to an agent.

Use `agent-setup` when the vault already exists and you only want to repair
agent config files:

```bash
node $ATLAS/cli/src/index.mjs agent-setup /absolute/path/to/vault --root /absolute/path/to/codebase --write
```

That command creates missing `.mcp.json` and `.codex/config.toml` files without
adding starter markdown. For a parseable existing file, it atomically merges or
rebinds only the `ontology-atlas` JSON entry / TOML section pair and preserves
unrelated servers, sections, and comments. Invalid or duplicate Atlas config is
left untouched with a merge template and a nonzero review result.
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
`ontology-atlas` MCP server registered, `tools/list` provides the exact current
local read/write inventory. Read tools cover connection and git state, node and
evidence lookup, graph queries, validation, compilation, and source analysis.
Write tools cover guarded concept/relation changes, source binding, local
snapshots, and project-meaning finalization. Run `mcp-verify` to prove that the
advertised set, initialize guidance, and this vault agree.

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

After the person accepts project competency answers and the agent has completed
the related concept/relation writes, `validate_vault`, and a complete compile,
call `finalize_project_meaning({ projectSlug, expected_mtime })`. The server
derives the body/graph/source provenance and writes only the receipt—never raw
answers, witness text, a private absolute source root, or remote coordinates.
`ok: true` means that receipt write completed; it does not mean the project is
verified. Read `agent_brief.meaningAssessment` for the categorical fail-closed
state (`verified_current`, `review_required`, `needs_evidence`, or `invalid`).
For a multi-project vault, use `query_ontology({ operation: "agent_brief",
project: "SLUG" })` or `ontology-atlas agent-brief <vault> --project SLUG`.

## How This Differs From A Graph Database

`ontology-atlas` deliberately borrows graph DB query habits, but optimizes for a
different job.

| Need | Graph DB | ontology-atlas |
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
node $ATLAS/cli/src/index.mjs facets docs/ontology --limit 10
node $ATLAS/cli/src/index.mjs schema docs/ontology --limit 10
node $ATLAS/cli/src/index.mjs match-nodes docs/ontology --kind capability --limit 10
node $ATLAS/cli/src/index.mjs match-edges docs/ontology --type depends_on --limit 10
node $ATLAS/cli/src/index.mjs domain-matrix docs/ontology --types depends_on,relates
node $ATLAS/cli/src/index.mjs all-paths capabilities/cli-developer-entry capabilities/mcp-server docs/ontology --plan --force --max-hops 3 --types depends_on,relates
node $ATLAS/cli/src/index.mjs explain capabilities/cli-developer-entry capabilities/mcp-server docs/ontology --types depends_on,relates
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

These checks were run against this repository's dogfood vault on 2026-07-27.

CLI-only checks:

- `node cli/src/index.mjs agent-setup docs/ontology --json`
  - `operation: "agent_setup"`
  - `sideEffect: false`
  - `summary: { total: 4, ready: 2, missing: 2, review: 0, written: 0, examples: 0 }`
  - `modeIds: ["cli_only", "mcp_connected", "graph_db_pack", "setup_gate"]`
- `node cli/src/index.mjs match-nodes docs/ontology --kind capability --min-degree 2 --sort degree --limit 8 --json`
  - `operation: "match_nodes"`
  - `totalMatches: 38`
  - `returned: 8`
  - `limited: true`
  - `followUp.focusSlug: "capabilities/cli-developer-entry"`
- `node cli/src/index.mjs agent-brief docs/ontology --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`
  - `operation: "agent_fallback_check"`
  - `ok: true`
  - `performanceOk: true`
  - `total: 32`
  - `passed: 32`
  - `failed: 0`
  - `slow: 0`
  - `wallMs: 1993`
  - `totalMs: 7928`
  - slowest fallback: `match-edges --plan --types depends_on --limit 20`
    at `377ms`
- `node scripts/perf-graph.mjs --json --check --n=1000`
  - budgets: `compileMs <= 750`, `queryMs <= 750`
  - failures: `0`
  - 1000 generated nodes, 3867 generated edges
  - median `compile.fullMs: 18.00`
  - median `agent_brief: 25.26ms`
  - median `graph_db_pack: 24.55ms`
  - median `project_map: 8.16ms`
  - graph DB pack replayed 10 calls:
    `query_plan`, `match_nodes`, `query_plan`, `match_edges`,
    `domain_matrix`, `query_plan`, `centrality`, `query_plan`, `all_paths`,
    `explain_relation`
  - graph DB pack diagnostics: `totalMatches: [719, 718]`,
    `allPathsEvidenceStatus: "complete"`, and
    `explainRelationHasShortestPath: true`

Graph and MCP-connected facts. **This section states no counts, hashes, or file
totals** — every one of them changes the moment anyone adds a node, so a number
written here is wrong by the next commit and nobody notices. Run the commands:

```bash
node cli/src/index.mjs compile docs/ontology --summary --json   # size, hash, kind census
node cli/src/index.mjs validate docs/ontology                   # problem files
node cli/src/index.mjs health docs/ontology                     # compile issues, cycles, unresolved
node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000
```

What the run must show is split into two contracts. `validate` reports **0
problem files**, `health` reports no structural compile/cycle/unresolved-edge
errors, and `mcp-verify` passes parser, server boot, every registered tool,
strict argument/enum checks, destructive dry-runs, batch no-write checks,
briefs, graph query smokes, and structured content checks. A cold-start or
unqualified vault may still report `needs_attention`: `workspace_brief` and
`agent_brief` must surface an invalid, unmeasured, or stale `meaningAssessment`
instead of relabelling it `healthy`/`ready`/`100`. The stronger `healthy` and
`ready` result is reserved for a vault whose meaning assessment is current and
whose exact construction plan has passed the qualification and human-approval
gate.

## Recommended First User Flow

For a non-developer or a first-time AI-agent session:

1. Install the macOS app and open the local vault folder there.
2. Open App Settings → AI agent and check the setup/connection card.
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

1. Run `ontology-atlas validate <vault>`.
2. Run `ontology-atlas agent-brief <vault> --verify-fallbacks --json`.
3. Run `ontology-atlas agent-brief <vault> --graph-db-pack`.
4. Use follow-up commands before treating graph scans as evidence.
