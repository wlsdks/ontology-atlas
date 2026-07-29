---
slug: domains/views
kind: domain
title: Views (Topology · Workshop · Insights)
display_ko: 화면(뷰)
display_en: Views
capabilities: [agent-graph-readiness, capabilities/agent-live-activity-contract, capabilities/agent-onboarding-brief, capabilities/changes-only-review, capabilities/edge-meaning-popover, capabilities/topology-change-visualization, capabilities/topology-direct-edit, capabilities/topology-kind-legibility, capabilities/topology-node-significance, capabilities/topology-skeleton-entry, collaborator-reader-brief, ontology-hub-mode-aware, studio-deep-link-focus, studio-relation-write-confirm, studio-vault-write, topology-analysis-modes, topology-canvas-render, topology-ontology-inspection]
elements: [elements/brand-mark-asset-pipeline, elements/business-ontology-lens, elements/dev-route-smoke, elements/ontology-atlas-quality-bar, elements/ontology-concept-detail-workbench, elements/ontology-description-helper, elements/ontology-design-surface-guard, elements/ontology-domain-tint-contract, elements/ontology-kind-tone-contract, elements/ontology-node-detail-modal, elements/ontology-reader-intent-contract, elements/ontology-review-brief, elements/ontology-tree-view, elements/topology-kind-classification-contract, elements/topology-kind-color-legend, elements/topology-kind-color-research-basis, elements/topology-kind-color-tests, elements/topology-kind-color-tones, elements/topology-map-canvas, elements/topology-owner-tint-overlay, elements/topology-path-chip, ontology-deeplink-node-resolver, sigma-graphology, src/features/vault-ontology/ui/LiveActivityIndicator.tsx, src/views/home, src/views/ontology-insights, src/views/ontology-redirect, src/views/ontology-studio, src/views/project-detail, src/widgets/global-search, src/widgets/topology-controls, src/widgets/topology-map-v2, topology-analysis-state, topology-ontology-drawer, topology-ontology-drawer-model, topology-selected-node-resolver]
relates: [documents/views-domain-boundary-audit, domains/onboarding-ux, domains/ontology-core]
relation_notes: { elements/brand-mark-asset-pipeline: "views 도메인의 모든 표면이 레일 로고·파비콘으로 이 마크를 쓰고, OS 아이콘까지 같은 좌표에서 파생된다" }
---

# Views

같은 ontology 그래프의 세 작업 출구. 토폴로지 (canvas-2D
`topology-map-v2` spatial network — `/`, `/topology`)는 읽고 탐색하고,
공방 (나침 무대 `/ontology/studio`)은 관계 소켓으로 의미를 완성해 실제
frontmatter 를 쓰며, 인사이트 (`/ontology/insights`)는 다섯 질문으로 정비
우선순위를 읽고 agent handoff를 만든다. `/ontology` 는 Topology INDEX로,
구 xyflow ERD Builder `/ontology/edit` 는 공방으로 리다이렉트한다. 검색은
`⌘K` 프로젝트 / `⇧⌘K` 노드+프로젝트 통합이다. Workshop와 Insights는
design-system의 operation page header 계약을 따른다: English caption으로
surface를 식별하고, Korean h1로 실제 작업 모드를 읽게 한다.

## 2026-07-26 entry and map audit

The topology surface now keeps canvas labels outside their rendered node rings,
measures the persistent legend stack before positioning toasts, and removes
Latin-only eyebrow spacing from Korean first-run/legend copy. The compact
datasheet and `FullDetailA1` share the same mtime-derived freshness sentence.
Unsupported browser folder entry uses one installed-app guide from both the
visible switch control and `⌘O`.
