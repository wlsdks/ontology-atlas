//! Raw sources are copied, measured and hashed, never parsed (`docs/DECISIONS.md`).
//! Discovery returns metadata for granted roots only, so no credential is scanned
//! (`.claude/rules/local-first.md`); mirrored in `tests/e2e/source-discovery-rules.ts`, or they drift.

pub(crate) mod discovery_rules;
pub(crate) mod dropped;
pub(crate) mod file_hashing;
mod import_destination;
mod import_run;
pub(crate) mod reveal;
pub(crate) mod running_imports;
mod source_copy;
pub(crate) mod source_discovery;
pub(crate) mod source_import;
mod source_offer;
pub(crate) mod source_picker;

#[cfg(test)]
mod fixture_folder;
