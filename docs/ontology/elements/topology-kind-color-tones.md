---
slug: elements/topology-kind-color-tones
kind: element
title: Topology Kind Color Tones
domain: views
---

`src/widgets/topology-map-sigma/lib/ontology-tone.ts` defines the color and size semantics for ontology nodes in the Sigma topology map.

It maps `domain`, `capability`, `element`, and `unknown` to visibly distinct, colorblind-safe kind tones. The topology still pairs color with labels and size hierarchy, so node kind is not conveyed by color alone. The current palette follows an Okabe-Ito-style separation: sky blue for domains, orange for capabilities, green for elements, and purple for unknown classification review.

This element is part of the Atlas dogfood proof loop: when Codex works from the project ontology, kind color separation helps the agent and human quickly distinguish shared vocabulary boundaries, user-visible behavior, implementation elements, and uncertain nodes before deciding which MCP or CLI graph query to run.