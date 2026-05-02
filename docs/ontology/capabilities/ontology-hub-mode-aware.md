---
slug: capabilities/ontology-hub-mode-aware
kind: capability
title: Ontology Hub — Mode-Aware (Q1=(a))
domain: mode-aware-adapters
elements: [src/features/vault-ontology/model/use-ontology-insight.ts, src/views/ontology-view/ui/OntologyViewPage.tsx]
relates: [capabilities/mode-aware-adapter, capabilities/frontmatter-to-ontology, domains/views]
---

# Ontology Hub — Mode-Aware

vault 활성 시 `/` 가 자동으로 그 데이터로 전환. mission v2 ideal "Notion
처럼 폴더만 골라도 사용" 의 ontology hub 표현.

`useOntologyInsight()` 분기:
- **local** → `useVaultOntology` 결과를 `KnowledgeProjectInsight` shape 으로 변환
- **static** → 빌드타임 dogfood 매니페스트 derivation (module-load 1 회 메모이즈)

OntologyStubNode → KnowledgeGraphNode 변환:
- sentinel `lastApprovedAt = Date(0)`, `lastApprovedBy = "vault-frontmatter"`,
  `source = "manual"` (UI 가 sentinel 감지하면 timestamp / timeline 패널 hide).

OntologyViewPage / SigmaTopology / GlobalSearch 등 모든 surface 가 같은
hook 한 번으로 vault frontmatter 의 stub 노드 + 엣지를 즉시 surface.
