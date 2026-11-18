---
uid: 36edc7a5-9317-4826-aed5-c8a2c2aec391
slug: elements/qualification-packet-evaluator
kind: element
title: Qualification packet evaluator
display_en: Qualification packet evaluator
display_ko: 자격 패킷 평가기
domain: domains/code-evidence
path: mcp/src/construction/construction-qualification.mjs
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
- Read from the module header, its consumers and, on 2026-11-19, its entry point `evaluateConstructionQualification`: it validates each part of the packet in turn, derives the seven axes, and returns `qualified` only when no finding is an error, every axis, competency question and claim passes, every citation is verified, the source-hidden task passes and acceptance is `accepted`. The per-part validators in its roughly 1,600 lines were not read one by one, and no qualification packet was ever submitted, because this setup has no independent evaluator.