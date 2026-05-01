---
slug: capabilities/mode-aware-adapter
kind: capability
title: Mode-Aware Data Source Adapter
domain: mode-aware-adapters
elements:
  - src/shared/hooks/use-data-source-mode
  - src/features/project-data-source
  - src/features/use-project-mutations
  - src/features/vault-ontology
relates:
  - domains/vault-local-first
  - domains/mode-aware-adapters
  - capabilities/ontology-hub-mode-aware
---

# Mode-Aware Data Source Adapter

`useDataSourceMode()` 가 vault 활성 / Firebase 로그인 / 둘 다 없음 → local / cloud / static
3 분기. 같은 hook 호출이 mode 별로 다른 source 를 본다 — 호출자 코드는 단일.

적용 surface:
- `useProjects` — local: vault manifest, cloud: Firestore subscribe
- `useProjectMutations` — local: vault file write, cloud: Firestore upsert
- `useOntologyInsight` (mission v2) — local: vault frontmatter stub, cloud: knowledgePublic projection
- `TaxonomyProvider` — local/static: defaults, cloud: subscribe

회귀 차단 anti-pattern (`docs/MODE-AWARE-CRUD.md` §5):
- mode 검증 없이 직접 Firestore subscribe
- vault 모드에서 silent fallback to demo
- mutation 만 mode-aware, read 만 cloud-only
