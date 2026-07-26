---
slug: domains/views
kind: domain
title: Views (Topology · Browse · Studio)
display_ko: 화면(뷰)
display_en: Views
capabilities: [agent-graph-readiness, capabilities/agent-live-activity-contract, capabilities/agent-onboarding-brief, capabilities/changes-only-review, capabilities/edge-meaning-popover, capabilities/topology-change-visualization, capabilities/topology-direct-edit, capabilities/topology-kind-legibility, capabilities/topology-node-significance, capabilities/topology-skeleton-entry, collaborator-reader-brief, ontology-hub-mode-aware, studio-deep-link-focus, studio-relation-write-confirm, studio-vault-write, topology-analysis-modes, topology-canvas-render, topology-ontology-inspection]
elements: [elements/business-ontology-lens, elements/dev-route-smoke, elements/ontology-atlas-quality-bar, elements/ontology-concept-detail-workbench, elements/ontology-description-helper, elements/ontology-design-surface-guard, elements/ontology-domain-tint-contract, elements/ontology-kind-tone-contract, elements/ontology-node-detail-modal, elements/ontology-reader-intent-contract, elements/ontology-review-brief, elements/ontology-tree-view, elements/topology-kind-classification-contract, elements/topology-kind-color-legend, elements/topology-kind-color-research-basis, elements/topology-kind-color-tests, elements/topology-kind-color-tones, elements/topology-map-canvas, elements/topology-owner-tint-overlay, elements/topology-path-chip, ontology-deeplink-node-resolver, sigma-graphology, src/features/vault-ontology/ui/LiveActivityIndicator.tsx, src/views/home, src/views/ontology-insights, src/views/ontology-redirect, src/views/ontology-studio, src/views/project-detail, src/widgets/global-search, src/widgets/topology-controls, src/widgets/topology-map-v2, topology-analysis-state, topology-ontology-drawer, topology-ontology-drawer-model, topology-selected-node-resolver]
relates: [documents/views-domain-boundary-audit, domains/onboarding-ux, domains/ontology-core]
---

# Views

같은 ontology 그래프의 세 출구. 토폴로지 (canvas-2D `topology-map-v2` spatial
network — `/`, `/topology`), 둘러보기 (`/ontology` 는 토폴로지 INDEX 로 흡수된
얇은 리다이렉트 + 노드 detail), 공방 (나침 무대 `/ontology/studio` — 노드
의미를 관계 소켓으로 완성해 실제 frontmatter 를 쓰는 표면; 구 xyflow ERD 빌더
`/ontology/edit` 는 2026-07-24 은퇴하고 공방으로 리다이렉트). 검색 — `⌘K`
프로젝트 / `⇧⌘K` 노드+프로젝트 통합. Workshop 와 Insights 는 design-system 의
operation page header 계약을 따른다: English caption 으로 surface 를 식별하고,
Korean h1 로 실제 작업 모드를 읽게 한다.
