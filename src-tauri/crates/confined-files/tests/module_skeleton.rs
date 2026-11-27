//! The public module skeleton the family design assigns to this crate stays reachable.

#[allow(
    unused_imports,
    reason = "the import is the check: it stops compiling if a module goes missing or private"
)]
use {
    confined_files::confined_root as _, confined_files::credential_names as _,
    confined_files::scan_root as _, confined_files::slug_paths as _,
    confined_files::snapshot_limits as _,
};

#[test]
fn every_assigned_module_is_public() {}
