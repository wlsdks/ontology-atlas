---
uid: c048a18a-3730-436e-a806-fa01231d648e
slug: elements/meaning-proposal-evaluator
kind: element
title: Meaning Proposal Evaluator
display_ko: 뜻 제안 판정기
domain: domains/project-portfolio
path: mcp/src/meaning-evaluation.mjs
created_by: "agent:codex"
---

## Definition

The meaning proposal evaluator validates proposed project, domain, capability, element, relation, and competency meaning against bounded repository analysis, then derives the exact non-writing review plan and any later released write plan.

## Claim-local authority

A Definition, Includes, Excludes, relation rationale, or answered competency that overlaps line-scoped `reviewRequiredEvidence` needs a different claim-aligned current semantic source. Without that source, the proposal fails; a partial or visible-gap answer may retain the unit only as unresolved counterevidence.

One exact current candidate unit plus one matching implementation witness may support only a capability proposal below 0.8 confidence. The path is not a second semantic authority and cannot establish domain, ownership, completeness, an answered competency, qualification, approval, or write.

## Exact body contract

Generated concept bodies use the parser canonical full-body representation with exactly one structural leading newline. The Markdown writer removes that representation-only prefix before serialization and the parser restores it on read, so `reviewPlan.body`, accepted `writePlan.body`, and a persisted full-body read remain byte-identical without changing Markdown content.

## Boundary

This evaluator neither writes a vault nor authenticates human acceptance. Unknown evidence remains a gap, project exclusions still require source-backed meaning, and canonical whitespace cannot substitute for claim, citation, source-hidden, or approval checks.

## Evidence

- Primary implementation: `mcp/src/meaning-evaluation.mjs#evaluateMeaningProposal`
- Supporting implementation: `mcp/src/meaning-evaluation.mjs#validateMeaningProposalAgainstAnalysis`

## Includes

- Validating a proposed project, domain, capability, element, relation, or competency meaning against bounded repository analysis.
- Requiring claim-local current semantic evidence for any Definition/Includes/Excludes/rationale overlapping `reviewRequiredEvidence`, and deriving both the non-writing review plan and the later write plan.
- The canonical-body whitespace contract keeping `reviewPlan.body`, `writePlan.body`, and persisted reads byte-identical.

## Excludes

- Writing the vault or authenticating human acceptance; this evaluator only validates and derives plans.
- Judging construction-wide qualification axes (witnesses, citations, coverage), owned by elements/construction-qualification-evaluator.
- Repository source analysis itself, performed by the analyze pipeline this evaluator consumes rather than runs.
