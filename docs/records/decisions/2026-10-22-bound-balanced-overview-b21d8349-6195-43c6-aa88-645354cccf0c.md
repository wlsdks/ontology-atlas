---
id: b21d8349-6195-43c6-aa88-645354cccf0c
date: 2026-10-22
---
## 2026-10-22 — Bound the balanced overview by measured density

**Why**: rendered storefront at 1512 and 1040 grew to 27 and 24 dependency crossings against the existing limit of 10. Small-map dogfood also resolved an arbitrary nearest domain while the whole map remained visible.
**Prior**: refines the twelve-domain shared-radius choice in a8491b2b-4b26-4da0-9eae-8f0f4a77c7ce.
**Decision**: share a balanced radius through six domains. Seven to twelve keep separated radial packing with outward member shelves; larger maps keep compact packing. A wholly visible map stays aggregated until domain selection; zooming beyond the whole view can resolve the nearest group. Hover previews ink over the existing selection and restores it on leave; positions and selected counts stay fixed.
**Dissent**: the six-domain boundary is a conservative measured scope, not a universal optimum. Larger fan maps may look less symmetric.
**Falsifier**: unchanged crossing/name bounds fail, selected detail stops resolving, or the preview changes selection or counts. Refine the layout before raising a bound.
**Owner**: project owner through the request to reinstall, inspect and keep improving.
