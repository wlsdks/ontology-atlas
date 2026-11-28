//! Which `.rs` files of a Cargo package the feature evidence reads: the files of its conventional
//! targets (`src`, `tests`, `examples`, `benches`, `build.rs`), never another package's, never a
//! link, a hidden name or a build output folder. A file named like a credential is listed so it can
//! be counted, and is never opened.

use std::collections::HashSet;

use confined_files::EntryKind;

use crate::repository_files::{join, RepositoryFiles};

const TARGET_NAMES: [&str; 5] = ["benches", "build.rs", "examples", "src", "tests"];
const NEVER_WALKED: [&str; 6] = [".git", "target", "node_modules", "dist", "build", "out"];

#[derive(Debug, Default)]
pub struct RustSourceInventory {
    /// The files to read, in walk order.
    pub files: Vec<String>,
    /// How many `.rs` files the walk met before it stopped.
    pub discovered: usize,
    pub limited: bool,
}

struct Walk<'a, 'f> {
    files: &'a RepositoryFiles<'f>,
    excluded: HashSet<&'a str>,
    limit: usize,
    inventory: RustSourceInventory,
}

impl Walk<'_, '_> {
    fn note_rust_file(&mut self, path: String) -> bool {
        self.inventory.discovered += 1;
        if self.inventory.files.len() < self.limit {
            self.inventory.files.push(path);
            true
        } else {
            self.inventory.limited = true;
            false
        }
    }

    /// `false` once the file limit was reached and the whole walk must stop.
    fn walk(&mut self, folder: &str) -> bool {
        if self.inventory.limited {
            return false;
        }
        for entry in self.files.listing(folder) {
            if NEVER_WALKED.contains(&entry.name.as_str()) || entry.name.starts_with('.') {
                continue;
            }
            let path = join(folder, &entry.name);
            if self.excluded.contains(path.as_str()) {
                continue;
            }
            match entry.kind {
                EntryKind::Directory => {
                    if !self.walk(&path) {
                        return false;
                    }
                }
                EntryKind::File if entry.name.ends_with(".rs") => {
                    if !self.note_rust_file(path) {
                        return false;
                    }
                }
                EntryKind::File | EntryKind::Symlink | EntryKind::Other => {}
            }
        }
        true
    }
}

/// The Rust files of the package at `package_root`, at most `limit`. `excluded_roots` are the
/// folders of other packages that lie below this one.
pub fn discover_rust_files(
    files: &RepositoryFiles<'_>,
    package_root: &str,
    excluded_roots: &[String],
    limit: usize,
) -> RustSourceInventory {
    let mut walk = Walk {
        files,
        excluded: excluded_roots.iter().map(String::as_str).collect(),
        limit,
        inventory: RustSourceInventory {
            limited: limit == 0,
            ..RustSourceInventory::default()
        },
    };
    for entry in files.listing(package_root) {
        if walk.inventory.limited {
            break;
        }
        if !TARGET_NAMES.contains(&entry.name.as_str()) {
            continue;
        }
        let path = join(package_root, &entry.name);
        match entry.kind {
            EntryKind::Directory => {
                walk.walk(&path);
            }
            EntryKind::File if entry.name.ends_with(".rs") => {
                walk.note_rust_file(path);
            }
            EntryKind::File | EntryKind::Symlink | EntryKind::Other => {}
        }
    }
    walk.inventory
}
