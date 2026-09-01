# Codebase Ontology Positioning

> Current product framing for launch, README copy, and prioritization.
> Last updated: 2026-09-01.

## One-line Position

**Understand what your codebase builds, why it is structured that way, and what
a change will affect.**

Ontology Atlas is a local-first codebase ontology workbench. It keeps product
meaning, capability boundaries, implementation evidence, dependencies, and
impact in Markdown beside the code. People and AI agents read and maintain the
same ontology; Git diffs remain the judgment surface.

The campaign lens is the human-comprehension gap created by agent-speed
development:

> AI agents can change a codebase faster than people can review every line.
> Atlas shows what the codebase has become at the capability and boundary level
> before a person accepts the work.

This sharpens the motivating moment without replacing the category or the
one-line position. It is not a `100x` claim and it does not claim faster work,
better code, lower token use, automatic semantic detection, or exhaustive
coverage.

## The User Problem

Source code is good at showing *how* a system works. After an AI agent changes
it, a maintainer who did not follow every edit can have an exact diff and still
be unable to state what product-level thing the codebase has become. The missing
answers matter after one agent turn and before accepting the work, handing it
off, or starting the next task:

- which capability, boundary, dependency, or evidence claim changed
- which domains and capabilities exist
- which files implement which capability
- which dependencies matter before changing a module
- which architectural decisions were already discovered
- which documentation is canonical and which is stale
- which parts of the agent's account remain unsupported or unknown

Without a codebase ontology, those answers remain scattered across source,
docs, tickets, an agent transcript, and people's heads. A maintainer must
reconstruct them after consequential work and again before the next change;
two readers can reach different answers without a reviewable place to reconcile
them.

The current alternatives each retain their authority and their limit:

| Surface | What it is good at | What Atlas adds |
|---|---|---|
| Git diff | Exact lines and files that changed | The reviewed capability, boundary, rationale, evidence, and unknown those lines now implement |
| Producing agent's summary | A compact account of its own work | A durable claim another person can correct, reject, or accept independently of that session |
| Source search, AST indexes, language servers, CodeGraph | Definitions, callers, imports, routes, and structural paths | The product meaning and verification path that explain why those facts matter |

The minimum supported path is intentionally plain: connect Atlas MCP or run the
Atlas CLI from Claude Code, Codex, Cursor, or another coding agent, and the agent
should already receive a useful workspace brief, graph health check, handoff
packet, and reviewable memory-diff workflow. No CodeGraph, Serena, language
server, grep wrapper, or external source-index service is required for the
product to be usable.

AI coding agents benefit because the answers survive between sessions, but
agent memory is a benefit rather than the product category.

Atlas should not promise to replace code-reading tools. Built-in source search,
grep, language servers, Serena, CodeGraph, AST indexes, and similar tools are
good at structural facts: definitions, callers, imports, routes, and local
impact paths. Atlas helps the coding agent one layer above that: it preserves
the task starting point, product meaning, capability boundary, implementation
evidence, and validation path that explain why those code facts matter.

## Product Bet

The product is not valuable because it can edit arbitrary ontologies, and it is
not valuable because it duplicates a code index. It is valuable when the
ontology explains a real codebase and stays current as that codebase changes.

The core loop is:

1. Open a repo and generate an ontology draft automatically.
2. Let the agent implement real code work, then explicitly propose the
   capability, boundary, dependency, evidence, or uncertainty that changed.
3. Let the developer correct, reject, or accept that semantic delta through
   readable Markdown and a Git diff.
4. Let the next human or agent retrieve the accepted state rather than trust the
   producing session's summary.

That loop is the product. AI-agent continuity is one payoff; shared and
reviewable codebase understanding is the broader outcome.

The coding-agent value is therefore not "Atlas reads all code for you." The
value is "Atlas tells the agent what to inspect, why it matters, and what must
be verified before acting." Store meaningful implementation evidence as
`element` nodes and relations; leave exhaustive symbol graphs to deterministic
code-intelligence tools.

## Why This Can Matter

The strongest positioning is the concrete outcome:

> Understand what your codebase builds, why it is structured that way, and what
> a change will affect.

The strongest campaign hook names the moment that makes that outcome urgent:

> Agents write the code. People accumulate the cognitive debt.
>
> Atlas keeps what the code means reviewable before the work is accepted.

This is clearer than either implementation-first or memory-first framing:

> Local-first ontology graph workbench with deterministic compiler and MCP tools.

> Give your AI coding agent a local, git-backed memory.

The first alternative leads with implementation language. The second reduces
the product to one audience and makes it sound like a conversation-memory store.
The current line names the decision a person is trying to make.

## Success Conditions

Ontology Atlas becomes a real product if a new repo can show value in one short
loop:

```text
init -> bootstrap -> agent changes code -> agent proposes a semantic delta
-> developer corrects/approves the Markdown diff -> next session retrieves it
```

Target: the first visible value should appear within 10 minutes.

## Failure Conditions

The product fails if users feel they must become general-purpose ontology
maintainers before they understand their codebase.

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

Use the plain outcome in launch copy and first-contact README text. Use
"codebase ontology workbench" to name the category. Use "agent memory" only for
the specific continuity benefit, never as the master identity.

Campaign copy may open with the after-agent, before-acceptance comprehension
gap, but it must resolve immediately to the review object: changed capabilities,
boundaries, dependencies, evidence, provenance, and unknowns. The reusable
contrast is:

```text
Git shows which lines changed.
The producing agent says what it claims it did.
Atlas preserves what a person reviewed the codebase to mean.
```

Do not lead with frontmatter, MCP inventory, agent forgetting, or token use.
Those are mechanism details or benefits after the product outcome is clear.
Never publish `100x`, speed, quality, cost, completeness, or automatic-current
claims without a separate measurement that directly supports them.

The promise is not that users can draw a better graph or model arbitrary
knowledge. The promise is that they can see what a codebase builds, why it has
its current shape, and what a change will affect.

When explaining the code side, use this boundary:

```text
Built-in search, grep, language servers, Serena, CodeGraph, and source indexes
find code structure.
Ontology Atlas preserves product/system meaning, implementation evidence, and
the next verification path for humans and AI agents.
```
