---
name: ontology-field-trial
description: Measure whether Atlas actually works on a repository nobody here knows, by building a vault with a real MCP agent and then handing that vault — without the source — to a second agent who must answer questions from it alone. Use when changing the construction rules, the MCP read/write contract, the bootstrap skill, or whenever someone asks "is this getting better?" and the honest answer is a number nobody has. Produces four measurements against a recorded baseline. Skip for UI work, copy edits, and anything that cannot change what a vault says.
---

# Field trial — does the vault survive being the only thing you have?

This project sells a meaning layer that an agent consumes. The only test of
that claim is to **take the source away** and see whether the vault still
answers. Everything else — node counts, green checks, a map that looks full —
measures effort, not usefulness.

Use the
[Atlas meta-model specification](../../../docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind)
as the shared answer key for kind, relation, direct `is_a`, and unsupported
inference claims. The trial measures whether agents can apply that contract; it
must not invent a second rubric from the vault it is judging.

Run this as four measurements, in order. Each one produces a number or a list
that goes in the report. **Do not skip a phase because the previous one looked
good** — phase 1 has looked good every time, and phases 2–4 are where the
defects were.

## Before you start

Pick a repository **nobody in this session knows**, permissively licensed
(Apache-2.0 / MIT / BSD), in a domain you cannot bluff. That is the point: a
familiar repository lets the agent — and you — fill gaps from memory, and the
whole trial then measures your memory instead of the vault.

⚠️ **Never name the chosen repository in this repo's code, tests, identifiers,
fixtures, or commit messages** (`.claude/rules/forbidden.md` — no third-party
brands in identifiers). Everything the trial produces lives outside this
checkout — a scratch directory, never inside `ontology-atlas/`.

```bash
# outside this repo
mkdir -p ~/scratch/atlas-field-trial && cd ~/scratch/atlas-field-trial
git clone --depth 1 <repo-url> repo
mkdir vault handoff
node <atlas>/cli/src/index.mjs init vault     # starter nodes only
```

## Phase 1 — build (measures: cost)

Give a **real agent session** the vault and the repo, with Atlas MCP connected,
and let it build. Do not coach it mid-run; coaching is what makes a trial
unrepeatable.

Record:

- **wall-clock time** from first tool call to last write
- **nodes and relations** at the end (`node cli/src/index.mjs overview <vault>`)
- which skill the agent used (`/ontology-bootstrap`, or none)

A fast build is not a passing grade. It is the denominator for everything below.

## Candidate packet gate — before any write (when analyzer or qualification changed)

The persisted-vault handoff below answers whether the accepted meaning survives.
It does **not** answer whether the analyzer's proposed meaning can be evaluated
before acceptance. When the trial changes repository analysis, qualification, or
the construction lifecycle, run this separate gate before Phase 3:

1. Take the exact non-writing `reviewPlan` returned by the analyzer, including
   every full body, `planDigest`, `sourceDigest`, `planRevision`,
   `requiredGapIds`, and proposal-coverage receipt available at that phase.
2. Give that candidate packet to a fresh source-hidden evaluator. It receives no
   source clone and no starter/shared vault. The packet must state
   `sourceHidden: true`, `canWrite: false`, and must not contain `writePlan`.
3. Serialize and deserialize the packet in scratch. Fail the gate if any body,
   array order, row, digest, or gap changes; exercise missing, foreign, and
   truncated-row mutations and record that they are rejected.
4. Ask the same fixed questions from the candidate packet alone. Record candidate
   answers separately from persisted-vault answers. A starter-vault `0/6` is a
   handoff setup failure, not analyzer semantic evidence.

This is a measurement boundary, not a new MCP/CLI schema or a write path. If the
packet is already lossless, do not implement another envelope. Move to the
semantic/evidence gap the evaluator actually named. Candidate evaluation never
changes the shared vault and never substitutes for human acceptance.

## Semantic/evidence calibration tracer — after the candidate packet gate

Use this internal tracer when the candidate packet is lossless but the
source-hidden evaluator still reports semantic gaps. It uses only fields that
already exist in the `analyze_repo_structure` response:

- `meaningGate.reviewQuestions`
- `implementationEvidence.reviewRequiredCapabilities`
- `semanticEvidence.riskFlags`
- `proposalValidation.findings`
- `competencyAnswers.gap`
- `constructionLifecycle.diagnostics`

Do not introduce a new public field, tool, schema, UI, or writer for the tracer.
It is a measurement procedure for choosing the next implementation slice, not a
new output contract.

Classify the fixed source-hidden questions in this order and keep the two
surfaces separate:

| question | calibration axis |
| --- | --- |
| q1 | scope |
| q2 | domain |
| q3 | ability |
| q4 | evidence |
| q5 | impact |
| q6 | omitted-behavior |

For each axis, record the candidate-packet-only result and the persisted-vault
result in separate rows. Attach the existing response field and source/path
references that support the result, then record one next action for the next
analysis or review pass. Do not infer a persisted-vault answer from a candidate
packet answer, or use a starter-vault failure as evidence about analyzer quality.

Use these bounded labels:

- `missing`: the question has no supported answer, required witness, or
  explicitly surfaced gap.
- `weak`: an answer exists, but the cited evidence, boundary, behavior, or
  impact is incomplete; preserve the reason and the next action.
- `conflict`: use only when trusted observations or accepted proposal evidence
  deterministically contradict each other.
- `not_measured`: use for a suspected conflict when no trusted contradiction is
  present. Ambiguity is not a conflict.

An `[observed · impact]` review question is still `weak` for q5: it proves that
bounded production import evidence was found, but it does not by itself prove
that an ontology `depends_on` relation should be accepted. The next action is
to inspect the bounded `infer_imports` evidence and validate the exact proposal
witness; absence of an impact question is never evidence of a complete impact
answer.

For H2, Axios, and Undici, compare before/after on two independent axes:

1. **Body transport equality** — exact review-plan bodies, order, digests,
   revision, required gaps, and packet mutation rejection.
2. **Semantic gap** — the q1–q6 labels, evidence references, next actions, and
   unanswered behavior/impact boundaries.

Never combine those axes into one score or claim that transport equality proves
semantic improvement. A lossless body with the same semantic gaps is a
transport pass and a calibration miss; a changed semantic result must still be
checked for citation accuracy and unsupported claims.

The tracer ends with a short scratch report containing the two surfaces, the
six-axis labels, supporting existing fields, next actions, and the before/after
comparison. It must not aggregate a quality score, write to the vault, create a
write plan, approve a human review, or weaken qualification. Automatic writes
and human-approval bypass remain out of scope.

## Phase 2 — citation accuracy (measures: truth)

Every `elements:` entry and every path in a node body is a claim that a file
exists. Check them all against the clone:

```bash
# list every path-shaped reference the vault makes, then test each one
node <atlas>/cli/src/index.mjs validate <vault>          # frontmatter + graph refs
OATLAS_REPO_ROOT=$PWD/repo node <atlas>/cli/src/index.mjs index <vault>   # prints "path drift"
```

Path-existence lives in `validate_vault`'s `pathDrift` (it needs `repoRoot` —
the CLI `index` command passes it and prints the drift count). `health` does
NOT open the repository (its five checks are graph-only), and plain `validate`
deliberately does not either. Then spot-check by hand: pick every cited path and confirm it
resolves in the clone.

Record: **cited paths / paths that exist**. Anything below 100% is a
hallucination, not a rounding error — name the node and the path.

## Phase 3 — handoff (measures: the actual product claim)

Start a **fresh agent** with the vault **and no access to the source clone**.
This is the measurement that matters, and it is the one that is easy to fake:
if the second agent can read the repo, it will, and you will learn nothing.

Ask questions a new engineer would ask on day one — five or six, written down
*before* you see the vault so you cannot tune them to it. For example:

- What is this system for, and who uses it?
- Where does <a domain the vault names> live in the code?
- What would I break if I changed <a capability the vault names>?
- What is deliberately out of scope?

Record, separately:

- **what it answered** — and, for each answer, whether it is *checkable* from
  the vault alone
- **what it could not answer, and the reason it gave** — this is the highest-value
  output of the whole trial. Both defects found on 2026-08-01 came from this
  list, not from anything the build phase showed.

### Scope-promotion rule

A capability's `Excludes` section bounds **that capability only**. The fresh
agent must not promote it to project scope: "the store-output capability
excludes plotting" does not mean "the project has no plotting". Project-level
scope claims may cite only the project node's own excludes. (2026-08-14 trial:
the single failed claim of the run was exactly this promotion — the vault was
right, the handoff answer widened it.)

### Full-body handoff gate

The list/summary response is a census, not evidence. Before the fresh agent
marks a domain, capability, project boundary, implementation path, or impact
answer as complete, it must read the named node bodies with
`get_concept({body: "full"})` or `get_concepts({body: "full"})`. A summary row,
title, path, or neighbor list may select the next read but may not close the
question. Record the exact full-body follow-up count and the slugs read. If a
named node is missing, truncated, or only available as an excerpt, the answer
is partial/unknown and must say so; do not infer the body from its title or
path. This gate exists because a fresh 2026-08 trial answered 4/6 questions
fully while silently stopping after summary reads.

## Phase 4 — hallucination check (measures: trust)

Take phase 3's answers back to the clone and verify each claim. An answer that
is confident, useful, and wrong is worse than a refusal, and only this phase
tells them apart.

Record: **claims verified / claims made**, and every claim that failed.

## Report

Write the four numbers and the two lists (unanswered questions, failed claims)
into the PR or the decision record. Compare against
[BASELINE.md](BASELINE.md). **A trial with no comparison is an anecdote** — if
you changed the construction rules and the unanswered list did not shrink, the
change did not work, whatever the node count says.

Update `BASELINE.md` only when a run beats it on a named measurement, and keep
the old row: the history is what makes the next comparison possible.
