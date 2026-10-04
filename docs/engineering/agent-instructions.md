---
title: Agent instruction and skill ownership
doc_type: runbook
status: current
area: harness
---

# Agent instruction and skill ownership

Verified on 2026-10-04 against the official guides and locally installed Claude
Code 2.1.289. Host loading is versioned behavior; recheck it before migration.

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

Both hosts support Agent Skills folders and symlinked skill directories. Claude
still discovers project skills under `.claude/skills`; native `AGENTS.md`
support does not make `.agents/skills` its discovery root. Codex discovers
`.agents/skills`. See [Claude skills](https://code.claude.com/docs/en/skills#where-skills-live)
and [Codex skills](https://developers.openai.com/codex/skills#where-codex-loads-local-skills).

A portable procedure can live once, with thin entrypoints in each host's
supported location. Use standard `name` and `description` for shared metadata;
keep host-specific invocation, tools, effort and subagent declarations in their
adapters. Do not synchronize agent briefs or hooks wholesale.

Folder symlinks are a possible later delivery form, not the current repository
layout. A real temporary fixture showed `.agents/check-instructions.mjs` ignoring
a symlinked skill directory: the target was readable, but the Claude inventory
contained zero skills. Migrate that inventory and citation coverage before
trusting a symlink rollout. Host documentation establishes support; this audit
did not measure a live symlink invocation in either host.

## Product pass assessment

Keep product boundary judgment for changed public behavior, contracts or
approval/truth authority. Behavior-preserving maintenance goes directly to
technical checks and does not need a product router receipt by default.

The closed pilot reports 103 eligible decisions, 60 reviews, a recorded material
delta rate of 96.7%, proof resolution of 68.0%, owner clarity of 50.5%, and 17
unresolved boundaries. These are historical process records, not a controlled
comparison proving the skill's benefit. The prior
[policy adjustment](../records/po-policy/04468072-6dbf-459b-af61-ed32a465b3bc.json)
kept routing but removed per-run bookkeeping. Preserve that useful boundary
check while removing repeated manuals and mandatory maintenance ceremony.

All 20 skill pairs now use one procedure per skill under
`.agents/skills/<name>/workflow.md`, with thin entrypoints in both discovery
roots. Claude phase guides point to the existing current Codex guides; scripts
and historical baseline receipts keep their original owners. The
`po-pass` workflow routes to the same
[owner procedure](../PRODUCT-OWNER-OPERATING-SYSTEM.md), loading its detailed
review protocol only for an actual review. The small rationale template stays
available to the existing discovery and contract checks. The router, approval
boundaries and reviewer selection remain unchanged.

The inventory also exposed concrete drift: Claude's motion skill still required
30 fps while Codex required at least 60 fps. Both entrypoints now use one [recording procedure](motion-recording.md), requiring
a real source at 60 fps minimum, timestamps and gap inspection; upsampling is
not proof. This is a bounded shared-procedure migration, not a wholesale merge
of every host adapter.

## Maintenance

Change the owner once and adjust adapters only for their host differences. Run
`pnpm agents:check` and `pnpm checks:changed -- --run` for instruction changes.
For a discovery or enforcement implementation change, plant an actual failing
case and restore a passing case through `gate-probe`. Never weaken a check just
to admit a missing or undiscovered skill. Keep capture and audit receipts in an
external scratch directory, outside committed instructions.
