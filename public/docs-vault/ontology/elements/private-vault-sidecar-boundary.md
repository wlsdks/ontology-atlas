---
uid: cf8a7154-61e7-44e2-969e-b977d5019121
slug: elements/private-vault-sidecar-boundary
kind: element
title: Private Vault Sidecar Boundary
domain: domains/local-vault-management
path: mcp/src/vault-sidecar.mjs
created_by: "agent:unknown"
---

The common file boundary where MCP and CLI handle private receipts and activity logs under `.ontology-atlas`. It closes symlink/junctions between the sidecar directory and final files, handles file identity changes and hardlink aliases, and provides atomic replacement and conflict detection. Due to limitations of the pure Node path API, it does not claim complete directory handle isolation against race conditions where an attacker with the same UID changes the parent name between checks.
