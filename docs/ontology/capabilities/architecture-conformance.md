---
uid: 9b4c0b43-af62-4ab6-9f32-1b27a0618594
slug: capabilities/architecture-conformance
kind: capability
title: Architecture conformance
display_en: Architecture conformance
display_ko: 아키텍처 준수 검사
domain: domains/code-evidence
elements: [elements/architecture-record-receipt]
path: mcp/src/architecture-profile.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/import-dependency-inference]
relation_notes: { capabilities/import-dependency-inference: "You asked for a first ontology showing what depends on what: the architecture check reads the same import scan, so changing that scan changes its verdicts.", elements/architecture-record-receipt: You asked for element nodes named by role under the capability that uses them; keeping one dated receipt per measurement is this role. }
---

Sets the architecture rules a person reviewed and wrote down beside the imports actually observed in the code, one declared role per row, and reports each rule as met, violated, or unknown.

## Includes
- A reviewed profile declaring scoped roles and the dependency rules between them.
- A verdict per rule that keeps unknown separate from met, so unscanned languages and unmapped edges never read as compliance.

## Excludes
- Inferring the intended architecture from folder names; the rules are a human declaration.
- Enforcing the rules or blocking a change.

## Uncertainty
- Read from `mcp/src/architecture-profile.mjs` and the `inspect_architecture` description; no profile exists in this vault yet, so the capability was never run here, and the app-side architecture screen under `src/views/architecture/` was listed but not opened.