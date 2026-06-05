---
slug: README
kind: vault-readme
title: My ontology vault
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

Prefer an automatic first graph? From your codebase root:

```bash
oh-my-ontology bootstrap . --vault <this-folder>
```

The command analyzes `package.json`, README headings, and `src/` layout,
then replaces untouched starter examples with real project/domain/capability
nodes. If you edited a starter file, it is preserved.

## AI agent setup

If this vault came from `oh-my-ontology init` or the installed app starter,
the vault folder already has:

- `.mcp.json` for Claude Code / Cursor
- `.codex/config.toml` for Codex

Open the vault folder itself in the agent and restart it. Both config files use
`OMOT_VAULT=.`, so the agent reads and writes this folder directly.

If you prefer to keep the agent opened at a separate codebase root, use the
CLI repair path from that codebase root:

```bash
oh-my-ontology agent-setup /absolute/path/to/this-vault --root . --write
```

It creates missing Claude Code / Cursor / Codex config files without adding
starter markdown or overwriting existing configs. If you need a manual merge
instead, open `.mcp.json.example`, replace the `OMOT_VAULT` placeholder with
the absolute path to this vault, then copy that server entry into your agent
config.

Codex can also be wired globally with one command:

  ```bash
  codex mcp add oh-my-ontology --env OMOT_VAULT=/absolute/path/to/this-vault -- npx -y oh-my-ontology-mcp
  ```

## Verify the agent loop

After restarting the agent, ask it to prove the connection before it edits
anything:

> Use the oh-my-ontology MCP server to run `validate_vault`, then
> `query_ontology({ "operation": "workspace_brief" })`, then
> `query_ontology({ "operation": "agent_brief" })`, then
> `query_ontology({ "operation": "health" })`,
> `query_ontology({ "operation": "cycles", "maxHops": 8 })`,
> `query_ontology({ "operation": "growth_plan", "limit": 20 })`, and
> `query_ontology({ "operation": "maintenance_plan", "limit": 20 })`. Tell me
> whether this vault is readable, graph-clean enough, and the write tools are
> available before proposing changes.

If the CLI is installed, the same first-contact check is:

```bash
oh-my-ontology validate .
oh-my-ontology workspace-brief .
oh-my-ontology agent-brief . --prompt
oh-my-ontology agent-brief . --graph-db-pack
oh-my-ontology agent-brief . --verify-fallbacks
oh-my-ontology cycles . --max-hops 8
oh-my-ontology growth . --limit 20
oh-my-ontology maintenance . --limit 20
oh-my-ontology mcp-verify . --timeout-ms 15000
```

For automation that wants a small JSON report instead of human terminal output:

```bash
oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
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

Once you register the `oh-my-ontology-mcp` server, the agent gets 23
tools to read/write this vault:

- **read 16**: list_concepts / get_concept / get_concepts / find_evidence /
  find_backlinks / find_neighbors / find_path / list_kinds / find_orphans /
  query_concepts / compile_ontology / query_ontology / validate_vault /
  analyze_repo_structure / infer_imports
- **write 8**: add_concept / add_concepts / add_relation / add_relations /
  patch_concept / delete_concept / rename_concept / merge_concepts

Details: https://github.com/wlsdks/oh-my-ontology/tree/main/mcp
