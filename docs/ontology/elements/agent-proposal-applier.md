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

The shared applier writes the exact document diffs a person approved in the vault agent or local Compile flow and reports confirmed saves when application fails.

## Includes
- Preflight checks for competency-qualification changes and available modification timestamps before document writes.
- Optional pre-write save points, one final write per selected file chain, and folder reload after writes.
- A failed outcome with the paths whose writer calls completed, the available save-point receipt, and a separate reload error when recovery also fails.

## Excludes
- Producing or automatically approving a proposal.
- Rolling back an already completed write after a later failure.
- Certifying semantic correctness or promoting project competency qualification from a vault-only conversation.

## Evidence
- `src/features/vault-agent/model/proposal-applier.ts` implements the shared write and recovery sequence; `use-vault-agent.ts` and `use-local-compile.ts` consume its outcomes.
- Controlled failures cover a later writer failure, first writer failure, failed recovery reload, and a final reload failure after completed writes.

## Uncertainty
- A rejected writer may itself have changed bytes. The returned prefix names confirmed completed calls, not every possible mutation or a transactional rollback.
- Installed native partial-write recovery and the accuracy of model-authored meaning are not established by these controlled tests.
