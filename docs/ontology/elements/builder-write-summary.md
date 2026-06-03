---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` workflow rail above the `/ontology/edit` canvas. The rail replaced the previous four-card status grid so the Builder opens with the graph canvas visible earlier, while still keeping each write-stage proof reachable.

`src/views/ontology-edit/lib/builder-source-status.ts` keeps the Source cell state machine explicit and tested, so writable, restoring, unavailable, and readonly states cannot collapse back into one ambiguous demo/read-only label.

The rail intentionally keeps the long body/proof copy in `aria-label` and `sr-only` text for desktop smoke tests and assistive technology, but visually shows only the order, label, value, compact flow chip, and copy/query/source actions. This preserves the AI-agent proof packets without forcing human users to scan dense paragraphs before they can use the canvas.