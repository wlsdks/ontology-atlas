---
uid: 99997c8f-4694-42ac-9e80-41b9193fb393
slug: elements/source-element-candidates
kind: element
title: Source element candidates
display_en: Source element candidates
display_ko: 소스 요소 후보
domain: domains/code-evidence
path: mcp/src/analyze/source-elements.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/import-dependency-inference]
relation_notes: { capabilities/import-dependency-inference: "You asked me to turn imports I actually witnessed into dependencies: the scan shows analyze/source-elements.mjs importing infer-imports.mjs to derive package boundaries." }
---

Materializes candidate implementation roles from source layout and observed imports: Go packages and their edges, Python packages and their import boundaries, root packages, and workspace members.

## Includes
- Package-level candidates bounded by explicit per-language limits.
- Import-derived boundaries, used for navigation rather than as proof of behaviour.

## Excludes
- Inferring a capability from imports; only element candidates come from here.
- Mirroring every file; unused files are not turned into candidates.

## Uncertainty
- Read from the module header and its import of the import scanner. The per-language limits were not read, so what happens in a repository that exceeds them was not checked.