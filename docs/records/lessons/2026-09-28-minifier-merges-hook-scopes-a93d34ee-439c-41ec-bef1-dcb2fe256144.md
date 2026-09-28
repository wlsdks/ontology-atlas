---
id: a93d34ee-439c-41ec-bef1-dcb2fe256144
date: 2026-09-28
kind: mistake
status: reported
harness_area: memory-harness
---
**Observed**: on `perf/web-vault-memory`, moving the tour's anchor check into a same-module helper hook (`useTourAnchorResolver`, `use-topology-keyboard-tour.tsx`) passed lint and unit tests, yet a heap snapshot of the static export after two folder switches still showed the previous 970-node map graph held through `activateTourAnchor`'s scope: the minifier had folded the one-call helper into its caller, putting `nodes` back in the caller's closure scope. A cross-module `useDerived(tourAnchorResolver, nodes)` (and a WeakRef inside the resolver) removed it, confirmed by the same snapshot.
**Cost**: one rebuild and one snapshot round, about 15 minutes.
**Suspected cause**: closure retention depends on which variables share a V8 scope after bundling; Turbopack inlines single-use functions within a module but not across modules.
**Proposed change**: skill or rule text where memory fixes are routed: prove a closure-retention fix on the built export with a heap snapshot or a queryObjects count, and put scope-isolating helpers in their own module.
