---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

# Builder Write Summary

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` workflow rail for `/ontology/edit`.

The rail is no longer always visible. The Builder opens canvas-first: the large page title is kept only as an accessibility heading, the visible header collapses to draft/link status plus tool controls, and the `Source` / `Draft` / `Guard` / `Proof` rail sits behind a toolbar `Write status` disclosure. Opening that disclosure reveals the same ordered proof cells and copy/query/source actions in an overlay panel, so the write contract is available without reserving a full-width row above the canvas.

The Builder's canvas arrangement controls follow the same progressive-disclosure rule. The old always-visible auto-layout button is folded into the `View` / `보기` popover, next to the readable step layout and relationship layout choices. Users see one top-level view control, then choose between arrangement mode or re-arranging the canvas only when needed.

When draft concepts exist, the Draft cell previews the first staged concepts by kind, title, and final vault path (`domains/foo.md`, `capabilities/bar.md`, `elements/baz.md`) before any markdown write happens. The list stays capped to three rows and folds the remaining count, so the save/agent handoff panel gives a concrete local-first file contract without becoming another inspector.

`src/views/ontology-edit/lib/builder-source-status.ts` keeps the Source cell state machine explicit and tested, so writable, restoring, unavailable, and readonly states cannot collapse back into one ambiguous demo/read-only label.

The rail still keeps the long body/proof copy in `aria-label` and `sr-only` text for desktop smoke tests and assistive technology, but it no longer consumes the default first viewport. This preserves the AI-agent proof packets without forcing human users to scan dense paragraphs before they can use the canvas.
