---
uid: 6cd4c1a0-77bb-4de8-8480-f624bdc3fe23
slug: elements/agent-proposal-applier
kind: element
title: Agent proposal applier
display_en: Agent proposal applier
display_ko: 에이전트 제안 적용기
domain: domains/agent-access
path: src/features/vault-agent/model/proposal-applier.ts
created_by: "agent:claude-code"
---

The single module that writes a consented proposal to disk, deliberately the only place where the in-app agent's changes can land.

## Includes
- Applying a proposal only after consent, from one call site.
- The boundary that refuses a change touching competency qualification without source backing.

## Excludes
- Producing the proposal.
- Being bypassable by the executor, which is exactly what concentrating writes here prevents.

## Uncertainty
- Read from the module header, which states the price of stopping the executor from writing is that writes gather in this one place and it should be called from exactly one site. Whether that single-call-site discipline currently holds was not verified.