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

On `/ontology/insights`, the contract also selects the first useful tab: `planning`, `marketing`, and `leadership` open the collaborator evidence lane, `agent` opens the agent proof lane, and `developer` stays on graph proof before continuing to Save/edit. The tab can still be changed by the user; the URL intent only sets the arrival focus.

Dogfood note: this element was added while implementing reader-intent destination behavior. Atlas MCP identified the existing collaborator reader and workbench summary nodes first, then CodeGraph located the `/ontology/insights` and `/ontology/edit` entry points that already used `useSearchParams()`.
