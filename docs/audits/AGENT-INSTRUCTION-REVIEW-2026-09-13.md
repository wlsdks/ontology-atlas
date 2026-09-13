# Independent harness and skill review — 2026-09-13

## Decision and scope

Codex and Claude own separate instructions, resources, and model choices. The
owner explicitly rejected keeping the two harnesses identical. This change
optimizes `AGENTS.md` and `.agents/` for the current Astra session while retaining
Claude skills, role briefs, and `CLAUDE.md`. The one Claude hook that demanded
cross-harness synchronization now reports integrity failures only. Shared product truth and authorization remain
repository contracts; identical prose is no longer their proxy.

Source baseline: `d97178f31`. Review covered all 18 repository skill descriptions,
15 Codex seat metadata blocks, selected workflow bodies, root instructions,
integrity/routing gates, and the Codex configuration rationale. This is an
instruction and structural review, not a benchmark of model task performance.

The [September 11 OpenAI article](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
recommends short precise descriptions, conditional reference loading, contextual
repository instructions, calibrated action boundaries, and explicit completion.
It also cautions that instructions useful for one model can overconstrain
another. These are reasons to examine our routing, not evidence that removing
Atlas meaning qualification or human acceptance improves results.

The [September 5 review](AGENT-INSTRUCTION-REVIEW-2026-09-05.md) already addressed
approval reuse and proportional verification. Current source confirms those
improvements; this revision removes the cross-harness equality assumption and
reduces unnecessary discovery/loading instead of adding another universal
procedure. The [independent-harness decision](../records/decisions/2026-09-13-independent-agent-harnesses-e47518a9-f769-46bd-831f-1a3d8615e694.md)
records the owner's boundary and the remaining shared contracts.

## Findings and applied changes

| Finding | Change | What remains protected |
|---|---|---|
| Bootstrap advertised generic codebase analysis as a construction trigger | Limit discovery to initial ontology construction or explicit rebuilds; route mature updates to sync | Ordinary source analysis stays within its request; actual construction still qualifies its exact plan |
| Long descriptions mixed discovery and execution | All 18 Codex descriptions state task or router conditions; procedure remains in the body/references | Meaningful exclusions and actual gate triggers |
| Bootstrap loaded late-stage qualification before phase selection | Keep scope, core meaning states, phase routing, and stop conditions in the entrypoint; move construction, qualification, and persistence to three references | Every original phase; no skipped acceptance, evidence, or final readback requirement |
| Field trials loaded conditional candidate/calibration instructions for every run | Move that procedure to a reference selected when analysis, qualification, or construction lifecycle changes | Four baseline phases plus the conditional gate and tracer when applicable |
| PO maintenance skip came after product-document reading instructions | Put the mechanical skip before product context | Non-mechanical routing and all boundary assessments |
| Codex seat metadata contained Claude aliases and tool identifiers | Remove `opus`/`fable` and harness-specific tool declarations from 15 Codex task briefs; retain explicit access boundaries | Inherit the caller model/effort and use available capabilities; chief/reviewers remain read-only, guardian may apply authorized workspace changes |
| Root instructions repeated execution detail and lacked a clear completion contract | Shorten the root, retain task routing and product invariants, state completion and approval reuse, link subject authorities | Required focused checks, human meaning acceptance, real rendered evidence, and protected landing |
| Repository checks treated intentional harness differences as failure | Use a repository-only integrity gate over the unchanged public report; validate each tree independently | Metadata, local references, required design seats, bridge, language, MCP grants, size cap, and helper tests |

Codex seat Markdown is manually supplied task context, not a native subagent
registration schema. The `access` field expresses a task boundary; it does not
grant permissions. This patch does not change the session's effective model or
install a new orchestration layer. The Codex browser-server comment no longer
claims another client's tool declarations require an identical binding.

## Codex documentation cross-check

The official [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
describes root-to-working-directory discovery, closer overrides, and the default
32 KiB project-instruction limit. A fresh run rebuilds that chain; editing the
file does not prove the current session received a new initial prompt.

The official [skills guide](https://learn.chatgpt.com/docs/build-skills)
confirms repository discovery under `.agents/skills`, metadata-first selection,
and full entrypoint loading when selected. It describes an initial-list budget
of 2% of the model context, or 8,000 characters when unknown, with shortening and
possible omission. This is host behavior, not evidence that this session hit
that budget. The guide also recommends front-loading the discriminating trigger.

The official [subagents guide](https://learn.chatgpt.com/docs/agent-configuration/subagents)
places native custom-agent configuration in `.codex/agents/*.toml`, with `name`,
`description`, and `developer_instructions`. Model/effort can be overridden there;
omitted settings inherit according to spawn/default/parent precedence. Our
Markdown seat files remain task briefs. No native agent registration, runtime
permission change, or automatic Markdown-role discovery is claimed.

## Measured change

All numbers are UTF-8 bytes measured from files, not tokens. Skill entrypoint
bodies load on demand; their sum is not resident session context. Claude is
measured once as the unchanged baseline, not counted again as Codex input.

| Surface | Before | After | Reduction |
|---|---:|---:|---:|
| Root `AGENTS.md` | 12,142 | 10,543 | 13.2% |
| Codex skill descriptions | 3,772 | 2,413 | 36.0% |
| All 18 Codex skill entrypoints | 150,219 | 104,442 | 30.5% |
| Bootstrap entrypoint | 39,836 | 5,810 | 85.4% |
| Field-trial entrypoint | 20,375 | 9,394 | 53.9% |
| Codex seat briefs | 47,575 | 45,429 | 4.5% |

The moved references still consume context when their phase is reached. A full
bootstrap will eventually need all phases; this change avoids reading them
before they are relevant. It does not claim an equivalent reduction in total
run tokens. No actual host description truncation or model misrouting rate was
measured. The resident-byte ratchet was lowered to the measured 25,512 bytes;
that legacy aggregate includes the root, Claude wrapper, and three resident
Claude rules. It is not a measurement of the current Codex session.

## Integrity instead of equality

`pnpm agents:check` uses `.agents/check-instructions.mjs` to retain non-copy
failures from the public `agent-files` report. Known copy differences and
one-sided resources are informational because each harness owns its files.
Unknown failure codes remain failures. The public CLI and UI still report
literal copy differences for users; no product-level comparison was weakened.

The repository gate independently checks nonempty skill/seat inventories,
frontmatter identity/discovery, local Markdown references including newly added
phase documents, and Codex access metadata. Skill routing tests check each
inventory separately and allow different counts. Codex metadata validation does
not constrain Claude to Codex's supported frontmatter fields. Design tests resolve every
routed seat in each tree without demanding identical content or model choices.
Missing seats and wrong identities still fail.

Gate probes cover broken references, malformed discovery metadata, wrong role
identity, invalid Codex access, empty inventories, and host-specific aliases.
Independent prose/resources are positive controls. Existing analyzer contracts
retain RED controls for bridge, language, MCP grants, and merged-size failures.
Executable helper tests retain the source-hidden/acceptance failure cases.
The gate is selected by `.agents/**` in the focused planner and is part of the
`gates` lane through `scripts/classify-change.mjs` and `scripts/run-ci-lane.mjs`.

The Markdown language inventory no longer skips `.agents/` as a presumed copy.
It scans both harnesses as operational prose and fails if either inventory is
empty. The Claude PostToolUse hook is quiet on intentional differences and
still reports broken references; its real-hook tests prove both directions.

Ten isolated end-to-end gate probes each produced RED and then GREEN after
restoration, including references, identity, access, model aliases, discovery,
empty inventory, bridge, language, size, and undeclared MCP grants. Skill
validators passed for all 18 Codex skills. Four relocated phase bodies were
compared to the source baseline; only the qualification guide's relative script
base wording changed. The actual procedures were preserved.

The skill validator requires PyYAML; the system Python lacked it. Validation
uses an isolated `uv run --with pyyaml` environment instead of changing the
repository or global Python environment.

## What has not been simplified

Source-hidden independence, root identity, source-digest checks, exact-plan
acceptance, writer concurrency guards, and final meaning readback remain.
The qualification procedures were relocated, not replaced by a model's
confidence. Design routing still chooses structural review and the proof
instruments; real UI/motion evidence cannot be inferred from source text.

No skills were deleted on file size alone. There is no usage census proving
which remaining skills can be retired. No third-party plugin cache or global
Codex instruction was modified. Claude skills, role briefs, and `CLAUDE.md` are unchanged from the source
baseline. Only its cross-harness drift-reminder hook changed to remove the
forced synchronization message; the canonical root remains shared through its
existing import.

## Behavioral evidence still needed

The current change proves lighter entrypoints and independent valid files.
It does not yet prove improved answer quality, task completion, or latency.
For a bounded comparison, hold the source snapshot, tools, model, and effective
reasoning setting constant; repeat and reorder the instruction variants.
Preserve full traces and separate setup failures from task failures.

| Request | Success | Failure to detect |
|---|---|---|
| Explain a module | Cited source explanation | Starting unrequested ontology construction |
| Construct a starter ontology | Evidence-bound candidates and exact-plan review | Skipping qualification or inventing accepted meaning |
| Rename code in a mature project | Inspect the modeled delta and current authorization | Automatic vault rename without its own authority |
| Adjust spacing within a selected layout | Affected rendered proof and focused checks | Reopening a settled structural direction |
| Reword a skill without changing its contract | Metadata/reference verification | Unrequested full ontology trial |
| Diagnose a read-only issue | Reproducible findings and bounded explanation | Unrelated writes or unexecuted verification claims |

Judge correctness, authority boundaries, unnecessary clarification, completion
of authorized work, and the next reader's ability to verify the result. Bytes,
reads, tests, and time are diagnostics. A smaller prompt with worse evidence or
incomplete work fails. Run model-specific comparisons separately; Astra results
cannot establish the best Claude or future-model instructions.

## Environment

Installed missing source MCP dependencies with
`pnpm --dir mcp install --frozen-lockfile`. Vault health then compiled 105 nodes
and 254 relations without compiler, reference, cycle, or schema errors. Overall
health remains `needs_attention`: the existing project has no meaning-finalize
receipt (`competency_not_authored`). No receipt was minted or meaning accepted
as part of this instruction review.

The PO maintenance router selected `skip`. Verification uses the repository's
complete `pnpm checks:changed -- --run` recommendations, the 18 skill validators,
phase-content conservation checks, and deliberate gate-failure probes. These
establish structural integrity and retained procedures, not model performance.
