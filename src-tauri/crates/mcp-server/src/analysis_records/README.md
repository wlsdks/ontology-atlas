# analysis_records

The analysis records of a vault, kept in `.ontology-atlas/analyses` as one Markdown file each. A run
keeps one question, the nodes it was answered from and the answer; a review keeps what a person
decided about one finding. The app writes the files and this module never does: it lists them, reads
them, and refuses a record that does not match its format or its digests.

| File | What it owns |
|---|---|
| `analysis_archive.rs` | `AnalysisArchive`: `history` (a page of records, newest first) and `record` (one, whole) |
| `analysis_record.rs` | `validate`: every rule of the format `atlas-analysis/v1`; `AnalysisRecord`, `AnalysisMode` |
| `record_text.rs` | `parse_record`: a file's text to a record: one `name: <JSON>` line per field, then the body |
| `record_value.rs` | `RecordValue`: JSON with its keys in file order, which the answer writes back as a script lists them |
| `field_checks.rs` | The checks a field passes and the sentence each fails with |
| `evidence_digest.rs` | `evidence_problems`: the SHA-256 each piece of evidence, observation and profile was stamped with |
| `record_file_name.rs` | The name of a record file, and what finds a record by its id |
| `name_page.rs` | `NamePage`: the newest names below a cursor, found in one pass while holding one page |
| `record_summary.rs` | `RecordSummary`: one history row, without evidence or answer |
| `archive_limits.rs` | The folder name and the byte and page limits |
| `record_fault.rs` | `RecordFault`: the first rule a record breaks, in the words listed under `problems` |

Files are opened through `confined-files` (`VaultSidecar::below`), so a link in the folder, or at a
record's name, reads nothing outside the vault. The module names no `std::fs`.
