---
title: Agent instruction and skill ownership
doc_type: runbook
status: current
area: harness
---

# Agent instruction and skill ownership

Host loading is versioned behavior; recheck the linked guides before migrating.

## Instruction files

`AGENTS.md` owns the common repository contract. Keep `CLAUDE.md` as a small
Claude adapter importing `@AGENTS.md`: this remains compatible with older
sessions and retains Claude-specific rule and hook ownership. Do not enable a
second direct load of the same content without removing the import.

Claude Code documents native `AGENTS.md` support from 2.1.277. Its default uses
`CLAUDE.md` instead when one exists in the working directory or an ancestor;
local instruction files also affect that choice. Therefore, deleting this
repository's adapter is not enough to establish which file loads in every
session. See [Claude instruction loading](https://code.claude.com/docs/en/memory#agentsmd).

Codex follows `AGENTS.md` from the repository root toward the working directory,
with more local instructions applying to their scope. It has its own override
and discovery behavior; a Claude rule glob is not a Codex loader. See
[Codex instructions](https://developers.openai.com/codex/guides/agents-md).

## Skills and host adapters

| Owner | Purpose |
|---|---|
| `AGENTS.md` | Short common constraints and workflow entrypoints |
| `CLAUDE.md` | Claude loading and hook ownership |
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
   entry, a row in README's command table and a CI lane in
   `scripts/classify-change.mjs`. The skill names the command and how to judge
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
| `pnpm po:route`, `pnpm design:route` | how much product review and which UI proof a change needs |
| `pnpm brief:new` | a delegation brief's mechanical lines |
| `pnpm conflicts:scan` | open pull requests touching the same files |
| `pnpm harness:tokens` | where agent tokens went and which runs broke the budget |

## Product check

`/product-check` keeps boundary judgment for changed public behavior,
contracts, or truth and approval authority; behavior-preserving maintenance
goes straight to technical checks. It routes through
[the owner procedure](../PRODUCT-OWNER-OPERATING-SYSTEM.md) and loads its review
protocol only for an actual review. Motion proof follows one
[recording procedure](motion-recording.md) for both hosts.

## Maintenance

Change the owner once and adjust adapters only for host differences. Run
`pnpm agents:check` and `pnpm checks:changed -- --run` after instruction
changes. For a discovery or enforcement change, plant a failing case and restore
a passing one through `/gate-probe`. Never weaken a check to admit a missing
skill.
