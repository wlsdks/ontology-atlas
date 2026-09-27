---
title: Contextual meaning editor and change review
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Contextual meaning editor and change review

### `/topology?workbench=edit` — contextual meaning editor and change review

- The reason field (`Why this relation exists`) grows with its text up to eight rows, then scrolls inside itself (`maxRows={8}` in `src/features/ontology-meaning-editor/ui/MeaningEditorPanel.tsx`).

- A selected node keeps its map context while its compact inspector swaps, at the
  same anchor, into `MeaningEditorPanel`. There is no second right dock and no
  separate review route.
- One edit handles **one relation**. The user chooses type, target, and rationale,
  or removes that existing relation from the same review path;
  `depends_on` requires a rationale. Invalid `is_a` and containment target kinds
  are filtered before selection.
- The real map draws a dashed directional preview between the live endpoint
  coordinates. This overlay never enters the force graph, so it cannot pull nodes
  or change graph statistics. A density-hidden target is temporarily rendered at
  its real coordinate and label. Confirming crossfades the same mark to solid,
  then the local writer applies the reviewed frontmatter arrays with `expectedMtime`.
- INDEX folds only during `workbench=edit` and restores after close. The responsive
  contract keeps at least 480px of map between left chrome and editor from 1024px
  upward; below `lg`, the editor is the single centered sheet above the tab bar.
- New concept creation uses `workbench=create`. It no longer calls `createDoc`
  from the first button press: the generated UID, slug, kind, display labels,
  domain, and authorship fields are shown in `OntologyChangeReview`, and only
  "Confirm and write" creates the file.
- ACP keeps read tools frictionless. Every Atlas write tool pauses the same
  conversation on a typed change card, hides `allow_always`, and resumes only on
  `allow_once`; rejection is `reject_once`. The tool-mode policy is checked against
  the generated `tools/list` surface so a new tool fails closed as a write.
- Batch writers preserve and display every requested row in protocol order. The
  review accordion selects one exact item at a time for the map preview, while
  allow/reject applies honestly to the whole batch; the first item is never used
  as a stand-in for hidden rows.
- `/ontology/studio` and `/ontology/edit` remain only as compatibility addresses.
  `node/mode/edit/via/review` are translated to `p/workbench/edit` on `/topology`.
