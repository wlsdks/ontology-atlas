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
- Which kinds keep which kind-named lists (`containmentKeyFor`: a project keeps domains; a project or domain keeps capabilities; a project, domain or capability keeps elements), and what a removal leaves when it empties a relation list (`emptiedRelationListValue`: the key goes, except a kind's scaffold list, which returns to `[]`).

## Excludes
- Deciding whether a node that satisfies the schema is a good or true concept.
- Enforcing itself; the write paths call it, it does not intercept them.

## Uncertainty
- Read from the module header and its stated role as the single source for both the agent and terminal write paths. Its declared mirror at `cli/src/lib/schema.mjs` was not opened; the repository names a contract test that holds the two in lock-step, which this scan did not run.
- Re-read 2026-09-26: `containmentKeyFor` and `emptiedRelationListValue` in `mcp/src/schema.mjs` (bundles #1874 and #1883); the app copy in `src/shared/lib/containment-keys.ts` is held to it by `tests/contract/vault-schema.contract.test.ts`.
