---
uid: 7294bda8-ce25-46e4-80ae-5f2e3619a48d
slug: elements/vault-agent-panel
kind: element
title: Vault Agent Panel
display_ko: 볼트 에이전트 패널
domain: domains/agent-integration
path: src/widgets/vault-agent-panel
created_by: "agent:unknown"
---

Panel widget showing agent connection status, actual tool reads, audit logs, timeouts, and mandatory read failures. Restores only absolute paths without a read manifest, downgrading to the existing no-folder lock to prevent divergence between bundle sample screens and hidden local body/audit logs. Local models that skip reading are corrected once; if skipped again, no answer is displayed. This serves as the human judgment surface for capabilities/vault-agent, with implementation spanning src/widgets/vault-agent-panel and src/features/vault-agent/model.

## Evidence

- Primary implementation: `src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx#VaultAgentPanel`
- Supporting implementation: `src/widgets/vault-agent-panel/ui/AgentProposalCard.tsx#AgentProposalCard`
- Focused test: `src/widgets/vault-agent-panel/model/use-vault-agent.test.ts#releases running and the elapsed clock`
- Focused test: `src/widgets/vault-agent-panel/model/use-vault-agent.test.ts#marks the turn failed and says so in the panel, without swallowing the error`

## Includes

- The human judgment surface for capabilities/vault-agent: agent connection status, actual tool reads, audit logs, timeouts, and mandatory-read failures.
- Restoring only absolute paths without a read manifest, downgrading to the existing no-folder lock rather than mixing bundle-sample and hidden local audit logs.
- Correcting a local model once for skipping a mandatory read, and withholding an answer if it skips again.

## Excludes

- The ACP write-review pause/allow decision, owned by elements/acp-ontology-write-review.
- The underlying `.ontology-atlas` sidecar file mechanics this panel's logs are read from, owned by elements/private-vault-sidecar-boundary.
- MCP tool execution itself; the panel observes and audits, it does not implement the tools.
