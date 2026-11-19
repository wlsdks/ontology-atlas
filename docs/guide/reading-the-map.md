---
title: "Reading the map"
doc_type: guide
status: current
area: product
---

# Reading the map

The map is the knowledge graph Atlas draws from the Markdown files in your ontology folder. This chapter explains what each mark means, what lights up when you point at a concept, what the concept panel shows, and how Atlas marks concepts whose code changed after they were written. Everything on the map comes from those files.

## The map at rest

The default view is **Flat**, a force graph grouped by domain. The view picker also offers **Hex**, **3D**, **Domain structure** and **Neural**; this chapter describes **Flat**.

- **The project** is one disc at the centre, the only mark with colour while nothing is selected.
- **Domains** are soft pools of light, each with a disc, a large bold name, and a caption that counts its members, for example "12 capabilities · 30 elements".
- **Capabilities** are smaller discs around their domain. More elements make a slightly larger disc.
- **Elements** are dots around their capability.
- Concepts outside every domain sit together under a caption such as "3 concepts belong to no domain".
- Faint arcs between domains count the `depends_on` relations between their concepts. Only the strongest pairs draw at rest.

Colour is kept for attention: it shows which domain you are pointing at and which way a relation runs. The layout depends only on the folder's content and the window size, so the same folder draws the same picture each time and you can learn where things are.

## Names and zoom

Names never overprint each other; where there is no room, a name is left out. Domain names are always drawn, capability names are added as space allows (the most connected first), and element names appear once you zoom in far enough that the dots stand apart. A selected concept is always named.

A missing name does not mean a missing concept. Zoom in, point at its domain, or search with `⌘K`.

## Pointing and selecting

Rest the pointer on a concept and, after a short pause, the map lights what it is connected to and sinks the rest. A quick sweep lights nothing.

- **A domain** lights its members and the domains it depends on or is used by.
- **A capability** lights its domain, its elements, and every concept it depends on, is used by, relates to, or sits under as a narrower concept.
- **An element** lights its capability, that capability's domain, and the far end of each of its own relations.

The shape of each line, not its colour alone, tells you the relation type:

| Line | Meaning |
|---|---|
| Filled taper, wide at the selection, pointed at the other concept | **Depends on**: the selection needs it |
| The same taper in a warm colour, wide at the other concept | **Used by**: the other concept needs the selection |
| Dotted hairline | **Related**: neither needs the other |
| Double hairline toward the broader concept | **Broader concept** (`is_a`) |

A key at the bottom names the line kinds on screen, and `?` lists every shortcut.

Click to select. The camera frames the selection and its lit neighbours, and one small light runs once along each line, from what is needed toward what needs it. With reduced motion turned on, no light travels. `Esc` clears the selection and returns the camera, and the arrow keys walk from concept to concept.

## The concept panel

Selecting a concept opens a compact panel at the right edge of the map:

- **Header**: the kind, the direct owner (a capability's domain, an element's capability), and a recent change such as "changed 3d ago".
- **Definition**: cut to three lines. Press it to read the rest.
- **A row that needs a person**, only when one applies: the document is marked for a person to decide, it changed after a person confirmed it, or some relations have no reason written.
- **Depends on** and **Used by**: the relations the map draws, one row per concept. **No reason** marks a relation without a recorded reason. Point at a row to read its reason.
- One line that counts the rest, such as **Other relations 2 · Implementation elements 1**.

The footer holds the slug and the actions: **Ask** (desktop app only; it opens the agent conversation with a question about this concept, and you press send), **Edit relations** (a domain shows an **Edit** menu that also offers **Create linked concept**), **More actions**, and **Details**, a centred dialog with the full body, every relation, code locations, and a prompt to copy for your agent. Editing is covered in [Editing concepts and relations](/guide/studio).

Right-click a concept for **Document**, **Edit relations**, **Copy prompt**, **Path** and **Details**. After **Path**, select a second concept and the map lights the shortest path between them, hop by hop. For a concept that contains others, **More actions** › **Show only what is inside** narrows the map to it; **Full map** returns.

The address keeps the selection, view, path, and narrowed view, so a link reopens the same picture.

## Stale and unknown evidence

In the desktop app, when the ontology folder is inside a Git repository, Atlas compares each concept's document with the code files it cites in `path`.

- **Stale**: a cited file changed after the document did. The disc carries a small amber dot, and the domain caption counts it, for example "2 stale".
- **Unknown**: the concept cites no file, or Atlas could not tell when the file changed. The disc is a dashed, hollow outline.
- When nothing could be checked, for example in a browser, a line under the project reads **Evidence not checked**.

These marks are not scores. They tell you where to read the code before you trust the text.

## Review results

**More actions** › **Ontology review** opens a panel with **Role & connections**, **Review results** and **Conversation**. In the desktop app with a connected agent, **Ask AI to review** asks the agent to question the meaning in scope. Its questions are saved under `.ontology-atlas/analyses` in your ontology folder and listed under **Review results**.

**Have it fixed** hands a question to the agent; any file change it proposes still waits for your approval. **Keep for later** and **Dismiss** record your judgment. As the panel says: "These are the AI's guesses. You decide whether they hold."

Next, [The ontology folder](/guide/vault-structure) shows the files behind every mark, and [Relations](/guide/relations) explains each line type.
