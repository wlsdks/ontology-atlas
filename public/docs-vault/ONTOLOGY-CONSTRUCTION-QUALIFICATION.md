# Ontology Construction Qualification v1

> Status: internal executable contract. This document explains the evaluator
> implemented by [`mcp/src/construction-qualification.mjs`](../mcp/src/construction-qualification.mjs).
> It does not add a vault kind, frontmatter field, MCP tool, or UI surface.

## Why this exists

A vault can compile cleanly and still fail its users. It may answer only one item
in an “each” question, cite stale evidence, or let the agent that built it declare
its own work correct. Construction qualification therefore asks whether an
ontology supports a named decision for each intended audience, not whether it has
many nodes or a high aggregate score.

The research rationale and eight-stage lifecycle live in
[`FOUNDATIONS.md`](FOUNDATIONS.md#construction-is-a-requirements-and-tests-lifecycle-not-noun-extraction).
This file owns the re-executable packet and verdict contract. The vault format
itself remains owned by [`ONTOLOGY-ATLAS-SPEC.md`](ONTOLOGY-ATLAS-SPEC.md).

## Qualification packet

Every `constructionQualification:v1` packet is bound to one project plus exact
graph and source SHA-256 digests. It contains:

1. a named builder and a separately identified evaluator;
2. motivating decision scenarios for executive, employee, FDE, and agent users;
3. atomic competency questions, each with a human owner, approved revision,
   expected answer shape and quantifier, target set, required witness kinds,
   explicit unknown/refusal behavior, exemplar, and counterexample;
4. currentness-marked witnesses with portable source references and SHA-256
   provenance — private absolute paths are invalid;
5. one exact-text claim ledger and citation checks;
6. target-level CQ results that bind each claimed covered target to witnesses and
   claims — a caller-supplied `coveredTargets` list has no authority;
7. an independently run source-hidden task, separate quality-axis results,
   classified diagnostics, measured resource use, and a human acceptance decision.

The canonical field shape is the executable fixture
[`tests/fixtures/construction-qualification/qualified.json`](../tests/fixtures/construction-qualification/qualified.json).
Future producers must emit that shape rather than inventing a parallel receipt.

## Independent quality axes

Qualification keeps semantic correctness, structural conformance, functional CQ
adequacy, evidence/provenance, pragmatic source-hidden usefulness,
maintainability, and interoperability honesty separate. Every axis is categorical:
`passed`, `failed`, `unknown`, or `not_measured`.

A non-passing axis must point to a diagnostic classified as one of:

- `evidence` — the required fact, current witness, authority, or citation is absent;
- `prompt` — the evaluator or construction instruction failed to elicit or preserve it;
- `ui` — the artifact exists but a human or agent surface hides or misrepresents it;
- `missing_primitive` — the current Atlas model or tool cannot express the requirement.

No overall score exists. A red axis cannot be averaged away by six green axes,
low latency, low cost, node count, compiler health, or operability.

## Fail-closed verdict

`qualified` is returned only when all of these are true at the same time:

- the packet is valid and builder/evaluator identities differ;
- every audience has a motivating scenario and a human-approved CQ;
- every CQ passes its declared quantifier from target-level evidence;
- every required witness is current, every claim is supported, and every claim has
  a verified current citation;
- all seven quality axes pass;
- the named independent evaluator passes the source-hidden task;
- a named human records `accepted`.

Honest `partial`, `unknown`, and `refused` answers remain visible and produce
`not_qualified`; malformed provenance, missing authority, maker self-evaluation,
and unclassified red axes produce `invalid`. Evaluation never writes to the vault
and never turns a receipt into a truth certificate.

## Metrics and rerun

The result reports claim accuracy, citation accuracy, duration, tool calls, input
and output tokens, and optional estimated cost as separate measurements. These
help compare trials but cannot change the categorical verdict.

Run the representative contract on the repository's required Node version:

```bash
node --version # v24.x
node --test mcp/src/construction-qualification.test.mjs
```

The fixture is a contract specimen, not evidence that Atlas has qualified three
real products. `O1.5` in [`BACKLOG.md`](BACKLOG.md#o15--three-product-independent-construction-qualification)
owns that independent field qualification after the lifecycle is wired into the
MCP and bootstrap surfaces by `M1.5`.

## Product disclosure boundary

There is no new UI in this slice. When `U1.3` is reached, basic and expert views
must project the same packet: the default view may summarize the next decision,
ambiguity, and approval; the expert view may expand CQs, witnesses, counterexamples,
diagnostics, and the write plan. Neither view may hide red/unknown/conflict state or
bypass human acceptance.
