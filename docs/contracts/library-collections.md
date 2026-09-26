# Library collections format

Library bookmark organization is vault-local navigation metadata stored at
`.ontology-atlas/library-collections.json`. It does not add ontology nodes, accepted meaning,
document bodies, authority fields, or relationships, and deleting a collection folder removes only
entries from this file.

Version 1 uses `schema: "ontology-atlas/library-collections/v1"`, with `folders` and `items` arrays.
The UTF-8 file is limited to 1 MiB so a damaged preferences file cannot make the workbench consume
unbounded memory.
Folders have UUID `id`, nullable `parentId`, `name`, and non-negative integer `order`. Items have UUID
`id`, nullable `folderId`, `label`, `order`, and one typed target. A null folder places a bookmark at
the collection root, so saving does not require creating a folder first:

- source and wiki targets store their exact vault-relative `path`;
- ontology targets store the node `uid` and `lastKnownPath`.

One target may be saved in several folders, but at most once in the same folder. Folder parents must
exist and cannot form cycles. An ontology target resolves only by UID; its last-known path is display
context and never a fallback identity. Missing, duplicated, or path-reused targets remain unresolved.
Sources and wiki pages likewise use exact paths without title, basename, or fuzzy retargeting. All
folder, item, and ontology identity values are lowercase UUIDv4 strings.

Malformed data and unknown schema versions are read as unavailable and preserved byte for byte until
the person reloads or repairs them. Saves compare the content observed at load with the current file
before atomic replacement in the desktop app. The browser serializes Atlas writes per selected folder
handle and repeats that comparison immediately before its File System Access write; the browser API
does not provide filesystem compare-and-swap, so an external write in that final interval can still
race. Native writes serialize Atlas operations in-process, compare exact bytes, and publish by atomic
replacement, but external editors do not share that process lock and can also race after comparison.
A conflict preserves the observed newer bytes and requires reload before retry. Selection is checked
before a save starts and after it finishes. A started save cannot be cancelled; if the selected vault
changes during it, the write may finish only in its captured vault and the UI must discard that stale
completion rather than applying it to the newly selected vault's state.
