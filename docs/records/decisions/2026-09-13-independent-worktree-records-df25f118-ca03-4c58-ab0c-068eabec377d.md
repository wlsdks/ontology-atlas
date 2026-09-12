---
id: df25f118-ca03-4c58-ab0c-068eabec377d
date: 2026-09-13
---
## 2026-09-13 — Independent records and worktree-local Docs Vault materialization

**Why**: Parallel branches repeatedly conflict in shared ledgers and generated JSON despite changing different authored inputs.
**Prior**: The 2026-09-12 CI execution decisions remain standing; this replaces tracked Docs Vault mirrors and shared-ledger appends.
**Decision**: Freeze historical ledgers; add UUID decision, change and pilot fragments, with explicit release assignments. Readers compose them deterministically. Generate ignored Docs Vault mirrors on install, checkout, merge and build; validate staged source before commit.
**Dissent**: Keeping generated files tracked permits imports immediately after a bare clone, but forces unrelated branches to reconcile the same derived bytes. Dependency-free prepare and checkout hooks supply those imports.
**Falsifier**: Two independent record additions conflict, a record vanishes from the composed view, or a prepared clean checkout cannot resolve its static imports.
**Owner**: Atlas maintainer.
