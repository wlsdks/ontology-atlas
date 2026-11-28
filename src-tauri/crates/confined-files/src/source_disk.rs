//! A source tree read from the disk, under the rules the snapshot gives by construction. The
//! boundary's rules, each checked before any byte is read:
//!
//! - a path is resolved against the root when it is relative, and must end up inside the root;
//! - a path with a hidden part (a leading dot) or a part named like a credential is refused, both
//!   as written and as it really resolves, so a link cannot reach `.git` or a key file;
//! - a link is followed only where its real location is inside the root's real folder, so a
//!   folder link to somewhere else in the repository works and one that leaves it is refused;
//! - a file larger than the caller's limit is refused, never cut, so a half-read file cannot
//!   look like a complete one.

use std::io::Read;
use std::path::{Path, PathBuf};

use crate::os_error::OsErrorCode;
use crate::private_names::{is_credential_name, is_hidden_name};
use crate::real_paths::{is_within, real_path, segments_below};
use crate::resolved_places::{NearestPlace, Resolution, ResolvedPlaces};
use crate::scan_root::SourceRoot;
use crate::source_access::{
    absolute, address, address_seeing_hidden, is_never_shown, DirectoryEntry, DirectoryListing,
    EntryKind, Refusal, SourceFiles, SourceReadError,
};

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

/// `bytes` as evidence text, or `None` when they are over [`MAX_EVIDENCE_TEXT_BYTES`], binary (a
/// NUL byte among the first 8000) or not UTF-8. An empty file is the empty text. A leading
/// byte-order mark is dropped, as `TextDecoder` drops it.
pub fn evidence_text(bytes: &[u8]) -> Option<String> {
    if bytes.len() > MAX_EVIDENCE_TEXT_BYTES {
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
    real_root: RealRoot,
    excluded: Vec<String>,
    max_file_bytes: usize,
    places: ResolvedPlaces,
}

/// Whether the root folder is there, is not, or could not be told: a root that is not there
/// holds nothing, and one the system would not answer for is refused, never read as empty.
enum RealRoot {
    Folder(PathBuf),
    NotThere,
    Unreadable,
}

/// Whether a failure to resolve a path says nothing is there, which is not a failure to look.
fn says_nothing_is_there(error: &std::io::Error) -> bool {
    matches!(
        OsErrorCode::of(error),
        OsErrorCode::NotFound | OsErrorCode::NotADirectory | OsErrorCode::TooManyLinks
    )
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
    /// `max_file_bytes` is the most one read returns; a larger file is refused. The caller
    /// states it because only the caller knows what a file it must understand may weigh.
    pub fn new(root: &SourceRoot, max_file_bytes: usize) -> Self {
        Self {
            root: root.as_path().to_path_buf(),
            real_root: match real_path(root.as_path()) {
                Ok(real) => RealRoot::Folder(real),
                Err(error) if says_nothing_is_there(&error) => RealRoot::NotThere,
                Err(_) => RealRoot::Unreadable,
            },
            excluded: Vec::new(),
            max_file_bytes,
            places: ResolvedPlaces::default(),
        }
    }

    /// Names (as `/`-separated paths below the root) a read refuses, with everything below them.
    #[must_use]
    pub fn excluding(mut self, excluded: Vec<String>) -> Self {
        self.excluded = excluded;
        self
    }

    /// `path` checked by name and made absolute below the root.
    fn address(&self, path: &Path) -> Result<PathBuf, Refusal> {
        let name = address(&self.root, &self.excluded, path)?;
        Ok(absolute(&self.root, &name))
    }

    /// Where a path really is, or `None` when nothing is there: refused unless that is inside the
    /// root's real folder and has no hidden or credential-named part below it. A path that is not
    /// there yet is judged by its nearest existing folder. With `follow` false the path itself
    /// may be a link that leads anywhere (it is only looked at, never opened), so its folder is
    /// judged.
    fn confine(&self, checked: &Path, follow: bool) -> Result<Option<PathBuf>, Refusal> {
        self.confine_showing(checked, follow, false)
    }

    /// [`Self::confine`], with hidden parts allowed when `sees_hidden`: credential names and
    /// `.git` stay refused, also as the path really resolves.
    fn confine_showing(
        &self,
        checked: &Path,
        follow: bool,
        sees_hidden: bool,
    ) -> Result<Option<PathBuf>, Refusal> {
        // A folder that is not there holds nothing, and nothing outside it is reachable through it:
        // the answer is "nothing is there", never a refusal that a caller reads as "not looked at".
        let real_root = match &self.real_root {
            RealRoot::Folder(real) => real,
            RealRoot::NotThere => return Ok(None),
            RealRoot::Unreadable => return Err(Refusal::Unreadable),
        };
        let judged = if follow {
            checked
        } else {
            checked.parent().unwrap_or(checked)
        };
        let nearest = self.nearest_place(judged)?;
        let real = nearest.real;
        let below = if is_within(real_root, &real) {
            segments_below(real_root, &real)
        } else {
            None
        }
        .ok_or(Refusal::OutsideApprovedRoot)?;
        let refused = |part: &String| {
            if sees_hidden {
                is_never_shown(part)
            } else {
                is_hidden_name(part) || is_credential_name(part)
            }
        };
        // Seeing through hidden folders stops at a hidden file: the last part is the file only
        // when the whole path is there.
        let hidden_file = sees_hidden
            && nearest.is_the_path
            && below.last().is_some_and(|last| is_hidden_name(last));
        if hidden_file || below.iter().any(refused) {
            return Err(Refusal::PrivateOrHiddenPath);
        }
        Ok((nearest.is_the_path && follow).then_some(real))
    }

    /// `judged` with its links resolved, or the nearest folder above it that is there.
    fn nearest_place(&self, judged: &Path) -> Resolution {
        if let Some(kept) = self.places.recall(judged) {
            return kept;
        }
        let resolution = match real_path(judged) {
            Ok(real) => Ok(NearestPlace {
                real,
                is_the_path: true,
            }),
            Err(error) if !says_nothing_is_there(&error) => Err(Refusal::Unreadable),
            Err(_) => match judged.parent() {
                Some(parent) if parent != judged => {
                    self.nearest_place(parent).map(|above| NearestPlace {
                        real: above.real,
                        is_the_path: false,
                    })
                }
                _ => Err(Refusal::OutsideApprovedRoot),
            },
        };
        self.places.remember(judged, &resolution);
        resolution
    }

    /// A regular file, not a link, in a folder that really is inside the root.
    pub fn is_own_file(&self, path: &Path) -> bool {
        self.link_kind(path) == Ok(Some(EntryKind::File))
    }

    /// The working-tree file as evidence text, only when it is a regular file inside the root, its
    /// path is not hidden or credential-named (also as it really resolves), and it fits what is
    /// left of `budget`. At most one byte past [`MAX_EVIDENCE_TEXT_BYTES`] is read, however large
    /// the file has grown. `None` for anything else.
    pub fn read_evidence_text(&self, path: &Path, budget: &mut ReadBudget) -> Option<String> {
        let checked = self.address(path).ok()?;
        let real = self.confine(&checked, true).ok()??;
        let RealRoot::Folder(real_root) = &self.real_root else {
            return None;
        };
        if real == *real_root {
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
        let checked = self.address(path).map_err(SourceReadError::Refused)?;
        let Some(real) = self
            .confine(&checked, true)
            .map_err(SourceReadError::Refused)?
        else {
            return Ok(None);
        };
        Ok(std::fs::metadata(real)
            .ok()
            .map(|found| kind_of(found.file_type())))
    }

    fn link_kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError> {
        let checked = self.address(path).map_err(SourceReadError::Refused)?;
        self.confine(&checked, false)
            .map_err(SourceReadError::Refused)?;
        Ok(std::fs::symlink_metadata(&checked)
            .ok()
            .map(|found| kind_of(found.file_type())))
    }

    fn regular_file_exists(&self, path: &Path) -> Result<bool, SourceReadError> {
        let checked = address_seeing_hidden(&self.root, &self.excluded, path)
            .map(|name| absolute(&self.root, &name))
            .map_err(SourceReadError::Refused)?;
        let Some(real) = self
            .confine_showing(&checked, true, true)
            .map_err(SourceReadError::Refused)?
        else {
            return Ok(false);
        };
        Ok(std::fs::metadata(real).is_ok_and(|found| found.is_file()))
    }

    fn read_text(&self, path: &Path) -> Result<std::borrow::Cow<'_, str>, SourceReadError> {
        let checked = self.address(path).map_err(SourceReadError::Refused)?;
        let real = self
            .confine(&checked, true)
            .map_err(SourceReadError::Refused)?
            .ok_or(SourceReadError::Absent)?;
        let file = std::fs::File::open(&real).map_err(|_| SourceReadError::Absent)?;
        let is_file = file.metadata().is_ok_and(|found| found.is_file());
        if !is_file {
            return Err(SourceReadError::Refused(Refusal::FileBytesUnavailable));
        }
        let mut bytes = Vec::new();
        let limit = u64::try_from(self.max_file_bytes).unwrap_or(u64::MAX);
        file.take(limit.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|_| SourceReadError::Absent)?;
        if bytes.len() > self.max_file_bytes {
            return Err(SourceReadError::Refused(Refusal::FileOverSizeLimit));
        }
        Ok(std::borrow::Cow::Owned(
            String::from_utf8_lossy(&bytes).into_owned(),
        ))
    }

    fn list_directory(&self, path: &Path) -> Result<DirectoryListing, SourceReadError> {
        let checked = self.address(path).map_err(SourceReadError::Refused)?;
        let real = self
            .confine(&checked, true)
            .map_err(SourceReadError::Refused)?
            .ok_or(SourceReadError::Absent)?;
        let listing = std::fs::read_dir(&real).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotADirectory {
                SourceReadError::Refused(Refusal::DirectoryUnavailable)
            } else {
                SourceReadError::Absent
            }
        })?;
        let mut entries: Vec<DirectoryEntry> = Vec::new();
        let mut credential_named_files: Vec<String> = Vec::new();
        for entry in listing.filter_map(Result::ok) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_hidden_name(&name) {
                continue;
            }
            let Some(kind) = entry.file_type().ok().map(kind_of) else {
                continue;
            };
            if is_credential_name(&name) {
                if kind == EntryKind::File {
                    credential_named_files.push(name);
                }
                continue;
            }
            entries.push(DirectoryEntry { name, kind });
        }
        entries.sort_by(|left, right| left.name.as_bytes().cmp(right.name.as_bytes()));
        credential_named_files.sort_unstable();
        Ok(DirectoryListing {
            entries,
            credential_named_files,
        })
    }
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;
    use crate::scan_root::ScanRoots;
    use std::os::unix::fs::symlink;

    const LIMIT: usize = 512 * 1024;

    struct Tree {
        _directory: tempfile::TempDir,
        root: PathBuf,
        outside: PathBuf,
        source: DiskSource,
    }

    fn source_of(root: &Path, limit: usize) -> DiskSource {
        let scan = ScanRoots::new(root.to_path_buf(), root.to_path_buf()).expect("roots");
        DiskSource::new(&scan.allow(root, "rootPath").expect("allowed"), limit)
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
        let source = source_of(&root, LIMIT);
        Tree {
            _directory: directory,
            root,
            outside,
            source,
        }
    }

    fn refusal<T: std::fmt::Debug>(result: Result<T, SourceReadError>) -> Refusal {
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

    /// A folder whose parent grants no search permission cannot be resolved: `realpath` fails with
    /// EACCES, which says nothing about whether the folder is there (POSIX `realpath`: "Search
    /// permission was denied for a component of the path prefix").
    #[test]
    fn a_root_the_system_will_not_resolve_is_refused_not_read_as_empty() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().expect("temp dir");
        let base = real_path(directory.path()).expect("real");
        let parent = base.join("closed");
        let root = parent.join("repo");
        std::fs::create_dir_all(root.join("src")).expect("root");
        std::fs::write(root.join("src/a.ts"), "x").expect("file");
        let scan = ScanRoots::new(root.clone(), root.clone()).expect("roots");
        let allowed = scan.allow(&root, "rootPath").expect("allowed");
        std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o000)).expect("close");
        let denied = std::fs::read_dir(&parent).is_err();
        let source = DiskSource::new(&allowed, LIMIT);
        let answer = source.kind(Path::new("src/a.ts"));
        std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o755)).expect("open");
        if denied {
            assert_eq!(refusal(answer), Refusal::Unreadable);
        }
    }

    #[test]
    fn a_folder_inside_the_root_the_system_will_not_resolve_is_refused_not_absent() {
        use std::os::unix::fs::PermissionsExt;
        let tree = tree();
        let closed = tree.root.join("closed");
        std::fs::create_dir_all(closed.join("deeper")).expect("folder");
        std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o000)).expect("close");
        let denied = std::fs::read_dir(&closed).is_err();
        let answer = tree.source.kind(&closed.join("deeper/a.ts"));
        std::fs::set_permissions(&closed, std::fs::Permissions::from_mode(0o755)).expect("open");
        if denied {
            assert_eq!(refusal(answer), Refusal::Unreadable);
        }
    }

    #[test]
    fn a_relative_path_is_read_below_the_root() {
        let tree = tree();
        assert_eq!(
            tree.source.read_text(Path::new("src/a.ts")).as_deref(),
            Ok("import './b';")
        );
        assert_eq!(
            refusal(tree.source.read_text(Path::new("../outside/sentinel.ts"))),
            Refusal::OutsideApprovedRoot
        );
    }

    #[test]
    fn a_folder_link_out_of_the_root_cannot_be_listed_read_or_probed() {
        let tree = tree();
        symlink(&tree.outside, tree.root.join("linked")).expect("link");
        assert_eq!(
            refusal(tree.source.list_directory(&tree.root.join("linked"))),
            Refusal::OutsideApprovedRoot
        );
        assert_eq!(
            refusal(tree.source.read_text(&tree.root.join("linked/sentinel.ts"))),
            Refusal::OutsideApprovedRoot
        );
        assert_eq!(
            refusal(tree.source.kind(&tree.root.join("linked"))),
            Refusal::OutsideApprovedRoot
        );
        assert_eq!(
            refusal(tree.source.link_kind(&tree.root.join("linked/sentinel.ts"))),
            Refusal::OutsideApprovedRoot,
            "what is under a link that leaves the root is not even looked at"
        );
        // The link itself is visible as a link, so a scan can skip it without a read.
        assert_eq!(
            tree.source.link_kind(&tree.root.join("linked")),
            Ok(Some(EntryKind::Symlink))
        );
    }

    #[test]
    fn a_file_link_to_the_outside_is_refused_and_a_link_inside_the_root_is_followed() {
        let tree = tree();
        symlink(
            tree.outside.join("sentinel.ts"),
            tree.root.join("src/leak.ts"),
        )
        .expect("link");
        assert_eq!(
            refusal(tree.source.read_text(&tree.root.join("src/leak.ts"))),
            Refusal::OutsideApprovedRoot
        );
        assert!(!tree.source.is_own_file(&tree.root.join("src/leak.ts")));
        assert!(tree.source.is_own_file(&tree.root.join("src/a.ts")));
        // A folder link that stays inside the root is read through.
        symlink(tree.root.join("src"), tree.root.join("alias")).expect("link");
        assert_eq!(
            tree.source
                .read_text(&tree.root.join("alias/a.ts"))
                .as_deref(),
            Ok("import './b';")
        );
        assert_eq!(
            tree.source.kind(&tree.root.join("alias")),
            Ok(Some(EntryKind::Directory))
        );
    }

    #[test]
    fn a_link_inside_the_root_cannot_reach_a_hidden_or_credential_name() {
        let tree = tree();
        std::fs::create_dir_all(tree.root.join(".git")).expect("git");
        std::fs::write(tree.root.join(".git/config"), "[core]").expect("config");
        std::fs::create_dir_all(tree.root.join("secrets")).expect("secrets");
        std::fs::write(tree.root.join("secrets/token.ts"), "x").expect("token");
        symlink(tree.root.join(".git"), tree.root.join("docs")).expect("link");
        symlink(tree.root.join("secrets"), tree.root.join("notes")).expect("link");
        symlink(
            tree.root.join("secrets/token.ts"),
            tree.root.join("plain.ts"),
        )
        .expect("link");
        for path in ["docs/config", "notes/token.ts", "plain.ts"] {
            assert_eq!(
                refusal(tree.source.read_text(&tree.root.join(path))),
                Refusal::PrivateOrHiddenPath,
                "{path}"
            );
        }
        let mut budget = ReadBudget::evidence();
        assert_eq!(
            tree.source
                .read_evidence_text(&tree.root.join("docs/config"), &mut budget),
            None
        );
    }

    #[test]
    fn hidden_credential_climbing_and_absolute_paths_are_refused_before_the_disk() {
        let tree = tree();
        std::fs::write(tree.root.join(".env"), "TOKEN=1").expect("env");
        std::fs::write(tree.root.join("id_rsa"), "key").expect("key");
        for (path, reason) in [
            (tree.root.join(".env"), Refusal::PrivateOrHiddenPath),
            (tree.root.join("id_rsa"), Refusal::PrivateOrHiddenPath),
            (
                tree.root.join("../outside/sentinel.ts"),
                Refusal::OutsideApprovedRoot,
            ),
            (
                tree.outside.join("sentinel.ts"),
                Refusal::OutsideApprovedRoot,
            ),
            (PathBuf::from("/etc/passwd"), Refusal::OutsideApprovedRoot),
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
    fn a_listing_leaves_out_hidden_and_credential_names_counts_the_credential_files_and_is_in_byte_order(
    ) {
        let tree = tree();
        std::fs::write(tree.root.join(".env"), "x").expect("env");
        std::fs::write(tree.root.join(".secrets.ts"), "x").expect("hidden credential");
        std::fs::write(tree.root.join("server.pem"), "x").expect("pem");
        std::fs::write(tree.root.join("Secrets.ts"), "x").expect("secrets");
        std::fs::create_dir(tree.root.join("credentials")).expect("a folder named like one");
        std::fs::write(tree.root.join("alpha.ts"), "x").expect("alpha");
        std::fs::write(tree.root.join("Zeta.ts"), "x").expect("Zeta");
        let listing = tree.source.list_directory(&tree.root).expect("list");
        let names: Vec<&str> = listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(names, ["Zeta.ts", "alpha.ts", "src"]);
        assert_eq!(
            listing.credential_named_files,
            ["Secrets.ts", "server.pem"],
            "a hidden name and a folder are not counted; a credential-named file is, unopened"
        );
    }

    #[test]
    fn the_caller_sets_the_limit_and_a_file_over_it_is_refused_not_cut() {
        let tree = tree();
        let small = source_of(&tree.root, 8);
        assert_eq!(
            refusal(small.read_text(&tree.root.join("src/a.ts"))),
            Refusal::FileOverSizeLimit
        );
        // A 1 MiB TypeScript file keeps its imports when the caller allows it.
        let big = "import './b';\n".repeat(70_000);
        std::fs::write(tree.root.join("src/big.ts"), &big).expect("big");
        assert!(big.len() > 900_000);
        let roomy = source_of(&tree.root, 2 * 1024 * 1024);
        assert_eq!(
            roomy
                .read_text(&tree.root.join("src/big.ts"))
                .map(|text| text.len()),
            Ok(big.len())
        );
    }

    #[test]
    fn an_empty_file_is_the_empty_text() {
        let tree = tree();
        std::fs::write(tree.root.join("src/empty.ts"), "").expect("empty");
        assert_eq!(
            tree.source
                .read_text(&tree.root.join("src/empty.ts"))
                .as_deref(),
            Ok("")
        );
        let mut budget = ReadBudget::evidence();
        assert_eq!(
            tree.source
                .read_evidence_text(&tree.root.join("src/empty.ts"), &mut budget)
                .as_deref(),
            Some("")
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
        let mut short = ReadBudget { left: 4 };
        assert_eq!(
            tree.source
                .read_evidence_text(&tree.root.join("src/a.ts"), &mut short),
            None
        );
    }

    #[test]
    fn a_file_in_a_hidden_folder_is_known_to_exist_but_credentials_and_git_stay_refused() {
        let tree = tree();
        for (name, text) in [
            (".generated/surface.json", "{}"),
            (".storybook/main.ts", ""),
            (".env", "KEY=1"),
            (".git/config", ""),
            ("src/credentials.json", "{}"),
            (".generated/secret.pem", ""),
        ] {
            let path = tree.root.join(name);
            std::fs::create_dir_all(path.parent().expect("parent")).expect("folder");
            std::fs::write(path, text).expect("file");
        }
        let exists = |name: &str| tree.source.regular_file_exists(&tree.root.join(name));
        assert_eq!(exists(".generated/surface.json"), Ok(true));
        assert_eq!(exists(".storybook/main.ts"), Ok(true));
        assert_eq!(exists("src/a.ts"), Ok(true));
        assert_eq!(exists(".generated/none.json"), Ok(false));
        assert_eq!(exists("src"), Ok(false), "a folder is not a regular file");
        for refused in [
            ".git/config",
            ".git",
            ".env",
            ".generated",
            "src/credentials.json",
            ".generated/secret.pem",
            "../outside/sentinel.ts",
        ] {
            assert!(
                matches!(exists(refused), Err(SourceReadError::Refused(_))),
                "{refused}"
            );
        }
        // A hidden file is not seen through, only hidden folders are: `.env` stays refused, and a
        // read of a file in a hidden folder is refused as before.
        assert_eq!(refusal(exists(".env")), Refusal::PrivateOrHiddenPath);
        assert_eq!(
            refusal(
                tree.source
                    .read_text(&tree.root.join(".generated/surface.json"))
            ),
            Refusal::PrivateOrHiddenPath
        );
    }

    #[test]
    fn a_hidden_file_is_refused_by_its_name_alone_so_a_missing_one_answers_as_an_existing_one() {
        let tree = tree();
        std::fs::write(tree.root.join("src/.env"), "KEY=1").expect("env");
        let exists = |name: &str| tree.source.regular_file_exists(&tree.root.join(name));
        let present = refusal(exists("src/.env"));
        let missing = refusal(exists("src/.missing-env"));
        assert_eq!(present, Refusal::PrivateOrHiddenPath);
        assert_eq!(missing, present);
        for folded in [".GIT/config", "src/.Git/HEAD", ".GiT"] {
            assert_eq!(
                refusal(exists(folded)),
                Refusal::PrivateOrHiddenPath,
                "{folded}: git's folder is refused in any letter case, present or not"
            );
        }
    }

    #[test]
    fn a_link_is_followed_only_while_it_stays_inside_the_root_and_off_the_credentials() {
        let tree = tree();
        std::fs::create_dir_all(tree.root.join(".generated")).expect("folder");
        std::fs::write(tree.root.join(".generated/surface.json"), "{}").expect("file");
        std::fs::write(tree.root.join(".env"), "KEY=1").expect("env");
        symlink(
            tree.root.join(".generated/surface.json"),
            tree.root.join("src/inside.json"),
        )
        .expect("link");
        symlink(
            tree.outside.join("sentinel.ts"),
            tree.root.join("src/leaves.ts"),
        )
        .expect("link");
        symlink(tree.root.join(".env"), tree.root.join("src/sees-env.txt")).expect("link");
        let exists = |name: &str| tree.source.regular_file_exists(&tree.root.join(name));
        assert_eq!(exists("src/inside.json"), Ok(true));
        assert_eq!(
            refusal(exists("src/leaves.ts")),
            Refusal::OutsideApprovedRoot
        );
        assert_eq!(
            refusal(exists("src/sees-env.txt")),
            Refusal::PrivateOrHiddenPath
        );
    }

    #[test]
    fn evidence_text_refuses_oversized_binary_and_invalid_bytes() {
        assert_eq!(evidence_text(b"").as_deref(), Some(""));
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

#[cfg(test)]
mod missing_root_tests {
    use super::*;
    use crate::scan_root::ScanRoots;

    #[test]
    fn a_root_that_is_not_there_holds_nothing_and_refuses_nothing() {
        let directory = tempfile::tempdir().expect("temp dir");
        let root = directory.path().join("absent");
        let scan = ScanRoots::new(root.clone(), root.clone()).expect("roots");
        let source = DiskSource::new(&scan.allow(&root, "rootPath").expect("allowed"), 1024);
        let file = Path::new("src/app.ts");
        assert_eq!(source.kind(file), Ok(None));
        assert_eq!(source.link_kind(file), Ok(None));
        assert_eq!(source.regular_file_exists(file), Ok(false));
        assert!(matches!(
            source.read_text(file),
            Err(SourceReadError::Absent)
        ));
    }
}
