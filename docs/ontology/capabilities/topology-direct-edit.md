---
slug: capabilities/topology-direct-edit
kind: capability
title: Topology Direct Edit (토폴로지에서 직접 편집)
domain: views
elements: []
relates: [capabilities/topology-ontology-inspection]
---

토폴로지(`/topology`)를 온톨로지의 *읽기* surface 가 아니라 **1차 편집 surface** 로 전환하는 흐름. 별도 빌더에서 "조립"하는 대신, 공간 그래프에서 노드를 선택해 그 자리에서 frontmatter 를 고치고 vault `.md` 에 바로 쓴다. (ontology-first 재구성 spec: `docs/superpowers/specs/2026-05-30-ontology-first-topology-restructure-design.md`)

## 현재 (S1)

- 노드 선택 → drawer 에서 **domain 인라인 편집** → vault 저장 (첫 end-to-end).
- `src/views/home/lib/topology-node-edit.ts` — `resolveTopologyNodeEditTarget`(노드→vault 문서, node.evidenceIds[0]=sourceSlug) + `buildNodeFrontmatterEdit`(바뀐 키만 patch).
- `src/views/home/ui/InlineFieldEdit.tsx` — 읽기↔편집↔저장/취소 primitive (헌장 준수).
- `src/views/home/ui/TopologyOntologyDrawer.tsx` — `domainEdit` slot.
- `src/views/home/ui/HomePage.tsx` — `useLocalVault().updateFrontmatter(slug, updates, {expectedMtime})` (본문 보존 patch + 저장 후 자동 refresh→재-derive). writable 로컬 vault 아니면 읽기 전용.
- 직렬화는 `entities/docs-vault` 의 `buildVaultMarkdown` 으로 추출(빌더와 공유, cross-view import 회피).

## 다음 (S2~)

토폴로지에서 노드 생성(S2) · 관계 생성(S3, RelationWriteConfirm 재사용) · 문서탭=노드 설명(S4) · 빌더 비파괴 강등(S5) · ontology-first 빈상태(S6).