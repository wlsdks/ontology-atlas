### 9. Qualify, show, and obtain exact-plan acceptance

Give the review plan and evidence packet to a separately identified evaluator.
The evaluator must use the `constructionQualification:v1` shape exposed by the
same tool's `qualification` input schema and must report:

- purpose/outcome, decisions, scope, non-goals, portable source references, and
  named human meaning owners;
- approved executive, employee, and agent scenarios and competency questions,
  including examples, counterexamples, quantifiers, target sets, and explicit
  unknown/refusal behavior; FDE is optional and may appear only when every FDE
  CQ is owned by a named project meaning owner, purpose authority declares the
  exact `audience:fde` decision, and current `audience-authority:fde` evidence
  from a declared purpose source is carried through a supported claim and its
  exact verified citation;
- current digest-bound witnesses, exact claims, citation checks, CQ target
  results, all seven quality axes, classified diagnostics, and resource use;
- a complete source-hidden task run by that evaluator;
- a cold-start `not_applicable` regression or an exact rerun of every prior CQ.

The source-hidden task judges what the portable plan can safely hand off. Raw
source absence makes source-body detail partial; it does not by itself prove the
unchanged candidate false. The source-aware citation check must then verify that
claim against current source before the mandatory evidence axis can pass.
For every `navigation:` evidence string, that auditor must also verify the exact
repo-relative file and qualified symbol/test in current source. A missing,
ambiguous, redirected, or task-inferred coordinate is an evidence-axis failure;
an existing symbol still does not prove the proposed behavior or impact.

#### Seal once, then qualify in isolated parallel lanes

Use one packaging path: the helper when available, otherwise the manual protocol.
Both obey all evidence, isolation, and acceptance requirements below. Helper
outputs satisfy the equivalent manual packaging steps; do not repeat evaluation
or ask for the same acceptance twice. Repair invalid inputs before continuing;
a helper rejection is not permission to bypass a failed gate.

When this skill directory provides `scripts/qualification-handoff.mjs`, resolve
that path relative to the parent skill directory (`../` from this guide), never relative
to the repository root, and reuse the resolved path for the whole run. Use its
`coverage`, `seal`, `hidden`,
`audit`, `join`, `accept`, and `release` stages instead of recreating canonical JSON, digests,
CQ witness projection, or lifecycle comparison code in scratch. Read its
machine contract by running `schema --output <fresh-scratch-directory>` exactly
once and reading the emitted schema file; never rely on displayed schema stdout,
which can truncate this large contract. Then author access, core, and answers
from `commands.hidden.jsonSchemas` without opening helper implementation source.
The source-aware auditor likewise authors access, claim results, fragment
catalog, and quantifier rows from `commands.audit.jsonSchemas`; prose describing
catalog deduplication is not a substitute for those exact shapes.
The builder, hidden evaluator, and
auditor still author the proposal, claims, witnesses, answers, axes, and source
judgments; the helper only validates and packages those decisions, invokes no
MCP tool, and writes no vault file.
Use `seal`'s compact analysis/proposal path form so the exact analyzer response
becomes the candidate without copying or normalizing review-plan bodies. On a
true cold start, `hidden` derives the reserved regression witness from the exact
CQ set; the evaluator still owns the maintainability-axis judgment.
Before sealing, read the emitted `qualityAxes` contract and inventory evidence
for every mandatory axis. A cold-start candidate needs current review/coverage,
impact-boundary, source-currentness, and round-trip receipts sufficient for an
independent evaluator to judge maintainability and interoperability; the
helper-derived cold-start regression witness does not promote either axis. If
that evidence is absent, stop before the qualification lanes instead of asking
the evaluator to turn `not_measured` green.
In `qualificationCore`, every axis and diagnostic `evidenceRefs` entry is a
sealed witness id, never a claim id, proposal ref, path, or diagnostic id. Every
axis `findingIds` entry names a diagnostic whose `axis` matches that row; keep a
passing row's list empty unless a same-axis diagnostic is intentionally retained.
Immediately after the first reviewable analyzer response and before authoring a
claim manifest, run `coverage` with that exact analysis/proposal pair. Use its
ordered proposal-coverage receipt refs as the manifest's first-occurrence coverage
order, while retaining separate material Definition, Includes, Excludes, and
Uncertainty claims. Then validate manifest, witness, and quantifier input against
`commands.seal.jsonSchemas` and run `seal`. The coverage receipt derives labels
only; it never chooses claims, witnesses, meaning, qualification, or writes.
When a witness embeds `payload`, omit `provenance.digest`; `seal` derives the
canonical SHA-256 into its cloned sealed witness without mutating the authored
input. A caller-supplied digest must still match exactly, and a witness without
payload must still supply its portable digest. Do not independently recreate the
helper's canonical JSON hashing in scratch.
Prefer the complete recorded analysis transcript as `analysisPath`. A transcript
whose `calls[]` row carries `{ name, args, response }`, with `response` equal to
the direct structured result, is a supported input and needs no hand-authored
wrapper. Consult `derivedCandidate.supportedAnalysisForms` once; do not probe
artifact shapes through failed `coverage` calls.
For `hidden`, keep the access manifest inline, write the evaluator-authored
`qualificationCore` and `answers` as two sibling JSON files beside the command
input, and use `qualificationCorePath` plus `answersPath`. The helper accepts
only plain sibling `.json` filenames, hydrates the exact values, and preserves
all four legacy outputs byte-for-byte; it does not derive or repair their
semantic judgments. Use a stable scratch directory with no symlinked ancestors;
the helper also rejects symlinks, hard links, and non-regular sibling inputs.
The older embedded form remains valid. A parseable access
end is preserved in the access artifact while the helper canonicalizes only its
derived pending-acceptance timestamp for the qualification contract.

Before either lane starts, show the exact purpose, scenarios, and competency
questions to one named human meaning owner and record that owner's id plus the
approval timestamp. Every CQ `owner`, `revision.approvedBy`, and purpose owner
must be that same person, and every `revision.approvedAt` must strictly predate
the source-hidden access window. The owner cannot be the builder, hidden
evaluator, or source-aware auditor and must be the same person who later accepts
the joined plan. The owner id and approval time come from that person's exact
question-set decision, not from an evaluator-authored stand-in. If the exact
question set has not been approved, stop before the lanes and ask; no vault
write is available.
Choose every CQ `requiredWitnessKinds` from the actual `kind` values in the
sealed witnesses used by its answer; do not copy a fixture or example kind. An
answered target must carry all of its required kinds. The helper blocks a
`failed` CQ before join; express an honestly incomplete answer as `partial` or
`unknown` with its exact gap instead of asking the person to accept a packet
error.
Before invoking `hidden`, assign every sealed manifest claim to at least one
truthfully related CQ answer: the union of all answer `claimIds` must equal the
sealed manifest id set. If no approved CQ can carry a claim, stop and obtain
approval for a revised question set; never pad an unrelated answer merely to
satisfy coverage.
Every CQ also carries the exact object
`unknownPolicy: { allowed: <boolean>, response: <nonblank string> }`.
`allowed: true` permits an explicit partial/unknown/refusal gap; it never turns
missing evidence into an answered CQ. The response states the bounded refusal
or unknown behavior the evaluator must return when evidence cannot close the
question. Read this shape from the helper `schema` stage instead of discovering
it through repeated hidden-stage failures.

Stop after `join` and show its generated exact acceptance request. Run `accept` only
after the preapproved CQ owner explicitly accepts that exact request, including
its full question-approval projection, then resubmit the
unchanged proposal and accepted qualification to `analyze_repo_structure`.
Run `release` only on that current executable response; it emits bounded writer
call data but does not execute it. If the helper is absent, use the manual
protocol below without weakening any gate. If it rejects input, inspect the
reported defect and repair it; a manual envelope cannot make failed evidence,
isolation, digests, or acceptance valid.

##### Shared requirements for either packaging path

After the first valid candidate is serialized and round-trip checked, freeze an
external claim manifest before either qualification lane starts. Each row has
one final claim `id`, `statement`, and exact `proposalRefs`; canonicalize and
digest the complete ordered manifest. This is a scratch orchestration receipt,
not a new MCP field or permission token.

Proposal-ref coverage is not body-assertion coverage. For each concept, give
every material `Definition` assertion, `Includes` / `Excludes` bullet, and
`Uncertainty` assertion its own manifest claim; multiple claims may cite the
same concept ref. Preserve a source's exact use context instead of widening it
to a broader audience or scenario. An uncertainty such as “not measured by the
static import packet” must keep that measurement qualifier and any observed
positive evidence; it cannot become an absolute source-absence claim. The
source-aware lane fails any body assertion contradicted or narrowed by current
source even when another claim already covers the same proposal row.
It must not fail a reviewed direct element-level `depends_on` merely because its
witness is an exact production/value import: verify the bounded source
dependency against both element roles, paths, and observed direction. Fail it
when either endpoint is only a path label, the direction is absent/reversed, the
relation is promoted above element level, or the answer claims runtime,
transitive, reverse, or complete impact without separate evidence.

Start both read-only lanes from that same sealed packet and manifest:

- The source-hidden evaluator receives the candidate, fixed questions, and
  manifest, but no source clone, shared vault, source-audit output, or builder
  transcript. It writes and digests its CQ answers, target results, axes, and
  complete `sourceHiddenTask` coverage before seeing any audit receipt.
- A differently identified source-aware auditor receives the candidate,
  manifest, and current source, but no hidden answers. It returns a pass/fail
  citation receipt for every manifest row and may not rewrite a claim.

When citations reuse the same source span, put each unique fragment once in the
audit input's `sourceFragmentCatalog` and reference its id through each
citation's `sourceFragmentRefs`. Do not copy a whole source-fragment catalog
into every citation. Use only the minimal fragments that verify that
claim/witness pair. The helper expands catalog input to the unchanged legacy
`sourceFragments` output and rejects mixed inline/catalog mode, duplicate
fragment bodies, foreign refs, and unused rows.

The builder, hidden evaluator, and source-aware auditor must have different
identities and the lanes must not exchange results. Record each start/end time
so overlap is evidence rather than an assertion. After both outputs are sealed,
the hidden evaluator may join the source-aware receipt into the qualification
packet without changing its earlier answers or any manifest `id`, `statement`,
order, or `proposalRefs`. Compare the final `claims` array byte-for-byte with the
manifest before resubmission. Actor collision, source-hidden access to source or
audit output, missing/extra rows, digest drift, citation mismatch, or claim
mutation blocks the join and withholds human acceptance.

Classify the seven axes by what actually failed. An unnamed persona, meaning
owner, or still-partial action question belongs in the matching CQ and
functional/pragmatic gap when the proposed definitions and boundaries remain
coherent with their bounded evidence. Mark `semantic` red only when the meaning
or boundary itself is unsupported, contradictory, circular, or conflated with
implementation structure. Semantic, structural, evidence-provenance,
maintainability, and interoperability are mandatory; a real red result on one
of them blocks the join rather than becoming a human-accepted gap.

Keep preliminary gaps visible during proposal review. Request final plan/gap
acceptance only after the clean join; earlier disclosure is not acceptance.
If isolated parallel execution is unavailable, keep the same fail-closed lifecycle in
serial; do not weaken independence to claim a faster first pass. A serial run
cannot satisfy the helper's measured-overlap condition: use the manual protocol
with honest serial timing, or defer helper release. Never invent overlap.

The builder cannot evaluate its own construction. If an independent evaluator
cannot run, stop without writes and ask the user for an independent evaluation
handoff. `not_measured`, stale/private provenance, unsupported claims, or any
red mandatory axis remains blocking. Only functional or pragmatic gaps that
were independently measured may remain, and each must keep its exact id.

Show the exact review plan grouped by project, domains, capabilities, elements,
and relations. Include definitions and evidence, not only slugs. Show every
`requiredGapId` and offer:

- accept all and the listed gaps;
- select concepts;
- refine definitions/boundaries;
- stop without writing.

If the user selects a subset, remove rejected concepts and relations whose
endpoints are no longer present, then restart at step 8. A changed plan needs a
new digest and a fresh acceptance.

Only after explicit acceptance, fill the qualification's `acceptance` with
declared human provenance plus the exact returned `planDigest`, `planRevision`,
and every accepted gap id. This records an assertion; Atlas does not
authenticate identity or certify the plan as truth.

Call `analyze_repo_structure` again with the unchanged proposal and that
complete qualification packet. Require all three:

- `proposalValidation.canWrite: true`;
- `constructionLifecycle.writeEligibility: executable`;
- `writePlan` exactly equal to the previously shown `reviewPlan`.

Any plan/source digest change, maker-only evaluation, incomplete source-hidden
run, mandatory-axis failure, regression failure, or unaccepted gap blocks the
write. Never reconstruct or edit the released rows by hand.

