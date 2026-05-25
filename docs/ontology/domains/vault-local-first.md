---
slug: domains/vault-local-first
kind: domain
title: Vault — Local-First
capabilities:
  - desktop-app-distribution
  - vault-live-updates
  - vault-migrator
  - vault-validator
elements:
  - file-system-access-api
  - src/entities/docs-vault
  - src/entities/local-fs-handle
  - src/features/docs-vault-local
  - src/shared/lib/idb-kv.ts
relates:
  - domains/mode-aware-adapters
  - domains/ontology-core
---

# Vault — Local-First

사용자 디스크 폴더를 진실원으로. File System Access API + IndexedDB 기반 핸들 영속.
focus / visibility 시 fingerprint 비교로 재스캔 short-circuit. R14 부터는 visible
인 동안 5s polling 으로 *focus 안 해도* 자동 반영 (`vault-live-updates`).

자세한 원칙: `.claude/rules/local-first.md`. 사용자 surface: `docs/FEATURES.md`.
