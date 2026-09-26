# Candidate packet gate and calibration tracer

Part of [the ontology-field-trial skill](../SKILL.md). Run the gate when the trial
changes repository analysis, qualification, or the construction lifecycle, before
any candidate write and before Phase 3. Run the tracer after the gate when the
packet is lossless but the source-hidden evaluator still reports semantic gaps.

## Candidate packet gate — before any write (when analyzer or qualification changed)

The persisted-vault handoff (the skill's Phase 3) answers whether the accepted
meaning survives. It does **not** answer whether the analyzer's proposed meaning
can be evaluated before acceptance. When the trial changes repository analysis, qualification, or
the construction lifecycle, run this separate gate before Phase 3:

1. Take the exact non-writing `reviewPlan` returned by the analyzer, including
   every full body, `planDigest`, `sourceDigest`, `planRevision`,
   `requiredGapIds`, and proposal-coverage receipt available at that phase.
   Before freezing claims, run the bootstrap helper's `coverage` stage against
   the exact reviewable analysis/proposal pair. Preserve its ordered refs and
   require the manifest's first-occurrence proposal refs to match them exactly;
   pass a supported complete recorder transcript directly when available, and
   do not discover artifact shapes or relation/impact grammar through failed
   coverage or seal attempts.
2. Give that candidate packet to a fresh source-hidden evaluator. It receives no
   source clone and no starter/shared vault. The packet must state
   `sourceHidden: true`, `canWrite: false`, and must not contain `writePlan`.
3. Serialize and deserialize the packet in scratch. Fail the gate if any body,
   array order, row, digest, or gap changes; exercise missing, foreign, and
   truncated-row mutations and record that they are rejected.
4. Ask the same fixed questions from the candidate packet alone. Record candidate
   answers separately from persisted-vault answers. A starter-vault `0/6` is a
   handoff setup failure, not analyzer semantic evidence.
5. Before either evaluator starts, freeze and digest one ordered claim manifest
   with exact `id`, `statement`, and `proposalRefs` rows. The builder,
   source-hidden evaluator, and source-aware auditor must have different ids.
6. Show the exact fixed question/CQ set to one named human meaning owner before
   either lane starts. Freeze that owner's id and approval timestamp into every
   CQ revision and purpose-owner row. The timestamp must predate the hidden
   access window; the owner must differ from all three construction actors and
   later be the exact plan acceptor. The evaluator cannot author that human
   provenance on the owner's behalf.
   Derive each CQ's required witness kinds from the sealed witnesses actually
   used by that answer, never from a test fixture. A failed CQ is a packet or
   evidence defect and blocks join; only an honestly measured partial/unknown
   answer can become an exact human gap.
7. Start the source-hidden answer lane and source-aware citation lane together
   from that same manifest. Hide source, shared vault, and audit output from the
   first; hide source-hidden answers from the second. Record branch start/end
   timestamps and require actual overlap. When source fragments repeat across
   citations, store each unique fragment once and reference it by id; do not
   copy the complete fragment catalog into every claim. Record fragment
   occurrences, unique fragments, and serialized audit-input bytes so repeated
   evidence cannot masquerade as useful qualification work.
8. Seal the hidden answers before the citation receipt is revealed. Join without
   changing any claim row or earlier answer, then compare the final
   qualification claims byte-for-byte with the manifest before acceptance.
9. Exercise same-actor, source-hidden-access, missing/foreign row, claim
   statement/ref mutation, audit mismatch, and pre-join acceptance probes. Each
   must withhold executable lifecycle status and every write.

Raw source is deliberately absent from this evaluator. Treat an exact
source-path claim it cannot verify as partial pending the source-aware citation
audit, not as automatically false and not as a reason to rewrite an unchanged
source-backed claim. A missing path, wrong attribution, unsupported statement,
or source-aware mismatch is a construction failure and does require revision.
Keep measurement qualifiers verbatim in candidate and persisted answers:
“unmeasured by the static packet” must not become “unmeasured” or “absent.” A
named source use case must not be widened to a broader audience/scenario. Audit
Definition, Includes, Excludes, and Uncertainty claims separately even when they
share one proposal ref.
Keep direct source dependency distinct from runtime or business impact. An exact
production/value import may verify a reviewed element-to-element `depends_on`
when both endpoint bodies name distinct implementation roles, both paths
resolve, the direction matches, and the relation/answer stays explicitly
bounded to source/code dependency. Do not fail that claim merely because the
witness is an import. Do fail a bare-path endpoint, absent/reversed direction,
higher-level promotion, or runtime/transitive/reverse/complete impact claim that
lacks separate current evidence. Record the impact answer as partial whenever
only the bounded source dependency is measured.
Record candidate releases separately from analyzer calls so an early rejected
draft cannot masquerade as an approval round.
A `status: pass` analyzer response is still not a candidate release when its
construction lifecycle is `blocked` by a mandatory non-gap warning. Count a
release only when the exact review plan is `reviewable`; count the blocked
response as a rejected draft and repair it before the evaluation lanes start.

The parallel receipts are scratch measurement evidence, not a new public MCP
schema or an authenticated identity proof. If the two lanes cannot be isolated,
run them serially and report that timing honestly; never count overlapping work
that shared source or answers as a source-hidden pass. A serial run cannot earn
the helper's overlap receipt; use the bootstrap manual protocol or defer that
helper result. Do not repeatedly retry `join` with unchanged serial timestamps.
When the bootstrap skill's qualification helper is available, record each
helper stage separately and require the `join` receipt to prove parallel overlap;
helper runtime does not replace actor isolation, source hiding, or the four
field-trial measurements.
Require every actor to discover the qualification helper through one file-backed
`schema --output` call and read the emitted schema file. Displayed stdout is not
a complete-contract receipt; any truncation-driven shape failure is a transport
RED, not an evaluator semantic result.
Record rooted-runner discovery and executions separately too. A clean run reads
its emitted schema once and executes each deliberately authored packet once;
any same-packet CLI-form retry or implementation source read invalidates the
cold-start usability result even if no vault write occurred.
Record `coverage` separately from candidate release and `seal`: it derives exact
review-row labels only and is neither a second candidate nor a qualification
result. Report coverage attempts/runtime and preserve any preflight mismatch.
For payload-carrying witnesses, exercise seal-derived digests and report that
the sealed payloads match their authored inputs; a wrong supplied digest must
remain a no-output RED. Do not count deterministic digest derivation as a meaning
decision or a qualification result.
Use the helper's sibling-path `hidden` form so `qualificationCore` and `answers`
remain separately authored artifacts instead of being copied into one large
wrapper. Record embedded-versus-path wrapper bytes, helper attempts, and exact
four-output byte parity. A smaller wrapper is transport evidence only; the
source-hidden evaluator still owns every answer, target, axis, diagnostic, and
resource judgment.

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
