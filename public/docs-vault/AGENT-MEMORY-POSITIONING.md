# Agent Memory Positioning

> Current product framing for launch, README copy, and prioritization.
> Last updated: 2026-05-18.

## One-line Position

**A repo-native memory layer for Claude Code, Cursor, and Codex.**

oh-my-ontology keeps a local, git-backed mental model of a codebase that AI
coding agents can read, query, and maintain through MCP.

## The User Problem

AI coding agents are useful, but they forget the durable structure of a
codebase between sessions:

- which domains and capabilities exist
- which files implement which capability
- which dependencies matter before changing a module
- which architectural decisions were already discovered
- which documentation is canonical and which is stale

Without a shared memory layer, every agent session starts by re-discovering the
same project shape from source files and chat history.

## Product Bet

The product is not valuable because it is "an ontology editor." Developers do
not want another system they must manually maintain.

The product is valuable if it reduces the maintenance cost of AI-agent memory:

1. Open a repo and generate an ontology draft automatically.
2. Let the agent propose mental-model changes after real code work.
3. Let the developer review those changes like a git diff.
4. Make the next agent session visibly better because the memory is already in
   the repo.

That loop is the product. The ontology graph is the implementation substrate.

## Why This Can Matter

The strongest positioning is:

> Your AI coding agent forgets your codebase. Give it a local, git-backed memory
> it can read and maintain.

This is stronger than:

> Local-first ontology graph workbench with deterministic compiler and MCP tools.

The second sentence is technically accurate, but it leads with implementation
language. The first sentence leads with the daily pain of AI-assisted coding.

## Success Conditions

oh-my-ontology becomes a real product if a new repo can show value in one short
loop:

```text
init -> bootstrap -> agent answers better through MCP -> agent proposes sync
-> developer reviews diff -> next task benefits
```

Target: the first visible value should appear within 10 minutes.

## Failure Conditions

The product fails if users feel they must become ontology maintainers before
they get value.

Risk signals:

- onboarding starts with manual node authoring
- the web UI feels like the primary product instead of an optional workbench
- agent sync is not visible in git diffs
- `health`, `workspace_brief`, and `maintenance_plan` explain problems but do
  not lead to obvious next actions
- bootstrap produces a graph that looks impressive but does not improve the
  next agent interaction

## What The Recent Engine Work Enables

The recent compiler/MCP/CLI work is meaningful because it supports the memory
loop:

- `compile_ontology` turns markdown frontmatter into a deterministic graph
  artifact with `graphHash`, issue counts, aliases, pagination, and optional
  indexes.
- `query_ontology` lets agents ask graph-database-like questions without
  pulling the whole vault into context.
- `health` and `workspace_brief` give first-contact diagnosis before an agent
  starts editing.
- `maintenance_plan` turns graph cleanup into an ordered work queue.
- Structured MCP schemas and error codes let agents recover from bad calls
  instead of parsing fragile prose.
- `analyze_repo_structure` and `infer_imports` reduce the cost of creating the
  first draft from code.

This is the difference between a markdown graph toy and an agent-usable memory
workbench.

## Positioning Guardrail

Use "ontology" in technical documentation and architecture. Use "repo-native
memory layer" in launch copy and first-contact README text.

The marketable promise is not that users can draw a better graph. The promise is
that their AI coding agent stops starting from zero.
