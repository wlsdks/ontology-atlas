---
slug: capabilities/mode-aware-adapter
kind: capability
title: Mode-Aware Data Source Adapter
domain: mode-aware-adapters
elements:
  - src/features/data-source-mode
  - src/features/project-data-source
  - src/features/vault-ontology
relates:
  - capabilities/ontology-hub-mode-aware
  - domains/mode-aware-adapters
  - domains/vault-local-first
---

# Mode-Aware Data Source Adapter

R10 (auth + cloud surface 영구 제거) 이후 2 mode:

- **local** — `useLocalVault().status === 'loaded'` (사용자 디스크 vault)
- **static** — vault 미선택. 빌드타임 dogfood 매니페스트 (`docs/ontology/`) 가 fallback.

`useDataSourceMode()` 가 두 mode 를 분기. 같은 hook 호출이 mode 별로 다른 source 를
본다 — 호출자 코드는 단일.

적용 surface:
- `useProjects` — local: vault manifest 의 `kind: project` doc, static: dogfood 매니페스트
- `useProjectMutations` — local: vault `.md` file write, static: reject
- `useOntologyInsight` — local/static 모두 frontmatter stub derivation

미래 cloud collab 단계가 다시 도입될 때 `'cloud'` mode 를 enum 에 추가하고
adapter 각각에 cloud branch 를 새로 디자인.
