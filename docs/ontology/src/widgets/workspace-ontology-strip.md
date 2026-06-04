---
slug: src/widgets/workspace-ontology-strip
kind: element
title: Workspace Ontology Strip
domain: views
---

# Workspace Ontology Strip

`src/widgets/workspace-ontology-strip` renders the compact ontology entrypoint used on project and workspace surfaces.

It summarizes the current vault-derived ontology as domain, capability, and element counts, then links into `/ontology/` so a project list can become a graph browse flow instead of a flat project index.

The primary chip now starts with a visible `Open ontology map` action before a short total-node expression. Domain, capability, and element counts stay in adjacent chips so the CTA remains readable on mobile while preserving the dense graph-count signal for people and agents who need to know what the project owns.

The ontology and unresolved-reference chips keep a 32px minimum interactive height, with visible focus rings and a restrained lift on hover. This makes the project-list handoff usable as an actual graph browse action rather than a tiny stat label, while preserving the compact ontology count strip.
