---
uid: fa08540f-a6c0-4a13-8dd9-b43df420534f
slug: capabilities/ontology-blocks
kind: capability
title: Studio Relation Blocks
domain: domains/graph-modeling
elements: [elements/ontology-studio]
path: src/features/ontology-blocks
created_by: "agent:unknown"
---

## 정의
Studio의 나침반 방위 관계 블록(UP=is_a, DOWN=contains, RIGHT=depends, LEFT=relates):
채우면 실제 frontmatter 관계를 쓴다. 빈 소켓은 관계를 추가할 수 있다는 중립
affordance이지, 그 관계가 필요하거나 특정 후보가 옳다는 뜻이 아니다.

추천 상태는 대상별 rationale, evidence reference, source/target/relation이 일치하는
`safe_to_add` preflight 영수증이 모두 있을 때만 성립한다. 현재 graph projection과
picker scorer는 그 semantic 영수증을 만들지 않으므로 빈 소켓을 추천하지 않는다.
특히 `is_a`는 같은 kind 후보만 Browse에 남기며, same-domain·이름 유사성·인접성을
direct subsumption 근거로 사용하지 않는다.

Ontology Block manifest v2는 노드를 `{uid, urn:uuid:<uid>, slug}`로 보존한다.
UID가 없는 legacy v1/slug-only manifest를 영구 identity로 위장하지 않고 거부하며,
마크다운 블록 import fallback은 그대로 남겨 두었다.

## 근거
- src/features/ontology-blocks (구현 증거)
- src/views/ontology-studio/lib/allowed-kinds.ts (relation별 kind 경계)
- src/views/ontology-studio/lib/build-picker-discovery.ts (중립 Browse와 추천 경계)
- src/views/ontology-studio/lib/build-studio-item.ts (추천 evidence/preflight 영수증)
- docs/ONTOLOGY-ATLAS-SPEC.md §2.2 (direct `is_a` 판별 정본)
- AGENTS.md: Routes ("`/ontology/studio` is the write surface: relation types at fixed compass bearings")

## 확신도
high (0.9)
