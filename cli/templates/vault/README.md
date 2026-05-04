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
5. To see the graph, point a self-hosted workbench's `/docs` picker at
   this folder.

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

Once you register the `oh-my-ontology-mcp` server, the agent gets 14
tools to read/write this vault:

- **read 8**: list_concepts / get_concept / find_evidence / find_backlinks /
  find_path / list_kinds / find_orphans / query_concepts
- **write 6**: add_concept / add_relation / patch_concept / delete_concept /
  rename_concept / merge_concepts

Details: https://github.com/wlsdks/oh-my-ontology/tree/main/mcp
