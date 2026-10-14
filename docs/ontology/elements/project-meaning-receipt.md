---
uid: b6e5939b-1f09-4e27-8dfc-a3c5e15af8ad
slug: elements/project-meaning-receipt
kind: element
title: Project meaning receipt
display_en: Project meaning receipt
display_ko: 프로젝트 의미 검증 기록
domain: domains/meaning-layer
path: mcp/src/project-meaning-receipt.mjs
created_by: "agent:codex-mcp-client"
---

## Definition

Project meaning receipt keeps the assessment of a project's five competency answers bound to the exact project document, graph and source evidence that were explicitly finalized.

## Evidence
- Primary implementation: `mcp/src/project-meaning-receipt.mjs#readProjectMeaningAssessment`
- Supporting implementation: `mcp/src/meaning-assessment.mjs#deriveMeaningAssessment`
- Focused test: `mcp/src/project-meaning-receipt.test.mjs#body digest binds the receipt to the entire current project Markdown`
- Focused test: `mcp/src/project-meaning-restart.test.mjs#fresh MCP readers keep edited answers unconfirmed until explicit finalization`
- `mcp/src/tools/graph.mjs` reads the assessment for health, workspace and task briefs.
- `mcp/src/tools/project-source.mjs` finalizes only after checking the current document timestamp, vault validation, complete project scope and the recorded witnesses.

## Includes
- Parsing the five fixed competency questions from the current project Markdown.
- A provenance receipt containing the body digest, graph hash, evaluator and source fingerprint, without raw answers or private source roots.
- Diagnosing a parseable project document changed since finalization as requiring competency review once source prerequisites hold.
- Keeping malformed documents, unsafe or invalid receipts, and missing witness inventories fail-closed; stale source evidence keeps its own recovery priority.
- Requiring explicit finalization after review; a new receipt with partial answers still needs evidence.

## Excludes
- Deciding that a person's product interpretation is correct.
- Measuring the source folder, granting write approval, or automatically finalizing.
- Treating supported paths, a healthy graph or passing code checks as accepted meaning.

## Uncertainty
- Read and exercised during the bounded 2026-10-14 self-use pass through receipt tests and fresh stdio MCP processes. The evidence covers recovery classification, unchanged files during reads and preservation of incomplete answers.
- This does not qualify the project's remaining capabilities or prove that arbitrary authored answers follow from their cited code.
