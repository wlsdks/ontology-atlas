---
slug: elements/ontology-deeplink-node-resolver
kind: element
title: Ontology Deeplink Node Resolver
domain: views
canvasPosition: { x: 880, y: 1792 }
relates: [elements/ontology-node-detail-modal]
---

> **Partially superseded (B3 허브가 곧 지도, 2026-07).** Two of the three
> resolvers described below are physically deleted:
> `src/views/ontology-view/lib/resolve-deeplink-node.ts` (with the rest of
> the tree hub, commit `3fa2c2508`) and
> `src/views/ontology-insights/lib/resolve-insights-query-node.ts` (dropped
> when `/ontology/insights` was rebuilt into its fixed 3-tab dashboard). The
> live successor for `/ontology?node=...` is
> `translateOntologyDeeplinkToTopologyParam` (`@/entities/knowledge-graph`),
> called from `src/views/ontology-redirect/ui/OntologyRedirectPage.tsx` —
> `/ontology` now only translates the `?node=<id>` contract into
> `/topology`'s `?p=<id>&index=expanded` and redirects; `/topology`
> (`HomePage`) is the one place that actually resolves `?p=` against the
> live vault. The `OntologyEditPage.tsx` / `BuilderWriteSummary` paragraph
> below is now fully obsolete — the xyflow ERD builder (`/ontology/edit`)
> was retired 2026-07-24. The live graph-id → deeplink builder is now
> `buildOntologyStudioNodeHrefFromGraphId` in
> `src/entities/knowledge-graph/lib/ontology-node-href.ts`, which the
> topology drawer uses to hand a node into the 나침 무대
> (`/ontology/studio?node=<id>`, see `capabilities/studio-deep-link-focus`).

`src/views/ontology-view/lib/resolve-deeplink-node.ts` resolved `/ontology?node=...` into the selected ontology node for the former tree hub.

It accepted both canonical ontology IDs such as `capability:mcp-server` and vault document slugs such as `capabilities/mcp-server`. This kept links from topology, docs, and builder compatible even though the tree view selected graph IDs while the builder focused vault `.md` slugs.

`src/views/ontology-insights/lib/resolve-insights-query-node.ts` applied the same compatibility rule for `/ontology/insights?node=...`. It also accepted project frontmatter slug aliases such as `ontology-atlas` for `project:ontology-atlas`, so builder proof links from the auto-focused root project opened the focused proof panel instead of falling back to the generic query cockpit.

(Obsolete after the 2026-07-24 builder retirement.) The former `src/views/ontology-edit/ui/OntologyEditPage.tsx` kept `BuilderWriteSummary` on the same contract: if a saved concept had a vault slug, proof links used it; if only a graph node id was available, the summary still emitted a focused `/ontology/insights/?node=...` link. That surface is gone; the 나침 무대 studio now consumes the same graph-id/slug deeplink contract via `buildOntologyStudioNodeHrefFromGraphId`.