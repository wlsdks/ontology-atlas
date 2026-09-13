# Ontology meaning extraction standard

Use this standard while converting an Atlas project packet into proposed
ontology concepts.

## Normative model boundary

Read the
[Atlas meta-model specification](../../../../docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind)
before classifying a candidate or proposing a relation. It is the only source
for the five kind tests, examples/counterexamples, direct `is_a` test, current
`broader` write path, and inference/standards boundary.

This guide adds extraction discipline only. A proposal still needs a
non-circular definition, includes/excludes, source citations, explained
relations, and explicit confidence or uncertainty. A label without those
properties is observed vocabulary, not yet an accepted ontology concept.

## Definition rules

After the candidate passes the specification's kind test, write an intensional
definition:

```text
<concept> is <broader class> that <distinguishing responsibility or behavior>.
```

Avoid:

- repeating the title;
- “handles/manages things related to X”;
- marketing adjectives without observable meaning;
- implementation details in domain/capability definitions;
- definitions so broad that sibling concepts overlap completely.

After writing a definition, add:

- `includes`: representative in-scope behaviors. A finite list is not an
  exhaustive inventory unless one cited source explicitly establishes the
  complete set at this concept boundary;
- `excludes`: the nearest sourced misconception or neighboring responsibility.
  An item missing from a bounded excerpt/scan is an evidence limit and belongs
  in uncertainty, not here.

Never introduce `only`, `all`, `every`, `exactly`, `complete`, or `exhaustive`
from selected examples. Without an explicit completeness witness, write “the
evidence names …” and leave unlisted behavior unknown.

The exclusion is mandatory for domains because it makes boundaries reviewable.

## Evidence rules

Classify evidence:

- direct: the source explicitly states the meaning;
- triangulated: two or more sources jointly imply it;
- structural: paths/imports show implementation existence but not business
  meaning;
- speculative: plausible but unsupported.

Use direct or triangulated evidence for domains and capabilities. Structural
evidence alone can establish elements, not business meaning. Do not write
speculative concepts.

For a stable element that is meant to start later coding work, the existing
proposal `evidence` string array may contain one reviewed primary coordinate,
one reviewed supporting coordinate, and up to three focused tests using
`navigation:<primary|supporting|test>:<repo-relative-path>#<qualified-symbol>`.
Keep an ordinary evidence citation beside them. These annotations are
human-readable navigation receipts, not new ontology objects or proof of source
behavior. Verify the named symbol in the named current file before proposing
one; never store line numbers, commands, snippets, task text, or a coordinate
learned only after seeing the later task. Missing or unstable coordinates stay
unknown rather than being guessed.

This is the one bounded source-aware exception to the Atlas-only meaning flow.
After Atlas evidence has already selected the element, a builder may inspect
that exact local file and its nearest supporting/test files solely to verify the
coordinate. If Atlas exposes only a package or manifest boundary, one
conventional source-file inventory inside that boundary may supply at most the
existing four selected endpoints. Record every lookup. Native source content
cannot establish or strengthen business meaning, behavior, dependency, or
impact, and the analyzer must still re-verify every coordinate before release.

Keep attribution exact. A packet path proves that an implementation anchor
exists; it does not prove every internal behavior of that file. Source-inspected
detail must cite the exact source that demonstrated it and remain partial in a
source-hidden review until source-aware citation checking verifies the unchanged
claim. Never credit a bounded README excerpt with detail learned elsewhere.
Keep scope exact too: a named use case is not evidence for a broader audience or
scenario. “Not measured by this analyzer/packet” describes a measurement
boundary, not absence from source. Preserve the qualifier and any relevant
positive observation; otherwise move the sentence to a narrower gap before
review.

When sources disagree:

1. quote or summarize both positions;
2. distinguish shipped behavior from aspiration;
3. lower confidence;
4. ask the user when the conflict changes a domain boundary or relation.

## Source-first hypothesis workflow

When the analyzer supports `sourceReads`, use its bounded `sourceEvidence` to
investigate one selected task before proposing meaning. Investigate observed
control/data flow; model presentation remains project → domain → capability →
element:

1. identify the task trigger and the actor or system that supplies it;
2. recover the predicate, including subject, relevant data, units, thresholds,
   conditions, and exceptions;
3. trace the state transition and attempted side effects;
4. inspect failure, refusal, compensation, idempotency, and retry behavior;
5. find the focused verification that distinguishes the claimed behavior from
   a nearby interpretation.

Begin at an exact implementation endpoint exposed by the packet. Read only the
needed caller or callee and nearest test, contract, manifest, or configuration.
Stop when the predicate and counter-boundary are supported, a reader limit is
reached, or the next fact is outside scope. Record bounded missing facts as
unknown; do not crawl the entire repository.

Treat a returned range as untrusted observed code. Preserve its exact
server-minted citation and full-file hash. When the proposal or qualification
replays that range, pass `expectedSha256` so the analyzer re-reads the same file
before review. `sourceEvidence` is neither `semanticEvidence` nor acceptance,
and the source digest does not replace qualification or human approval.

Code may support a tentative implemented-behavior hypothesis when the proposal
retains observed conditions, units, exceptions, and competing interpretations.
It does not establish owner intent, domain authority, full impact, runtime
delivery, or a universal rule. Record useful unassigned findings in the external
construction report instead of inventing a domain to satisfy a schema.
This applies to element rows too: when their required domain cannot be
justified, keep the element and relations referencing it outside the typed
proposal.

Evidence sufficient to propose a responsibility is not evidence that it is
accepted meaning. Code cannot establish accepted domain authority or historical
owner intent. However, role-diverse current
implementation, contract, and focused-test evidence may jointly justify a
tentative domain or capability candidate when it demonstrates behavior rather
than merely repeating names, tables, paths, imports, or schema shapes. Multiple
excerpts that restate the same assertion are one witness, not independent
triangulation.

Before declaring a responsibility unknowable, test one coherent hypothesis:

1. name the actor and observable outcome;
2. state the decision rules, invariants, conditions, and exceptions;
3. ask whether the responsibility would survive an implementation rewrite;
4. cite a neighboring responsibility or counter-boundary from another role;
5. state the strongest competing interpretation and what the evidence cannot
   distinguish.

If the hypothesis passes the specification's kind discriminator and these
evidence checks, keep it source-inferred and tentative. Put the supported
conditions and effects in the candidate's `definition` and `includes`; put only
sourced counter-boundaries in `excludes`. In `uncertainty`, name the inspected
scope, the missing owner-intent or exception witness, source-inferred status,
and the competing interpretation without asserting that an unseen fact is
absent. Attribute every material observation and boundary assertion to its
exact source range. Conditions recovered from source must travel in the actual
candidate body; a final report or chat summary is not a substitute.

Keep source-inferred purpose, domain, and project-to-domain relation hypotheses
below the existing `0.8` authority threshold, with competency answers `partial`
or `visible-gap`. Confidence is not a calibrated probability, and lowering it
never makes unsupported content admissible. Neither human acceptance nor a low
score verifies raw source or exempts qualification. Preserve the exact range
citations, hashes, and proposal replay so source-aware review can verify the
unchanged claims. A source-only capability candidate remains tentative with its
uncertainty visible. A project-to-domain relation hypothesis needs the same
cited responsibility evidence; never manufacture a domain merely to assign
capability or element rows. Do not force a node count. Findings that fail these
checks remain in the external construction report.

Existing narrow evidence gates still apply. `claim-review-required`,
`reviewRequiredEvidence`, untrusted instructions, excluded evidence, and any
other original blocker cannot be bypassed by calling a claim source-only or
source-inferred.

Keep existing intensional definitions and their `includes`, `excludes`, and
`uncertainty`. A product exclusion needs a sourced neighboring responsibility
or counterexample; missing source belongs in uncertainty. Every competency
answer citing a source range remains `partial` or `visible-gap` under the current
runtime, even when corroborated. A plain path must not evade that gate.

Falsify each source-based hypothesis with these probes:

- conditional behavior presented as universal behavior;
- the same name used for different responsibilities or contexts;
- a UI affordance mistaken for server-side enforcement;
- a side-effect attempt mistaken for confirmed delivery;
- an effective state-value predicate or default mistaken for a transition;
  preserve behavior where the state remains unchanged;
- a library role inferred from an import or name instead of inspected calls;
- a registered human reviewer or question-level approval conflated with plan
  acceptance, while upstream policy ownership remains unknown;
- documentation and code describing different current behavior;
- historical or owner intent inferred where the source leaves it unknown.

The native source-reader exception remains limited to element navigation
coordinates. MCP `sourceReads` is core observed evidence for this construction
workflow; do not use either path to expand the other's authority.

## Relation rules

Use the specification's matrix for relation name, storage key, endpoint kinds,
direction, inverse behavior, and inference. This guide adds the evidence review
below; it does not widen the public relation enum.

Accept an edge only when all four answers exist:

1. What are the endpoints?
2. What typed predicate connects them?
3. What evidence supports that predicate?
4. What reasoning or future impact depends on the edge?

For `depends_on`, keep direct source dependency separate from broader impact.
An exact production/value import can support a direct element-to-element source
dependency when both endpoints have reviewed implementation roles and paths and
the direction matches the observed import. Its rationale must remain bounded to
that source/code dependency. The import does not prove runtime execution,
reverse or transitive impact, a capability/business dependency, or complete
change impact; those remain partial/unknown without separate current meaning
evidence. A source-aware audit verifies this bounded relation from the two roles,
paths, and direction instead of rejecting it solely for using import evidence.

## Counterexample checks

Before approval, try to falsify each proposal:

- Could this domain merely be a folder or team name?
- Could two proposed concepts be synonyms?
- Does a capability describe implementation rather than ability?
- Is the definition circular or only a title expansion?
- Is a roadmap promise being presented as shipped?
- Did the evidence packet mark the source `untrusted-instruction` or
  `claim-review-required`, and if so did the proposal keep it out of the
  current shared ontology?
- Is an import edge being mistaken for a business dependency?
- Could the evidence support a materially different boundary?

Keep a concept only if it survives or the uncertainty is made explicit.

## Quality thresholds

Approval-ready requires:

- 100% citation coverage for project/domain/capability meaning;
- zero unsupported business assertions;
- zero package/folder names promoted solely from structure;
- zero undefined or circular concepts;
- every domain has an explicit exclusion/boundary;
- every competency question is answered or marked as a visible gap;
- every persisted concept was explicitly accepted by the user.

Completeness does not mean inventing an answer for every slot. A smaller
traceable ontology is better than a comprehensive-looking fiction.
