//! The bounds of one source probe. `SOURCE_INVENTORY_VERSION` is hashed into every fingerprint, so a
//! change to what a fingerprint covers bumps it and every stored receipt reads as changed once.

pub const SOURCE_INVENTORY_VERSION: &str = "inventory-v3";
/// Folders a walk of a folder without Git descends before it says the inventory was cut.
pub const SOURCE_INVENTORY_MAX_DEPTH: usize = 20;
/// The bytes of changed files one fingerprint reads; past it the inventory is marked cut.
pub const SOURCE_INVENTORY_MAX_HASH_BYTES: u64 = 32 * 1024 * 1024;
/// Folders a walk of a folder without Git never enters: caches and build output, not source.
pub const SOURCE_PRUNE_DIR_NAMES: [&str; 9] = [
    ".git",
    ".next",
    ".turbo",
    ".cache",
    "node_modules",
    "target",
    "dist",
    "build",
    "coverage",
];
