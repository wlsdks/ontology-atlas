# analysis_records

The analysis records of a vault, kept in `.ontology-atlas/analyses` as one Markdown file each. A run
keeps one question, the nodes it was answered from and the answer; a review keeps what a person
decided about one finding. The app writes and lists the files; this module never writes: it reads
one record whole, and refuses a record that does not match its format or its digests.

| File | What it owns |
|---|---|
| `analysis_archive.rs` | `AnalysisArchive`: `record`, one record found by its id and read whole |
| `analysis_record.rs` | `validate`: every rule of the format `atlas-analysis/v1`; `AnalysisRecord` |
| `record_text.rs` | `parse_record`: a file's text to a record: one `name: <JSON>` line per field, then the body |
| `record_value.rs` | `RecordValue`: JSON with its keys in file order, which the answer writes back as a script lists them |
| `field_checks.rs` | The checks a field passes and the sentence each fails with |
| `evidence_digest.rs` | `evidence_problems`: the SHA-256 each piece of evidence, observation and profile was stamped with |
| `record_fault.rs` | `RecordFault`: the first rule a record breaks, in the words the refusal gives |

The folder, the byte limit and the name of a record file are `analysis-archive-format`'s, which the
app that writes the records links too. Files are opened through `confined-files`
(`VaultSidecar::below`), so a link in the folder, or at a record's name, reads nothing outside the
vault. The module names no `std::fs`.
