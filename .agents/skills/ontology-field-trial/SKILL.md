---
name: ontology-field-trial
description: Run an Atlas ontology quality field trial when requested or when construction rules or MCP behavior can change vault contents. Skip UI and wording-only changes that preserve evidence, approval, and write contracts.
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

Before starting the clock or a fresh agent, prepare that agent's exact MCP
binding. A session opened in the Atlas checkout may inherit the dogfood server
even when the scratch vault has its own config. For source-checkout scratch
runs, use the bootstrap skill's
[rooted MCP reader](../ontology-bootstrap/scripts/rooted-mcp-read.mjs) with
absolute server/vault/repository paths. Its automatic `connection_info` must
match both roots before the first census or source read. A mismatch is a setup
failure: stop the process, record the elapsed recovery cost, and never call
`list_kinds`, `index_project`, or a semantic reader on that wrong server.
Discover that runner with the resolved script plus the single positional
argument `schema`; `--schema`, `schema --output`, and an empty invocation are
not rooted-reader discovery forms.

## Phase 1 — build (measures: cost)

Give a **real agent session** the vault and the repo, with Atlas MCP connected,
and let it build. Do not coach it mid-run; coaching is what makes a trial
unrepeatable.

Record:

- **wall-clock time** from first tool call to last write
- **nodes and relations** at the end (`node cli/src/index.mjs overview <vault>`)
- which skill the agent used (`/ontology-bootstrap`, or none)
- wrong-root setup attempts and recovery time, separately from valid rooted
  calls; do not silently reset the product clock after fixing a connection

A fast build is not a passing grade. It is the denominator for everything below.

## Conditional candidate and calibration proof

When repository analysis, qualification, or the construction lifecycle changes,
read [Candidate and calibration proof](guides/candidate-calibration.md) before
any candidate write and before Phase 3. Complete both its candidate gate and
semantic/evidence tracer, preserving the distinct candidate and persisted-vault
answers. For other trials, continue to Phase 2 without loading that procedure.

## Phase 2 — citation accuracy (measures: truth)

Every `elements:` entry and every path in a node body is a claim that a file
exists. Check them all against the clone:

```bash
# list every path-shaped reference the vault makes, then test each one
node <atlas>/cli/src/index.mjs validate <vault> --json
node <atlas>/cli/src/index.mjs index <repo> --vault <vault> --json
OATLAS_REPO_ROOT=<repo> node <atlas>/cli/src/index.mjs health <vault> --json
```

`index` receives the repository as its positional `rootPath` and the vault via
`--vault`; passing the vault as the positional argument analyzes the wrong root.
The `index` command forwards the repository root to `validate_vault`, whose
`pathDrift` is the authoritative cited-path check. `health` also performs the
vault validation and source-path check when `OATLAS_REPO_ROOT` is set; without
that variable it deliberately reports only frontmatter/graph-reference scope.
Plain `validate` deliberately does not check source paths. Then spot-check by
hand: pick every cited path and confirm it resolves in the clone.

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

A full body still does not make a finite `Definition` or `Includes` list
exhaustive. Report “the vault names/models these items” unless the same body
explicitly claims completeness and cites a source-backed product boundary.
Never introduce `only`, `all`, `every`, or `exactly` from list membership alone;
carry `Excludes` and `Uncertainty` separately. If an exclusion merely says an
item was not named/listed in bounded evidence, mark the answer partial and report
that construction defect instead of repeating it as product scope.

### Atomic claim qualifier gate

Before sealing Phase 3 answers, inspect every atomic claim containing `only`,
`one`, `none`, `no`, `complete`, `absence`, `unmeasured`, or an equivalent
quantifier. When the full body says `bounded packet`, `static packet`, `bounded
excerpt`, or `selected evidence`, preserve that measurement qualifier in the
same atomic claim sentence. Never split “only one … in the bounded packet” into
the source-wide claim “only one …”. Keep observed positives and still-unknown
behavior in separate claims. Record the checked claim ids and a zero missing-
qualifier count in the reader report; any missing qualifier blocks Phase 4.

## Phase 4 — hallucination check (measures: trust)

Take phase 3's answers back to the clone and verify each claim. An answer that
is confident, useful, and wrong is worse than a refusal, and only this phase
tells them apart.

Record: **claims verified / claims made**, and every claim that failed.

## Headless ACP replay

The same door the app opens — the vault MCP bound to one folder, the session's
appended handoff, and the first-run instruction sent as the person's own turn —
assembled outside the app so the trial can be repeated after every change.

Run it for any change to the construction rules, to the card the agent reads in
`connection_info`'s guide, to the write-door findings, or to the two prompts the
app sends (`vaultHandoffPrompt` in `src/features/acp-session/model/use-acp-session.ts`
and `buildFromCodePrompt` in `src/features/first-run-starter/model/build-from-code-prompt.ts`).
The scripts read those two texts out of the app source at run time and stop with
a non-zero exit if they cannot, so a replay always measures what the app sends.

The four assets are shared with the other harness and live in its tree; this is
a pointer to them, the way this repository's visibility table allows:

```bash
# 1. Seal six questions into scratch before any vault exists.
cp .claude/skills/ontology-field-trial/scripts/sealed-questions.template.md \
   ~/scratch/atlas-field-trial/sealed-questions.md

# 2. Replay the door: two turns, the second resuming the first.
.claude/skills/ontology-field-trial/scripts/acp-replay.sh ~/scratch/atlas-field-trial/repo \
  --model opus --out ~/scratch/atlas-field-trial/replay

# 3. Phase 3, sealed: the vault's read tools and nothing else.
.claude/skills/ontology-field-trial/scripts/sealed-reader.sh ~/scratch/atlas-field-trial/repo \
  ~/scratch/atlas-field-trial/sealed-questions.md --out ~/scratch/atlas-field-trial/reader

# 4. What the write door would still say about the finished vault.
node .claude/skills/ontology-field-trial/scripts/scan-findings.mjs \
  ~/scratch/atlas-field-trial/repo/atlas ~/scratch/atlas-field-trial/repo
```

Phase 2 still runs from the CLI and phase 4 is still done by hand against the
clone. Record in [BASELINE.md](BASELINE.md): the two turns' cost and wall clock
from the run's `<out>/replay.json`; nodes per kind folder and whether the final answer reached
finalizing the project meaning; one verdict per sealed question plus the seventh
question's answer verbatim; the finding tally from `<scripts>/scan-findings.mjs`; and the
target repository **by shape, never by name** (`.claude/rules/forbidden.md`).

Known limits: the permission card is replaced by an allow-list, so the run is
never evidence that the checkpoint holds; n = 1, so only a moved category counts
as a change; the grader is the session that made the change, which is why phase
4 against the clone stays mandatory; and it reproduces the door's three inputs,
not the app, so the installed build stays unproven.

## Report

Write the four numbers and the two lists (unanswered questions, failed claims)
into the PR or the decision record. Compare against
[BASELINE.md](BASELINE.md). **A trial with no comparison is an anecdote** — if
you changed the construction rules and the unanswered list did not shrink, the
change did not work, whatever the node count says.

Update `BASELINE.md` only when a run beats it on a named measurement, and keep
the old row: the history is what makes the next comparison possible.
