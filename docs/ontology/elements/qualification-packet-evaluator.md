---
uid: 36edc7a5-9317-4826-aed5-c8a2c2aec391
slug: elements/qualification-packet-evaluator
kind: element
title: Qualification packet evaluator
display_en: Qualification packet evaluator
display_ko: 자격 패킷 평가기
domain: domains/code-evidence
path: mcp/src/construction-qualification.mjs
created_by: "agent:claude-code"
---

Validates the packet an independent evaluator submits about a proposed ontology and derives a categorical result across seven quality axes, deliberately refusing to reduce it to a score.

## Includes
- The seven axes, the competency-question results, and the claim and citation checks the packet must carry.
- Categorical output in which a failed axis cannot be averaged away by clean structure elsewhere.

## Excludes
- Writing to the vault or approving the meaning it evaluates.
- Standing in for a person; approval remains declared provenance, not a truth certificate.

## Uncertainty
- Read from the module header and its consumers. At roughly 1,600 lines it is the largest module in this domain and its body was not read; no qualification packet was ever submitted in this session, because this setup has no independent evaluator.