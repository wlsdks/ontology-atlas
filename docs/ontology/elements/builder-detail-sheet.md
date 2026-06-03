---
slug: elements/builder-detail-sheet
kind: element
title: Builder Detail Sheet
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` opens selected builder node details in a centered dialog instead of keeping the full inspector visible as a fixed right panel.

The sheet reuses `OntologyInspector` through its `surface="sheet"` mode, so rename, read-only sample detail, relation arrays, backlinks, and delete flows stay on the same editing contract while the canvas remains visually focused.

Selected saved nodes now split detail into `Overview`, `Relations`, and `Document` tabs. The default overview keeps only name, slug, and save state visible. Relation arrays and backlinks move into the relations tab, while domain/description document fields and destructive actions move into the document tab. This keeps human reading light while preserving the same frontmatter write surface that AI agents inspect over MCP.

`src/views/ontology-edit/ui/OntologyEditCanvas.tsx` separates selection synchronization from explicit node opening via `onNodeOpen`, so automatic focus changes do not cover the canvas with a dialog.
