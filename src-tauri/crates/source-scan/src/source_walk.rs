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

    #[cfg(test)]
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

/// Folders deeper than this below a walk's start are not entered. Every file system ends a path
/// before this many folders (a path of one-letter folders is two bytes a level, and no system
/// takes one of 8 KiB), so on a real tree the limit never binds; it only bounds a walk a hostile
/// file system could keep extending.
pub const WALK_MAX_DEPTH: usize = 4096;

/// What a walk is asked to stay within.
#[derive(Debug, Clone, Copy)]
pub struct WalkLimits {
    /// The deepest folder that is listed, counted in folders below the start (the start is 0).
    /// A folder one level deeper is still shown to the visitor, but its names are not read.
    pub deepest_folder: usize,
    /// The names the walk looks at before it stops, hidden and ignored ones included.
    pub max_entries: usize,
}

impl WalkLimits {
    /// Every folder a path can hold, and no limit on the names.
    pub const UNBOUNDED_NAMES: Self = Self {
        deepest_folder: WALK_MAX_DEPTH,
        max_entries: usize::MAX,
    };
}

/// One name in a folder the walk listed.
pub struct Entry<'a> {
    pub path: &'a Path,
    pub name: &'a str,
    pub kind: EntryKind,
    /// How many folders lie between the walk's start and the folder that holds this name.
    pub depth: usize,
}

/// What a visitor wants the walk to do next.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Stop,
}

struct Pending {
    path: PathBuf,
    name: String,
    kind: EntryKind,
    depth: usize,
}

/// Walks the folders below `start` in name order, with a folder's names where its own name falls:
/// each file and folder `admit` accepts is shown to `visit` (a folder before what it holds), and
/// a folder is entered when it is within `limits`. A stack stands in for recursion, so a tree
/// thousands of folders deep costs the same stack as a flat one. Links and other kinds of entry
/// are counted against the limit but never shown.
pub fn walk_sorted(
    files: &dyn SourceFiles,
    start: &Path,
    limits: WalkLimits,
    admit: &dyn Fn(&Entry<'_>) -> bool,
    visit: &mut dyn FnMut(&Entry<'_>) -> Flow,
) {
    let mut stack: Vec<Pending> = Vec::new();
    push_listing(files, start, 0, &mut stack);
    let mut looked_at = 0usize;
    while let Some(pending) = stack.pop() {
        looked_at += 1;
        if looked_at > limits.max_entries {
            return;
        }
        let entry = Entry {
            path: &pending.path,
            name: &pending.name,
            kind: pending.kind,
            depth: pending.depth,
        };
        if !matches!(entry.kind, EntryKind::File | EntryKind::Directory) || !admit(&entry) {
            continue;
        }
        if visit(&entry) == Flow::Stop {
            return;
        }
        if entry.kind == EntryKind::Directory && pending.depth < limits.deepest_folder {
            push_listing(files, &pending.path, pending.depth + 1, &mut stack);
        }
    }
}

/// The names of `folder` onto the stack, so that the first in name order is taken first.
fn push_listing(files: &dyn SourceFiles, folder: &Path, depth: usize, stack: &mut Vec<Pending>) {
    let listed = list_sorted(files, folder);
    stack.extend(listed.into_iter().rev().map(|(name, kind)| Pending {
        path: folder.join(&name),
        name,
        kind,
        depth,
    }));
}

/// The files below `directory` whose extension passes `wanted`, in name order with a folder's
/// files where its name falls, at most `max_files` in `found` altogether. Hidden names and the
/// ignored ones are skipped.
pub fn list_source_files(
    files: &dyn SourceFiles,
    directory: &Path,
    ignore: &IgnoredNames,
    max_files: usize,
    wanted: &dyn Fn(&str) -> bool,
    found: &mut Vec<PathBuf>,
) {
    let admit = |entry: &Entry<'_>| {
        !ignore.has(entry.name)
            && !entry.name.starts_with('.')
            && match entry.kind {
                EntryKind::File => extension_of(entry.name).is_some_and(wanted),
                _ => true,
            }
    };
    walk_sorted(
        files,
        directory,
        WalkLimits::UNBOUNDED_NAMES,
        &admit,
        &mut |entry| {
            if found.len() >= max_files {
                return Flow::Stop;
            }
            if entry.kind == EntryKind::File {
                found.push(entry.path.to_path_buf());
                if found.len() >= max_files {
                    return Flow::Stop;
                }
            }
            Flow::Continue
        },
    );
}
