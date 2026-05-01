---
slug: domains/vault-local-first
kind: domain
title: Vault — Local-First
capabilities:
  - folder-pick-fsa
  - manifest-build
  - fingerprint-watch
  - handle-persist
  - backlink-rewrite
  - vault-scaffold
elements:
  - src/features/docs-vault-local
  - src/entities/local-fs-handle
  - src/entities/docs-vault
  - src/shared/lib/idb-kv
relates:
  - domains/mode-aware-adapters
  - domains/ontology-core
---

# Vault — Local-First

사용자 디스크 폴더를 진실원으로. File System Access API + IndexedDB 기반 핸들 영속.
focus / visibility 시 fingerprint 비교로 재스캔 short-circuit.

자세한 정책: `docs/LOCAL-FIRST-SYNC.md`, `docs/OFFLINE-FIRST-UX-FLOW.md`.
