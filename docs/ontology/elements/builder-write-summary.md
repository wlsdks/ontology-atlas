---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

# Builder Write Summary

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` workflow rail for `/ontology/edit`.

The rail is no longer always visible. The Builder opens canvas-first: the large page title is kept only as an accessibility heading, the visible header collapses to draft/link status plus tool controls, and the `Source` / `Draft` / `Guard` / `Proof` rail sits behind a one-line `Write status` disclosure. Opening that disclosure reveals the same ordered proof cells and copy/query/source actions when the user or agent needs the write contract.

`src/views/ontology-edit/lib/builder-source-status.ts` keeps the Source cell state machine explicit and tested, so writable, restoring, unavailable, and readonly states cannot collapse back into one ambiguous demo/read-only label.

The rail still keeps the long body/proof copy in `aria-label` and `sr-only` text for desktop smoke tests and assistive technology, but it no longer consumes the default first viewport. This preserves the AI-agent proof packets without forcing human users to scan dense paragraphs before they can use the canvas.
