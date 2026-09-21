---
uid: 6b4ff35f-4167-4928-ab64-f5e97457e416
slug: elements/vault-kind-schema
kind: element
title: Vault kind schema
display_en: Vault kind schema
display_ko: 볼트 종류 스키마
domain: domains/meaning-layer
path: mcp/src/schema.mjs
created_by: "agent:claude-code"
---

Declares, once, what frontmatter each node kind must carry, which folder its slug lives under, and how a new node's permanent identity is minted.

## Includes
- The per-kind required and expected fields every writer follows, whether the write came from an agent, the terminal, or the app.
- The folder each kind belongs in, and the default body a new node starts from.
- Minting the immutable node identity that survives a rename.

## Excludes
- Deciding whether a node that satisfies the schema is a good or true concept.
- Enforcing itself; the write paths call it, it does not intercept them.

## Uncertainty
- Read from the module header and its stated role as the single source for both the agent and terminal write paths. Its declared mirror at `cli/src/lib/schema.mjs` was not opened; the repository names a contract test that holds the two in lock-step, which this scan did not run.