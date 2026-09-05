# Agent instruction review — 2026-09-05

Scope: all 18 repository skill entrypoints, their relevant authority documents,
and the coordinator/guardian briefs that repeated conflicting instructions.
This is an instruction-consistency review, not a benchmark of model behavior or
ontology quality. Installed third-party skill packages and saved scheduled-task
prompts are outside this review.

The OpenAI GPT-6 Astra guidance recommends explicit autonomy, instruction
priority, bounded delegation, concise reporting, and proportional verification:
[official model guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra).

## Reviewed skills

| Skill | Result |
| --- | --- |
| design-audit | Retained: routed scope and geometry plus real-window evidence remain explicit. |
| design-build | Limit repeated token/history research to new values; preserve technical checks alongside routed visual proof. |
| design-council | Permit evidence-supported no-change results, distinguish serial execution from shared context, clarify report location and legitimate questions. |
| design-directions | Existing selection skips alternative generation; text-only applies to proposed alternatives, not baseline inspection. |
| design-system-audit | Scope every inventory to the requested audit; repair instructions do not authorize edits during an audit-only request. |
| gate-probe | Existing regression cases do not require duplicate README/check-list entries. RED/GREEN and wiring proof remain required. |
| map-perf | Retained: actual node grab, headed measurement, and work-time evidence protect against false performance claims. |
| motion-verify | Resolve available binaries; measure the declared active interval; use actual frames and reject empty/static samples without division by zero. |
| ontology-absorb-confluence | Existing MCP registration and exact approval remain usable; suspect rows pause writes and lead to the explicit warning-review step. |
| ontology-bootstrap | One helper/manual packaging path; repair invalid input; preserve all qualification and acceptance gates; serial execution cannot fabricate helper overlap. |
| ontology-extract | Pasted prose alone does not request extraction; explicit unchanged approval proceeds to writing; zero candidates need no approval. |
| ontology-field-trial | Trigger on ontology-quality work; wording-only clarifications do not imply a trial; distinguish serial measurement from helper overlap certification. |
| ontology-sync | Reverts skip only when the graph remains accurate; collisions/warnings do not authorize invented parents or overwrites; critical findings may exceed five lines. |
| parallel-brief | Retained the preceding ownership fix: subagents do not delete worktrees; isolation and cleanup ownership remain explicit. |
| po-council | Independent contexts may run serially; shared-context reviews cannot claim independence; caller role does not grant human decision authority. |
| po-pass | Retained: fact-derived route, mechanical skip, bounded probe, and one recovery outcome already limit ceremony. |
| responsive-sweep | Router owns affected bands; local layout repairs do not automatically trigger the full matrix; compose query parameters correctly. |
| user-walkthrough | A/B journeys are selected by scope, not both mandatory; local journey timing does not inherit the north-star citation metric. |

The `chief` and `design-guardian` briefs now agree with the council that review
may preserve an already supported design. The chief also allows necessary scope
questions instead of labeling every clarification as failure.

## Protected boundaries

No model, tool schema, ontology kind/relation contract, qualification axis,
meaning-evidence threshold, plan digest, writer authorization, or routed
instrument requirement changes. A helper error does not waive a gate. Existing
source-hidden and source-aware isolation remains mandatory. New or changed
meaning still requires its exact approval.

Long bootstrap/field-trial procedures and their candidate bounds were reviewed
but not removed merely for length. Changing those evidence rules would require
a measured field trial. This revision clarifies execution and reuse of existing
receipts; it does not claim better ontology quality from wording changes.

Motion still requires a real recording and a reduced-motion check. The sample
statistics apply to the declared active interval; its bounds and full recording
must remain inspectable so a stall cannot be cropped away to manufacture a pass.

## Verification

The documented motion-statistics example was executed in scratch against short
moving, static, and insufficient-frame controls. Moving frames produced zero
stalls; static and insufficient samples failed explicitly. These synthetic
controls test the recipe, not any product animation.

Run the repository's complete `pnpm checks:changed -- --run` recommendations for
this diff. Mirror equality, citations, resident-context limits, and routing
contracts are machine-checked; the prose's intended behavior was reviewed above.
Do not add tests that pin these sentences.

The design-council contract previously pinned removal demands and refusal of
clarification as literal prose. It now derives the seat inventory from the
executable router and checks roster references, callable metadata, byte budgets,
coordinator tool declarations, and mirrored files. Its negative controls cover
missing files, wrong identities, and mirror drift. A real temporary mirror
mutation failed with the named file; restoring its exact bytes passed. Routing
behavior tests remain in the existing design-proof-router suite. The focused
planner maps these paths to `pnpm test:design-gates`, and CI's gates lane includes
that command through `scripts/classify-change.mjs`.


## Bounded harness optimization

The GPT-6 guide advises completing required checks and repeating or broadening
verification only for changed inputs, failures, or unresolved risk. Applying
that principle locally, the focused runner recognizes a preceding default
`pnpm test:contracts` invocation and avoids later equivalent contract-only
Vitest invocations in the same stable-checkout run. It derives aliases from
current package scripts, preserves earlier focused tests and command ordering,
and stops if the full suite fails. Unknown definitions, custom flags,
environment overrides, lifecycle hooks, and command chains remain separate.

This is not a result cache: no previous run, timestamp, or stored success grants
coverage. As with any check run, concurrent changes to its inputs invalidate the
evidence. The optimization leaves test selection and CI routing unchanged.
A deliberately widened skip condition failed the conservative-coverage tests;
restoring the guard passed. No additional hook, model override, mandatory agent,
or persistent tracking layer was added.
