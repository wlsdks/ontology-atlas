---
uid: 15d8a782-a814-4061-8bc5-d8b05d87ad9e
slug: elements/vault-connector-registry
kind: element
title: Vault connector registry
display_en: Vault connector registry
display_ko: 볼트 커넥터 목록
domain: domains/agent-access
path: src/features/mcp-connectors/model/use-vault-connectors.ts
created_by: "agent:claude-code"
---

Keeps the set of agent connectors recorded for the open folder, so which servers a session will be given is a fact about the folder rather than a hidden application setting.

## Includes
- Reading, adding and removing connector entries held with the folder.

## Excludes
- Launching a connector.
- Holding any secret; credentials live in the operating system's store.

## Uncertainty
- Read from the feature's file layout only. The storage location of the connector list was not confirmed, and no connector was added during this scan.