# Agent Memory Positioning

> Current product framing for launch, README copy, and prioritization.
> Last updated: 2026-06-05.

## One-line Position

**A repo-native memory layer for Claude Code, Cursor, and Codex.**

ontology-atlas keeps a local, git-backed mental model of a codebase that AI
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

ontology-atlas becomes a real product if a new repo can show value in one short
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
- the hosted website feels like the primary product instead of intro/download
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

## Agent Builder Concerns Lens

Use this lens when deciding whether a new Ontology Atlas feature is worth adding.
The point is not to copy any agent framework UI. The point is to answer the
operational problems that experienced agent builders keep designing around.

Current research scan, 2026-06-05:

- Anthropic's agent guidance stresses that simple workflows should stay simple,
  while true agents should be reserved for open-ended loops that need tools and
  environmental feedback:
  <https://www.anthropic.com/engineering/building-effective-agents>
- Claude Code guidance repeatedly treats context as the scarce resource:
  project memory files, subagents, skills, and task-focused sessions exist to
  keep the main agent context clean and durable:
  <https://code.claude.com/docs/en/best-practices>
  <https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts>
  <https://support.claude.com/en/articles/14554000-claude-code-power-user-tips>
- OpenAI's Codex and Agents SDK guidance puts persistent repo instructions,
  issue-shaped prompts, MCP connections, approvals, and human-in-the-loop
  resumption at the center of agent development:
  <https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf>
  <https://openai.github.io/openai-agents-js/guides/mcp/>
- Cognition's agent verification writing frames async coding-agent output as
  incomplete until it includes end-to-end proof artifacts such as labeled
  screenshots, videos, and pass/fail assertions:
  <https://cognition.ai/blog/testing-development>
- Google ADK frames agent infrastructure around structured context, sessions,
  memory, tools, callbacks, traces, failures, and resumability:
  <https://adk.dev/>
- LangChain's memory work separates semantic, episodic, and procedural memory
  so agents can distinguish durable facts, prior episodes, and reusable skills:
  <https://docs.langchain.com/oss/python/deepagents/memory>
- MCP frames agent integration as a typed boundary for tools, resources, and
  prompts rather than an ad hoc pile of API calls:
  <https://modelcontextprotocol.io/>

Translate those concerns into Atlas product tests:

1. **Context selection**: Does the feature help an agent get the smallest useful
   packet instead of flooding the context window?
2. **Durable memory**: Does it turn an agent discovery into repo-backed markdown
   that the next Claude Code, Codex, or Cursor session can reuse?
3. **Tool and relation clarity**: Does it expose which MCP tool, graph query,
   node slug, relation type, or source file the agent should use next?
4. **Traceability**: Can a human see what changed, why it changed, and which
   graph proof or validation command supports it?
5. **Guardrails**: Does it fail closed before risky writes, stale assumptions,
   ambiguous relations, or unverified graph rows become committed memory?
6. **Human-in-the-loop economy**: Does it ask the developer for review at the
   right point, not on every low-value observation?
7. **Resumability**: If a session stops, can another agent reconstruct the
   working state from the vault, git diff, graph health, and saved briefs?

Near-term product implications:

- Prefer "agent-ready packets" over long explanations: selected node profile,
  blast radius, relation preflight, source file evidence, and next command in
  one copyable bundle.
- Make MCP connection and graph health visible as runtime state, not hidden in
  documentation.
- Treat draft ontology changes as first-class: staged, reviewable, discardable,
  and backed by validation before they become durable memory.
- Keep the visual UI quiet by default, but make proof, trace, and handoff
  available through popovers, collapsible panels, and copy actions.
- When adding a feature, ask whether it makes the next agent session cheaper,
  safer, or more accurate. If not, it is probably decorative.

## Positioning Guardrail

Use "ontology" in technical documentation and architecture. Use "repo-native
memory layer" in launch copy and first-contact README text.

The marketable promise is not that users can draw a better graph. The promise is
that their AI coding agent stops starting from zero.
