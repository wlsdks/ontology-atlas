---
slug: capabilities/mode-aware-adapter
kind: capability
title: Mode-Aware Data Source Adapter
display_ko: 데이터 출처 자동 전환
display_en: Automatic Data Source Switch
domain: mode-aware-adapters
elements:
  - src/features/data-source-mode
  - src/features/project-data-source
  - src/features/vault-ontology
relates:
  - capabilities/ontology-hub-mode-aware
  - domains/vault-local-first
---

# Mode-Aware Data Source Adapter

R10 (auth + cloud surface 영구 제거) 이후 2 mode:

- **local** — 사용자 디스크 vault. 검증된 manifest가 있으면 증분 재로딩의
  transient `loading` 동안에도 source를 static으로 바꾸지 않는다.
- **static** — vault 미선택. 빌드타임 dogfood 매니페스트 (`docs/ontology/`) 가 fallback.

`useDataSourceMode()` 가 두 mode 를 분기. 같은 hook 호출이 mode 별로 다른 source 를
본다 — 호출자 코드는 단일.

적용 surface:
- `useProjects` — local: vault manifest 의 `kind: project` doc, static: dogfood 매니페스트
- `useProjectMutations` — local: 경로와 무관하게 실제 `kind: project` 문서를 찾아
  부분 patch/full write. 전체 편집은 원본에 없던 category/status/position을
  form default로 만들어내지 않고 title/name key shape도 보존한다. 신규
  프로젝트는 `kind: project`를 포함한 `projects/<slug>.md`로 생성. static:
  reject
- `useOntologyInsight` — local/static 모두 frontmatter stub derivation

미래 cloud collab 단계가 다시 도입될 때 `'cloud'` mode 를 enum 에 추가하고
adapter 각각에 cloud branch 를 새로 디자인.
