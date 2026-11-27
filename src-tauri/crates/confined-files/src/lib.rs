//! Opening, listing, reading and writing files under a vault or a source root, and nothing
//! outside it. Every file operation of the server's families goes through this crate: a family
//! crate names neither `std::fs` nor `std::process` (a test in this crate fails when one does).
//!
//! The guarantees are types. A [`ConfinedPath`] can only be built by [`VaultRoot`] from a slug that
//! passed every rule; a [`WritablePath`] is one a write tool may change; a [`SourceRoot`] only
//! from [`ScanRoots::allow`]. A function that takes one needs no check of its own.

pub mod atomic_write;
pub mod confined_root;
pub mod markdown_walk;
pub mod modified_time;
pub mod private_names;
pub mod real_paths;
pub mod scan_root;
pub mod slug_rules;
pub mod source_access;
pub mod source_disk;
pub mod source_snapshot;
pub mod vault_root;
pub mod write_plan;

mod temporary_name;

pub use atomic_write::{
    check_current_text, check_modified_time, write_atomically, AtomicWrite, ConflictReport,
    Expectation, VaultConflict, WriteError,
};
pub use confined_root::{ensure_vault_root, resolve_path, VaultRootError};
pub use markdown_walk::{list_markdown_files, utf16_order};
pub use modified_time::ModifiedTime;
pub use private_names::{is_credential_name, is_hidden_name, names_hidden_or_credential_file};
pub use scan_root::{ScanRootRefused, ScanRoots, SourceRoot};
pub use slug_rules::{
    is_vault_source_path, raw_source_slug_issue, unwritable_slug_issue, VAULT_SOURCES_DIR,
};
pub use source_access::{DirectoryEntry, EntryKind, SourceFiles, SourceReadError};
pub use source_disk::{
    evidence_text, DiskSource, ReadBudget, MAX_EVIDENCE_READ_BYTES, MAX_EVIDENCE_TEXT_BYTES,
};
pub use source_snapshot::{
    ReadBoundary, SnapshotError, SnapshotSource, SourceSnapshot, MAX_ENTRIES, MAX_FILE_TEXT_BYTES,
    MAX_TEXT_BYTES, MAX_TRANSPORT_BYTES, SNAPSHOT_CONTRACT, SNAPSHOT_DESCRIPTOR,
};
pub use vault_root::{ConfinedPath, SlugError, VaultRoot, WritablePath};
pub use write_plan::{apply_all_or_nothing, Applied, ApplyOptions, PlanEntry, PlannedOperation};
