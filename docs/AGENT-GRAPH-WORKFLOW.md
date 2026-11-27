---
title: Agent Graph Workflow
doc_type: authority
status: current
area: agents
---

# Agent Graph Workflow

This guide is for a person or an AI coding agent working against an Atlas vault
through an MCP client. It covers what MCP `agent_brief` points to: MCP-connected
use, the graph DB-style query pack, how Atlas differs from a graph database,
and the verification checks.

`ontology-atlas` is not a hosted graph database. Markdown frontmatter is the
graph, Git is the audit log, and agents read or write through MCP when they are
connected. Atlas does not host a terminal or type commands for you. For work on
your source code it prepares config files and text that you run in the agent
session you already use; the app's own agent conversations are described in
[features/agents.md](features/agents.md).

There is no npm package. The installed macOS app carries a compiled MCP server
and connects it from the **Connect an AI agent** dialog. From a source checkout,
register `node /absolute/path/to/ontology-atlas/mcp/src/index.js`. A config that
still holds `command: "npx"` cannot start.

In the installed app, **Connect** on a tool's row writes that tool's config
files into the folder and confirms completion.

Codex ignores a project-scoped `.codex/config.toml` until it trusts the
project, and Atlas cannot inspect that trust. A Codex registration stays
unverified until a fresh Codex session passes the trust prompt,
`codex mcp list`, and Atlas `connection_info`. If the project config is
ignored, register the server globally with `codex mcp add ...`, restart Codex,
and repeat those checks.

## MCP-connected use

Register the server as described in
[mcp/README.md](../mcp/README.md#1-register-with-an-agent). With it registered,
`tools/list` is the exact read and write inventory, and the MCP verifier
(`node mcp/scripts/verify.mjs`) proves that the advertised set, the initialize
guidance and the vault agree. MCP lets the
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
limits, live in [mcp/README.md](../mcp/README.md#read-only-registration-oatlas_read_only); it is not a
claim about every MCP registration.

When no coding task is known, start read-only:

```json
{ "tool": "validate_vault", "arguments": {} }
{ "tool": "query_ontology", "arguments": { "operation": "workspace_brief" } }
{ "tool": "query_ontology", "arguments": { "operation": "agent_brief" } }
{ "tool": "query_ontology", "arguments": { "operation": "health" } }
```

Compact responses keep `structuredContent` plus the handoff text within 12,000
UTF-8 bytes and return an exact `detail:"full"` follow-up when the complete
manuals or graph packs are needed; the complete response is the default.
Reviewed Markdown Evidence coordinates are checked only in their named
current-source files; missing, ambiguous, stale,
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
`query_ontology({ operation: "agent_brief", project: "SLUG" })`.

## Graph DB-style query pack

Start agent sessions with a plan-first scan instead of pulling the full graph.
Each line is one `query_ontology` call:

```json
{ "operation": "facets", "limit": 10 }
{ "operation": "schema", "limit": 10 }
{ "operation": "match_nodes", "kind": "capability", "limit": 10 }
{ "operation": "match_edges", "type": "depends_on", "limit": 10 }
{ "operation": "domain_matrix", "types": ["depends_on", "relates"] }
{ "operation": "query_plan", "targetOperation": "all_paths", "from": "capabilities/mcp-tool-server", "to": "domains/human-workbench", "maxHops": 3 }
{ "operation": "explain_relation", "from": "capabilities/mcp-tool-server", "to": "domains/human-workbench" }
```

Scan rows are candidates, not proof. MCP `agent_brief` returns this
scan-to-proof checklist as `docs.graphScanProofChecklist`:

1. Report `totalMatches`, `limited`, and the returned row count from
   `match_nodes` or `match_edges`.
2. For a node row, run `node_profile` or `blast_radius` before using it as
   onboarding or refactor evidence.
3. For an edge row, run `explain_relation`, `path`, and `relation_check` before
   using it as coupling or write evidence.
4. For path evidence, report `evidence.pathsComplete`; if it is false, narrow
   the query before writing or making an architecture claim.

## How this differs from a graph database

Atlas borrows graph database query habits for a different job.

| Need | Graph DB | ontology-atlas |
|---|---|---|
| Storage | Server or database files | Plain Markdown files in your repository or a local folder |
| Setup | Database service, schema, credentials | Pick or create a folder; no login or backend |
| Query language | Cypher, Gremlin or SPARQL style | MCP `query_ontology` operations |
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

```bash
node scripts/perf/perf-graph.mjs --json --check --n=1000
node mcp/scripts/verify.mjs --vault docs/ontology --timeout-ms 90000
```

`perf-graph` enforces its compile and query budgets and exits nonzero when one
fails. The MCP verifier passes parser, server boot, every registered tool,
strict argument and enum checks, destructive dry-runs, batch no-write checks,
briefs, graph query smokes and structured content checks.

Over MCP, `validate_vault` reports problem files and `query_ontology` with
`health` reports structural compile, cycle and unresolved-edge errors.
A cold-start or unqualified vault may still report `needs_attention`:
`workspace_brief` and `agent_brief` surface an invalid, unmeasured or stale
`meaningAssessment` instead of relabelling it `healthy`, `ready` or `100`.
`healthy` and `ready` are reserved for a vault whose meaning assessment is
current and whose exact construction plan passed qualification and human
approval.

## First session

With the installed app:

1. Open the local vault folder in the app.
2. Open **Agents → MCP** (`/agents/?tab=mcp`; Settings → Connections → **MCP**
   opens it) and check the setup and connection card.
3. A session opened in the vault folder can use `.` as the vault path; a
   session opened at a separate codebase root passes the vault as an absolute
   path.
4. Restart Claude Code, Codex, or Cursor.
5. Run the read-first verification prompt.
6. Only then ask the agent to answer architecture questions or write ontology
   updates.
