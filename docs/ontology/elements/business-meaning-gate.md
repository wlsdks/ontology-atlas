---
uid: 6f7c2ccb-edb6-44a5-a6c3-9fda61354f95
slug: elements/business-meaning-gate
kind: element
title: Business meaning gate
display_en: Business meaning gate
display_ko: 업무 의미 게이트
domain: domains/code-evidence
path: mcp/src/analyze/meaning-gate.mjs
created_by: "agent:claude-code"
---

Separates what the vault already holds from what is merely proposed and what a person still has to review, and binds each business candidate to the sentence that witnesses it.

## Includes
- Business capability candidates derived from semantic evidence, each carrying the excerpt that suggested it.
- The three-way split of already-recorded, proposed, and needs-review, and the extraction contract its competency questions form.

## Excludes
- Writing any candidate into the vault.
- Treating folder structure as business meaning; that separation is the point of this gate.

## Uncertainty
- Read from the module header and its imports. The clue list that drives candidate detection was not read, so how well it recognises business language outside this repository's vocabulary is unknown.