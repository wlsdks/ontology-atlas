---
slug: capabilities/topology-analysis-modes
kind: capability
title: Topology Analysis Modes
domain: views
elements: [topology-analysis-state, topology-path-chip]
---

`/topology` exposes a **two-view switch** — Map (Relief) and Graph — instead of five peer mode tabs (2026-07 owner feedback: the four Relief-family modes looked like the same sparse card screen with different panels, so mode proliferation read as "five confusing siblings").

**분석 패널 완전 소멸 2단계 (2026-07)** removed the dedicated `TopologyAnalysisBar` component entirely — its remaining Map/Graph switch had become unreachable by click once focus/path/health stopped reclaiming the left slot (analysis-rail only rendered when a non-overview mode already owned the slot, and nothing left the user there from a cold start). The two-view switch is now a single toggle chip in the always-visible top-right utility lane (`HomePage.tsx`, icon `Waypoints`, `data-testid="topology-graph-toggle"`) that flips `mode=overview` ↔ `mode=graph` — always reachable, not gated by any slot contest.

The Relief-family URL modes (`overview` / `focus` / `path` / `health`) are all still preserved for deep links, agent handoff, and desktop verify contracts, but each mode's dedicated rail content has been re-homed to the surface that actually needs it instead of living in a shared popup panel:
- **focus** (node click / card-expand selection) shows nothing of its own any more — the node datasheet (`TopologyV2DetailPanel`'s 4-action row) and `FullDetailA1`'s handoff row already covered the same brief/impact/sync-gate copy, so it was retired rather than migrated;
- **path** (the datasheet's "경로" action tile, or a `pathFrom`/`pathTo` deep link) now shows a minimal top-center "chrome grammar" status chip (`TopologyPathChip`, mounted next to `SearchHint`) — "경로: {source} → 대상 선택" before a target is picked, "{source} → {target} · N hops" once resolved (hop count via a new undirected-BFS `computeTopologyPathHopCount`), with one agent-facing "경로 패킷 복사" action (a single `find_path` MCP check — the old panel's CLI/MCP 2-way split and 5-button proof-check row were dropped) and a ✕ that clears the route;
- **health** (previously a queue-count chip on the old rail) has no map entry point at all now — the repair queue lives on `/ontology/insights`' relations tab, directly below the agent-readiness gauge, reusing the same `buildOntologyHealthActionTarget` picking rule the map used to use (now hoisted to `entities/knowledge-graph`) so the "next repair target" can't drift between the two surfaces.

The Graph view (`mode=graph`) is the Obsidian-style living graph: the full ontology node set under an always-on d3-force simulation (Web Worker), single-node elastic drag (grabbed node pins to the cursor, neighbors respond through link springs, release hands the node back to physics), hover ego highlight, and an always-visible `contains` backbone drawn with opaque pre-blended ink tokens (`--topology-graph-edge-*`) because the WebGL edge compositing renders low-alpha colors as effectively opaque. Node clicks keep graph mode (no focus hijack); deep inspection hands off to the Relief views.