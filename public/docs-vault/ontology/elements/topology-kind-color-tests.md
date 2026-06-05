---
slug: elements/topology-kind-color-tests
kind: element
title: Topology Kind Color Tests
domain: views
---

`src/widgets/topology-map-sigma/lib/ontology-tone.test.ts` and `src/widgets/topology-map-sigma/lib/graph-build.test.ts` guard the topology kind-color contract.

The tests now prove three user-facing claims:

- The visible topology legend has five kinds: `project`, `domain`, `capability`, `element`, and `unknown`.
- Every visible kind fill color is unique and has at least 120 RGB-distance from every other kind color, catching palettes that look too similar during graph scanning.
- When `ontologyExtension` is active, plain project nodes use the same project tone as the legend instead of a generic slug-derived leaf color.

This makes the user's "색상이 다 비슷해서 구분이 안됨" feedback executable: future color changes must preserve categorical separation, not only compile.