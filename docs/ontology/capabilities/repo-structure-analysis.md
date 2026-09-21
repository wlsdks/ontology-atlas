---
uid: c2098d78-0a39-4f7d-b864-81b40322dc47
slug: capabilities/repo-structure-analysis
kind: capability
title: Repository structure analysis
display_en: Repository structure analysis
display_ko: 저장소 구조 분석
domain: domains/code-evidence
elements: [elements/business-meaning-gate, elements/non-js-implementation-evidence, elements/project-identity-detection, elements/rust-feature-evidence, elements/semantic-evidence-packet, elements/source-element-candidates]
path: mcp/src/analyze/repo-structure.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/construction-qualification-gate, capabilities/import-dependency-inference, elements/business-meaning-gate, elements/non-js-implementation-evidence, elements/project-identity-detection, elements/rust-feature-evidence, elements/semantic-evidence-packet, elements/source-element-candidates]
relation_notes: { capabilities/import-dependency-inference: "You asked for what depends on what: a structure proposal may only cite import endpoints the import scan already observed.", elements/project-identity-detection: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/project-detection.mjs.", elements/semantic-evidence-packet: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/semantic-evidence.mjs.", elements/non-js-implementation-evidence: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/native-evidence.mjs.", elements/business-meaning-gate: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/meaning-gate.mjs.", elements/source-element-candidates: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing analyze/source-elements.mjs.", elements/rust-feature-evidence: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing rust-feature-evidence.mjs.", capabilities/construction-qualification-gate: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/repo-structure.mjs importing construction-lifecycle.mjs, which is why a bulk plan cannot be released unqualified." }
---

Reads a code repository and proposes candidate ontology nodes, each carrying the file or heading that evidences it, so a person has something concrete to accept, correct, or reject.

## Includes
- Package manifests, README headings, and folder conventions read as candidate projects, domains, capabilities, and elements.
- An explicit contract separating what was observed in source from what is only a proposal.

## Excludes
- Treating structure as business understanding; a folder or heading is evidence of a concept, not the concept.
- Writing anything into the vault; the analysis alone never changes a file.

## Uncertainty
- Exercised once against this repository at depth three, which produced twenty-five capability and sixty-five element candidates from folder conventions alone. Its behaviour on an unfamiliar repository, which the product itself calls the hardest capability, was not tested here.