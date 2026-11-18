---
uid: dde7868c-9c6f-4fc2-9c97-e3588c74b52c
slug: elements/agent-system-prompt
kind: element
title: Vault agent system prompt
display_en: Vault agent system prompt
display_ko: 볼트 에이전트 시스템 프롬프트
domain: domains/agent-access
path: src/features/vault-agent/model/system-prompt.ts
created_by: "agent:claude-code"
---

The instruction Atlas gives its own agent, kept in code so it changes in the same commit as the schema it describes, and readable by the person in one click so nothing is hidden.

## Includes
- The prompt text itself, and the disclosure surface that shows the person exactly what was sent.

## Excludes
- Being editable by the person; it is the product's discipline, not their data.
- Instructing agents that connect from outside, which the server's own instructions do.

## Uncertainty
- Read end to end on 2026-11-19 (`src/features/vault-agent/model/system-prompt.ts`): the product discipline, the meta-model block, the construction rules, and `buildSystemPrompt`, which appends the owner's `.ontology-atlas/agent-instructions.md` below them. The meta-model block is a literal copy of `mcp/src/construction/construction-rules.mjs`, and `tests/contract/mcp/ontology-meta-model.contract.test.ts`, which holds the two equal, passed that day. Whether the rest of the prose matches today's schema was not checked sentence by sentence.