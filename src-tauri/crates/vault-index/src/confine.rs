//! Which files the index may read, decided here rather than trusted from the caller's listing: a
//! `.md` file under the canonical root, reached through real folders only, with no component that
//! is empty, `.`, `..` or starts with a dot. Symlinks are never followed, so a link cannot bring a
//! file from outside the vault, and dotfiles (where credentials such as `.env` live) are never
//! read; credential files are not `.md` files either.

use crate::stamps::Stamp;
use std::collections::HashMap;
use std::fs::{File, Metadata};
use std::path::{Path, PathBuf};

/// Whether a listed path can name an indexable file at all.
pub(crate) fn admits_name(relative: &str) -> bool {
    relative.ends_with(".md")
        && !relative.contains('\\')
        && relative.split('/').all(|part| {
            !part.is_empty() && !part.starts_with('.') && !part.contains(':') && part != ".."
        })
}

fn is_real_folder(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .is_ok_and(|meta| meta.is_dir() && !meta.file_type().is_symlink())
}

fn regular_file(path: &Path) -> Option<Metadata> {
    std::fs::symlink_metadata(path)
        .ok()
        .filter(|meta| meta.is_file() && !meta.file_type().is_symlink())
}

/// Remembers which folders were reached without a symlink, so a stamp pass checks each folder once.
pub(crate) struct Folders<'a> {
    root: &'a Path,
    checked: HashMap<String, bool>,
}

impl<'a> Folders<'a> {
    pub(crate) fn new(root: &'a Path) -> Folders<'a> {
        Folders {
            root,
            checked: HashMap::new(),
        }
    }

    fn folders_are_real(&mut self, relative: &str) -> bool {
        let mut end = 0;
        while let Some(slash) = relative[end..].find('/') {
            end += slash;
            let folder = &relative[..end];
            let real = match self.checked.get(folder) {
                Some(&real) => real,
                None => {
                    let real = is_real_folder(&self.root.join(folder));
                    self.checked.insert(folder.to_string(), real);
                    real
                }
            };
            if !real {
                return false;
            }
            end += 1;
        }
        true
    }

    /// The file's stamp, or `None` when it is gone or not admitted.
    pub(crate) fn stamp(&mut self, relative: &str) -> Option<Stamp> {
        if !admits_name(relative) || !self.folders_are_real(relative) {
            return None;
        }
        Stamp::of_regular_file(&self.root.join(relative))
    }
}

/// The admitted file's path, once its real path is confirmed inside the root.
pub(crate) fn resolve(root: &Path, relative: &str) -> Option<PathBuf> {
    if !admits_name(relative) || !Folders::new(root).folders_are_real(relative) {
        return None;
    }
    let path = root.join(relative);
    regular_file(&path)?;
    let real = std::fs::canonicalize(&path).ok()?;
    real.starts_with(root).then_some(path)
}

/// Opens an admitted file. The opened file must be the one `resolve` checked: a swap to a link
/// between the check and the open is refused.
pub(crate) fn open(root: &Path, relative: &str) -> Option<(File, Metadata)> {
    let path = resolve(root, relative)?;
    let checked = regular_file(&path)?;
    let file = File::open(&path).ok()?;
    let opened = file.metadata().ok()?;
    same_file(&checked, &opened).then_some((file, opened))
}

#[cfg(unix)]
fn same_file(checked: &Metadata, opened: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    opened.is_file() && checked.dev() == opened.dev() && checked.ino() == opened.ino()
}

#[cfg(not(unix))]
fn same_file(_checked: &Metadata, opened: &Metadata) -> bool {
    opened.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_markdown_names_inside_the_root_are_admitted() {
        for admitted in ["a.md", "wiki/deep/page.md", "한글 문서.md"] {
            assert!(admits_name(admitted), "{admitted}");
        }
        for refused in [
            "../outside/secret.md",
            "wiki/../../secret.md",
            "/etc/secret.md",
            "C:/secret.md",
            r"wiki\page.md",
            ".env",
            ".secrets/notes.md",
            "wiki/.hidden.md",
            "notes.txt",
            "id_rsa",
            "wiki//page.md",
            "./page.md",
        ] {
            assert!(!admits_name(refused), "{refused}");
        }
    }
}
