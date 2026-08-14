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
2. Create new nodes through the workbench Studio, MCP `add_concept`, or the
   source-checkout CLI. These writers mint the immutable UID; do not copy a
   starter file and its identity. After setting `$ATLAS` as shown below:
   ```bash
   node $ATLAS/cli/src/index.mjs add domain auth --title="Authentication" --vault .
   ```
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

**If you don't**, run the agent setup command once from an Ontology Atlas
source checkout. Both angle-bracket parts are yours to fill in with real
absolute paths — the checkout you cloned, and this vault folder:

```bash
node <ontology-atlas checkout>/cli/src/index.mjs agent-setup <this vault folder> --root . --write
```

It creates missing Claude Code / Cursor / Codex config files without adding
starter markdown. In a parseable existing file it changes only the
`ontology-atlas` entry and preserves unrelated servers and sections. Invalid
or duplicate Atlas config stays untouched. To merge by hand instead, open
`.mcp.json.example`, replace the `OATLAS_VAULT` placeholder with the absolute
path to this vault, then copy that server entry into your agent config. The
CLI writes `.mcp.json` and `.codex/config.toml` pointing at the checkout's
`mcp/src/index.js`. Codex loads the project file only after you trust this
folder. Approve its trust prompt, run `codex mcp list` here, and confirm
`ontology-atlas` appears before any write. A parseable existing review
template keeps its unrelated entries while Atlas is rebound; a malformed
template is preserved and the current binding is written beside it as an
`.ontology-atlas-current.example` sidecar.

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
`mcp-verify` to prove that the server can read this vault.

Start with `connection_info`, `list_kinds`, `validate_vault`, and
`query_ontology({ operation: "agent_brief" })`. Write only after the read-first
checks are clean and the person accepts the proposed meaning.

Details: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
