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
- Read from the module header, which argues that a prompt living in the vault would drift out of step with the schema. The prompt body was not read, and whether it currently matches the schema was not checked.