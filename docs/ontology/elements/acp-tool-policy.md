---
uid: 5402f1e0-4790-40ea-9a6f-877fb6431976
slug: elements/acp-tool-policy
kind: element
title: ACP tool policy
display_en: ACP tool policy
display_ko: ACP 도구 정책
domain: domains/agent-access
path: src/features/acp-session/model/atlas-tool-policy.ts
created_by: "agent:claude-code"
---

Classifies each Atlas tool name as reading or writing when a permission request arrives carrying nothing but that name, failing closed on anything it does not recognise.

## Includes
- An explicit read list, with anything absent treated as a write.
- A sibling contract test that compares this list against the server's generated surface so it cannot drift silently.

## Excludes
- Being the authority on what a tool does; the server's surface is, and this list is held to it.
- Granting anything; it only classifies.

## Uncertainty
- Read from the module header and the opening entries of its read list. The full list was not compared against the live inventory by hand, and the contract test that would catch drift was not run.