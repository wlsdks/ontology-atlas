# project-source

The code folder a project node describes: one probe and fingerprint of it, the receipt that records
which source claims the folder supports, and the sidecar file that binds a project to a folder. The
MCP server and the app both measure a folder here, so one folder has one fingerprint
(`inventory-v3`) whoever asks.

The fingerprint of a Git folder is the revision, the index (Git's blob ids), the bytes of only the
files `git status` reports as changed, and the filtered status. A folder without Git gets one walk
of names, sizes and times. Names are composed (NFC) and ordered by code point; no file-count cut
applies. The vault folder inside the source is left out of both.

| File | Owns |
|---|---|
| `src/source_inventory_limits.rs` | The version word, the depth cap, the hashed-bytes budget and the pruned folder names |
| `src/source_digest.rs` | The one digest every identity here is made with |
| `src/composed_name.rs` | NFC spelling of a path |
| `src/vault_exclusion.rs` | The vault folder inside a source: its path and the filter on `git status` |
| `src/git_state.rs` | The Git inventory and fingerprint from one `status` call |
| `src/folder_state.rs` | The inventory and fingerprint of a folder without Git |
| `src/source_probe.rs` | The probe of a folder, whichever kind |
| `src/probe_error.rs` | Why a probe failed |
| `src/project_graph_hash.rs` | The hash of a project's scoped documents a receipt is dated against |
| `src/source_range_citation.rs` | A cited line range and the relative paths a receipt may persist |
| `src/competency_evidence.rs` | The paths and citations a project's competency answers name |
| `src/source_witnesses.rs` | The claims a project's documents make about code |
| `src/source_receipt.rs` | The receipt: its shape and how a probe and claims mint it |
| `src/source_receipt_view.rs` | The stored receipt judged against the folder and ontology as they are |
| `src/source_vocabulary.rs` | The gap and action names a receipt may use |
| `src/ordered_json.rs` | JSON that keeps its key order, for bindings another project owns |
| `src/source_bindings.rs` | `.ontology-atlas/project-sources.json`: read, replace one project's binding, remove |
| `src/source_folder_inference.rs` | The folder a call without `rootPath` would bind |

File access goes through `confined-files` (`ProbeFolder`, `VaultSidecar`) and `git` through
`hardened-git`; this crate names neither `std::fs` nor `std::process`.
