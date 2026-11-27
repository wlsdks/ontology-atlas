//! Which files of a repository an import scan reads, and in what order.
//!
//! The walk lists a folder's names in UTF-16 order (the order the JavaScript server listed them
//! in), skips hidden names, links and the names in the ignore set, and stops at `max_files`, so
//! a monorepo cannot make a scan unbounded and a cap always keeps the same files.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use confined_files::{EntryKind, SourceFiles};

use crate::source_language::extension_of;

/// Folders that hold what a build made or a tool cached, never what a person wrote.
pub const DEFAULT_IGNORE: [&str; 10] = [
    "node_modules",
    ".git",
    "out",
    "dist",
    "build",
    ".next",
    ".expo",
    ".turbo",
    ".cache",
    "coverage",
];

/// Extensions whose files yield module edges (grouped into modules and reconciled with a vault).
pub const MODULE_EXTENSIONS: [&str; 9] = [
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".py",
];
pub const RUST_EXTENSION: &str = ".rs";
/// Java and Kotlin yield file edges only.
pub const JVM_EXTENSIONS: [&str; 2] = [".java", ".kt"];
pub const GO_EXTENSION: &str = ".go";

/// Whether a file with this extension is a module of a module graph: the scripts, Python and Rust.
pub fn is_module_extension(extension: &str) -> bool {
    MODULE_EXTENSIONS.contains(&extension) || extension == RUST_EXTENSION
}

/// Whether the import scan reads a file with this extension itself (Go is read by package).
pub fn is_scanned_extension(extension: &str) -> bool {
    is_module_extension(extension) || JVM_EXTENSIONS.contains(&extension)
}

/// The names a scan skips: the defaults and what the caller added.
#[derive(Debug, Clone)]
pub struct IgnoredNames(BTreeSet<String>);

impl IgnoredNames {
    pub fn with_defaults(added: &[String]) -> Self {
        Self(
            DEFAULT_IGNORE
                .iter()
                .map(|name| (*name).to_string())
                .chain(added.iter().cloned())
                .collect(),
        )
    }

    pub fn defaults() -> Self {
        Self::with_defaults(&[])
    }

    pub fn has(&self, name: &str) -> bool {
        self.0.contains(name)
    }

    /// Whether any part of a `/`- or `\`-separated path is an ignored name.
    pub fn hides(&self, path: &str) -> bool {
        path.split(['/', '\\']).any(|segment| self.has(segment))
    }
}

/// The names in `directory` in UTF-16 order, with what each is; empty when it cannot be listed.
pub fn list_sorted(files: &dyn SourceFiles, directory: &Path) -> Vec<(String, EntryKind)> {
    let mut entries: Vec<(String, EntryKind)> = files
        .list_directory(directory)
        .unwrap_or_default()
        .into_iter()
        .map(|entry| (entry.name, entry.kind))
        .collect();
    entries.sort_by(|left, right| answer_format::utf16::compare(&left.0, &right.0));
    entries
}

/// The files below `directory` whose extension passes `wanted`, folders before the next name's
/// files in name order, at most `max_files` in `found` altogether.
pub fn walk(
    files: &dyn SourceFiles,
    directory: &Path,
    ignore: &IgnoredNames,
    max_files: usize,
    wanted: &dyn Fn(&str) -> bool,
    found: &mut Vec<PathBuf>,
) {
    if found.len() >= max_files {
        return;
    }
    for (name, kind) in list_sorted(files, directory) {
        if ignore.has(&name) || name.starts_with('.') {
            continue;
        }
        let path = directory.join(&name);
        match kind {
            EntryKind::Directory => {
                walk(files, &path, ignore, max_files, wanted, found);
                if found.len() >= max_files {
                    return;
                }
            }
            EntryKind::File => {
                if extension_of(&name).is_some_and(wanted) {
                    found.push(path);
                    if found.len() >= max_files {
                        return;
                    }
                }
            }
            EntryKind::Symlink | EntryKind::Other => {}
        }
    }
}

/// The source files of a repository the way a reconciliation reads them: module files only,
/// under the default ignore set, at most `max_files`.
pub fn list_source_files(files: &dyn SourceFiles, max_files: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    walk(
        files,
        files.root(),
        &IgnoredNames::defaults(),
        max_files,
        &is_module_extension,
        &mut found,
    );
    found
}
