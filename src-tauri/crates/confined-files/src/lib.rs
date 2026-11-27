//! The one type that opens, reads and writes files under a vault or source root. No other crate calls `std::fs` directly.

pub mod confined_root;
pub mod credential_names;
pub mod scan_root;
pub mod slug_paths;
pub mod snapshot_limits;
