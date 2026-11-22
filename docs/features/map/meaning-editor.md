---
title: Building the ontology by hand on the map
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Building the ontology by hand on the map

A person builds and corrects the ontology in place on `/topology`. Every manual
write lands at once and answers with a toast that names it and offers **Undo**;
there is no review step before a manual write. Agent writes keep their
permission card (below).

### Creating concepts

- The create card (`src/views/home/ui/create/CreateNodeForm.tsx`) sits at the
  map's right inset, where the concept panel sits, with no scrim: the map and
  the concept list stay usable. It opens from `N` (when no field has focus), a
  right-click on empty canvas, the **+** in the concept list's header, the
  empty state's one create door, the panel's **Add a concept inside** and
  `?workbench=create`.
- Fields, in order: the name in the screen language (focused); the kind as four
  chips with one sentence that changes per kind; where it goes, only for a
  capability or element, prefilled from the selection (a selected domain puts
  it inside that domain; a selected capability or element puts it under its
  domain) and changeable by searching domains; an optional one-sentence
  description, written as the body's first paragraph; the other language's
  name last. A same-kind concept with a near-identical name is named, with
  **Open it**.
- `Enter` writes the file, closes the card, selects the new concept and eases
  the camera to it. `⌘/Ctrl+Enter` writes it and keeps the card open with the
  same kind and place, the name cleared. `Esc` closes it.
- Each open group in the concept list ends in a quiet add row: a project's
  **Add a domain**, a domain's **Add a capability** and **Add an element**.
  Pressing one turns it into a name field; `Enter` creates the concept in that
  group and leaves the field ready for the next; `Esc` ends it. The rows hide
  while the list is filtered or a lens narrows it.
- A right-click places nothing: the map lays concepts out by force, so the new
  concept appears where the layout puts it.

### Relations (`?workbench=edit`)

- **Edit relations** swaps the concept panel, at the same anchor, into
  `MeaningEditorPanel`. It lists the relations the concept's document declares
  (`Depends on Orders`) and those other documents declare toward it
  (`Billing contains this`), each with **Edit** and **Remove**. An incoming
  relation is edited in, and removed from, the document that declares it.
- **Add a relation** offers only the relations the kind allows (contains for a
  project, domain or capability; is a kind of for a domain, capability or
  element), a target search that matches the title or any `display_<locale>`
  and shows each match's kind and domain, and the reason. A dependency
  requires its reason, asked as what breaks here when that one changes. The
  reason field grows to eight rows, then scrolls (`maxRows={8}`).
- The map draws a dashed directional preview between the live endpoints while
  the draft has a target. It never enters the force graph. `Enter` writes.
- A map edge whose line lives in the other end's document opens that
  document's relations; **needs a folder** answers only when no folder is open.
- A relation written by hand uses the key and value shape the MCP writer
  (`add_relation`, `mcp/src/tools/relation-keys.mjs`) uses for the same
  relation between the same kinds: `dependencies:` (a `depends_on:` list is
  folded into it), `relates:`, the typed `domains:`/`capabilities:`/
  `elements:` list where the kinds fit and `contains:` otherwise, references
  sorted and de-duplicated, an emptied scaffold list kept as `[]`, and the
  reason in `relation_notes:` under the target's slug. `is_a` is written as
  `broader:`, which the MCP writer does not write.

### Changing and taking back

- The panel's **Edit** menu renames the concept in the name's place, edits its
  description in one step, and deletes it. A rename changes the name shown in
  the screen language (`display_<locale>` when the file has one, else
  `title`), moves `title` with it when both spelled the same name, and renames
  the title heading; slug and uid stay. The description is `description:` when
  the file keeps one, else the paragraph under the title heading
  (`src/views/home/model/authoring/lead-paragraph.ts`). Delete first names
  every document that still points here.
- Create, relation add, change and remove, rename, description and delete each
  answer with a toast and **Undo**
  (`src/views/home/model/authoring/use-manual-write-undo.ts`). Undo restores the
  file's bytes from before the write (a created file is removed, a deleted one
  comes back), only for the most recent write, and refuses in one sentence when
  the file changed on disk since. The toast stays ten seconds; after it is gone
  `⌘Z` on the map (outside a text field) takes the same write back, and the
  shortcut sheet lists it. Undo writes nothing once another folder is open. It
  reads and writes through the same handles in the browser and the app.

### Agent writes

- ACP keeps read tools frictionless. Every Atlas write tool pauses the same
  conversation on a typed change card, hides `allow_always`, and resumes only on
  `allow_once`; rejection is `reject_once`. The tool-mode policy is checked
  against the generated `tools/list` surface so a new tool fails closed as a
  write.
- Batch writers preserve and display every requested row in protocol order. The
  review accordion selects one exact item at a time for the map preview, while
  allow/reject applies to the whole batch; the first item is never used as a
  stand-in for hidden rows.
- `/ontology/studio` and `/ontology/edit` remain only as compatibility addresses.
  `node/mode/edit/via/review` are translated to `p/workbench/edit` on `/topology`.
