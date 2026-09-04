---
uid: cf8a7154-61e7-44e2-969e-b977d5019121
slug: elements/private-vault-sidecar-boundary
kind: element
title: Private Vault Sidecar Boundary
display_ko: 볼트 사이드카 경계
domain: domains/local-vault-management
path: mcp/src/vault-sidecar.mjs
created_by: "agent:unknown"
---

The common file boundary where MCP and CLI handle private receipts and activity logs under `.ontology-atlas`. It closes symlink/junctions between the sidecar directory and final files, handles file identity changes and hardlink aliases, and provides atomic replacement and conflict detection. Due to limitations of the pure Node path API, it does not claim complete directory handle isolation against race conditions where an attacker with the same UID changes the parent name between checks.

## Evidence

- Primary implementation: `mcp/src/vault-sidecar.mjs#readVaultSidecarText`
- Supporting implementation: `mcp/src/vault-sidecar.mjs#createVaultSidecarTextExclusive`
- Focused test: `mcp/src/vault-sidecar.test.mjs#rejects read, create, replace, append, and remove through an external sidecar symlink`
- Focused test: `mcp/src/vault-sidecar.test.mjs#canonicalizes a vault-root symlink alias and writes only inside the real vault`

## Includes

- The common MCP/CLI file boundary for private receipts and activity logs under `.ontology-atlas`.
- Closing symlink/junction traversal between the sidecar directory and its final files, and detecting file-identity changes or hardlink aliases.
- Atomic replacement and conflict detection for sidecar writes.

## Excludes

- Complete directory-handle isolation against a same-UID attacker racing a parent rename between checks: an explicitly named residual gap.
- Vault Markdown content itself, which is never routed through the sidecar boundary.
- The LLM audit log's content/schema, only its file-safety mechanics.
