//! Writing one file without a torn state: a new file beside it, flushed, then renamed over it. A
//! rename is atomic within one file system, so a crash leaves either the old contents or the new,
//! never a truncated user file. A write may state what it expects to find, and a file that is
//! something else at the moment of the rename is a conflict, not an overwrite.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::modified_time::{reading_text, ModifiedTime};
use crate::temporary_name::next_atomic_temporary_name;
use crate::vault_root::WritablePath;

/// What a write expects the file to be when it commits.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum Expectation {
    /// Nothing is checked.
    #[default]
    Unchecked,
    /// The file must not exist: a create.
    Absent,
    /// The file must hold exactly this text, as read when the change was planned.
    Text(String),
}

/// A write found the file changed since it was read: by an editor, a sync client, the app or
/// another agent. Re-reading the document gives the current reading to retry with.
#[derive(Debug, Clone, PartialEq)]
pub struct VaultConflict {
    pub slug: String,
    pub expected_modified: Option<ModifiedTime>,
    pub current_modified: Option<ModifiedTime>,
}

impl std::fmt::Display for VaultConflict {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Only a recovery that works is named: seven of the eight write tools that raise this do
        // not accept `force`, and a delete's `force` means "despite backlinks", not "ignore the
        // modification time".
        write!(
            formatter,
            "Vault conflict: \"{}\" was modified externally (changed on disk) between read and write. \
expectedMtime={} currentMtime={}. \
Re-read the doc with get_concepts to get the current expected_mtime, then retry the write.",
            self.slug,
            reading_text(self.expected_modified),
            reading_text(self.current_modified)
        )
    }
}

impl std::error::Error for VaultConflict {}

impl VaultConflict {
    /// The code a tool answers with.
    pub const CODE: &'static str = "VAULT_CONFLICT";
}

/// Why a write or a plan did not happen. Each message is the sentence an agent reads.
#[derive(Debug)]
pub enum WriteError {
    Conflict(VaultConflict),
    /// These files changed or were deleted since they were read; nothing was written.
    ChangedOnDisk(Vec<PathBuf>),
    /// These plan items lack the snapshot revision a plan must carry; nothing was written.
    MissingRevisions(Vec<PathBuf>),
    /// These files (with the error code for each) cannot be written; nothing was written.
    NotWritable(Vec<(PathBuf, &'static str)>),
    /// A step failed and every earlier one was put back.
    RolledBack {
        reason: String,
    },
    /// A step failed and these files still hold rewritten content or folders remain.
    Inconsistent {
        reason: String,
        unrecovered: Vec<PathBuf>,
    },
    Io(io::Error),
}

fn listed(paths: &[PathBuf]) -> String {
    paths
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("\n  ")
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict(conflict) => conflict.fmt(formatter),
            Self::ChangedOnDisk(paths) => write!(
                formatter,
                "Refused before writing anything: {} file(s) changed on disk or were deleted since they \
were read, so this operation would overwrite someone else's edit:\n  {}\n\
The vault is unchanged. Re-read those documents and run this again.",
                paths.len(),
                listed(paths)
            ),
            Self::MissingRevisions(paths) => write!(
                formatter,
                "Refused before writing anything: {} plan item(s) are missing snapshot revision data:\n  {}\n\
The vault is unchanged. Rebuild the plan from fresh reads.",
                paths.len(),
                listed(paths)
            ),
            Self::NotWritable(blocked) => {
                let lines: Vec<String> = blocked
                    .iter()
                    .map(|(path, code)| format!("{} ({code})", path.display()))
                    .collect();
                write!(
                    formatter,
                    "Refused before writing anything: {} file(s) are not writable, \
so this operation could not finish as one unit:\n  {}\n\
The vault is unchanged. Fix permissions (or close the editor/sync client \
holding them) and re-run with confirm: true.",
                    blocked.len(),
                    lines.join("\n  ")
                )
            }
            Self::RolledBack { reason } => write!(
                formatter,
                "Write failed ({reason}). Every change was rolled back: the vault is unchanged."
            ),
            Self::Inconsistent {
                reason,
                unrecovered,
            } => write!(
                formatter,
                "Write failed ({reason}) and the rollback could not finish. \
The vault is INCONSISTENT: these files still hold rewritten content:\n  {}\n\
If the vault is a git repository, `git diff` shows exactly what changed \
and `git checkout -- <path>` restores it.",
                listed(unrecovered)
            ),
            Self::Io(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for WriteError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Conflict(conflict) => Some(conflict),
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for WriteError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// Names the slug and the reading a conflict reports.
#[derive(Debug, Clone, Copy)]
pub struct ConflictReport<'a> {
    pub slug: &'a str,
    pub expected_modified: Option<ModifiedTime>,
}

/// One atomic write.
#[derive(Default)]
pub struct AtomicWrite<'a> {
    pub expectation: Expectation,
    /// With a report, a changed file is a [`WriteError::Conflict`]; without one it is
    /// [`WriteError::ChangedOnDisk`].
    pub conflict: Option<ConflictReport<'a>>,
    /// Runs after the new file is flushed and before the check and the rename; a test parks a
    /// racing edit here.
    pub before_commit: Option<&'a dyn Fn()>,
}

/// Whether the file at `path` holds `expected` as Node's `readFileSync(path, 'utf-8')` decodes
/// it. A file that cannot be read does not.
pub(crate) fn file_holds_text(path: &Path, expected: &str) -> bool {
    std::fs::read(path).is_ok_and(|bytes| String::from_utf8_lossy(&bytes) == expected)
}

/// Whether the file is not what `expectation` says it should be.
pub(crate) fn changed_on_disk(path: &Path, expectation: &Expectation) -> bool {
    match expectation {
        Expectation::Absent => path.exists(),
        Expectation::Text(expected) => !file_holds_text(path, expected),
        Expectation::Unchecked => false,
    }
}

/// The modification time of the file at `path`, or `None` when it is absent.
pub(crate) fn modified_time_of(path: &Path) -> Option<ModifiedTime> {
    std::fs::metadata(path)
        .ok()
        .and_then(|metadata| ModifiedTime::of(&metadata))
}

/// The permission bits of an existing regular file, or `None` when there is none. Other errors
/// than an absent file are the caller's.
#[cfg(unix)]
fn existing_regular_file_mode(path: &Path) -> io::Result<Option<u32>> {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => Ok(Some(metadata.permissions().mode() & 0o777)),
        Ok(_) => Ok(None),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Writes `text` over `target` without a torn state: a new file in the same folder opened with
/// `create_new`, the text written, flushed to the disk, then renamed over the target. A failed
/// write leaves the target as it was and removes the new file. A private original's mode is
/// given to the new file before any text is written.
pub fn write_atomically(
    target: &WritablePath,
    text: &str,
    options: &AtomicWrite<'_>,
) -> Result<(), WriteError> {
    let path = target.as_path();
    let temporary = temporary_beside(path);
    let result = write_then_rename(path, &temporary, text, options);
    // Only a failed write leaves the new file; removing it never touches the original.
    if temporary.exists() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

fn temporary_beside(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    path.with_file_name(next_atomic_temporary_name(&name))
}

fn write_then_rename(
    path: &Path,
    temporary: &Path,
    text: &str,
    options: &AtomicWrite<'_>,
) -> Result<(), WriteError> {
    #[cfg(unix)]
    let existing_mode = existing_regular_file_mode(path)?;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temporary)?;
    // Before the contents, so the new file never widens a private original's mode.
    #[cfg(unix)]
    if let Some(mode) = existing_mode {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(mode))?;
    }
    file.write_all(text.as_bytes())?;
    // Flush before the rename, or a power loss can leave the new name with the contents still
    // in the cache.
    file.sync_all()?;
    drop(file);
    if let Some(before_commit) = options.before_commit {
        before_commit();
    }
    if changed_on_disk(path, &options.expectation) {
        return Err(match options.conflict {
            Some(report) => WriteError::Conflict(VaultConflict {
                slug: report.slug.to_string(),
                expected_modified: report.expected_modified,
                current_modified: modified_time_of(path),
            }),
            None => WriteError::ChangedOnDisk(vec![path.to_path_buf()]),
        });
    }
    std::fs::rename(temporary, path)?;
    Ok(())
}

/// A conflict unless `expected` is absent or within a millisecond of `current`. A file that is
/// now absent is a conflict whenever a reading was expected.
pub fn check_modified_time(
    slug: &str,
    expected: Option<ModifiedTime>,
    current: Option<ModifiedTime>,
) -> Result<(), VaultConflict> {
    let Some(expected_reading) = expected else {
        return Ok(());
    };
    match current {
        Some(reading) if !expected_reading.differs_from(reading) => Ok(()),
        _ => Err(VaultConflict {
            slug: slug.to_string(),
            expected_modified: expected,
            current_modified: current,
        }),
    }
}

/// A conflict unless the file still holds the text a plan was made from.
pub fn check_current_text(
    slug: &str,
    path: &crate::vault_root::ConfinedPath,
    expected_text: &str,
    expected_modified: Option<ModifiedTime>,
) -> Result<(), VaultConflict> {
    if file_holds_text(path.as_path(), expected_text) {
        return Ok(());
    }
    Err(VaultConflict {
        slug: slug.to_string(),
        expected_modified,
        current_modified: path.modified_time(),
    })
}
