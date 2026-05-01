---
slug: domains/settings-diagnostics
kind: domain
title: Settings & Diagnostics
capabilities:
  - taxonomy-categories
  - taxonomy-statuses
  - csv-import
  - tbox-history-view
  - stale-orphan-insights
elements:
  - src/views/settings
  - src/views/settings-categories
  - src/views/settings-statuses
  - src/views/settings-project-import
  - src/views/diagnostics-insights
relates:
  - domains/ontology-core
---

# Settings & Diagnostics

운영자 surface. 카테고리·상태 lifecycle 편집, CSV 일괄 import, TBox 버전 이력 read-only,
stale / orphan / promotion 후보 진단. 1인 도구 default 라 admin 권한 게이트는 가벼운 화이트리스트.
