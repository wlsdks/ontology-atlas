---
uid: fa08540f-a6c0-4a13-8dd9-b43df420534f
slug: capabilities/reviewed-ontology-writing
kind: capability
title: Reviewed Ontology Writing
domain: domains/graph-modeling
elements: [elements/acp-ontology-write-review, elements/ontology-change-review, elements/ontology-meaning-editor]
path: src/features/ontology-meaning-editor
created_by: "agent:unknown"
---

## 정의
지도에서 사람이 직접 고치거나 ACP 에이전트가 요청한 온톨로지 쓰기를, 정확한 typed 변경안 검토 뒤에만 마크다운 frontmatter에 적용하는 능력. 지도 선택 맥락과 사람의 최종 의미 결정권을 같은 흐름에 남긴다.

## 경계
변경안은 휘발성 pre-write 상태이며 별도 승인 원장이나 두 번째 정본이 아니다. 확인 뒤 쓰인 마크다운이 즉시 정본이다. 지도 편집기는 한 번에 관계 하나만 다루고, ACP read tool은 자동 진행하지만 write tool은 allow_once 또는 reject_once를 기다린다. 의미 쓰기에는 allow_always를 제공하지 않는다.

## 근거
- src/features/ontology-meaning-editor (선택 node inspector와 같은 anchor의 relation editor)
- src/features/ontology-change-review (수동/ACP 공통 typed change review)
- src/entities/knowledge-graph/lib/ontology-relation-edit.ts (frontmatter before/after plan)
- src/widgets/topology-map-v2/render/preview-edge.ts (force graph를 바꾸지 않는 directional preview)
- src/features/acp-session/model/atlas-tool-policy.ts (generated MCP surface와 맞춘 read/write 분류)
- src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx (ACP write pause, allow-once/reject-once)
- docs/DECISIONS.md 2026-08-21 (92)

## 확신도
high (0.95)