---
title: "Reading the map"
doc_type: guide
status: current
area: product
---

# Reading the map

The map is the knowledge graph Atlas draws from the Markdown files in your ontology folder, and everything on it comes from those files. Here you learn what each mark means, what lights up when you point at a concept, what the concept panel shows, and how Atlas marks concepts whose code changed after they were written.

## The map at rest

The default view is **Flat**, a force-directed graph grouped by domain. The view picker also offers **Hex**, **3D** and **Neural**. This chapter describes **Flat**.

- **The project** is one disc at the center. While nothing is selected, it is the only mark in color.
- **Domains** are soft pools of light, each with a disc, a large bold name, and a caption that counts its members, for example "12 capabilities · 30 elements".
- **Capabilities** are smaller discs around their domain. A capability with more elements has a slightly larger disc.
- **Elements** are dots around their capability.
- Concepts outside every domain sit together under a caption such as "3 concepts belong to no domain".
- Faint arcs between domains count the `depends_on` relations between their concepts. At rest, only the strongest pairs are drawn.

Color is saved for what needs your attention: it shows which domain you are pointing at and which way a relation runs. The layout depends only on the folder's content and the window size. The same folder draws the same picture each time, so you can learn where things are.

## Names and zoom

Names never overlap; where there is no room, a name is left out. Domain names are always drawn. Capability names are added as space allows, the most connected first. Element names appear once you zoom in far enough that the dots stand apart. A selected concept is always named.

A missing name does not mean a missing concept. Zoom in, point at its domain, or search with `⌘K`.

## Pointing and selecting

Rest the pointer on a concept. After a short pause, the map lights up what it is connected to and dims the rest. Moving the pointer quickly across the map lights nothing.

- **A domain** lights its members and the domains it depends on or is used by.
- **A capability** lights its domain, its elements, and every concept it depends on, is used by, relates to, or sits under as a narrower concept.
- **An element** lights its capability, that capability's domain, and the far end of each of its own relations.

The shape of each line, not just its color, tells you the relation type:

| Line | Meaning |
|---|---|
| Filled taper, wide at the selection, pointed at the other concept | **Depends on**: the selection needs it |
| The same taper in a warm color, wide at the other concept | **Used by**: the other concept needs the selection |
| Dotted hairline | **Related**: neither needs the other |
| Double hairline toward the broader concept | **Broader concept** (`is_a`) |

A legend at the bottom names the line types on screen, and `?` lists every keyboard shortcut.

Click a concept to select it. The camera frames the selection and its lit neighbors, and a small light runs once along each line, from what is needed toward what needs it. With reduced motion turned on, no light moves. `Esc` clears the selection and moves the camera back, and the arrow keys step from concept to concept.

## The concept panel

Selecting a concept opens a compact panel at the right edge of the map:

- **Header**: the kind, the direct parent (a capability's domain, an element's capability), and the latest change, such as "changed 3d ago".
- **Definition**: shortened to three lines. Press it to read the rest.
- **A row that needs a person**, only when it applies: the document is marked for a person to decide, it changed after a person confirmed it, or some relations have no written reason.
- **Depends on** and **Used by**: the relations the map draws, one row per concept. **No reason** marks a relation without a recorded reason. Point at a row to read its reason.
- One line that counts the rest, such as **Other relations 2 · Implementation elements 1**.

The footer shows the slug and the actions:

- **Ask** (desktop app only) opens the agent chat with a question about this concept; you press send.
- **Edit relations**. On a domain, an **Edit** menu holds it and also offers **Create linked concept**.
- **More actions**.
- **Details** opens a centered dialog with the full body, every relation, the code locations, and a prompt to copy for your agent.

[Editing concepts and relations](/guide/studio) covers editing.

Right-click a concept for **Document**, **Edit relations**, **Copy prompt**, **Path** and **Details**. After **Path**, select a second concept, and the map lights up the shortest path between them, one step at a time. For a concept that contains others, **More actions** › **Show only what is inside** narrows the map to that concept. **Full map** brings the whole map back.

The page address keeps the selection, the view, the path and the narrowed scope, so a link reopens the same picture.

## Stale and unknown evidence

In the desktop app, when the ontology folder is inside a Git repository, Atlas compares each concept's document with the code files it cites in `path`.

- **Stale**: a cited file changed after the document did. The disc gets a small amber dot, and the domain caption counts it, for example "2 stale".
- **Unknown**: the concept cites no file, or Atlas could not tell when the file changed. The disc is drawn as a dashed, hollow outline.
- When nothing could be checked, for example in the browser version, a line under the project reads **Evidence not checked**.

These marks are not scores. They tell you where to read the code before you trust the text.

## Review results

**More actions** › **Ontology review** opens a panel with three sections: **Role & connections**, **Review results** and **Conversation**. In the desktop app with a connected agent, **Ask AI to review** asks the agent to question the meaning of the concepts in scope. Its questions are saved under `.ontology-atlas/analyses` in your ontology folder and listed under **Review results**.

**Have it fixed** hands a question to the agent; any file change it proposes still waits for your approval. **Keep for later** and **Dismiss** record your decision. As the panel says: "These are the AI's guesses. You decide whether they hold."

Next, [The ontology folder](/guide/vault-structure) shows the files behind every mark, and [Relations between concepts](/guide/relations) explains each line type.
