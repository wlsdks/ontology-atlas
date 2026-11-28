//! Writes and deletes of several files as one unit. Any failure while the process lives leaves the
//! vault as it started: every target's permission is checked first, and a later failure puts the
//! original bytes back. Not crash-safe, hence not "atomic": that needs a journal, and the vault is
//! Git.
//!
//! A plan never rewrites a file reserved for a person (`review_state: human_decides`): the
//! caller states how a reservation is read ([`Reservations`]), because only the frontmatter
//! parser knows. The caller forgets any cached parse of a file when
//! [`WriteError::ChangedOnDisk`] or [`WriteError::Conflict`] names it.

use std::io;
use std::path::{Path, PathBuf};

use icu_normalizer::ComposingNormalizerBorrowed;

use crate::atomic_write::{
    file_holds_text, modified_time_of, permission_bits_of, write_atomically, AtomicWrite, Expectation, WriteError,
};
use crate::modified_time::ModifiedTime;
use crate::os_error::{IoFailure, OsErrorCode};
use crate::plain_file::{self, FileIdentity};
use crate::vault_root::WritablePath;

/// What one entry of a plan does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlannedOperation {
    Write { content: String },
    Delete,
}

/// One file of a plan, with what the plan saw when it read the file.
#[derive(Debug, Clone)]
pub struct PlanEntry {
    pub path: WritablePath,
    pub operation: PlannedOperation,
    /// The text the plan was made from. `None` skips the check unless revisions are required.
    pub expected_text: Option<String>,
    /// The file did not exist when the plan was made.
    pub expected_absent: bool,
    pub expected_modified: Option<ModifiedTime>,
    /// The file the plan was made from, by identity: the name must still lead to that file, which
    /// must still be a plain file. Text and time cannot say a file was swapped for a copy.
    pub expected_identity: Option<FileIdentity>,
    /// The permission bits a file this entry creates gets: those of a named file, so a copy is
    /// never more open than its original.
    pub new_file_bits: Option<u32>,
}

impl PlanEntry {
    pub fn write(path: WritablePath, content: String) -> Self {
        Self {
            path,
            operation: PlannedOperation::Write { content },
            expected_text: None,
            expected_absent: false,
            expected_modified: None,
            expected_identity: None,
            new_file_bits: None,
        }
    }

    pub fn delete(path: WritablePath) -> Self {
        Self {
            path,
            operation: PlannedOperation::Delete,
            expected_text: None,
            expected_absent: false,
            expected_modified: None,
            expected_identity: None,
            new_file_bits: None,
        }
    }

    pub fn expecting_text(mut self, text: String) -> Self {
        self.expected_text = Some(text);
        self
    }

    pub fn expecting_absent(mut self) -> Self {
        self.expected_absent = true;
        self
    }

    pub fn expecting_modified(mut self, modified: Option<ModifiedTime>) -> Self {
        self.expected_modified = modified;
        self
    }

    /// A file this entry creates gets the permission bits `original` has now (a private file's copy
    /// stays private). Without bits to read, the new file gets the system's default.
    pub fn as_open_as(mut self, original: &Path) -> Self {
        self.new_file_bits = permission_bits_of(original);
        self
    }

    pub fn expecting_identity(mut self, identity: FileIdentity) -> Self {
        self.expected_identity = Some(identity);
        self
    }

    fn is_write(&self) -> bool {
        matches!(self.operation, PlannedOperation::Write { .. })
    }

    fn path(&self) -> &Path {
        self.path.as_path()
    }

    fn changed_on_disk(&self) -> bool {
        if self.expected_absent {
            return self.path().exists();
        }
        if let Some(text) = &self.expected_text {
            if !file_holds_text(self.path(), text) {
                return true;
            }
        }
        if let Some(identity) = self.expected_identity {
            if !identity.is_still_at(self.path()) {
                return true;
            }
        }
        match self.expected_modified {
            None => false,
            Some(expected) => {
                modified_time_of(self.path()).is_none_or(|current| expected.differs_from(current))
            }
        }
    }
}

/// A file reserved for a person: a plan that would rewrite it is refused.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error(
    "Refused: {slug} carries review_state: human_decides, so it is reserved for a person \
and this change would rewrite it.{} Report it and let the person decide; only they release the \
reservation.",
    note.as_ref().map(|text| format!(" What they have to decide: {text}")).unwrap_or_default()
)]
pub struct ReservedForPerson {
    /// The file's own `slug`, or its path when it has none.
    pub slug: String,
    pub note: Option<String>,
}

/// How a plan treats a file reserved for a person. A required choice of every plan: a tool that
/// rewrites several files (rename, reclassify, merge touch backlinks nobody named) cannot forget
/// the check.
pub enum Reservations<'a> {
    /// Refuse a plan that touches a reserved file. The reader gets the path and the current text
    /// of every target that exists, and returns the reservation it finds in that text, or `None`
    /// when there is none, the text does not parse, or the file is only being created.
    Refuse(&'a dyn Fn(&Path, &str) -> Option<ReservedForPerson>),
    /// The one tool that releases a reservation may rewrite reserved files.
    AllowReserved,
}

/// How a plan is applied.
pub struct ApplyOptions<'a> {
    pub reservations: Reservations<'a>,
    /// Refuse an entry that carries no snapshot of what it replaces.
    pub require_revisions: bool,
    /// Runs before each entry, with its index; a test parks a racing edit here.
    #[cfg(feature = "test-hooks")]
    pub before_entry: Option<&'a dyn Fn(usize)>,
}

impl<'a> ApplyOptions<'a> {
    pub fn new(reservations: Reservations<'a>) -> Self {
        Self {
            reservations,
            require_revisions: false,
            #[cfg(feature = "test-hooks")]
            before_entry: None,
        }
    }

    pub fn requiring_revisions(mut self) -> Self {
        self.require_revisions = true;
        self
    }
}

/// What an applied plan did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Applied {
    pub steps: usize,
}

struct Step {
    path: WritablePath,
    operation: StepKind,
    existed: bool,
    before: Option<String>,
    /// The permission bits the file had before the step, so a deleted file comes back as open as
    /// it was and no more.
    bits_before: Option<u32>,
}

enum StepKind {
    Write { after: String },
    Delete,
}

/// Applies `plan` in order, all or nothing.
pub fn apply_all_or_nothing(
    plan: Vec<PlanEntry>,
    options: &ApplyOptions<'_>,
) -> Result<Applied, WriteError> {
    if plan.is_empty() {
        return Ok(Applied { steps: 0 });
    }
    if let Reservations::Refuse(reservation_of) = &options.reservations {
        for entry in &plan {
            if let Ok(bytes) = std::fs::read(entry.path()) {
                let text = String::from_utf8_lossy(&bytes);
                if let Some(reserved) = reservation_of(entry.path(), &text) {
                    return Err(WriteError::Reserved(reserved));
                }
            }
        }
    }
    let plan = without_deletes_of_written_files(plan);
    if options.require_revisions {
        let missing: Vec<PathBuf> = plan
            .iter()
            .filter(|entry| lacks_revision(entry))
            .map(|entry| entry.path().to_path_buf())
            .collect();
        if !missing.is_empty() {
            return Err(WriteError::MissingRevisions(missing));
        }
    }
    // If someone edited a target since the planner's snapshot, write nothing.
    let conflicts: Vec<PathBuf> = plan
        .iter()
        .filter(|entry| entry.changed_on_disk())
        .map(|entry| entry.path().to_path_buf())
        .collect();
    if !conflicts.is_empty() {
        return Err(WriteError::ChangedOnDisk(conflicts));
    }
    refuse_unwritable(&plan)?;
    apply_with_rollback(plan, options)
}

/// A plan that writes then deletes one file drops the delete: a case-only rename (write
/// `auth.md`, delete `Auth.md`) names one file on macOS and Windows, so the delete would erase
/// what was just written.
fn without_deletes_of_written_files(plan: Vec<PlanEntry>) -> Vec<PlanEntry> {
    let writes: Vec<PathBuf> = plan
        .iter()
        .filter(|entry| entry.is_write())
        .map(|entry| entry.path().to_path_buf())
        .collect();
    plan.into_iter()
        .filter(|entry| {
            entry.is_write() || !writes.iter().any(|written| names_one_file(written, entry.path()))
        })
        .collect()
}

/// The spelling two names share when a disk may open one as the other: letters without case, and
/// composed Unicode, because macOS opens `e` plus U+0301 as the precomposed U+00E9.
fn spelling_a_disk_may_fold(path: &Path) -> String {
    ComposingNormalizerBorrowed::new_nfc()
        .normalize(&path.to_string_lossy())
        .to_lowercase()
}

/// Whether two paths of one plan name the same file. The same path always does. Another spelling
/// does only when it differs by letter case or Unicode normalization and both paths exist as one
/// file (device and inode on Unix, volume and file index on Windows): a case-insensitive or
/// normalization-insensitive disk opens `auth.md` as `Auth.md` and `e\u{301}.md` as `\u{e9}.md`,
/// and a case-sensitive one holds two files, which stay two.
fn names_one_file(first: &Path, second: &Path) -> bool {
    if first == second {
        return true;
    }
    if spelling_a_disk_may_fold(first) != spelling_a_disk_may_fold(second) {
        return false;
    }
    match (plain_file::facts_at(first), plain_file::facts_at(second)) {
        (Ok(first), Ok(second)) => first.identity == second.identity,
        _ => false,
    }
}

fn lacks_revision(entry: &PlanEntry) -> bool {
    if entry.path().exists() {
        entry.expected_text.is_none()
    } else if entry.is_write() {
        !entry.expected_absent
    } else {
        entry.expected_text.is_none()
    }
}

fn refuse_unwritable(plan: &[PlanEntry]) -> Result<(), WriteError> {
    let mut blocked: Vec<(PathBuf, OsErrorCode)> = Vec::new();
    for entry in plan {
        let path = entry.path();
        let checks = || -> io::Result<()> {
            if path.exists() {
                check_writable(path)?;
            } else if entry.is_write() {
                check_writable(&nearest_existing_parent(path))?;
            }
            if !entry.is_write() && path.exists() {
                // Deleting needs write permission on the folder, not the file.
                if let Some(folder) = path.parent() {
                    check_writable(folder)?;
                }
            }
            Ok(())
        };
        if let Err(error) = checks() {
            blocked.push((path.to_path_buf(), OsErrorCode::of(&error)));
        }
    }
    if blocked.is_empty() {
        Ok(())
    } else {
        Err(WriteError::NotWritable(blocked))
    }
}

/// The nearest existing parent of a target that does not exist yet. The pre-check never creates
/// anything.
fn nearest_existing_parent(path: &Path) -> PathBuf {
    let mut probe = path.parent().map(Path::to_path_buf).unwrap_or_default();
    loop {
        if probe.exists() {
            return probe;
        }
        match probe.parent() {
            Some(parent) if parent != probe => probe = parent.to_path_buf(),
            _ => return probe,
        }
    }
}

/// `access(2)` with `W_OK`, through a safe binding: it asks the kernel about the real user, so
/// it sees what a read-only mount or an access list says and a mode bit does not.
#[cfg(unix)]
fn check_writable(path: &Path) -> io::Result<()> {
    rustix::fs::access(path, rustix::fs::Access::WRITE_OK).map_err(io::Error::from)
}

/// Windows has the read-only attribute and nothing else to ask without opening the file. A
/// folder's attribute does not stop a file being created in it, so a folder always passes, as
/// `accessSync` says.
#[cfg(windows)]
fn check_writable(path: &Path) -> io::Result<()> {
    let metadata = std::fs::metadata(path)?;
    if !metadata.is_dir() && metadata.permissions().readonly() {
        Err(io::Error::from(io::ErrorKind::PermissionDenied))
    } else {
        Ok(())
    }
}

/// Creates missing folders one level at a time, only during the real apply: an `AlreadyExists`
/// per level tells a folder another process raced in from one we own, so a rollback removes only
/// ours.
fn create_missing_parents(path: &Path, created: &mut Vec<PathBuf>) -> Result<(), WriteError> {
    let mut missing: Vec<PathBuf> = Vec::new();
    let mut probe = path.parent().map(Path::to_path_buf).unwrap_or_default();
    while !probe.as_os_str().is_empty() && !probe.exists() {
        missing.push(probe.clone());
        match probe.parent() {
            Some(parent) if parent != probe => probe = parent.to_path_buf(),
            _ => break,
        }
    }
    for folder in missing.into_iter().rev() {
        match std::fs::create_dir(&folder) {
            Ok(()) => created.push(folder),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(WriteError::io("mkdir", &folder)(error)),
        }
    }
    Ok(())
}

fn read_text_lossy(path: &Path) -> Result<String, WriteError> {
    let bytes = std::fs::read(path).map_err(WriteError::io("read", path))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn apply_with_rollback(
    plan: Vec<PlanEntry>,
    options: &ApplyOptions<'_>,
) -> Result<Applied, WriteError> {
    let mut done: Vec<Step> = Vec::new();
    let mut created_folders: Vec<PathBuf> = Vec::new();
    let outcome = (|| -> Result<(), WriteError> {
        for (index, entry) in plan.into_iter().enumerate() {
            #[cfg(feature = "test-hooks")]
            if let Some(before_entry) = options.before_entry {
                before_entry(index);
            }
            #[cfg(not(feature = "test-hooks"))]
            let _ = (index, options);
            if entry.changed_on_disk() {
                return Err(WriteError::ChangedOnDisk(vec![entry.path().to_path_buf()]));
            }
            let existed = entry.path().exists();
            let before = if existed {
                Some(read_text_lossy(entry.path())?)
            } else {
                None
            };
            let bits_before = permission_bits_of(entry.path());
            match entry.operation {
                PlannedOperation::Write { content } => {
                    create_missing_parents(entry.path.as_path(), &mut created_folders)?;
                    let expectation = match before.as_deref() {
                        Some(text) => Expectation::Text(text),
                        None => Expectation::Absent,
                    };
                    write_atomically(
                        &entry.path,
                        &content,
                        &AtomicWrite {
                            expectation,
                            new_file_bits: entry.new_file_bits,
                            ..AtomicWrite::default()
                        },
                    )?;
                    done.push(Step {
                        path: entry.path,
                        operation: StepKind::Write { after: content },
                        existed,
                        before,
                        bits_before,
                    });
                }
                PlannedOperation::Delete => {
                    if let Some(text) = &before {
                        if !file_holds_text(entry.path.as_path(), text) {
                            return Err(WriteError::ChangedOnDisk(vec![entry
                                .path
                                .as_path()
                                .to_path_buf()]));
                        }
                        std::fs::remove_file(entry.path.as_path())
                            .map_err(WriteError::io("unlink", entry.path.as_path()))?;
                    }
                    done.push(Step {
                        path: entry.path,
                        operation: StepKind::Delete,
                        existed,
                        before,
                        bits_before,
                    });
                }
            }
        }
        Ok(())
    })();
    match outcome {
        Ok(()) => Ok(Applied { steps: done.len() }),
        Err(error) => Err(roll_back(done, created_folders, error)),
    }
}

fn roll_back(done: Vec<Step>, created_folders: Vec<PathBuf>, cause: WriteError) -> WriteError {
    let mut unrecovered: Vec<PathBuf> = Vec::new();
    for step in done.into_iter().rev() {
        if restore_step(&step).is_err() {
            unrecovered.push(step.path.as_path().to_path_buf());
        }
    }
    for folder in created_folders.into_iter().rev() {
        if let Err(error) = std::fs::remove_dir(&folder) {
            if error.kind() != io::ErrorKind::NotFound {
                unrecovered.push(folder);
            }
        }
    }
    let cause = Box::new(cause);
    if unrecovered.is_empty() {
        WriteError::RolledBack { cause }
    } else {
        WriteError::Inconsistent { cause, unrecovered }
    }
}

/// Puts one step back. A file someone changed since the step is left alone and reported.
fn restore_step(step: &Step) -> Result<(), WriteError> {
    let path = step.path.as_path();
    let refuse = || Err(WriteError::ChangedOnDisk(vec![path.to_path_buf()]));
    match &step.operation {
        StepKind::Write { after } => {
            if !file_holds_text(path, after) {
                return refuse();
            }
            if let (true, Some(before)) = (step.existed, &step.before) {
                put_back(&step.path, before, Expectation::Text(after), step.bits_before)
            } else if path.exists() {
                std::fs::remove_file(path)
                    .map_err(|source| WriteError::Io(IoFailure::new("unlink", path, source)))
            } else {
                Ok(())
            }
        }
        StepKind::Delete => {
            if !step.existed {
                return Ok(());
            }
            if path.exists() {
                return refuse();
            }
            match &step.before {
                Some(before) => put_back(&step.path, before, Expectation::Absent, step.bits_before),
                None => Ok(()),
            }
        }
    }
}

fn put_back(
    target: &WritablePath,
    text: &str,
    expectation: Expectation<'_>,
    bits: Option<u32>,
) -> Result<(), WriteError> {
    write_atomically(
        target,
        text,
        &AtomicWrite {
            expectation,
            restored_bits: bits,
            ..AtomicWrite::default()
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The disk decides whether `e` plus U+0301 and U+00E9 are one name (macOS: yes; Linux and NTFS:
    /// two files), and the plan must agree with it either way, so a case-only rename on one never
    /// deletes the file it just wrote and two files on the other are never merged.
    #[test]
    fn two_names_that_differ_only_in_unicode_normalization_are_one_file_exactly_when_the_disk_says() {
        let folder = tempfile::tempdir().expect("folder");
        let composed = folder.path().join("caf\u{e9}.md");
        let decomposed = folder.path().join("cafe\u{301}.md");
        std::fs::write(&composed, "x").expect("file");
        let disk_folds = decomposed.exists();
        assert_eq!(names_one_file(&composed, &decomposed), disk_folds);
        if !disk_folds {
            std::fs::write(&decomposed, "y").expect("a second file");
            assert!(!names_one_file(&composed, &decomposed));
        }
    }
}
