//! Writing one file without a torn state: a new file beside it, flushed, then renamed over it. A
//! rename is atomic within one file system, so a crash leaves either the old contents or the new,
//! never a truncated user file. A write may state what it expects to find, and a file that is
//! something else at the moment of the rename is a conflict, not an overwrite.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::modified_time::{reading_text, ModifiedTime};
use crate::os_error::{IoFailure, OsErrorCode};
use crate::temporary_name::next_atomic_temporary_name;
use crate::vault_root::WritablePath;

/// What a write expects the file to be when it commits.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Expectation<'a> {
    /// Nothing is checked.
    #[default]
    Unchecked,
    /// The file must not exist: a create.
    Absent,
    /// The file must hold exactly this text, as read when the change was planned.
    Text(&'a str),
}

/// A write found the file changed since it was read: by an editor, a sync client, the app or
/// another agent. Re-reading the document gives the current reading to retry with; which tool
/// reads it is the server's sentence to add.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[error(
    "Vault conflict: \"{slug}\" was modified externally (changed on disk) between read and write. \
expectedMtime={} currentMtime={}.",
    reading_text(*expected_modified),
    reading_text(*current_modified)
)]
pub struct VaultConflict {
    pub slug: String,
    pub expected_modified: Option<ModifiedTime>,
    pub current_modified: Option<ModifiedTime>,
}

impl VaultConflict {
    /// The code a tool answers with.
    pub const CODE: &'static str = "VAULT_CONFLICT";
}

/// Which public `errorCode` a failed write answers with. The set is stable: agents branch on it,
/// so an existing code keeps its meaning and a new one may be added.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteErrorClass {
    /// The file changed since it was read (a stale expectation): `vault_conflict`.
    VaultConflict,
    /// A name was taken (`EEXIST`): `conflict`.
    Conflict,
    /// Anything else: `tool_error`.
    ToolError,
}

impl WriteErrorClass {
    /// The code as the answer prints it.
    pub fn public_code(self) -> &'static str {
        match self {
            Self::VaultConflict => "vault_conflict",
            Self::Conflict => "conflict",
            Self::ToolError => "tool_error",
        }
    }
}

/// Why a write or a plan did not happen.
#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error(transparent)]
    Conflict(VaultConflict),
    /// A target is reserved for a person; nothing was written.
    #[error(transparent)]
    Reserved(crate::write_plan::ReservedForPerson),
    /// These files changed or were deleted since they were read; nothing was written.
    #[error(
        "Refused before writing anything: {} file(s) changed on disk or were deleted since they \
were read, so this operation would overwrite someone else's edit:\n  {}\n\
The vault is unchanged. Re-read those documents and run this again.",
        .0.len(),
        listed(.0)
    )]
    ChangedOnDisk(Vec<PathBuf>),
    /// These plan items lack the snapshot revision a plan must carry; nothing was written.
    #[error(
        "Refused before writing anything: {} plan item(s) are missing snapshot revision data:\n  {}\n\
The vault is unchanged. Rebuild the plan from fresh reads.",
        .0.len(),
        listed(.0)
    )]
    MissingRevisions(Vec<PathBuf>),
    /// These files cannot be written (with the code the check found for each); nothing was
    /// written.
    #[error(
        "Refused before writing anything: {} file(s) are not writable, \
so this operation could not finish as one unit:\n  {}\n\
The vault is unchanged. Fix permissions (or close the editor or sync client holding them) \
and run it again.",
        .0.len(),
        not_writable_lines(.0)
    )]
    NotWritable(Vec<(PathBuf, OsErrorCode)>),
    /// A step failed and every earlier one was put back.
    #[error("Write failed ({cause}). Every change was rolled back: the vault is unchanged.")]
    RolledBack { cause: Box<WriteError> },
    /// A step failed and these files still hold rewritten content or folders remain.
    #[error(
        "Write failed ({cause}) and the rollback could not finish. \
The vault is INCONSISTENT: these files still hold rewritten content:\n  {}\n\
If the vault is a git repository, `git diff` shows exactly what changed \
and `git checkout -- <path>` restores it.",
        listed(unrecovered)
    )]
    Inconsistent {
        cause: Box<WriteError>,
        unrecovered: Vec<PathBuf>,
    },
    #[error(transparent)]
    Io(#[from] IoFailure),
}

fn listed(paths: &[PathBuf]) -> String {
    paths
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("\n  ")
}

fn not_writable_lines(blocked: &[(PathBuf, OsErrorCode)]) -> String {
    blocked
        .iter()
        .map(|(path, code)| format!("{} ({})", path.display(), access_error_name(*code)))
        .collect::<Vec<_>>()
        .join("\n  ")
}

/// The name JavaScript's `accessSync` shows for a permission check that failed: the code when
/// the set names one, else what the platform answers for a refused write (Windows `EPERM`).
fn access_error_name(code: OsErrorCode) -> &'static str {
    code.name()
        .unwrap_or(if cfg!(windows) { "EPERM" } else { "EACCES" })
}

impl WriteError {
    /// The class the server reports for this error, from the variant and not from its text.
    /// [`WriteErrorClass::public_code`] is the `errorCode` an agent sees.
    pub fn class(&self) -> WriteErrorClass {
        match self {
            Self::Conflict(_) => WriteErrorClass::VaultConflict,
            Self::Io(failure) if failure.code() == OsErrorCode::AlreadyExists => {
                WriteErrorClass::Conflict
            }
            // Rolling back changes nothing about why the write failed: a stale write that was
            // rolled back is still a `vault_conflict`.
            Self::RolledBack { cause } | Self::Inconsistent { cause, .. } => cause.class(),
            _ => WriteErrorClass::ToolError,
        }
    }

    pub(crate) fn io<'a>(
        syscall: &'static str,
        path: &'a Path,
    ) -> impl FnOnce(io::Error) -> WriteError + 'a {
        move |source| Self::Io(IoFailure::new(syscall, path, source))
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
    pub expectation: Expectation<'a>,
    /// The permission bits of the file this write copies (see `permission_bits_of`). A file that
    /// is already there is given the bits both have, so a write never widens either.
    pub new_file_bits: Option<u32>,
    /// The bits a file put back must have exactly: those the write being undone found, which it
    /// may have narrowed.
    pub restored_bits: Option<u32>,
    /// With a report, a changed file is a [`WriteError::Conflict`]; without one it is
    /// [`WriteError::ChangedOnDisk`].
    pub conflict: Option<ConflictReport<'a>>,
    /// Runs after the new file is flushed and before the check and the rename; a test parks a
    /// racing edit here.
    #[cfg(feature = "test-hooks")]
    pub before_commit: Option<&'a dyn Fn()>,
}

/// Whether the file at `path` holds `expected` as Node's `readFileSync(path, 'utf-8')` decodes
/// it. A file that cannot be read does not.
pub(crate) fn file_holds_text(path: &Path, expected: &str) -> bool {
    std::fs::read(path).is_ok_and(|bytes| String::from_utf8_lossy(&bytes) == expected)
}

/// Whether the file is not what `expectation` says it should be.
pub(crate) fn changed_on_disk(path: &Path, expectation: Expectation<'_>) -> bool {
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

/// The permission bits of the regular file at `path`, for a file made to be no more open than it:
/// a copy, a backup, a file put back. `None` where the system has no such bits (Windows keeps access
/// lists, which a new file in a folder inherits) or when no regular file is there.
pub(crate) fn permission_bits_of(path: &Path) -> Option<u32> {
    #[cfg(unix)]
    {
        existing_regular_file_mode(path).ok().flatten()
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

/// The permission bits of an existing regular file, or `None` when there is none. Other errors
/// than an absent file are the caller's.
#[cfg(unix)]
fn existing_regular_file_mode(path: &Path) -> Result<Option<u32>, WriteError> {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => Ok(Some(metadata.permissions().mode() & 0o777)),
        Ok(_) => Ok(None),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(WriteError::io("stat", path)(error)),
    }
}

/// The new file this call created, removed when the call ends without renaming it. A file that
/// was already there under that name (a tie `create_new` refused) is never this call's, so it is
/// never removed.
struct CreatedFile<'a> {
    path: &'a Path,
    renamed: bool,
}

impl Drop for CreatedFile<'_> {
    fn drop(&mut self) {
        if !self.renamed {
            let _ = std::fs::remove_file(self.path);
        }
    }
}

/// Writes `text` over `target` without a torn state: a new file in the same folder opened with
/// `create_new`, the text written, flushed to the disk, then renamed over the target. A failed
/// write leaves the target as it was and removes the new file. A private original's mode is
/// given to the new file before any text is written; over a file that is already there the new
/// file gets the bits both have. After the rename the folder is flushed
/// where the platform allows, best effort: a failure there cannot undo the rename.
pub fn write_atomically(
    target: &WritablePath,
    text: &str,
    options: &AtomicWrite<'_>,
) -> Result<(), WriteError> {
    let path = target.as_path();
    let temporary = temporary_beside(path);
    #[cfg(unix)]
    let existing_mode = match (
        options.restored_bits,
        existing_regular_file_mode(path)?,
        options.new_file_bits,
    ) {
        (Some(restored), _, _) => Some(restored),
        (None, Some(existing), Some(copied)) => Some(existing & copied),
        (None, existing, copied) => existing.or(copied),
    };
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(WriteError::io("open", &temporary))?;
    let mut created = CreatedFile {
        path: &temporary,
        renamed: false,
    };
    // Before the contents, so the new file never widens a private original's mode, nor the mode of
    // the file it is a copy of.
    #[cfg(unix)]
    if let Some(mode) = existing_mode {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(mode))
            .map_err(WriteError::io("chmod", &temporary))?;
    }
    file.write_all(text.as_bytes())
        .map_err(WriteError::io("write", &temporary))?;
    // Flush before the rename, or a power loss can leave the new name with the contents still
    // in the cache.
    file.sync_all()
        .map_err(WriteError::io("fsync", &temporary))?;
    drop(file);
    #[cfg(feature = "test-hooks")]
    if let Some(before_commit) = options.before_commit {
        before_commit();
    }
    if changed_on_disk(path, options.expectation) {
        return Err(match options.conflict {
            Some(report) => WriteError::Conflict(VaultConflict {
                slug: report.slug.to_string(),
                expected_modified: report.expected_modified,
                current_modified: modified_time_of(path),
            }),
            None => WriteError::ChangedOnDisk(vec![path.to_path_buf()]),
        });
    }
    std::fs::rename(&temporary, path).map_err(WriteError::io("rename", path))?;
    created.renamed = true;
    #[cfg(unix)]
    if let Some(folder) = path
        .parent()
        .and_then(|parent| std::fs::File::open(parent).ok())
    {
        let _ = folder.sync_all();
    }
    Ok(())
}

fn temporary_beside(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    path.with_file_name(next_atomic_temporary_name(&name))
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
