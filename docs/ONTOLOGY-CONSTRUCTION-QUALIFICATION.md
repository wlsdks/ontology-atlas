# Ontology Construction Qualification v1

> Status: executable public input contract for the existing
> `analyze_repo_structure` MCP tool. The evaluator is implemented by
> [`mcp/src/construction-qualification.mjs`](../mcp/src/construction-qualification.mjs)
> and the write-eligibility lifecycle by
> [`mcp/src/construction-lifecycle.mjs`](../mcp/src/construction-lifecycle.mjs).
> It adds no vault kind, frontmatter field, new MCP tool, or UI surface.

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

Every `constructionQualification:v1` packet is bound to one project plus the
exact review-plan and current source SHA-256 digests returned by
`analyze_repo_structure`. It contains:

1. the intended outcome, decisions, scope, non-goals, portable source refs, and
   named human meaning owners;
2. a named builder and a separately identified evaluator;
3. motivating decision scenarios for executive, employee, FDE, and agent users;
4. atomic competency questions, each with a human owner, approved revision,
   expected answer shape and quantifier, target set, required witness kinds,
   explicit unknown/refusal behavior, exemplar, and counterexample;
5. currentness-marked witnesses with portable source references and SHA-256
   provenance — private absolute paths are invalid;
6. one exact-text claim ledger and citation checks. Every claim also carries
   non-empty `proposalRefs` for the exact concept/relation/competency/impact
   rows in the current review plan; lifecycle output exposes the derived
   `proposalCoverage` receipt and rejects missing or foreign refs;
7. target-level CQ results that bind each claimed covered target to witnesses and
   claims — a caller-supplied `coveredTargets` list has no authority;
8. an independently run source-hidden task, separate quality-axis results,
   classified diagnostics, and measured resource use;
9. either a cold-start `not_applicable` regression receipt or an exact rerun of
   every prior approved CQ with current regression evidence;
10. a declared human acceptance decision bound to the exact `planDigest`,
    `planRevision`, and every accepted gap id.

The canonical field shape is the executable fixture
[`tests/fixtures/construction-qualification/qualified.json`](../tests/fixtures/construction-qualification/qualified.json).
Future producers must emit that shape rather than inventing a parallel receipt.

## Runtime lifecycle

The existing read-only tool enforces one sequence:

1. Call `analyze_repo_structure` with a complete proposal and no
   `qualification`. A valid proposal returns `reviewPlan`, `planDigest`,
   `planRevision`, `sourceDigest`, eight phase states, and exact
   `requiredGapIds`; `canWrite` remains false and `writePlan` is absent.
2. A maker-independent evaluator executes the packet, including the complete
   source-hidden task and prior-CQ regression. The user sees the exact review
   plan and every remaining gap. The lifecycle also checks that the evaluator
   packet covers that same plan, not merely a digest-compatible foreign packet.
3. If the user accepts, the caller records declared human provenance bound to
   the returned plan digest/revision and accepted gap ids, then calls the same
   tool with the unchanged proposal plus the qualification packet.
4. Only an admissible, current packet returns
   `constructionLifecycle.writeEligibility: executable`, `canWrite: true`, and
   `writePlan`. That plan is an exact clone of the reviewed rows. Any source or
   plan change invalidates the acceptance.
5. After the batch writers, the agent validates and compiles the vault, connects
   the project source, and runs `finalize_project_meaning`. Post-write failure is
   repaired forward; it is not reported as a successful construction.

The eight phases are purpose/authority, approved CQs, evidence reuse, a small
conceptual slice, semantic/structural tests, independent source-hidden use,
human plan approval, and prior-CQ regression. Atlas exposes categorical phase
diagnostics rather than one confidence score.

Human authority and acceptance in this packet are declared provenance. Atlas
does not authenticate the person's identity and does not turn an accepted
packet into a truth certificate.

The detailed lifecycle packet is not a new persistent vault protocol. The
project Markdown persists the existing five competency answers, witnesses, and
visible gaps; the existing finalizer receipt binds that body to the current
graph and source. CQ revisions, axis results, exact gap acceptance, and the
pre-write regression remain evidence in the MCP response/agent transcript and
cannot be reconstructed after restart unless that evidence is handed off. This
deliberate M1.5 limit preserves `reviewPlan === writePlan`; O1.5 must falsify it
before Atlas adds another storage contract.

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
- purpose, scope, non-goals, decisions, portable refs, and human meaning owners
  are present;
- every audience has a motivating scenario and a human-approved CQ;
- every CQ passes its declared quantifier from target-level evidence;
- every required witness is current, every claim is supported, and every claim has
  a verified current citation;
- all seven quality axes pass;
- the named independent evaluator passes the source-hidden task;
- the cold-start or prior-CQ regression contract is current and consistent;
- a named human records `accepted`.

Honest `partial`, `unknown`, and `refused` answers remain visible and produce
`not_qualified`; malformed provenance, missing authority, maker self-evaluation,
and unclassified red axes produce `invalid`. Evaluation never writes to the vault
and never turns a receipt into a truth certificate.

## Metrics and rerun

The result reports claim accuracy, citation accuracy, duration, tool calls, input
and output tokens, and optional estimated cost as separate measurements. These
help compare trials but cannot change the categorical verdict.

Run the representative contracts on the repository's required Node version:

```bash
node --version # v24.x
node --test mcp/src/construction-qualification.test.mjs mcp/src/construction-lifecycle.test.mjs
```

The fixture and integration round trip are contract specimens, not evidence that
Atlas has qualified three real products. `O1.5` in
[`BACKLOG.md`](BACKLOG.md#o15--three-product-independent-construction-qualification)
owns that independent field qualification.

## Product disclosure boundary

There is no new UI in this slice. When `U1.3` is reached, basic and expert views
must project the same packet: the default view may summarize the next decision,
ambiguity, and approval; the expert view may expand CQs, witnesses, counterexamples,
diagnostics, and the write plan. Neither view may hide red/unknown/conflict state or
bypass human acceptance.
