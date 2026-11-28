//! Opening, listing, reading and writing files under a vault or a source root, and nothing
//! outside it. Every file operation of the server's families goes through this crate: a family
//! crate names neither `std::fs` nor `std::process` (the `family_boundary` test fails when one
//! does).
//!
//! The guarantees are types. A [`ConfinedPath`] can only be built by [`VaultRoot`]; a
//! [`WritablePath`] is one a write tool may change; a [`SourceRoot`] only comes from
//! [`ScanRoots::allow`]. A function that takes one needs no check of its own.

mod absorbed_file;
mod atomic_write;
mod confined_file_read;
// Public only because `mcp-server` imports `confined_files::confined_root::...` by this path;
// the same names are re-exported at the root below, and the module closes once it moves there.
pub mod confined_root;
mod markdown_walk;
mod modified_time;
mod os_error;
mod plain_file;
mod plain_parts;
mod probe_folder;
mod private_names;
mod raw_source_read;
mod real_paths;
mod repository_file_read;
mod scan_root;
mod settle_rule;
mod slug_rules;
mod source_access;
mod source_disk;
mod source_snapshot;
mod stable_read;
mod temporary_name;
mod vault_root;
mod vault_sidecar;
mod write_plan;

pub use plain_file::FileIdentity;
pub use absorbed_file::{
    AbsorbRepository, AbsorbedFile, AbsorbedFileRefusal, AbsorbedPlace, ABSORBED_FILE_MAX_BYTES,
    ABSORB_BACKUP_SUFFIX,
};
pub use atomic_write::{
    check_current_text, check_modified_time, write_atomically, AtomicWrite, ConflictReport,
    Expectation, VaultConflict, WriteError, WriteErrorClass,
};
pub use confined_root::{ensure_vault_root, resolve_path, VaultRootError};
pub use markdown_walk::utf16_order;
pub use modified_time::ModifiedTime;
pub use os_error::{IoFailure, OsErrorCode};
pub use plain_parts::{PlainParts, PlainPartsRefusal};
pub use probe_folder::{ProbeEntry, ProbeFacts, ProbeFolder};
pub use private_names::{is_credential_name, is_hidden_name, names_hidden_or_credential_file};
pub use raw_source_read::{
    RawSourcePath, RawSourcePathRefusal, RawSourceReadRefusal, RAW_SOURCE_PATH_MAX_BYTES,
};
pub use real_paths::{is_within_folding_case, real_path};
pub use repository_file_read::{RepositoryFile, RepositoryFileRefusal};
pub use scan_root::{ScanRootRefused, ScanRoots, SourceRoot};
pub use slug_rules::{
    is_vault_source_path, raw_source_file_for_slug, unwritable_slug_reason, UnwritableReason,
    AGENT_INSTRUCTION_FILE_STEMS, VAULT_SOURCES_DIR,
};
pub use source_access::{
    DirectoryEntry, DirectoryListing, EntryKind, Refusal, SourceFiles, SourceReadError,
};
pub use source_disk::{
    evidence_text, DiskSource, ReadBudget, MAX_EVIDENCE_READ_BYTES, MAX_EVIDENCE_TEXT_BYTES,
};
pub use source_snapshot::{
    confined_source_reads_enabled, sha256_hex, ListedDirectory, Lookup, ReadBoundary, ReadFile,
    SnapshotError, SnapshotSource, SourceSnapshot, MAX_ENTRIES, MAX_FILE_TEXT_BYTES,
    MAX_TEXT_BYTES, MAX_TRANSPORT_BYTES, SNAPSHOT_CONTRACT, SNAPSHOT_DESCRIPTOR,
};
pub use settle_rule::{is_settled_at, now_nanoseconds, SETTLE_NANOSECONDS};
pub use stable_read::{FileSnapshot, FileStamp, StableReadError, MAX_ATTEMPTS};
pub use vault_root::{ConfinedPath, SlugError, VaultRoot, WritablePath, TOP_FILE_MAX_BYTES};
pub use vault_sidecar::{
    FileNames, Revision, SidecarError, Stored, StoredTail, Unsafe, VaultSidecar,
};
pub use write_plan::{
    apply_all_or_nothing, Applied, ApplyOptions, PlanEntry, PlannedOperation, Reservations,
    ReservedForPerson,
};
