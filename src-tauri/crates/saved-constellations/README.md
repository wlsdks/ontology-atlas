# saved-constellations

The constellations a person saved in `.ontology-atlas/library-collections.json`, as
`get_constellation` lists them. Saved membership is task scope: nothing here is an ontology
relation, accepted meaning or a complete impact.

| File | Owns |
|---|---|
| `src/collections_file.rs` | Reading the file through `confined-files` (never through a link, never past 1 MiB) and describing it: its status, SHA-256 revision and modification time |
| `src/collections_validation.rs` | Judging the parsed document as the script server did, with the sentence it gave for each way the file is wrong |
| `src/constellation_list.rs` | The saved constellations in their order, with member counts |
| `src/constellation_context.rs` | One constellation as the vault's nodes are now: members resolved by uid, declared relations between them, direct dependencies that cross the boundary |

A file that is missing, corrupt or of another schema is an answer (`availability`), never an
error, and the file is never repaired. A member that no node claims, that two nodes claim, or that
claims a document without a `kind` is reported with its reason; it is never guessed.
