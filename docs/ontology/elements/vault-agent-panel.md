---
uid: 7294bda8-ce25-46e4-80ae-5f2e3619a48d
slug: elements/vault-agent-panel
kind: element
title: Vault Agent Panel
domain: domains/agent-integration
path: src/widgets/vault-agent-panel
created_by: "agent:unknown"
---

Panel widget showing agent connection status, actual tool reads, audit logs, timeouts, and mandatory read failures. Restores only absolute paths without a read manifest, downgrading to the existing no-folder lock to prevent divergence between bundle sample screens and hidden local body/audit logs. Local models that skip reading are corrected once; if skipped again, no answer is displayed. This serves as the human judgment surface for capabilities/vault-agent, with implementation spanning src/widgets/vault-agent-panel and src/features/vault-agent/model.
