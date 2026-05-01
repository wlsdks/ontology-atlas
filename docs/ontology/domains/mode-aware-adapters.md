---
slug: domains/mode-aware-adapters
kind: domain
title: Mode-Aware Adapters
capabilities:
  - data-source-dispatch
  - mode-aware-read
  - mode-aware-mutation
  - taxonomy-mode-bridge
elements:
  - src/features/project-data-source
  - src/shared/hooks/use-data-source-mode
  - src/features/use-project-mutations
relates:
  - domains/vault-local-first
  - domains/ontology-core
---

# Mode-Aware Adapters

`useDataSourceMode()` 가 local / cloud / static 분기 결정. 같은 hook 호출이 모드별로
다른 source 를 본다 — 사용자에겐 단일 UX. 자세한 가이드: `docs/MODE-AWARE-CRUD.md`.
