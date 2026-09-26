---
title: Cross-cutting UI
doc_type: index
status: current
area: design-system
---

# Cross-cutting UI

## 4. Cross-cutting UI

**feat/rail-rollout** collapsed the old 3-tier nav (`OperationsNav` top tabs +
`OntologySubNav` inline sub-tabs + `BottomTabBar`) into one ownership model: a
persistent left rail on desktop and `BottomTabBar` on mobile. They share the
same active-destination resolver while exposing inventories appropriate to
their viewport. `OperationsNav` and `OntologySubNav` are retired (deleted, not
just unmounted).
