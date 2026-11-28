//! The path questions one scan asks, each put to the disk at most once.
//!
//! A resolver tries several candidates per specifier (`a.ts`, `a.tsx`, `a/index.ts`...). A path
//! whose parent is not a folder is absent without a probe, and every answer is remembered, so a
//! scan costs one disk call per distinct path whose parent exists however often a module is
//! imported (a census is asked every path, so its record of what a scan looked at is complete).
//! A path the root refuses to show (credential-named, `.git`, outside, through a link
//! that leaves) is absent: a scan never learns that it exists. Whether a file exists is the one
//! question asked through hidden folders (`.generated`), so an import into one is placed.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use confined_files::{EntryKind, SourceFiles};

pub struct PathFacts<'files> {
    files: &'files dyn SourceFiles,
    through_links: RefCell<HashMap<PathBuf, Option<EntryKind>>>,
    as_written: RefCell<HashMap<PathBuf, Option<EntryKind>>>,
    regular_files: RefCell<HashMap<PathBuf, bool>>,
}

impl<'files> PathFacts<'files> {
    pub fn new(files: &'files dyn SourceFiles) -> Self {
        Self {
            files,
            through_links: RefCell::default(),
            as_written: RefCell::default(),
            regular_files: RefCell::default(),
        }
    }

    pub fn root(&self) -> &Path {
        self.files.root()
    }

    pub fn files(&self) -> &'files dyn SourceFiles {
        self.files
    }

    /// What `path` is, following links; `None` when nothing is there or the root will not say.
    pub fn kind(&self, path: &Path) -> Option<EntryKind> {
        if let Some(known) = self.through_links.borrow().get(path) {
            return *known;
        }
        let answer = if self.parent_is_not_a_folder(path) {
            None
        } else {
            self.files.kind(path).ok().flatten()
        };
        self.through_links
            .borrow_mut()
            .insert(path.to_path_buf(), answer);
        answer
    }

    /// What `path` itself is: a link is a link.
    pub fn link_kind(&self, path: &Path) -> Option<EntryKind> {
        if let Some(known) = self.as_written.borrow().get(path) {
            return *known;
        }
        let answer = if self.parent_is_not_a_folder(path) {
            None
        } else {
            self.files.link_kind(path).ok().flatten()
        };
        self.as_written
            .borrow_mut()
            .insert(path.to_path_buf(), answer);
        answer
    }

    /// A regular file, through links that stay inside the root, also below a hidden folder.
    pub fn is_file(&self, path: &Path) -> bool {
        if let Some(known) = self.regular_files.borrow().get(path) {
            return *known;
        }
        let answer = self.files.regular_file_exists(path).unwrap_or(false);
        self.regular_files
            .borrow_mut()
            .insert(path.to_path_buf(), answer);
        answer
    }

    pub fn is_directory(&self, path: &Path) -> bool {
        self.kind(path) == Some(EntryKind::Directory)
    }

    /// A regular file that is not a link, in a folder that really is inside the root.
    pub fn is_own_file(&self, path: &Path) -> bool {
        self.link_kind(path) == Some(EntryKind::File)
    }

    /// A folder that is not a link.
    pub fn is_own_directory(&self, path: &Path) -> bool {
        self.link_kind(path) == Some(EntryKind::Directory)
    }

    fn parent_is_not_a_folder(&self, path: &Path) -> bool {
        if self.files.answers_from_census() {
            return false;
        }
        match path.parent() {
            Some(parent) if parent.starts_with(self.root()) && parent != self.root() => {
                !self.is_directory(parent)
            }
            _ => false,
        }
    }

    /// `path` below the root as a `/`-separated name, or `None` when it is not below it.
    pub fn relative(&self, path: &Path) -> Option<String> {
        relative_slash(self.root(), path)
    }
}

/// `path` below `root` as a `/`-separated name (`.` for the root itself).
pub fn relative_slash(root: &Path, path: &Path) -> Option<String> {
    let below = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = below
        .components()
        .filter_map(|component| match component {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    Some(if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    })
}

/// `name` joined onto `base` as Node's `path.join` joins it: a leading `/` does not leave `base`.
pub fn join_below(base: &Path, name: &str) -> PathBuf {
    resolve_below(base, &format!("./{name}"))
}

/// `name` (a `/`-separated path below `base`, possibly with `..`) as the absolute path Node's
/// `path.resolve(base, name)` gives.
pub fn resolve_below(base: &Path, name: &str) -> PathBuf {
    confined_files::confined_root::resolve_path(base, Path::new(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_below_the_root_is_written_with_slashes_and_the_root_itself_is_a_dot() {
        let root = Path::new("/repo");
        assert_eq!(
            relative_slash(root, Path::new("/repo/src/a.ts")).as_deref(),
            Some("src/a.ts")
        );
        assert_eq!(relative_slash(root, root).as_deref(), Some("."));
        assert_eq!(relative_slash(root, Path::new("/elsewhere/a.ts")), None);
    }
}
