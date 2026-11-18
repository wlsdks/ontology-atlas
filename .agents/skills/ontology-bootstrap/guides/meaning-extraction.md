# Ontology meaning extraction standard

Use this standard while turning what a build read into nodes.

## Normative model boundary

Read the
[Atlas meta-model specification](../../../../docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind)
before classifying a candidate or proposing a relation. It is the only source
for the five kind tests, examples and counterexamples, the direct `is_a` test,
and the inference boundary. This guide adds definition and relation discipline.

## 1. Definition rules

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

## 2. Relation rules

Use the specification's matrix for relation name, storage key, endpoint kinds,
direction, inverse behaviour and inference. Write an edge only when you can name
its endpoints, its typed predicate, the line that supports it, and what a reader
will conclude from it.

A depends on B when a change to B's behaviour or contract can change or break
what A does, in the product as it is wired by default:

- Default wiring decides, not replaceability. An interface, hook or injected
  option with a shipped default is a dependency on that role; the condition goes
  in `why` ("unless a custom controller is injected").
- Direction is consumer to provider. A caller depends on the interface it
  calls. An implementation does not depend on its interface, and an interface
  never depends on an implementation. A composition root depends on what it
  wires. Never write both directions between one pair; `validate_vault` warns.
- Link ability to ability when one needs another to have run, be configured
  or be present ("a refund needs the payment record capture writes").
- Candidates come from a call on the main flow, the composition root wiring B
  into A, A reading state that B writes, or a product-code import between units
  (not test-only, not type-only). One call site or constructor line confirms it.
- An edge every node shares (config loading, logging) is written once, from the
  composition root element.
- `relates` is for alternatives or neighbours with no change impact either way.
- `why` is one checkable sentence: what A needs from B and where it happens.
  Never consent ("you approved"). A relation note states only what was read:
  `validate_vault` warns when it describes a node that says outlined only.
- Every capability has a `depends_on` or `elements` edge, or its
  `## Uncertainty` says why none is known. A first build ends with at least one
  `depends_on` per two capabilities.
