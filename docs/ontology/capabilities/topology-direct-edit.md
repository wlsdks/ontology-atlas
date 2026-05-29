---
slug: capabilities/topology-direct-edit
kind: capability
title: Topology Direct Edit (토폴로지에서 직접 편집)
domain: views
elements: []
relates: [capabilities/topology-ontology-inspection]
---

토폴로지(`/topology`)를 온톨로지의 *읽기* surface 가 아니라 **1차 편집 surface** 로 전환하는 흐름. 별도 빌더에서 "조립"하는 대신, 공간 그래프에서 노드를 선택해 그 자리에서 만들고·고치고·잇고·설명한다. vault `.md` 에 바로 쓴다. (ontology-first 재구성 spec: `docs/superpowers/specs/2026-05-30-ontology-first-topology-restructure-design.md`)

## 4대 편집 액션 (S1~S4 완성)

- **S1 노드 속성 편집** — drawer 에서 domain 인라인 편집 → `updateFrontmatter`(본문 보존 patch). `topology-node-edit.ts` + `InlineFieldEdit`.
- **S2 노드 생성** — 토폴로지 우상단 "+ 노드" → `buildNewNodeDoc` → `createDoc`. `CreateNodeForm`.
- **S3 관계 생성** — drawer 에서 대상+관계종류 선택 → 빌더와 동일 `buildVaultRelationPatch` → `updateFrontmatter`(배열 append). `RelationCreateForm`.
- **S4 노드 설명 편집** — drawer 에서 본문(설명) 편집 → raw 전체 로드 → `replaceVaultBody` → `saveDoc`(frontmatter 보존). `NodeExplanationEdit`.

## 기반 (entity 레이어 공유 — 빌더와 drift 0)

`entities/docs-vault` 의 `buildVaultMarkdown`/`buildNewNodeDoc`/`vaultFolderForKind`/`relation-proposal`(buildVaultRelationPatch 등) + `shared/lib` 의 `replaceVaultBody`. writable 로컬 vault 일 때만 편집 노출(static/데모는 읽기 전용). 저장 후 기존 폴링/refresh 가 재-derive.

## 남은 단계

S5 빌더 비파괴 강등(라우트 유지, 토폴로지를 1차로) · S6 ontology-first 빈상태.