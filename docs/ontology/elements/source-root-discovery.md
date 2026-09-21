---
uid: 7ac44f32-bf90-4083-b1e8-588b699f9937
slug: elements/source-root-discovery
kind: element
title: Source root discovery
display_en: Source root discovery
display_ko: 소스 루트 탐색
domain: domains/code-evidence
path: mcp/src/project-source-discovery.mjs
created_by: "agent:claude-code"
---

Collects the candidate folders a project could be bound to when nobody named one, walking outward within a fixed bound and refusing to nominate the filesystem root or the home directory.

## Includes
- Candidate roots from the enclosing repository or the nearest folder carrying a project manifest.
- A depth bound on how far the walk may go.

## Excludes
- Choosing between candidates; the ranking is done elsewhere and the person confirms.
- Binding anything without an explicit confirmation.

## Uncertainty
- Read from the module header. It was never exercised in this vault because both bindings named the root explicitly, so the ranking that follows discovery is unobserved here.