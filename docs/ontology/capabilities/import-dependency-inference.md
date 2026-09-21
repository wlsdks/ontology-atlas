---
uid: f2a684bd-92f8-4f37-b2d1-0e4ea8078bbd
slug: capabilities/import-dependency-inference
kind: capability
title: Import dependency inference
display_en: Import dependency inference
display_ko: 임포트 의존성 추론
domain: domains/code-evidence
elements: [elements/import-reconciliation]
path: mcp/src/infer-imports.mjs
created_by: "agent:claude-code"
relation_notes: { elements/import-reconciliation: You asked for element nodes named by role under the capability that uses them; diffing observed imports against declared dependencies is this role. }
---

Walks the connected source tree and derives file-level and module-level static import edges as reviewable dependency candidates, and reconciles them against the dependencies the vault already declares.

## Includes
- Static imports in TypeScript, JavaScript, Python, Rust, and Go, with a bounded focused view around one named file.
- A reconciliation showing where declared meaning and observed imports disagree.

## Excludes
- Runtime behaviour, dynamic dispatch, and transitive or reverse impact.
- Promoting an observed edge into a declared dependency on its own; every candidate waits for a person.

## Uncertainty
- Exercised once in focused mode against `cli/src/index.mjs`, which returned zero edges even though that file's static imports are visible in its source, so the focused view's resolution of relative specifiers is not something this scan can vouch for.