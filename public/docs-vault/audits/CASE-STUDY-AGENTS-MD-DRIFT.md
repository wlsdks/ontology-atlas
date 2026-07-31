# Case Study: Avoiding AGENTS.md / CLAUDE.md Drift

> How this repo keeps its own instruction files in sync, and why the same
> pattern extends into the vault for facts that change faster than
> instructions do. Written from this repo's own history, not a hypothetical.

## The problem, as the community describes it

Multiple coding-agent instruction files (`AGENTS.md`, `CLAUDE.md`,
`GEMINI.md`, `.github/copilot-instructions.md`, …) are now a common setup for
any repo touched by more than one AI tool. Community reporting on the result
is consistent:

- **Hacker News, "A good AGENTS.md is a model upgrade"**
  ([discussion](https://news.ycombinator.com/item?id=47938417)) — one
  commenter (`forgotusername6`) reported that VS Code Copilot "often" misses
  nested `AGENTS.md` files, a discovery mismatch between tools. Another
  (`kajman`) noted that "every attempt I've made to quickly get an LLM to
  one-shot an AGENTS file has been too verbose in all the wrong areas."
- **Lobsters, "AGENTS.md as a dark signal"**
  ([discussion](https://lobste.rs/s/x0qrlm/agents_md_as_dark_signal)) —
  `ChaelCodes` asked the pointed question directly: "Why do the robots need
  extra hints that human collaborators don't get?" — a proxy for the real
  cost, which is that someone has to keep those hints correct.
- **kau.sh, "Keep your AGENTS.md in sync"**
  ([post](https://kau.sh/blog/agents-md/)) — names the failure mode plainly:
  "When developers use more than one tool, things drift fast... The same
  setup steps and style rules get duplicated in different formats, and the
  moment your project changes, those files drift out of sync." The post goes
  on to describe a small ecosystem of third-party sync tools that exists
  specifically to patch this gap.

The shape of the problem is always the same: two or more files claim to
describe the same working rules, nobody owns keeping them equal, and they
silently disagree.

## What this repo actually does about it

This repo has carried both `AGENTS.md` and `CLAUDE.md` since before this case
study was written, and the fix is deliberately boring:

- `AGENTS.md` is the single canonical source. Every rule — architecture,
  product gates, testing, git workflow, forbidden patterns — is written there
  once.
- `CLAUDE.md` is a thin wrapper. Its entire body is one import line,
  `@AGENTS.md`, plus a short "Claude Code only" section for things that
  genuinely don't apply to other tools (skills, hooks, the design-guardian
  subagent). See the current file: [`CLAUDE.md`](../CLAUDE.md).
- The sync rule is written down as policy, not left to memory —
  `AGENTS.md`'s own "CLAUDE.md / AGENTS.md sync" section states it directly:
  *"AGENTS.md 가 single source of truth... 이 파일은 thin wrapper... AGENTS.md
  를 수정해도 이 파일은 그대로 일관성을 유지한다"* (AGENTS.md is the single
  source of truth; this file is a thin wrapper; editing AGENTS.md keeps this
  file consistent without a second edit).
- Drift between the two is listed as a named forbidden pattern in
  [`.claude/rules/forbidden.md`](../.claude/rules/forbidden.md), under
  "문서" (documentation): *"AGENTS.md 와 CLAUDE.md 가 비동기"* — AGENTS.md and
  CLAUDE.md being out of sync is treated the same as a shipped bug, not a
  documentation nice-to-have.

The mechanism is not clever — it is import-instead-of-duplicate. But it means
there is structurally only one place to edit, so the "which file is
current?" question the community reports never comes up in this repo. This
document is itself the evidence: it points at real files in this repo, not a
description of a technique used somewhere else.

## The vault extends the same pattern to facts that change

`AGENTS.md`/`CLAUDE.md` solves drift for **static instructions** — the rules
an agent should follow regardless of what it is working on this week. It does
not solve the harder problem: a codebase's domains, capabilities, and
implementation evidence change *with every feature*, and a single
instruction file can't stay both current and short.

That is a close match for what the community calls **context rot** — the
term (coined on Hacker News by user `Workaccount2`, since adopted broadly)
for an agent that starts "forgetting the function it wrote an hour ago,
reintroducing a bug you already fixed" as a session grows
([braingrid.ai](https://www.braingrid.ai/blog/context-rot),
[producttalk.org](https://www.producttalk.org/context-rot/)). The mitigation
those write-ups converge on is exactly this shape: *"Moving persistent
information out of the conversation and into reference files that the agent
can consult rather than carry. Instead of restating your project rules,
conventions, and constraints in every session, you write them once into a
permanent reference file."*

`AGENTS.md` is one permanent reference file, for instructions. The vault
(`docs/ontology/` in this repo, or any vault folder pointed at by
`ontology-atlas init`) is the same pattern applied to the part instructions
can't cover: which domain a piece of code belongs to, which capability it
proves, what it depends on, and what changed recently. An agent calls
`get_concept` or `workspace-brief` instead of re-deriving that mental model
from source files and chat history every session — the same "consult a
reference file instead of restating it" move, aimed at facts instead of
rules. See [`mcp/README.md`](../mcp/README.md) for the tool surface an agent
uses to read and write that reference file, and
[`AGENTS.md`](../AGENTS.md#working-with-the-ontology-while-you-code) for how
this repo's own agents are told to use it.
