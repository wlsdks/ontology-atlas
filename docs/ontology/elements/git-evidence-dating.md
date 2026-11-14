---
uid: e36aaa84-c19c-4001-bd51-b53803c86d3c
slug: elements/git-evidence-dating
kind: element
title: Git evidence dating
display_en: Git evidence dating
display_ko: Git 근거 시점 확인
domain: domains/code-evidence
path: mcp/src/drift/evidence-drift.mjs
created_by: "agent:claude-code"
dependencies: [elements/evidence-verdict-rule]
relation_notes: { elements/evidence-verdict-rule: "You asked me to turn imports I actually witnessed into dependencies: the scan shows evidence-drift.mjs importing evidence-verdict.mjs so the dates and the verdict cannot disagree." }
---

Dates cited source files and concept documents from their respective Git histories so a shared rule can compare evidence changes with recorded meaning.

## Includes
- Bounded date reads with distinct vault-document and source-path maps. The native command resolves the existing project binding and performs a guarded walk for each authoritative repository (`src-tauri/src/git/evidence/bound.rs`); MCP dating remains in `mcp/src/drift/evidence-drift.mjs`.
- Native checks for grants, binding and receipt identity, repository HEAD and root identity around the read.
- Native binding reads use a Unix-only confined reader, with macOS as the verified app surface. Windows returns unreadable with empty date maps and leaves the comparison unknown.
- Explicit unknowns for unavailable history, missing authority, ambiguous bindings, dirty files and omitted paths. A picker selection must match the existing bound folder before date comparison resumes.

## Excludes
- Accepting meaning or choosing the freshness verdict; the shared evidence rule owns that comparison.
- Rebinding a project, changing source files or using filesystem modification time as committed evidence.

## Uncertainty
- Controlled separate-repository fixtures exercise the native comparison; they do not establish correctness for every repository or accepted business meaning. The historical 75-percent missed-impact reduction was not reproduced in this campaign.
- The renderer hook that discarded an obsolete binding or scope before using returned dates lived in the Analysis screen and was removed with it on 2026-11-15. Which renderer code now calls the native command, and whether it keeps that discard, was not checked.
