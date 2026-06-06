---
slug: elements/ontology-reader-intent-contract
kind: element
title: Ontology Reader Intent Contract
domain: views
path: src/shared/lib/ontology-reader-intent.ts
---

# Ontology Reader Intent Contract

`src/shared/lib/ontology-reader-intent.ts` defines the shared URL intent contract for stakeholder handoffs across Browse, Query, and Write ontology surfaces.

The contract accepts `planning`, `marketing`, `leadership`, `developer`, and `agent`, and rejects unknown values so destination screens do not invent unsupported reader modes from arbitrary query strings.

Dogfood note: this element was added while implementing reader-intent destination behavior. Atlas MCP identified the existing collaborator reader and workbench summary nodes first, then CodeGraph located the `/ontology/insights` and `/ontology/edit` entry points that already used `useSearchParams()`.
