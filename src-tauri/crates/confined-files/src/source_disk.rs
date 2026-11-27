//! A source tree read from the disk, with the confinement the snapshot gives by construction: a
//! path must be below the root, not hidden and not named like a credential, a link is never
//! followed, and what a path really is must lie inside the root's real folder.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::private_names::{is_credential_name, is_hidden_name};
use crate::real_paths::{is_within, real_path};
use crate::scan_root::SourceRoot;
use crate::source_access::{address, DirectoryEntry, EntryKind, SourceFiles, SourceReadError};
use crate::source_snapshot::MAX_FILE_TEXT_BYTES;

/// A file larger than this is never re-read as evidence: it stays moved.
pub const MAX_EVIDENCE_TEXT_BYTES: usize = 1024 * 1024;
/// Bytes one call reads at most as evidence, committed and working sides together.
pub const MAX_EVIDENCE_READ_BYTES: usize = 32 * 1024 * 1024;
/// Git's own binary test: a NUL byte in the first 8000 bytes.
const BINARY_PROBE_BYTES: usize = 8000;

/// What is left of the bytes one call may read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReadBudget {
    pub left: usize,
}

impl ReadBudget {
    pub fn evidence() -> Self {
        Self {
            left: MAX_EVIDENCE_READ_BYTES,
        }
    }
}

/// `bytes` as evidence text, or `None` when they are empty, over [`MAX_EVIDENCE_TEXT_BYTES`],
/// binary (a NUL byte among the first 8000) or not UTF-8. A leading byte-order mark is dropped,
/// as `TextDecoder` drops it.
pub fn evidence_text(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() || bytes.len() > MAX_EVIDENCE_TEXT_BYTES {
        return None;
    }
    if bytes.iter().take(BINARY_PROBE_BYTES).any(|byte| *byte == 0) {
        return None;
    }
    let text = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    std::str::from_utf8(text).ok().map(str::to_string)
}

/// The disk below one [`SourceRoot`].
pub struct DiskSource {
    root: PathBuf,
    real_root: Option<PathBuf>,
    excluded: Vec<String>,
    max_file_bytes: usize,
    kinds: Mutex<HashMap<(PathBuf, bool), Option<EntryKind>>>,
}

fn kind_of(file_type: std::fs::FileType) -> EntryKind {
    if file_type.is_symlink() {
        EntryKind::Symlink
    } else if file_type.is_dir() {
        EntryKind::Directory
    } else if file_type.is_file() {
        EntryKind::File
    } else {
        EntryKind::Other
    }
}

impl DiskSource {
    pub fn new(root: &SourceRoot) -> Self {
        Self {
            root: root.as_path().to_path_buf(),
            real_root: real_path(root.as_path()).ok(),
            excluded: Vec::new(),
            max_file_bytes: MAX_FILE_TEXT_BYTES,
            kinds: Mutex::new(HashMap::new()),
        }
    }

    /// Names (as `/`-separated paths below the root) a read refuses, with everything below them.
    #[must_use]
    pub fn excluding(mut self, excluded: Vec<String>) -> Self {
        self.excluded = excluded;
        self
    }

    /// The most bytes a read returns; a larger file is refused, not cut.
    #[must_use]
    pub fn with_max_file_bytes(mut self, max_file_bytes: usize) -> Self {
        self.max_file_bytes = max_file_bytes;
        self
    }

    /// `path` made absolute and checked by name, and every folder between the root and it must be
    /// a real folder: a path under a link is under whatever the link points at.
    fn address(&self, path: &Path) -> Result<PathBuf, SourceReadError> {
        let name = address(&self.root, &self.excluded, path)?;
        let checked = crate::source_access::absolute(&self.root, &name);
        for ancestor in checked.ancestors().skip(1) {
            if ancestor == self.root.as_path() || !ancestor.starts_with(&self.root) {
                break;
            }
            match self.probe(ancestor, false) {
                Some(EntryKind::Directory) => {}
                Some(EntryKind::Symlink) => {
                    return Err(SourceReadError::Refused("symlink".to_string()))
                }
                _ => {}
            }
        }
        Ok(checked)
    }

    fn really_inside(&self, path: &Path) -> bool {
        let Some(real_root) = &self.real_root else {
            return false;
        };
        real_path(path).is_ok_and(|real| is_within(real_root, &real))
    }

    fn probe(&self, path: &Path, through_links: bool) -> Option<EntryKind> {
        let key = (path.to_path_buf(), through_links);
        if let Some(known) = self
            .kinds
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(&key)
        {
            return *known;
        }
        // A path under a parent that is not a directory is absent without a probe of its own.
        let parent_is_directory = path
            .parent()
            .filter(|parent| parent.starts_with(&self.root) && *parent != self.root.as_path())
            .is_none_or(|parent| self.probe(parent, false) == Some(EntryKind::Directory));
        let kind = parent_is_directory
            .then(|| {
                let metadata = if through_links {
                    std::fs::metadata(path)
                } else {
                    std::fs::symlink_metadata(path)
                };
                metadata.ok().map(|found| kind_of(found.file_type()))
            })
            .flatten();
        self.kinds
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(key, kind);
        kind
    }

    /// A regular file, not a link, whose real location is inside the root.
    pub fn is_own_file(&self, path: &Path) -> bool {
        self.address(path).is_ok_and(|checked| {
            self.probe(&checked, false) == Some(EntryKind::File) && self.really_inside(&checked)
        })
    }

    /// The working-tree file as evidence text, only when it is a regular file inside the root, its
    /// path is not hidden or credential-named (also as it really resolves), and it fits what is
    /// left of `budget`. At most one byte past [`MAX_EVIDENCE_TEXT_BYTES`] is read, however large
    /// the file has grown. `None` for anything else.
    pub fn read_evidence_text(&self, path: &Path, budget: &mut ReadBudget) -> Option<String> {
        let checked = self.address(path).ok()?;
        let real = real_path(&checked).ok()?;
        let real_root = self.real_root.as_ref()?;
        if !is_within(real_root, &real) {
            return None;
        }
        let below = real.strip_prefix(real_root).ok()?;
        if below.as_os_str().is_empty()
            || below.components().any(|part| {
                let name = part.as_os_str().to_string_lossy();
                is_hidden_name(&name) || is_credential_name(&name)
            })
        {
            return None;
        }
        let file = std::fs::File::open(&real).ok()?;
        let metadata = file.metadata().ok()?;
        let size = usize::try_from(metadata.len()).ok()?;
        if !metadata.is_file() || size > MAX_EVIDENCE_TEXT_BYTES || size > budget.left {
            return None;
        }
        let mut bytes = Vec::with_capacity(size.min(MAX_EVIDENCE_TEXT_BYTES));
        file.take(
            u64::try_from(MAX_EVIDENCE_TEXT_BYTES)
                .ok()?
                .saturating_add(1),
        )
        .read_to_end(&mut bytes)
        .ok()?;
        if bytes.len() > budget.left {
            return None;
        }
        budget.left -= bytes.len();
        evidence_text(&bytes)
    }
}

impl SourceFiles for DiskSource {
    fn root(&self) -> &Path {
        &self.root
    }

    fn kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError> {
        let checked = self.address(path)?;
        match self.probe(&checked, false) {
            Some(EntryKind::Symlink) => Err(SourceReadError::Refused("symlink".to_string())),
            other => Ok(other),
        }
    }

    fn link_kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError> {
        let checked = self.address(path)?;
        Ok(self.probe(&checked, false))
    }

    fn read_text(&self, path: &Path) -> Result<String, SourceReadError> {
        let checked = self.address(path)?;
        match self.probe(&checked, false) {
            None => return Err(SourceReadError::Absent),
            Some(EntryKind::Symlink) => {
                return Err(SourceReadError::Refused("symlink".to_string()))
            }
            Some(EntryKind::File) => {}
            Some(_) => {
                return Err(SourceReadError::Refused(
                    "file bytes unavailable".to_string(),
                ))
            }
        }
        if !self.really_inside(&checked) {
            return Err(SourceReadError::Refused(
                "outside approved root".to_string(),
            ));
        }
        let file = std::fs::File::open(&checked).map_err(|_| SourceReadError::Absent)?;
        let mut bytes = Vec::new();
        let limit = u64::try_from(self.max_file_bytes).unwrap_or(u64::MAX);
        file.take(limit.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|_| SourceReadError::Absent)?;
        if bytes.len() > self.max_file_bytes {
            return Err(SourceReadError::Refused(
                "file over the size limit".to_string(),
            ));
        }
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }

    fn list_directory(&self, path: &Path) -> Result<Vec<DirectoryEntry>, SourceReadError> {
        let checked = self.address(path)?;
        match self.probe(&checked, false) {
            None => return Err(SourceReadError::Absent),
            Some(EntryKind::Symlink) => {
                return Err(SourceReadError::Refused("symlink".to_string()))
            }
            Some(EntryKind::Directory) => {}
            Some(_) => {
                return Err(SourceReadError::Refused(
                    "directory unavailable".to_string(),
                ))
            }
        }
        if !self.really_inside(&checked) {
            return Err(SourceReadError::Refused(
                "outside approved root".to_string(),
            ));
        }
        let listing = std::fs::read_dir(&checked).map_err(|_| SourceReadError::Absent)?;
        let mut entries: Vec<DirectoryEntry> = listing
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                if is_hidden_name(&name) || is_credential_name(&name) {
                    return None;
                }
                let kind = entry.file_type().ok().map(kind_of)?;
                Some(DirectoryEntry { name, kind })
            })
            .collect();
        entries.sort_by(|left, right| left.name.as_bytes().cmp(right.name.as_bytes()));
        Ok(entries)
    }
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;
    use crate::scan_root::ScanRoots;
    use std::os::unix::fs::symlink;

    struct Tree {
        _directory: tempfile::TempDir,
        root: PathBuf,
        outside: PathBuf,
        source: DiskSource,
    }

    fn tree() -> Tree {
        let directory = tempfile::tempdir().expect("temp dir");
        let base = real_path(directory.path()).expect("real");
        let root = base.join("repo");
        let outside = base.join("outside");
        std::fs::create_dir_all(root.join("src")).expect("src");
        std::fs::create_dir_all(&outside).expect("outside");
        std::fs::write(root.join("src/a.ts"), "import './b';").expect("a");
        std::fs::write(outside.join("sentinel.ts"), "outside sentinel").expect("sentinel");
        let scan = ScanRoots::new(root.clone(), root.clone());
        let source = DiskSource::new(&scan.allow(&root, "rootPath").expect("allowed"));
        Tree {
            _directory: directory,
            root,
            outside,
            source,
        }
    }

    fn refusal(result: Result<impl std::fmt::Debug, SourceReadError>) -> String {
        match result {
            Err(SourceReadError::Refused(reason)) => reason,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_regular_file_below_the_root_is_read_and_a_missing_one_is_absent() {
        let tree = tree();
        assert_eq!(
            tree.source
                .read_text(&tree.root.join("src/a.ts"))
                .as_deref(),
            Ok("import './b';")
        );
        assert_eq!(
            tree.source.read_text(&tree.root.join("src/none.ts")),
            Err(SourceReadError::Absent)
        );
        assert_eq!(
            tree.source.kind(&tree.root.join("src/none/deeper.ts")),
            Ok(None)
        );
        assert_eq!(
            tree.source.kind(&tree.root.join("src")),
            Ok(Some(EntryKind::Directory))
        );
    }

    #[test]
    fn a_folder_link_out_of_the_root_cannot_be_listed_read_or_probed() {
        let tree = tree();
        symlink(&tree.outside, tree.root.join("linked")).expect("link");
        assert_eq!(
            refusal(tree.source.list_directory(&tree.root.join("linked"))),
            "symlink"
        );
        assert_eq!(
            refusal(tree.source.read_text(&tree.root.join("linked/sentinel.ts"))),
            "symlink"
        );
        assert_eq!(
            refusal(tree.source.kind(&tree.root.join("linked"))),
            "symlink"
        );
        // The link itself is visible as a link, so a scan can skip it without a read.
        assert_eq!(
            tree.source.link_kind(&tree.root.join("linked")),
            Ok(Some(EntryKind::Symlink))
        );
    }

    #[test]
    fn a_file_link_to_the_outside_and_a_file_under_a_linked_folder_are_refused() {
        let tree = tree();
        symlink(
            tree.outside.join("sentinel.ts"),
            tree.root.join("src/leak.ts"),
        )
        .expect("link");
        assert_eq!(
            refusal(tree.source.read_text(&tree.root.join("src/leak.ts"))),
            "symlink"
        );
        assert!(!tree.source.is_own_file(&tree.root.join("src/leak.ts")));
        assert!(tree.source.is_own_file(&tree.root.join("src/a.ts")));
        // A folder link that stays inside the root still makes its files not "own" paths.
        symlink(tree.root.join("src"), tree.root.join("alias")).expect("link");
        assert_eq!(
            refusal(tree.source.read_text(&tree.root.join("alias/a.ts"))),
            "symlink"
        );
    }

    #[test]
    fn hidden_credential_climbing_and_absolute_paths_are_refused_before_the_disk() {
        let tree = tree();
        std::fs::write(tree.root.join(".env"), "TOKEN=1").expect("env");
        std::fs::write(tree.root.join("id_rsa"), "key").expect("key");
        for (path, reason) in [
            (tree.root.join(".env"), "private or hidden path"),
            (tree.root.join("id_rsa"), "private or hidden path"),
            (
                tree.root.join("../outside/sentinel.ts"),
                "outside approved root",
            ),
            (tree.outside.join("sentinel.ts"), "outside approved root"),
            (PathBuf::from("/etc/passwd"), "outside approved root"),
        ] {
            assert_eq!(
                refusal(tree.source.read_text(&path)),
                reason,
                "{}",
                path.display()
            );
        }
    }

    #[test]
    fn a_listing_leaves_out_hidden_and_credential_names_and_is_in_byte_order() {
        let tree = tree();
        std::fs::write(tree.root.join(".env"), "x").expect("env");
        std::fs::write(tree.root.join("server.pem"), "x").expect("pem");
        std::fs::write(tree.root.join("alpha.ts"), "x").expect("alpha");
        std::fs::write(tree.root.join("Zeta.ts"), "x").expect("Zeta");
        let names: Vec<String> = tree
            .source
            .list_directory(&tree.root)
            .expect("list")
            .into_iter()
            .map(|entry| entry.name)
            .collect();
        assert_eq!(names, ["Zeta.ts", "alpha.ts", "src"]);
    }

    #[test]
    fn a_file_over_the_limit_is_refused_not_cut() {
        let tree = tree();
        let source = DiskSource::new(
            &ScanRoots::new(tree.root.clone(), tree.root.clone())
                .allow(&tree.root, "rootPath")
                .expect("allowed"),
        )
        .with_max_file_bytes(8);
        assert_eq!(
            refusal(source.read_text(&tree.root.join("src/a.ts"))),
            "file over the size limit"
        );
    }

    #[test]
    fn evidence_is_read_only_from_a_visible_regular_file_inside_the_root_within_the_budget() {
        let tree = tree();
        std::fs::write(tree.root.join(".env"), "TOKEN=1").expect("env");
        symlink(
            tree.outside.join("sentinel.ts"),
            tree.root.join("src/leak.ts"),
        )
        .expect("link");
        let mut budget = ReadBudget::evidence();
        assert_eq!(
            tree.source
                .read_evidence_text(&tree.root.join("src/a.ts"), &mut budget)
                .as_deref(),
            Some("import './b';")
        );
        assert_eq!(budget.left, MAX_EVIDENCE_READ_BYTES - "import './b';".len());
        for path in [
            tree.root.join(".env"),
            tree.root.join("src/leak.ts"),
            tree.root.join("src"),
            tree.root.join("src/none.ts"),
            tree.outside.join("sentinel.ts"),
        ] {
            assert_eq!(
                tree.source.read_evidence_text(&path, &mut budget),
                None,
                "{}",
                path.display()
            );
        }
        let mut empty = ReadBudget { left: 4 };
        assert_eq!(
            tree.source
                .read_evidence_text(&tree.root.join("src/a.ts"), &mut empty),
            None
        );
    }

    #[test]
    fn evidence_text_refuses_empty_oversized_binary_and_invalid_bytes() {
        assert_eq!(evidence_text(b""), None);
        assert_eq!(evidence_text(b"a\0b"), None);
        assert_eq!(evidence_text(&[0xff, 0xfe, 0x41]), None);
        assert_eq!(
            evidence_text(&vec![b'a'; MAX_EVIDENCE_TEXT_BYTES + 1]),
            None
        );
        assert_eq!(
            evidence_text(&vec![b'a'; MAX_EVIDENCE_TEXT_BYTES]).map(|t| t.len()),
            Some(MAX_EVIDENCE_TEXT_BYTES)
        );
        assert_eq!(
            evidence_text(b"\xEF\xBB\xBFhello").as_deref(),
            Some("hello")
        );
        // A NUL after the first 8000 bytes is not git's binary signal.
        let mut late = vec![b'a'; BINARY_PROBE_BYTES];
        late.push(0);
        assert!(evidence_text(&late).is_some());
    }
}
