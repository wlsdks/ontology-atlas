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
element / document), and the frontmatter at the top of each file is the graph.

In this vault, an ontology is an executable meaning model for a codebase:
five authorable kinds and typed relations that explain scope, dependency,
association, and description. The exact includes/excludes, examples,
counterexamples, direct `is_a` test, and inference boundary have one source:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## Get started in 5 minutes

1. Open `project.md` and write your project's name and description.
2. Create new nodes through the map's editor or MCP `add_concepts`. These
   writers mint the immutable UID; do not copy a starter file and its identity.
3. Use the same writer path for capabilities and elements.
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

**If you don't**, merge the server entry by hand: open `.mcp.json.example`,
replace the `OATLAS_VAULT` placeholder with the absolute path to this vault,
then copy that server entry into your agent config. Codex loads a project
`.codex/config.toml` only after you trust this folder. Approve its trust
prompt, run `codex mcp list` here, and confirm `ontology-atlas` appears before
any write.

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

## Kinds and relations

Use the specification linked above rather than guessing from a folder name.
`project`, `domain`, `capability`, `element`, and `document` are authorable;
`vault-readme` is generated and reserved. `broader:` is a validated storage key
that the app renders as `is_a`, but the current public MCP relation API does not
accept `broader` or `is_a`. The connected agent receives the exact guarded
`patch_concept` fallback in its server instructions.

## What an AI agent can do for you

Once you register the `ontology-atlas-mcp` server, the running server gives the
agent its current read/write inventory. Use `tools/list` for the exact names and
`validate_vault` to prove that the server can read this vault.

Start with `connection_info`, `list_concepts`, `validate_vault`, and
`query_ontology({ operation: "agent_brief" })`. Write only after the read-first
checks are clean and the person accepts the proposed meaning.

Details: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
