---
slug: elements/builder-detail-sheet
kind: element
title: Builder Detail Sheet
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` opens selected builder node details in a centered dialog instead of keeping the full inspector visible as a fixed right panel.

The sheet reuses `OntologyInspector` through its `surface="sheet"` mode, so rename, read-only sample detail, relation arrays, backlinks, and delete flows stay on the same editing contract while the canvas remains visually focused.

For unsaved builder nodes, the detail sheet previews the exact markdown file path that the save action will create, using the same `vaultFolderForKind(kind)` rule as the write path (`domains/access-control.md`, `capabilities/foo.md`, and so on). This keeps the pre-save UI aligned with the local-first vault contract instead of showing an internal graph handle that does not match the file written to disk.

That same preview now checks the active vault manifest before save. If the draft name would write to an existing path, the sheet shows the conflicting `.md` path, disables save, and offers the next available title/path as a one-click rename. The write handler repeats the same guard so Enter-save and indirect calls cannot collide with an existing ontology node.

The save area also shows a compact status row for `ready`, `path conflict`, or `name needed`, so the user can read the next action without parsing a disabled button state. The draft path has a copy action, and named drafts expose an agent packet that includes kind, title, vault path, MCP `add_concept` args, and post-save validation checks for Claude Code, Codex, or a terminal run before the file exists.

When a draft detail sheet opens while other unsaved work exists, its top callout now routes to the save and agent handoff summary, where the staged draft concepts are previewed by kind, title, and final vault path.

Selected saved nodes now split detail into `Overview`, `Relations`, and `Document` tabs. The default overview opens with an ontology object proof card before the name editor: kind + vault slug, outgoing frontmatter relation count, incoming backlink count, and source `.md` status. Its actions jump straight to relation inspection or source document work, so a selected node reads as a markdown-backed graph object that Claude Code / Codex can query, edit, and validate rather than as a plain form row. Relation arrays and backlinks move into the relations tab, while domain/description document fields and destructive actions move into the document tab. The document tab also links directly to `/docs/?slug=<node-slug>`, so a human can read the same markdown body and frontmatter that an AI agent reads over MCP. This keeps human reading light while preserving the same source-backed write surface for agents.

`src/views/ontology-edit/ui/OntologyEditCanvas.tsx` separates selection synchronization from explicit node opening via `onNodeOpen`, so automatic focus changes do not cover the canvas with a dialog.
