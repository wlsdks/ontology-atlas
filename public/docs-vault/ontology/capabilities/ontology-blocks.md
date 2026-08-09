---
uid: fa08540f-a6c0-4a13-8dd9-b43df420534f
slug: capabilities/ontology-blocks
kind: capability
title: Studio Relation Blocks
domain: domains/graph-modeling
elements: [elements/ontology-studio]
created_by: "agent:unknown"
---

## 정의
Studio의 나침반 방위 관계 블록(UP=is_a, DOWN=contains, RIGHT=depends, LEFT=relates): 채우면 실제 frontmatter 관계를 쓴다.

Ontology Block manifest v2는 노드를 `{uid, urn:uuid:<uid>, slug}`로 보존한다.
UID가 없는 legacy v1/slug-only manifest를 영구 identity로 위장하지 않고 거부하며,
마크다운 블록 import fallback은 그대로 남겨 두었다.

## 근거
- src/features/ontology-blocks (구현 증거)
- AGENTS.md: Routes ("`/ontology/studio` is the write surface: relation types at fixed compass bearings")

## 확신도
high (0.9)
