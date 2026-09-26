---
id: 5a06fda7-f263-415b-a547-defdb41ca826
date: 2026-09-26
category: Fixed
---
Removing the last relation of a key no longer leaves the key behind: the map's relation editor, MCP remove_relation and replace_relation, and the CLI's remove-relation now delete a list emptied by the removal, and `relation_notes` with its last reason, where they used to write `relates: []` and `relation_notes: {  }`; only a kind's own scaffold list, such as a capability's `elements`, returns to the `[]` creating the node writes. The change review says "None" where it printed `[]` or `null`. The launch chooser lists the folders that still exist first and gathers the ones that no longer exist into one quiet line at the end of the list, whose review names each path and forgets one or all of them only when pressed; the list is drawn once, from the reachability check, instead of redrawing a frame after it appears. The rail switcher's picker reads "Open another folder".
