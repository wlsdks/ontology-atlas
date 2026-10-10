---
uid: c2098d78-0a39-4f7d-b864-81b40322dc47
slug: capabilities/repo-structure-analysis
kind: capability
title: Repository structure analysis
display_en: Repository structure analysis
display_ko: 저장소 구조 분석
domain: domains/code-evidence
elements: [elements/bounded-source-read, elements/business-meaning-gate, elements/non-js-implementation-evidence, elements/project-identity-detection, elements/rust-feature-evidence, elements/semantic-evidence-packet, elements/source-declaration-outline, elements/source-element-candidates]
path: mcp/src/analyze/repo-structure.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/construction-qualification-gate, capabilities/import-dependency-inference, elements/bounded-source-read, elements/business-meaning-gate, elements/non-js-implementation-evidence, elements/project-identity-detection, elements/rust-feature-evidence, elements/semantic-evidence-packet, elements/source-element-candidates]
relation_notes: { capabilities/import-dependency-inference: "You asked for what depends on what: a structure proposal may only cite import endpoints the import scan already observed.", elements/project-identity-detection: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/project-detection.mjs.", elements/semantic-evidence-packet: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/semantic-evidence.mjs.", elements/non-js-implementation-evidence: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/native-evidence.mjs.", elements/business-meaning-gate: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/meaning-gate.mjs.", elements/source-element-candidates: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/source-elements.mjs.", elements/rust-feature-evidence: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing rust-feature-evidence.mjs.", capabilities/construction-qualification-gate: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing construction-lifecycle.mjs, which is why a bulk plan cannot be released unqualified.", elements/bounded-source-read: "You asked me to add depends_on only where I witnessed the import: mcp/src/tools/repo-analysis.mjs imports `readSourceEvidence`, `composeSourceDigest` and `validateSourceReadSelectors` from source-evidence.mjs into the analyze tool.", elements/source-declaration-outline: "You asked me to name the role, not the file: listing a file's declarations so the next read is exact is a second role the same capability uses." }
---

Reads a bound code repository and proposes candidate ontology nodes so a person can inspect, correct or reject the modeled meaning.

## Includes
- Full discovery from package/README and implementation structure, kept separate from accepted business meaning.
- Bounded source reads by exact lines or declaration outline, with hashes, refusals and continuation coordinates.
- Opt-in `sourceOnly:true` continuations through `mcp/src/tools/repo-analysis.mjs`: identical sourceEvidence without another candidate scan, delivered as rootPath, delivery, canWrite:false and sourceEvidence.
- Full analysis and proposal/qualification replay when sourceOnly is omitted or false; lifecycle fields are rejected in source-only mode, including explicit null values.
- Construction guidance that traces entry-point setup, branch conditions, failures, customization and callees before writing supported rules into node bodies.

## Excludes
- Promoting structure, source text, outlines or test names into accepted meaning.
- Writing a vault or releasing a candidate from a source-only packet.
- Adding repository tools to the app's internal local conversation.

## Uncertainty
- Re-read the source-only branch and original full path in `mcp/src/tools/repo-analysis.mjs` on 2026-10-03. MCP integration exercised identical evidence, false/omitted full-mode parity, null lifecycle rejection, and escaped/sensitive/symlink/stale-hash refusals. Existing stable source-read unit guards also ran.
- A frozen calibration read returned 11,105 bytes in full mode and 2,042 bytes in source-only mode with identical sourceEvidence. This does not establish general build speed or meaning quality.
- Actual ACP construction and source-hidden readers ran on a calibration and a fresh source shape. Their partial answers and citation/condition defects remain audit evidence, not formal candidate qualification or human competency acceptance. Native local source construction and installed-app behavior remain unmeasured.
