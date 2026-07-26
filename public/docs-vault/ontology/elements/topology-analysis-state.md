---
slug: elements/topology-analysis-state
kind: element
title: Topology Analysis State
domain: views
relates: [elements/ontology-relation-key-inference]
---

# Topology Analysis State

`src/views/home/model/url-state.ts` persists
`/topology?mode=<overview|focus|path|health>`, while
`src/views/home/lib/topology-analysis.ts` derives compact summary and handoff
facts from that state.

The dedicated `TopologyAnalysisBar` is retired. These URL modes remain because
deep links, agent handoff, node focus, path selection, and desktop verification
need reproducible state:

- `overview` — stable map + INDEX reading surface;
- `focus` — selected node ego state and datasheet;
- `path` — `TopologyPathChip`, source/target URL state, hop result, and one
  copyable agent path packet;
- `health` — compatibility/deep-link state; the actionable repair queue now
  lives in `/ontology/insights` → Do next.

`buildTopologyAnalysisSummary` and the brief formatters still derive compact
facts for handoff consumers, not for a shared floating analysis panel.
`topology-map-v2` owns current relation LOD through its deterministic skeleton,
density-gate clusters, tier reveal, focus/realm state, and tokenized edge
rendering. No Sigma reducer or saved Sigma camera can revive a retired edge
cloud.
