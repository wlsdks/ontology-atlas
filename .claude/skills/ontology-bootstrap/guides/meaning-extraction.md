# Ontology meaning extraction standard

Use this standard while converting an Atlas project packet into proposed
ontology concepts.

## What counts as an ontology concept

A concept represents a stable unit of shared meaning. It needs:

- a non-circular definition;
- a boundary: what it includes and excludes;
- one or more source citations;
- a place in the project/domain/capability/element hierarchy;
- relations whose predicates can be explained;
- an explicit confidence or unresolved uncertainty.

A label without those properties is a tag, not yet an ontology concept.

## Kind tests

### Project

Test: Can the definition finish the sentence, “This system exists so that …”?

Bad: “A TypeScript monorepo.”

Good: “A personal AI companion that preserves continuity and acts with
context-sensitive initiative.”

### Domain

Test all:

- Is it a durable responsibility or problem boundary?
- Does it group at least two coherent capabilities, or is there strong evidence
  that it will?
- Would the boundary still make sense if the implementation were rewritten?
- Can its difference from neighboring domains be stated?

Reject domains copied from `src/`, package names, teams, technologies, document
sections, lifecycle phases, or generic words such as “platform” without a
specific responsibility.

### Capability

Test all:

- Does it describe something the product/system can do?
- Is its outcome observable by a user, operator, or dependent system?
- Can it be expressed without prescribing the current module or framework?
- Does the source describe it as shipped, required, or intentionally planned?

Prefer ability phrases such as “Preserve conversational continuity” over
component nouns such as “Memory Manager.” Record shipped/planned/unknown status
when evidence permits.

### Element

Use for concrete implementation evidence: application, package, service,
module, schema, command, UI surface, integration, or file. A precise technical
name is desirable here.

An element may support multiple capabilities. Do not create one capability per
package merely to force a one-to-one hierarchy.

## Definition rules

Write an intensional definition:

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

Accept an edge only when all four answers exist:

1. What are the endpoints?
2. What typed predicate connects them?
3. What evidence supports that predicate?
4. What reasoning or future impact depends on the edge?

Common interpretations:

- `contains`: scope/ownership, not mere physical nesting;
- `domain`: a capability or element belongs to a responsibility boundary;
- `depends_on` / `dependencies`: the source requires the target to function or
  a change to the target can affect the source;
- `relates`: meaningful association when a stronger predicate cannot be
  justified; use sparingly;
- `describes`: a document explains another concept.

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
