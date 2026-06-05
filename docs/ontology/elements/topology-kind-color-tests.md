---
slug: elements/topology-kind-color-tests
kind: element
title: Topology Kind Color Tests
domain: views
---

# Topology Kind Color Tests

`src/widgets/topology-map-sigma/lib/ontology-tone.test.ts`, `src/widgets/topology-map-sigma/lib/graph-build.test.ts`, `src/widgets/topology-map-sigma/lib/reducer-owner-tint.test.ts`, and `src/widgets/topology-map-sigma/lib/reducer-edge-lod.test.ts` guard the topology kind-color and first-viewport readability contract.

The tests prove four user-facing claims:

- The visible topology legend has five kinds: `project`, `domain`, `capability`, `element`, and `unknown`.
- Every visible kind fill color is unique and has at least 120 RGB-distance from every other kind color, catching palettes that look too similar during graph scanning.
- When `ontologyExtension` is active, plain project nodes use the same project tone as the legend instead of a generic slug-derived leaf color.
- Dense overview mode hides ontology relation lines in the unselected map view; relationship proof still comes back through focus/path/impact evidence, so the first viewport is a semantic cluster map instead of an edge cloud.

This makes the user's "색상이 다 비슷해서 구분이 안됨" and "엉킨 선 덩어리처럼 보이지 않게" feedback executable: future color or LOD changes must preserve categorical separation and overview legibility, not only compile.