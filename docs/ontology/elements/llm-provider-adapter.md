---
uid: e16aefe0-889e-4794-ade6-6fa4ab630640
slug: elements/llm-provider-adapter
kind: element
title: LLM provider adapter
display_en: LLM provider adapter
display_ko: LLM 공급자 어댑터
domain: domains/agent-access
path: src/features/vault-agent/model/provider-adapter.ts
created_by: "agent:claude-code"
---

Shapes cloud and local model requests and responses into a common form used by the vault conversation loop.

## Includes
- Normalized request, response and tool-call shapes for the supported providers.
- Structural response validation: malformed roots or blocks fail with a bounded diagnostic and no executable calls from that response. Argument validation and approval remain separate.
- The local conversation's bounded evidence reads and synthesis checks in `src/features/vault-agent/model/providers/local.ts`.
- After a successful census explicitly reports zero documented and referenced concepts, the local adapter closes tools and explains that source inspection is unavailable in this conversation. Missing, erroneous, malformed and nonempty census results do not take that shortcut.

## Excludes
- Secrets, transport and auditing, which the native layer owns.
- Choosing the provider or granting repository-analysis tools to the internal local conversation.
- Claiming that a refusal or a structurally valid response is a constructed or qualified ontology.

## Uncertainty
- Provider fixtures exercise normalization and the empty-census regression. A 2026-10-03 Node HTTP shim drove the shipped loop against the installed local 27B model: four requests and a failed impossible read became two requests and an honest source-access limit, with zero writes in both runs.
- This measured the source loop with a substituted transport, not a reinstalled native bundle or rendered app. General answer quality and newer unobserved provider shapes remain unmeasured.
