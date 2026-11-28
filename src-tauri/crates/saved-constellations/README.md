# saved-constellations

The constellations a person saved in `.ontology-atlas/library-collections.json`, as
`get_constellation` lists them. Saved membership is task scope: nothing here is an ontology
relation, accepted meaning or a complete impact.

| File | Owns |
|---|---|
| `src/collections_file.rs` | Reading the file through `confined-files` (never through a link, never past 1 MiB) and describing it: its status, SHA-256 revision and modification time |
| `src/collections_validation.rs` | Judging the parsed document as the script server did, with the sentence it gave for each way the file is wrong |
| `src/constellation_list.rs` | The saved constellations in their order, with member counts |

A file that is missing, corrupt or of another schema is an answer (`availability`), never an
error, and the file is never repaired. One saved constellation's members, relations and
dependencies are not built here yet.
