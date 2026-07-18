---
slug: elements/topology-path-chip
kind: element
title: Topology Path Chip
domain: views
---

`src/views/home/ui/TopologyPathChip.tsx` — the top-center "chrome grammar" status chip for path mode (분석 패널 완전 소멸 2단계 §b), mounted next to `SearchHint` rather than in the left INDEX/analysis-rail slot.

Shows "경로: {source} → 대상 선택" before a target is picked, or "{source} → {target} · N hops" once both endpoints resolve (hop count from `computeTopologyPathHopCount`, an undirected BFS in `views/home/lib/topology-analysis.ts` reusing `buildOntologyReachability`). When resolved, one agent-facing "경로 패킷 복사" action copies a single-MCP-check packet (`formatTopologyPathAgentPacket` — source/target titles+slugs, hop count, ontology/builder URLs, one `query_ontology({operation:"path"})` check) instead of the old panel's CLI/MCP 2-way split and 5-button relation-preflight/explain_relation/all_paths proof row. A ✕ button clears the route and returns to overview mode.

Entered via the node datasheet's (`TopologyV2DetailPanel`) "경로" action tile, the context menu's path action, or a `pathFrom`/`pathTo` URL deep link — never through a left-slot rail (`slot-ownership.ts`'s `resolveLeftSlotOwner` no longer reclaims the slot for path mode). Canvas path highlighting logic (pre-existing, unrelated to this chip) was left untouched.