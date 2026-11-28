---
uid: c2098d78-0a39-4f7d-b864-81b40322dc47
slug: capabilities/repo-structure-analysis
kind: capability
title: Repository structure analysis
display_en: Repository structure analysis
display_ko: 저장소 구조 분석
domain: domains/code-evidence
elements: [elements/bounded-source-read, elements/source-declaration-outline]
path: mcp/src/tools/repo-analysis/analyze-structure.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/import-dependency-inference, elements/bounded-source-read]
relation_notes: { capabilities/import-dependency-inference: "You asked for what depends on what: mcp/src/analyze/survey/breadth-map.mjs imports `inferImports` and prints each unit's `imports` and `importedBy` from that scan.", elements/bounded-source-read: "You asked me to add depends_on only where I witnessed the import: mcp/src/tools/repo-analysis/analyze-structure.mjs imports `readSourceEvidence` and `validateSourceReadSelectors` from source-evidence.mjs into the analyze tool.", elements/source-declaration-outline: "You asked me to name the role, not the file: listing a file's declarations so the next read is exact is a second role the same capability uses." }
---

Surveys a bound code repository and reads its source on request, so an agent can write ontology nodes from what the code does and a person can inspect, correct or reject the meaning it recorded.

## Includes
- A breadth map of product units, entry points and the abilities to place, kept separate from accepted business meaning.
- Bounded source reads by exact lines or declaration outline, with hashes, refusals and continuation coordinates.
- Opt-in `sourceOnly:true` continuations through `mcp/src/tools/repo-analysis/`: the same sourceEvidence without another survey, delivered as rootPath, delivery, canWrite:false and sourceEvidence.
- The breadth map when sourceOnly is omitted or false; with sourceOnly the call answers its source reads alone.
- Construction guidance that traces entry-point setup, branch conditions, failures, customization and callees before writing supported rules into node bodies.

## Excludes
- Promoting structure, source text, outlines or test names into accepted meaning.
- Writing a vault, proposing nodes or releasing a plan; the survey carries no candidates.
- Adding repository tools to the app's internal local conversation.

## Uncertainty
- Re-read the source-only branch in `mcp/src/tools/repo-analysis/` on 2026-10-03. MCP integration exercised identical evidence and escaped/sensitive/symlink/stale-hash refusals. Existing stable source-read unit guards also ran. The proposal route that branch once sat beside has since been removed.
- A frozen calibration read returned 2,042 bytes in source-only mode. This does not establish general build speed or meaning quality.
- Actual ACP construction and source-hidden readers ran on a calibration and a fresh source shape. Their partial answers and citation/condition defects remain audit evidence, not human competency acceptance. Native local source construction and installed-app behavior remain unmeasured.
