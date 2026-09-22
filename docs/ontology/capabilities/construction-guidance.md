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

Tells a person or an agent how to build this graph well, from one written source that every channel repeats: the server's opening instructions, the guide topics, and the warnings a write hands back. It also authors the sentence each of those warnings says out loud, including the exact call that repairs it.

## Includes
- The construction card, the long-form topics behind it, and the procedure for deciding whether a new child is a real concept or a duplicate.
- Guidance delivered at the moment of the write, not only in documentation.
- The wording of two findings the write door now hands back: a declared dependency the citing file never names, and a starter example still standing beside real nodes. Each message argues its own case and ends in the call that fixes it, and neither refuses the write.

## Excludes
- Enforcing the guidance; the rules shape warnings and never block a write.
- Detecting the conditions those two warnings describe, which the meaning layer's validation owns; this side owns only what the person reads.
- Rules about the format of a file, which the schema owns.

## Uncertainty
- Read today: the two message literals this module authors, `dependencyUnwitnessedMessage` (`mcp/src/construction-rules.mjs:677`) and `starterExampleNodeMessage` (`:733`), and the import list that pulls both, plus the starter's slug and body markers, into the detector (`mcp/src/meaning-findings.mjs:37-52`). The dependency message insists a cited path be written repository-relative or it is ignored; whether writers actually do so was not measured here.
- Otherwise read from the module header, which records the 2026-07-31 decision that produced it and the case it was written against. The full rule text was not read, and whether following it measurably improves a vault is not a claim the repository makes.
