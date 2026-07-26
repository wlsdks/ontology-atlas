---
slug: capabilities/topology-analysis-modes
kind: capability
title: Topology Analysis Modes
display_ko: 지도 보는 방식 고르기
display_en: Ways to Read the Map
domain: views
elements: [topology-analysis-state, topology-path-chip]
---

`/topology` is a **single Relief (Map) surface**. The old peer-mode tabs were collapsed over 2026-07 (owner feedback: the four Relief-family modes looked like the same sparse card screen with different panels, so mode proliferation read as "five confusing siblings"), and the separate **Graph (살아있는 그래프) view was removed outright (#19, 2026-07-25)** — an always-on force simulation served no audience's task (reading needs positional stability; continuous physics destroys spatial memory). Free single-node drag survives on the precomputed Relief layout (transient, session-scoped, no continuous re-simulation); only the physics *toggle* is gone.

**분석 패널 완전 소멸 2단계 (2026-07)** removed the dedicated `TopologyAnalysisBar` component entirely — its remaining Map/Graph switch had become unreachable by click once focus/path/health stopped reclaiming the left slot. With the Graph mode itself retired (#19), no view toggle remains; the top-right utility lane keeps only auto-arrange / search / recent-changes / workspace / + 개념.

The Relief-family URL modes (`overview` / `focus` / `path` / `health`) are all still preserved for deep links, agent handoff, and desktop verify contracts, but each mode's dedicated rail content has been re-homed to the surface that actually needs it instead of living in a shared popup panel:
- **focus** (node click / card-expand selection) shows nothing of its own any more — the node datasheet (`TopologyV2DetailPanel`'s 4-action row) and `FullDetailA1`'s handoff row already covered the same brief/impact/sync-gate copy, so it was retired rather than migrated;
- **path** (the datasheet's "경로" action tile, or a `pathFrom`/`pathTo` deep link) now shows a minimal top-center "chrome grammar" status chip (`TopologyPathChip`, mounted next to `SearchHint`) — "경로: {source} → 대상 선택" before a target is picked, "{source} → {target} · N hops" once resolved (hop count via a new undirected-BFS `computeTopologyPathHopCount`), with one agent-facing "경로 패킷 복사" action (a single `find_path` MCP check — the old panel's CLI/MCP 2-way split and 5-button proof-check row were dropped) and a ✕ that clears the route;
- **health** (previously a queue-count chip on the old rail) has no map entry point at all now — the repair queue lives on `/ontology/insights`' **Do next** tab, directly below the agent-readiness gauge. It preserves every resolvable missing-containment target plus one representative per disconnected island in `VaultHealthRepair.actionTargets`; the first row stays visible and a bounded disclosure exposes the rest with per-node relation-editor and source-document handoff. `actionTarget` remains the first item for compact summary/deep-link compatibility, so aggregate counts no longer strand unnamed repairs while existing consumers keep one deterministic next target.

Free node drag survives on the Relief surface itself: grabbing a node pins it to the cursor and its 1–2-hop neighbors follow through a brief, radius-limited settle, but there is no continuous physics loop and released positions persist for the session (no auto-reset). The old `mode=graph` living-graph view — full node set under an always-on d3-force simulation — was removed (#19); a legacy `?mode=graph` deep link now silently falls back to `overview`.

**Agent handoff source boundary (2026-07-25).** The node datasheet's copied
handoff now names its source explicitly. A loaded local vault emits
`source: loaded-vault` and may propose `get_concept` followed by a guarded
write. The bundled read-only sample emits `source: read-only-sample`, a
`write_guard`, and only asks the user to open a real markdown vault before
copying again. Sample facts therefore cannot masquerade as writable MCP facts.
