---
title: First run
doc_type: feature
status: current
area: product
routes: [/]
---

# First run

### First run — what the folder holds (2026-09-06)

"Just start" and "Create" open one question before writing anything: a documents wiki, an
ontology map of a codebase, or both. While it is asked, the question is the screen's heading. The answer is written as files — the wiki's
`wiki/_template.md`, the map's starter nodes and skills — and every folder of the fixed
`atlas/` tree is made either way. Nothing is stored as a preference: `describeVaultShape`
reads the folder, so a teammate who pulls it sees the same thing. A wiki without a map lands
on `/library`, and the map view is never drawn on the way there; the opening frame names the folder rather than the map when its last read found documents and no concept. Settings › Workspace carries an add-only row, "This folder holds", whose one
chip writes the missing part's starter files; the tabs follow the files.

Under it, "Clear all concepts" takes the map back to empty after a confirm dialog. It moves
every Markdown file whose `kind:` is `project`, `domain`, `capability`, `element` or
`document` into `.ontology-atlas/removed/<UTC stamp>/` at its original relative path; each
copy is written before its original is removed, and a failure stops the run with the rest in
place. The vault README, `wiki/`, `sources/`, `planning/`, dot-folders, agent files and every
file without a `kind:` are never touched. The success toast's Undo moves that reset's files
back, skipping any path that holds a file again; the copies stay in the sidecar folder, so
they can also be put back by hand. The empty map then shows the existing first-run starter.

The sample starter keeps its folder-opening action and sample switch, and nothing
on it unfolds in place. Under the folder action one row of quiet text buttons
creates a new folder (through the folder guide) and opens the map's glossary in a
small centred dialog with the plain-view action. The terminal command is the
folder guide's last section; a browser without folder access shows it from the
row instead, in its own dialog. The installed app also shows the build-from-code
door on the card. Its first turn asks the agent to outline every source unit,
read the one main flow, say the outline in a few sentences and write the whole
first map in the same run, with titles in the words a teammate says aloud; a
question the agent asks carries the default it takes. Each write still meets the
permission card unless Auto-approve is on, and binding the code folder and
finishing the map always ask. It does not launch a step-by-step popup tour. The
optional automatic folder-opening guide remains controlled in Screen settings.

Entering Map from another screen reveals the existing start actions for an empty
folder or concepts without relationships. These states do not mount a canvas, so
the committed start screen completes navigation instead of waiting for a draw.

Starter creation keeps a persistent failure explanation and retry action, including
when only some files were saved. Retrying preserves existing files and creates
missing starter files. The person can also leave the recovery step and keep what
was saved. The Concepts panel steps aside while creation or recovery owns the
start card, and returns to its previous state afterwards. Successful creation produces its own notification without duplicate
external-change notices.

The agent connection step opens the top-level Agents destination. It directs people
to the current tool checks instead of maintaining a separate runtime support list.

An empty Map keeps the Concepts panel out of the way until concepts exist. The
touch gesture hint appears only once the map canvas can actually be manipulated.
