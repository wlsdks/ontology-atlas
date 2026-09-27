---
title: Agent Graph Workflow
doc_type: authority
status: current
area: agents
---

# Agent Graph Workflow

This guide is for a person or an AI coding agent working against an Atlas vault
from a terminal or an MCP client. It covers the four topics that `agent-setup`,
`agent-brief` and MCP `agent_brief` point to: CLI-only use, MCP-connected use,
how Atlas differs from a graph database, and the verification checks.

`ontology-atlas` is not a hosted graph database. Markdown frontmatter is the
graph, Git is the audit log, and agents read or write through MCP when they are
connected. Atlas does not run an agent loop, host a terminal, or start a process
on your behalf; it prepares config files and text that you choose to run in the
agent session you already use.

There is no npm package. The installed macOS app carries a compiled MCP server
and connects it through **Connect agent**. From a source checkout, register
`node /absolute/path/to/ontology-atlas/mcp/src/index.js` and run the CLI as
`node cli/src/index.mjs <command>`. A config that still holds `command: "npx"`
cannot start.

## Choose a mode

The modes share the same vault files, so switching between them migrates
nothing. `agent-setup --json` reports these ids as `docs.modeComparison`.

| Mode id | Start here when | What you get |
|---|---|---|
| `cli_only` | You inspect a local vault from a terminal | Validation, workspace summaries, graph scans, path and explain queries, and graph DB packs without an MCP client |
| `mcp_connected` | Claude Code, Codex, or Cursor has the MCP server registered | Direct read and write tools, structured repair fields, and guarded vault writes after validation |
| `graph_db_pack` | You want graph-database-style exploration without a database server | Bounded query plans, node and edge scans, domain matrix, paths, relation explanations, and follow-up evidence commands |
| `setup_gate` | Setup is unclear or the agent opened at another codebase root | Config repair commands, restart guidance, JSON readiness checks, and fallback timing before edits |

The installed app's **Connect agent** shows the config it is about to write,
writes it after you approve, then spawns the bundled server and round-trips
`get_concept`; a green light means the vault is readable. A browser has no
absolute path to write, so it shows the source-checkout instructions instead.

Read the JSON setup gate in three states:

- `ok: false`: setup or fallback execution is broken. Fix the config before
  asking the agent to edit ontology files.
- `ok: true` with `performanceOk: false`: the local graph path works, but
  fallback latency is slow enough to inspect before relying on it.
- `ok: true` with `performanceOk: true`: setup and the fallback graph path are
  ready for read-first agent work.

`agent-brief --verify-fallbacks` prints the same summary for people before the
row list: `ok=true performanceOk=true wall=... slow=0/N failed=0`.

## CLI-only use

The CLI needs no MCP client. Its 62 commands run over the same local vault and
graph engine and print answers in terminal form; `node cli/src/index.mjs --help`
lists them and [cli/README.md](../cli/README.md) is the command reference.

```bash
node $ATLAS/cli/src/index.mjs validate docs/ontology
node $ATLAS/cli/src/index.mjs workspace-brief docs/ontology
node $ATLAS/cli/src/index.mjs match-nodes docs/ontology --kind capability --limit 10
node $ATLAS/cli/src/index.mjs agent-brief docs/ontology --graph-db-pack
```

Use `agent-setup` when the vault exists and only agent config needs repair:

```bash
node $ATLAS/cli/src/index.mjs agent-setup /absolute/path/to/vault --root /absolute/path/to/codebase --write
```

It creates missing `.mcp.json` and `.codex/config.toml` files without adding
starter Markdown. For a parseable existing file it atomically merges or rebinds
only the `ontology-atlas` JSON entry and TOML section and preserves unrelated
servers, sections and comments. Invalid or duplicate Atlas config is left
untouched with a merge template and a nonzero review result.

Codex ignores a project-scoped `.codex/config.toml` until it trusts the
project, and Atlas cannot inspect that trust. `agent-setup --json` therefore
reports `clientStatus.codex.projectTrust: "unknown"` and
`registration: "unverified"` until a fresh Codex session passes the trust
prompt, `codex mcp list`, and Atlas `connection_info`. If the project config is
ignored, use the generated global `codex mcp add ...` fallback, restart Codex,
and repeat those checks.

## MCP-connected use

Register the server as described in
[mcp/README.md](../mcp/README.md#1-register-with-an-agent). With it registered,
`tools/list` is the exact read and write inventory, and `mcp-verify` proves that
the advertised set, the initialize guidance and the vault agree. MCP lets the
agent fetch precise context on demand, write back to the same vault after it has
read, validated and preflighted a change, and recover from bad input through
structured repair fields, result contracts and write guardrails.

When the coding task is known and the session does not write the ontology,
register the server with `OATLAS_READ_ONLY=1` and use the shortest read-only
sequence:

```json
{ "tool": "connection_info", "arguments": {} }
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "agent_brief",
    "project": "project-slug",
    "detail": "compact",
    "task": "Describe the requested code change"
  }
}
```

When `focus.taskNavigation.status` is `ready`, read its primary, supporting and
focused-test coordinates plus any verified runner manifest in one source batch
before repository inventory or broad search. Make separately named positive and
negative regressions with exact observable output; run one focused and one
non-overlapping full check. Broaden only if current source contradicts the
reviewed evidence. Otherwise run the returned full-body read and treat exact
navigation as unknown. Do not precede this path with `workspace_brief`,
`list_concepts`, or a full `agent_brief`; those orient over the whole vault and
duplicate the known-task handoff. The measured effect of this profile, and its
limits, live in [docs/benchmark/README.md](benchmark/README.md); it is not a
claim about every MCP registration.

When no coding task is known, start read-only:

```json
{ "tool": "validate_vault", "arguments": {} }
{ "tool": "query_ontology", "arguments": { "operation": "workspace_brief" } }
{ "tool": "query_ontology", "arguments": { "operation": "agent_brief" } }
{ "tool": "query_ontology", "arguments": { "operation": "health" } }
```

Compact responses stay within 12,000 UTF-8 JSON bytes and return an exact
`detail:"full"` follow-up when the complete manuals or graph packs are needed;
the complete response is the default. Reviewed Markdown Evidence coordinates are
checked only in their named current-source files; missing, ambiguous, stale,
unsafe or unrecorded coordinates return no exact target, and there is no
repository symbol scan. `project` is mandatory when the vault has several
projects. Task text is request-local, is not stored, and does not prove source
behaviour.

Propose writes only after those checks are clean. After the person accepts
project competency answers and the agent has completed the related concept and
relation writes, `validate_vault`, and a complete compile, call
`finalize_project_meaning({ projectSlug, expected_mtime })`. The server derives
body, graph and source provenance and writes only the receipt, never raw
answers, witness text, a private absolute source root, or remote coordinates.
`ok: true` means the receipt was written, not that the project is verified; read
`agent_brief.meaningAssessment` for the fail-closed state (`verified_current`,
`review_required`, `needs_evidence`, or `invalid`). In a multi-project vault use
`query_ontology({ operation: "agent_brief", project: "SLUG" })` or
`node cli/src/index.mjs agent-brief <vault> --project SLUG`.

## Graph DB-style query pack

Start agent or terminal sessions with a plan-first scan instead of pulling the
full graph:

```bash
node $ATLAS/cli/src/index.mjs facets docs/ontology --limit 10
node $ATLAS/cli/src/index.mjs schema docs/ontology --limit 10
node $ATLAS/cli/src/index.mjs match-nodes docs/ontology --kind capability --limit 10
node $ATLAS/cli/src/index.mjs match-edges docs/ontology --type depends_on --limit 10
node $ATLAS/cli/src/index.mjs domain-matrix docs/ontology --types depends_on,relates
node $ATLAS/cli/src/index.mjs all-paths capabilities/cli-developer-entry capabilities/mcp-server docs/ontology --plan --force --max-hops 3 --types depends_on,relates
node $ATLAS/cli/src/index.mjs explain capabilities/cli-developer-entry capabilities/mcp-server docs/ontology --types depends_on,relates
```

Scan rows are candidates, not proof. `agent-setup --json` returns this
scan-to-proof checklist as `docs.graphScanProofChecklist`:

1. Report `totalMatches`, `limited`, and the returned row count from
   `match-nodes` or `match-edges`.
2. For a node row, run `node` / `node_profile` or `blast-radius` before using it
   as onboarding or refactor evidence.
3. For an edge row, run `explain`, `path`, and `relation-check` before using it
   as coupling or write evidence.
4. For path evidence, report `evidence.pathsComplete`; if it is false, narrow
   the query before writing or making an architecture claim.

## How this differs from a graph database

Atlas borrows graph database query habits for a different job.

| Need | Graph DB | ontology-atlas |
|---|---|---|
| Storage | Server or database files | Plain Markdown files in your repository or a local folder |
| Setup | Database service, schema, credentials | Pick or create a folder; no login or backend |
| Query language | Cypher, Gremlin or SPARQL style | CLI commands and MCP `query_ontology` operations |
| Source of truth | Database state | Git-tracked Markdown frontmatter |
| Human readability | Usually requires a UI or export | Every node is an editable `.md` document |
| Agent use | Agent needs DB tooling and schema context | Agent gets MCP tools, first-call guidance, result contracts and write guardrails |
| Write safety | Transaction and schema constraints | Dry-runs, `relation_check`, `expected_mtime`, validation, maintenance queues |
| Best scale | Large transactional graphs | Codebase and team memory graphs that need explainable local context |

The claim is not speed on every graph workload. For a developer's local
codebase memory, the graph is inspectable, editable, reviewable in Git, and
directly available to AI coding agents.

## Verification checks

These checks state no counts, timings or hashes; run them and read the numbers
from your own output.

CLI-only checks:

```bash
node cli/src/index.mjs agent-setup docs/ontology --json
node cli/src/index.mjs match-nodes docs/ontology --kind capability --min-degree 2 --sort degree --limit 8 --json
node cli/src/index.mjs agent-brief docs/ontology --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
node scripts/perf-graph.mjs --json --check --n=1000
```

`agent-setup` reports `operation: "agent_setup"`, `sideEffect: false`, and the
four mode ids. `match-nodes` reports `totalMatches`, `returned`, `limited`, and
`followUp.focusSlug`. The fallback check reports `ok`, `performanceOk`, and
`failed: 0`. `perf-graph` enforces its compile and query budgets and exits
nonzero when one fails.

Graph and MCP-connected checks:

```bash
node cli/src/index.mjs compile docs/ontology --summary --json   # size, hash, kind census
node cli/src/index.mjs validate docs/ontology                   # problem files
node cli/src/index.mjs health docs/ontology                     # compile issues, cycles, unresolved
node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000
```

`validate` reports no problem files, `health` reports no structural compile,
cycle or unresolved-edge errors, and `mcp-verify` passes parser, server boot,
every registered tool, strict argument and enum checks, destructive dry-runs,
batch no-write checks, briefs, graph query smokes and structured content checks.
A cold-start or unqualified vault may still report `needs_attention`:
`workspace_brief` and `agent_brief` surface an invalid, unmeasured or stale
`meaningAssessment` instead of relabelling it `healthy`, `ready` or `100`.
`healthy` and `ready` are reserved for a vault whose meaning assessment is
current and whose exact construction plan passed qualification and human
approval.

## First session

With the installed app:

1. Open the local vault folder in the app.
2. Open App Settings → AI agent and check the setup and connection card.
3. A session opened in the vault folder can use `.` as the vault path; a
   session opened at a separate codebase root passes the vault as an absolute
   path.
4. If the agent opens at a separate codebase root, copy the `agent-setup`
   command before copying manual templates.
5. Restart Claude Code, Codex, or Cursor.
6. Run the read-first verification prompt or the JSON setup gate.
7. Only then ask the agent to answer architecture questions or write ontology
   updates.

From a terminal:

1. Run `node cli/src/index.mjs validate <vault>`.
2. Run `node cli/src/index.mjs agent-brief <vault> --verify-fallbacks --json --exit-zero`.
3. Run `node cli/src/index.mjs agent-brief <vault> --graph-db-pack`.
4. Use follow-up commands before treating graph scans as evidence.
