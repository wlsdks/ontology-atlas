---
slug: elements/topology-kind-color-tests
kind: element
title: Topology Kind Color Tests
domain: views
---

`src/widgets/topology-map-sigma/lib/ontology-tone.test.ts` and `src/widgets/topology-map-sigma/lib/graph-build.test.ts` guard the topology kind-color contract.

The tests assert exact kind tones and a minimum RGB distance between every visible ontology kind color. That turns the user-facing requirement "domain/capability/element/unknown must be easy to separate" into a regression gate instead of a subjective screenshot-only check.