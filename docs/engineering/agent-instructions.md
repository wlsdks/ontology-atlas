---
title: Agent instruction and skill ownership
doc_type: runbook
status: current
area: harness
---

# Agent instruction and skill ownership

Host loading is versioned behavior; recheck the linked guides before migrating.

## Instruction files

`AGENTS.md` is the only root instruction file. It owns the common repository
contract and the Claude-specific loading and hook ownership that a `CLAUDE.md`
adapter used to carry.

Claude Code reads `AGENTS.md` directly from 2.1.277, but only when no
`CLAUDE.md`, `CLAUDE.local.md` or `CLAUDE.md` inside a `.claude` folder exists in
the working directory or an ancestor; any of those replaces it. So the
repository commits none (`rules-path-scope.contract.test.ts` refuses all
three at the root, a personal `CLAUDE.local.md` included). A profile whose
`CLAUDE_CONFIG_DIR` is not `~/.claude` counts `~/.claude/CLAUDE.md` as an
ancestor file and needs the user setting **Project instructions** =
`claude-md-and-agents-md` in that profile. Without it the failure is silent:
only `.claude/rules/` loads, and `AGENTS.md` does not.
`.claude/rules/` loads alongside `AGENTS.md`; a nested `AGENTS.md` loads when
Claude reads a file in its directory. See
[Claude instruction loading](https://code.claude.com/docs/en/memory#agentsmd).

Codex follows `AGENTS.md` from the repository root toward the working directory,
with more local instructions applying to their scope. It has its own override
and discovery behavior; a Claude rule glob is not a Codex loader. See
[Codex instructions](https://developers.openai.com/codex/guides/agents-md).

## Loading and hooks

`AGENTS.md` is the only root instruction file: Claude Code reads it directly,
and a root `CLAUDE.md` would replace it. `.claude/rules/` always loads `forbidden`,
`git` and `local-first`; `design`, `design-gates`, `architecture`, `testing`,
`surfaces` and `documentation` load by their frontmatter paths
(`rules-path-scope.contract.test.ts`). Making a rule resident updates that
contract, this section, and the commit's reason together. Codex loads no rule
by itself. Claude discovers skills in `.claude/skills/`, Codex in
`.agents/skills/`.

`.claude/settings.json` owns Claude permissions and hooks, `.codex/hooks.json`
Codex hooks; Codex skips a new or changed entry until a person trusts it in
`/hooks`. Hooks block irreversible commands, report lint and language findings
at edit time, and inject the vault census at session start; each header says
why. Each has a `.codex/hooks/` adaptation (a Codex edit is an `apply_patch`
envelope), not a copy, except Codex-only
`block-secret-read.sh` (Claude uses `permissions.deny`) and Claude-only
`session-length.sh` (it reads Claude's transcript). `pnpm test:claude:hooks`
guards the wiring.

## Skills and host adapters

| Owner | Purpose |
|---|---|
| `AGENTS.md` | Short common constraints, workflow entrypoints, harness loading and hook ownership |
| `.claude/rules/` | Topic authorities; Claude path loading, explicit Codex reads |
| `.agents/skills/*/SKILL.md` | Codex discovery metadata and entrypoint |
| `.agents/skills/*/workflow.md` | Shared procedure for both hosts |
| `.claude/skills/*/SKILL.md` | Claude discovery metadata and entrypoint |
| Existing owner guide or skill reference | One maintained procedure, read only when needed |
| `.agents/agents/`, `.claude/agents/` | Host-specific delegation metadata and briefs |
| `.codex/hooks.json`, `.claude/settings.json` | Host-specific enforcement; keep separate |

Claude discovers project skills under `.claude/skills`; Codex discovers
`.agents/skills`. Each skill keeps one shared procedure in
`.agents/skills/<name>/workflow.md` and a thin entrypoint in both roots, with
host-specific invocation, tools and agent notes only in the entrypoints
([Claude skills](https://code.claude.com/docs/en/skills#where-skills-live),
[Codex skills](https://developers.openai.com/codex/skills#where-codex-loads-local-skills)).
`.agents/check-instructions.mjs` does not follow symlinked skill folders, so
keep real folders.

## Designing a skill

1. **Script what source can answer.** A check that code, Git or a rendered page
   can answer is a script: `scripts/<name>.mjs` with a node test, a `pnpm`
   entry, a row in the command table of `docs/DEVELOPMENT-CHECKS.md` and a CI lane in
   `scripts/ci/classify-change.mjs`. The skill names the command and how to judge
   its output; it never carries a probe or a recipe for the agent to retype.
2. **Name the moment.** One or two plain words for when it is used (`ui-build`,
   `ui-proof`, `land`), no product, vendor or person names. The description
   says when to use it and the command it starts from.
3. **Stay small.** One `workflow.md` of about 5KB at most; detail only some runs
   need goes in `guides/<topic>.md`, linked from the workflow. Extend one of
   the existing skills before adding another.
4. **Leave no records.** A skill writes nothing into the repository except the
   change: no plans, logs, retrospectives, ledgers or handoffs. Reasons go in
   commit bodies and pull requests; working files in the session scratchpad.

| Command | Answers |
|---|---|
| `pnpm checks:changed` | which gates a change needs, and runs them |
| `pnpm review:facts` | line growth, 800-line files, export and dependency changes, untouched sibling tests, security paths |
| `pnpm ui:audit` | rendered overflow, occlusion, targets, off-ramp values, contrast, repeated sets, scroll end |
| `pnpm design:tokens` | the current token ramps |
| `pnpm ui:look` | a screenshot of a route with a vault open, per width |
| `pnpm brief:new` | a delegation brief's mechanical lines |
| `pnpm conflicts:scan` | open pull requests touching the same files |
| `pnpm harness:tokens` | where agent tokens went and which runs broke the budget |

## Product judgment

A one-way change (the `AGENTS.md` workflow table) follows
[the owner procedure](../PRODUCT-OWNER-OPERATING-SYSTEM.md) and gets one
`code-reviewer`; behavior-preserving maintenance goes straight to technical checks.
Motion proof follows one [recording procedure](motion-recording.md) for both
hosts.

## Maintenance

Change the owner once and adjust adapters only for host differences. Run
`pnpm agents:check` after instruction changes and select any other checks from
`pnpm checks:changed` for the actual risk. For a discovery or enforcement change, plant a failing case and restore
a passing one through `/gate-probe`. Never weaken a check to admit a missing
skill.
