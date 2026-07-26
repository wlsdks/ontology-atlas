---
slug: elements/topology-owner-tint-overlay
kind: element
title: Topology Owner Tint Overlay
domain: views
---

# Topology Owner Tint Overlay

This is a retired UI contract. The old Sigma reducer could recolor plain
project nodes by `owner` while preserving hub and ontology-kind hues. Sigma,
`reducer-owner-tint.ts`, and its tests no longer exist.

The current topology-v2 adapter intentionally emits `ownerKey: null`, and its
world model does not carry an owner-tint channel. Ownership therefore is not
silently inferred or painted on the current canvas.

If ownership returns, it needs observed user evidence, a typed source field,
an explicit legend/handoff contract, and topology-v2 tests. This node records
that boundary so the retired reducer is not mistaken for a live capability.
