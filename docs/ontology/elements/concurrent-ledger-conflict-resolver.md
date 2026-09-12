---
uid: 26de5f55-1ec1-4eb2-9ae0-7dac6993580d
slug: elements/concurrent-ledger-conflict-resolver
kind: element
title: Concurrent Ledger Conflict Resolver
display_ko: 동시 작업 장부 충돌 해결기
domain: domains/agent-integration
path: scripts/resolve-docs-vault-conflicts.mjs
created_by: "agent:unknown"
---

A fail-closed repository migration helper for concurrent worktrees. New decision, change and pilot records live in independent UUID fragments and are composed when read. This helper resolves tracked-era Docs Vault conflicts by removing derived mirrors from the index and regenerating local ignored output, without continuing the Git operation.

## Evidence

- Primary implementation: `scripts/resolve-docs-vault-conflicts.mjs#resolveRepositoryConflicts`
- Record composition: `scripts/lib/record-ledgers.mjs#readLedgerSource`
- Transition tests: `scripts/resolve-docs-vault-conflicts.test.mjs`
- Independent worktree and cold-checkout proof: `scripts/worktree-materialization.test.mjs`

## Includes

- Removing conflicted reproducible Docs Vault mirrors from the index while materializing them locally from authored inputs.
- Refusing frozen-history edits, unrelated conflicts and ambiguous authored changes.
- Retaining legacy prepend-only record recovery only before the freeze policy exists.
- Keeping the separate tracked census output contract when that file conflicts.

## Excludes

- Committing, pushing, or completing the caller's merge or rebase.
- Automatically converting historical ledger edits into new records with invented metadata.
- Resolving concurrent edits to the same implementation or current reference document.
