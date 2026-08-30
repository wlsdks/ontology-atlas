# Ontology Quality Authority Map

This document is not the place to create new ontology rules. It is an authoritative map that lets you find, in one place, where the canonical answer for any question lies and what is machine-enforced, what is a review signal, and what requires human judgment. If values or public tool contracts below differ from those in other documents and code, fix the owning canonical source, not this document.

## Public Quality Contract

- There is **no upper limit on the number of nodes** in the entire vault or project.
- The direct connection width of a single parent is not a defect judgment but a **signal to start review**. A wide hub where each child's role is exclusive and justifications are resolved can be a correct structure.
- Bridge nodes are not baskets for reducing numbers. They describe shared behavior in one sentence, are distinguishable from siblings, and only qualify when they actually re-parent children.
- The candidate/citation limits of the repository analyzer limit the **width of evidence packet processing** in one pass. They are not upper limits on graph size, project size, or node fan-out.
- `uid` is a permanent identity that persists even if the name changes, and `slug` is the current address read and edited by humans. Source location is the `path:` justification; do not put raw paths in graph relations.
- Isolate checkout, vault, node, and relation for external repository field trials in scratch. Generalized measurements and failure learnings can remain, but do not merge external trial ontologies into Atlas dogfood ontology.

## Who Decides What

| Question | Classification | Execution/Canonical Source | Verification |
|---|---|---|---|
| Which kinds and frontmatter are valid? | hard · code-enforced | `mcp/src/schema.mjs` (`VAULT_KIND_SCHEMA`, `NODE_UID_PATTERN`) · mirror `cli/src/lib/schema.mjs` · public format `docs/ONTOLOGY-ATLAS-SPEC.md` | `tests/contract/vault-schema.contract.test.ts` · `tests/contract/validate-vault-document.contract.test.ts` |
| Element names, slugs, and boundaries between `path:` and `elements:` | hard shape + advisory meaning | `mcp/src/construction-rules.mjs` (`ELEMENT_NAMING_RULE_EN`, `CONSTRUCTION_RULES_EN`) · write path `mcp/src/vault.mjs` · human explanation `docs/guide/what-becomes-a-node.md` | `mcp/src/write-path-gate.test.mjs` · `tests/contract/construction-rules.contract.test.ts` |
| Total node count and direct fan-out | no hard cap · advisory review | Value `NODE_ELIGIBILITY_GATE` in `mcp/src/schema.mjs` · procedure/phrasing `mcp/src/construction-rules.mjs` · rationale and refutation `docs/DECISIONS.md` | `mcp/src/write-path-gate.test.mjs` · `tests/contract/vault-schema.contract.test.ts` |
| Whether to maintain a wide hub or create a bridge | human judgment · tool-assisted | Four bridge conditions and non-exclusive questions in `CONSTRUCTION_RULES_EN` · user guide `docs/guide/what-becomes-a-node.md` | Review write warning/maintenance results alongside the actual parent's `get_concept` and `facets` |
| Current width of language-specific repository analysis packets | evidence protocol · code-owned | Python auto/risk candidates are `PYTHON_IMPORT_ELEMENT_LIMIT`·`PYTHON_IMPORT_RISK_ELEMENT_LIMIT` in `mcp/src/analyze/constants.mjs`; additional exact endpoint is `PYTHON_SELECTED_IMPORT_ELEMENT_LIMIT` in `mcp/src/meaning-evaluation.mjs`; public behavior is `mcp/README.md` | `mcp/src/analyze.test.mjs` · `mcp/src/meaning-evaluation.test.mjs` · `mcp/src/integration.test.mjs` |
| Boundary between field trial data and product dogfood | evidence protocol | `.agents/skills/ontology-field-trial/SKILL.md` and similar content in `.claude` mirror · prohibition rules `.claude/rules/forbidden.md` | Verify scratch paths, source-hidden handoff, and citation path verification in trial records; external outputs must not be in the repo diff |
| How to draw many children on the map | rendering only · not ontology policy | Dense-group contract and topology renderer in `docs/FEATURES.md` | Relevant UI/contract/performance checks; do not reuse this value for ontology quality judgments |


## Change Rules

1. First, change the owning canonical source in the table above. Do not create separate norms in this document for values or enums owned by code.
2. Rules that machines can judge must prove red/green with tests and gate probes in the same change. For rules requiring human judgment like meaning exclusivity, leave sentences and refutation conditions.
3. If public invariant principles change, update the short contract in `README.md`. Do not replicate detailed algorithms or variable caps in README.
4. Append rationale, failed counterarguments, and re-review conditions to `docs/DECISIONS.md`. This document does not rewrite that history.
5. Finally, run verification pointed out by `pnpm checks:changed -- <touched paths>`, and if ontology meaning has changed, sync the dogfood vault by augmenting existing nodes.

## Observations Viewed as Failures

If any of the following occur, this authoritative map has failed its role.

- A future contributor or agent describes the analysis packet limit as a graph/node/fan-out limit.
- Splitting a valid hub just because it is wide, or creating an empty bridge without moving children.
- Writing raw source paths in `elements:` or treating UIDs and slugs as the same identity.
- Having to manually fix the same rule in multiple prose files, with one quietly becoming outdated.
- External field-trial ontology entering dogfood node/relation.

In such cases, do not replicate the explanation further. Move it to a surface generatable from the execution source, or remove it if it is an unfindable authoritative map.
