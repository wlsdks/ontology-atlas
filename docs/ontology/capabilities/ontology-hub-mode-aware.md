---
slug: capabilities/ontology-hub-mode-aware
kind: capability
title: Ontology Hub — Mode-Aware (Q1=(a))
domain: mode-aware-adapters
elements: [src/features/vault-ontology/model/use-ontology-insight.ts, src/views/ontology-view/ui/OntologyViewPage.tsx]
relates: [capabilities/mode-aware-adapter, capabilities/frontmatter-to-ontology, domains/views]
---

# Ontology Hub — Mode-Aware (Q1=(a))

LOOP-TASK Open question #1 의 (a) — vault 활성 시 `/` 가 자동으로 그 데이터로 전환. mission v2 ideal "Notion 처럼 폴더만 골라도 사용" 의 ontology hub 표현.

`useOntologyInsight(accountId)`:
- mode === local → useVaultOntology 결과를 KnowledgeProjectInsight shape 으로 변환
- mode !== local → useKnowledgePublicInsight 그대로

OntologyStubNode → KnowledgeGraphNode 변환은 sentinel lastApprovedAt = Date(0), lastApprovedBy = "vault-frontmatter", source = "manual".

OntologyViewPage 가 useOntologyInsight 로 바꿔 vault 활성 시 즉시 vault frontmatter 의 stub 노드/엣지가 트리·ego graph·검색에 등장.
