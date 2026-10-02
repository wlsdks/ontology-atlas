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

Shapes three model vendors into one form, so switching vendor is a change here rather than a change everywhere the agent loop touches.

## Includes
- One normalized request and response shape covering the supported vendors, including how each expresses a tool call.

- Structural response validation shared by cloud adapters and the OpenAI-compatible local adapter. Invalid roots or malformed message/tool blocks return a failed normalized response with a bounded structure diagnostic and no executable calls from that response. Tool argument validation and approval remain separate.

## Excludes
- Secrets, transport and auditing, which the native layer handles so keys never enter the web context.
- Choosing which vendor to use.

## Uncertainty
- Vendor-shaped fixtures and malformed root/block cases exercise the normalizers, loop failure and subsequent-send recovery. No live provider was contacted in this check; compatibility with unobserved newer response shapes and answer quality remain unmeasured.