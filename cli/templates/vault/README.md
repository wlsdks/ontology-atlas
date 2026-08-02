---
slug: README
kind: vault-readme
title: My ontology vault
display_ko: 내 온톨로지 문서함
display_en: My ontology vault
---

# My ontology vault

This folder is **a codebase mental model that humans and AI agents grow
together**. Every `.md` file is one node (project / domain / capability /
element / concept), and the frontmatter at the top of each file is the
graph's keys (slug / kind / depends_on / capabilities / elements / domain).

In this vault, an ontology is an executable meaning model for a codebase:
projects, domains, capabilities, elements, and typed relations that explain
ownership, dependency, evidence, and change impact.

## Get started in 5 minutes

1. Open `project.md` and write your project's name and description.
2. When a new domain comes to mind, add `<slug>.md` under `domains/`:
   ```markdown
   ---
   slug: domains/auth
   kind: domain
   title: Authentication
   capabilities:
     - capabilities/login
     - capabilities/signup
   ---

   Owns user authentication, sessions, and permissions.
   ```
3. Same pattern for capability and element — under `capabilities/` and `elements/`.
4. Register an AI agent (Claude Code, Cursor, …) and it reads/writes the
   same vault, growing it alongside you.
5. To see the graph, open the workbench's `/docs` picker and point it at
   this vault folder.

## AI agent setup

There are two ways to connect an agent to this vault.

**If you have the installed Ontology Atlas app**, open this folder in it and
press the connect button. The app writes the Claude Code / Cursor / Codex
config for you: it already knows this folder's real path, and it carries the
MCP server inside its own bundle. No terminal, no Node, no install step.

**If you don't**, run the agent setup command once from an Ontology Atlas
source checkout. Both angle-bracket parts are yours to fill in with real
absolute paths — the checkout you cloned, and this vault folder:

```bash
node <ontology-atlas checkout>/cli/src/index.mjs agent-setup <this vault folder> --root . --write
```

It creates missing Claude Code / Cursor / Codex config files without adding
starter markdown or overwriting existing ones. To merge by hand instead, open
`.mcp.json.example`, replace the `OATLAS_VAULT` placeholder with the absolute
path to this vault, then copy that server entry into your agent config. The
CLI writes `.mcp.json` and `.codex/config.toml` pointing at the checkout's
`mcp/src/index.js`.

## Verify the agent loop

After restarting the agent, ask it to prove the connection before it edits
anything:

> Use the ontology-atlas MCP server to run `validate_vault`, then
> `query_ontology({ "operation": "workspace_brief" })`, then
> `query_ontology({ "operation": "agent_brief" })`, then
> `query_ontology({ "operation": "health" })`,
> `query_ontology({ "operation": "cycles", "maxHops": 8 })`,
> `query_ontology({ "operation": "growth_plan", "limit": 20 })`, and
> `query_ontology({ "operation": "maintenance_plan", "limit": 20 })`. Tell me
> whether this vault is readable, graph-clean enough, and the write tools are
> available before proposing changes.

From an Ontology Atlas source checkout, the same first-contact check runs
through the CLI. Point `$ATLAS` at the checkout **folder** once — the same meaning every
other Atlas surface uses — then:

```bash
export ATLAS=<path to your ontology-atlas source checkout>

node $ATLAS/cli/src/index.mjs validate .
node $ATLAS/cli/src/index.mjs workspace-brief .
node $ATLAS/cli/src/index.mjs agent-brief . --prompt
node $ATLAS/cli/src/index.mjs agent-brief . --graph-db-pack
node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks
node $ATLAS/cli/src/index.mjs cycles . --max-hops 8
node $ATLAS/cli/src/index.mjs growth . --limit 20
node $ATLAS/cli/src/index.mjs maintenance . --limit 20
node $ATLAS/cli/src/index.mjs mcp-verify . --timeout-ms 15000
```

For automation that wants a small JSON report instead of human terminal output:

```bash
node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
```

For an agent opened at your codebase root instead of this vault folder, replace
`.` with the vault path, for example `./ontology`.

## Relations (frontmatter keys)

| Key | What it expresses |
|---|---|
| `depends_on: [<slug>, ...]` | This node depends on other nodes |
| `capabilities: [...]` | Capabilities this domain / project provides |
| `elements: [...]` | Elements this capability / domain uses |
| `domain: <slug>` | Parent domain of this capability/element |
| `relates: [...]` | Loose related-to references |

## Kinds

- `project` — Top-level. Usually one per workspace.
- `domain` — A large area (auth, billing, builder, …).
- `capability` — A user-visible feature inside a domain (login, signup, …).
- `element` — A smaller unit a capability uses (jwt-token, otp-store, …).
- `document` — Evidence node (markdown doc backing other concepts).

## What an AI agent can do for you

Once you register the `ontology-atlas-mcp` server, the agent gets 33
tools to read/write this vault:

- **read 19**: connection_info / git_status / git_history / list_concepts / get_concept / get_concepts / find_evidence /
  find_backlinks / find_neighbors / find_path / list_kinds / find_orphans /
  query_concepts / compile_ontology / query_ontology / validate_vault /
  analyze_repo_structure / infer_imports / index_project
- **write 14**: absorb_document / add_concept / add_concepts / add_relation / add_relations /
  remove_relation / replace_relation / patch_concept / reclassify_concept /
  delete_concept / rename_concept / merge_concepts / git_snapshot / finalize_project_meaning

Details: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
