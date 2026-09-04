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

A fail-closed repository helper for concurrent worktrees. It semantically merges only complete dated records prepended to the append-only CHANGELOG and DECISIONS ledgers, refuses historical or unrelated conflicts, rebuilds deterministic docs-vault artifacts, and stages the verified result without continuing the Git operation.

## Evidence

- Primary implementation: `scripts/resolve-docs-vault-conflicts.mjs#resolveRepositoryConflicts`
- Supporting implementation: `scripts/resolve-docs-vault-conflicts.mjs#mergeAppendOnlyLedger`

## Includes

- Fail-closed merging of concurrent-worktree conflicts limited to complete, dated records prepended to the append-only CHANGELOG and DECISIONS ledgers.
- Refusing historical or unrelated conflicts rather than guessing a resolution.
- Rebuilding deterministic docs-vault artifacts and staging the verified result without continuing the git operation itself.

## Excludes

- Committing or pushing the resolved state: the caller's git operation (merge/rebase) completes separately after this script stages the result.
- Resolving conflicts in generated JSON under `src/entities/docs-vault/data/` or `public/docs-vault/` outside the ledger-only scope.
- Any conflict shape other than a prepended dated ledger record; those are refused, not merged.
