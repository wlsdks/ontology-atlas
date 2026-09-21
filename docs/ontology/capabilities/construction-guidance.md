---
uid: df40993a-ed25-4f1d-968a-a621c1c32c93
slug: capabilities/construction-guidance
kind: capability
title: Construction guidance
display_en: Construction guidance
display_ko: 구축 지침
domain: domains/meaning-layer
elements: []
path: mcp/src/construction-rules.mjs
created_by: "agent:claude-code"
---

Tells a person or an agent how to build this graph well, from one written source that every channel repeats: the server's opening instructions, the guide topics, and the warnings a write hands back.

## Includes
- The construction card, the long-form topics behind it, and the procedure for deciding whether a new child is a real concept or a duplicate.
- Guidance delivered at the moment of the write, not only in documentation.

## Excludes
- Enforcing the guidance; the rules shape warnings and never block a write.
- Rules about the format of a file, which the schema owns.

## Uncertainty
- Read from the module header, which records the 2026-07-31 decision that produced it and the case it was written against. The full rule text was not read, and whether following it measurably improves a vault is not a claim the repository makes.