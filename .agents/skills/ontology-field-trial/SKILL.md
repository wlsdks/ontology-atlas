---
name: ontology-field-trial
description: Measure whether Atlas actually works on a repository nobody here knows, by building a vault with a real MCP agent and then handing that vault — without the source — to a second agent who must answer questions from it alone. Use when changing the construction rules, the MCP read/write contract, the bootstrap skill, or whenever someone asks "is this getting better?" and the honest answer is a number nobody has. Produces four measurements against a recorded baseline. Skip for UI work, copy edits, and anything that cannot change what a vault says.
---

# Field trial — does the vault survive being the only thing you have?

This project sells a meaning layer that an agent consumes. The only test of
that claim is to **take the source away** and see whether the vault still
answers. Everything else — node counts, green checks, a map that looks full —
measures effort, not usefulness.

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

## Phase 2 — citation accuracy (measures: truth)

Every `elements:` entry and every path in a node body is a claim that a file
exists. Check them all against the clone:

```bash
# list every path-shaped reference the vault makes, then test each one
node <atlas>/cli/src/index.mjs validate <vault>          # frontmatter + graph refs
OATLAS_REPO_ROOT=$PWD/repo node <atlas>/cli/src/index.mjs health <vault>
```

`health` is the one that opens the repository — `validate` deliberately does
not, and says so. Then spot-check by hand: pick every cited path and confirm it
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
