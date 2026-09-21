---
uid: 1be0b896-d697-48af-b816-b075ca4a2739
slug: elements/project-identity-detection
kind: element
title: Project identity detection
display_en: Project identity detection
display_ko: 프로젝트 정체 판별
domain: domains/code-evidence
path: mcp/src/analyze/project-detection.mjs
created_by: "agent:claude-code"
---

Works out who a repository says it is, from its package manifest, its build configuration, or the first heading of its README, and what domain candidates its section headings suggest.

## Includes
- Project name and description taken from a declared manifest rather than a folder name.
- Domain candidates read from README section headings, and the nodes an existing vault already contributes.

## Excludes
- Treating a heading as a domain; it produces candidates a person still has to accept.
- Reading implementation files.

## Uncertainty
- Read from the module header and its import receipts. Which manifest wins when a repository declares several was not traced, and its behaviour on a repository with no manifest and no README was not tested.