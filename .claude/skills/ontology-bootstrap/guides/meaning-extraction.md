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

- `includes`: representative in-scope behaviors;
- `excludes`: the nearest tempting misconception or neighboring responsibility.

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

When sources disagree:

1. quote or summarize both positions;
2. distinguish shipped behavior from aspiration;
3. lower confidence;
4. ask the user when the conflict changes a domain boundary or relation.

## Relation rules

Use the specification's matrix for relation name, storage key, endpoint kinds,
direction, inverse behavior, and inference. This guide adds the evidence review
below; it does not widen the public relation enum.

Accept an edge only when all four answers exist:

1. What are the endpoints?
2. What typed predicate connects them?
3. What evidence supports that predicate?
4. What reasoning or future impact depends on the edge?

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
