---
slug: elements/builder-detail-sheet
kind: element
title: Builder Detail Sheet
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` opens selected builder node details in a centered dialog instead of keeping the full inspector visible as a fixed right panel.

The sheet reuses `OntologyInspector` through its `surface="sheet"` mode, so rename, read-only sample detail, relation arrays, backlinks, and delete flows stay on the same editing contract while the canvas remains visually focused.

`src/views/ontology-edit/ui/OntologyEditCanvas.tsx` separates selection synchronization from explicit node opening via `onNodeOpen`, so automatic focus changes do not cover the canvas with a dialog.