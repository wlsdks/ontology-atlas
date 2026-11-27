//! Writes and deletes of several files as one unit. Any failure while the process lives leaves the
//! vault as it started: every target's permission is checked first, and a later failure puts the
//! original bytes back. Not crash-safe, hence not "atomic": that needs a journal, and the vault is
//! Git.
//!
//! The caller checks what only it can know before applying: that no target carries a reservation
//! for a person (`review_state: human_decides`), and it forgets any cached parse of a file when
//! [`WriteError::ChangedOnDisk`] or [`WriteError::Conflict`] names it.

use std::collections::HashSet;
use std::io;
use std::path::{Path, PathBuf};

use crate::atomic_write::{
    file_holds_text, modified_time_of, write_atomically, AtomicWrite, Expectation, WriteError,
};
use crate::modified_time::ModifiedTime;
use crate::real_paths::real_path;
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
}

impl PlanEntry {
    pub fn write(path: WritablePath, content: String) -> Self {
        Self {
            path,
            operation: PlannedOperation::Write { content },
            expected_text: None,
            expected_absent: false,
            expected_modified: None,
        }
    }

    pub fn delete(path: WritablePath) -> Self {
        Self {
            path,
            operation: PlannedOperation::Delete,
            expected_text: None,
            expected_absent: false,
            expected_modified: None,
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
        match self.expected_modified {
            None => false,
            Some(expected) => {
                modified_time_of(self.path()).is_none_or(|current| expected.differs_from(current))
            }
        }
    }
}

/// How a plan is applied.
#[derive(Default)]
pub struct ApplyOptions<'a> {
    /// Refuse an entry that carries no snapshot of what it replaces.
    pub require_revisions: bool,
    /// Runs before each entry, with its index; a test parks a racing edit here.
    pub before_entry: Option<&'a dyn Fn(usize)>,
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
    apply_with_rollback(&plan, options)
}

/// A plan that writes then deletes one file drops the delete: a case-only rename (write
/// `auth.md`, delete `Auth.md`) names one file on macOS and Windows, so the delete would erase
/// what was just written.
fn without_deletes_of_written_files(plan: Vec<PlanEntry>) -> Vec<PlanEntry> {
    let written: HashSet<String> = plan
        .iter()
        .filter(|entry| entry.is_write())
        .map(|entry| same_file_key(entry.path()))
        .collect();
    plan.into_iter()
        .filter(|entry| entry.is_write() || !written.contains(&same_file_key(entry.path())))
        .collect()
}

/// A key for "do these paths name the same file": the real path when it exists, else the path as
/// written, lower-cased for case-insensitive file systems. On a case-sensitive one a false match
/// costs one skipped delete, never data.
fn same_file_key(path: &Path) -> String {
    let named = if path.exists() {
        real_path(path).unwrap_or_else(|_| path.to_path_buf())
    } else {
        path.to_path_buf()
    };
    named.to_string_lossy().to_lowercase()
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
    let mut blocked: Vec<(PathBuf, &'static str)> = Vec::new();
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
            blocked.push((path.to_path_buf(), error_code(&error)));
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

#[cfg(unix)]
fn check_writable(path: &Path) -> io::Result<()> {
    use std::os::unix::ffi::OsStrExt;
    let name = std::ffi::CString::new(path.as_os_str().as_bytes())
        .map_err(|_| io::Error::from(io::ErrorKind::InvalidInput))?;
    // SAFETY: `name` is a NUL-terminated string that outlives the call, and `access` only reads it.
    let status = unsafe { libc::access(name.as_ptr(), libc::W_OK) };
    if status == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

/// Windows has the read-only attribute and nothing else to ask without opening the file.
#[cfg(windows)]
fn check_writable(path: &Path) -> io::Result<()> {
    if std::fs::metadata(path)?.permissions().readonly() {
        Err(io::Error::from(io::ErrorKind::PermissionDenied))
    } else {
        Ok(())
    }
}

/// The error name JavaScript shows for the failures a permission check meets.
fn error_code(error: &io::Error) -> &'static str {
    #[cfg(unix)]
    match error.raw_os_error() {
        Some(libc::EPERM) => return "EPERM",
        Some(libc::ENOENT) => return "ENOENT",
        Some(libc::EROFS) => return "EROFS",
        Some(libc::ENOTDIR) => return "ENOTDIR",
        Some(libc::ELOOP) => return "ELOOP",
        Some(libc::ENAMETOOLONG) => return "ENAMETOOLONG",
        _ => {}
    }
    match error.kind() {
        io::ErrorKind::NotFound => "ENOENT",
        _ if cfg!(windows) => "EPERM",
        _ => "EACCES",
    }
}

/// Creates missing folders one level at a time, only during the real apply: an `AlreadyExists`
/// per level tells a folder another process raced in from one we own, so a rollback removes only
/// ours.
fn create_missing_parents(path: &Path, created: &mut Vec<PathBuf>) -> io::Result<()> {
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
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn read_text_lossy(path: &Path) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&std::fs::read(path)?).into_owned())
}

fn apply_with_rollback(
    plan: &[PlanEntry],
    options: &ApplyOptions<'_>,
) -> Result<Applied, WriteError> {
    let mut done: Vec<Step> = Vec::new();
    let mut created_folders: Vec<PathBuf> = Vec::new();
    let outcome = (|| -> Result<(), WriteError> {
        for (index, entry) in plan.iter().enumerate() {
            if let Some(before_entry) = options.before_entry {
                before_entry(index);
            }
            if entry.changed_on_disk() {
                return Err(WriteError::ChangedOnDisk(vec![entry.path().to_path_buf()]));
            }
            let existed = entry.path().exists();
            let before = if existed {
                Some(read_text_lossy(entry.path())?)
            } else {
                None
            };
            match &entry.operation {
                PlannedOperation::Write { content } => {
                    create_missing_parents(entry.path(), &mut created_folders)?;
                    let expectation = match &before {
                        Some(text) => Expectation::Text(text.clone()),
                        None => Expectation::Absent,
                    };
                    write_atomically(
                        &entry.path,
                        content,
                        &AtomicWrite {
                            expectation,
                            ..AtomicWrite::default()
                        },
                    )?;
                    done.push(Step {
                        path: entry.path.clone(),
                        operation: StepKind::Write {
                            after: content.clone(),
                        },
                        existed,
                        before,
                    });
                }
                PlannedOperation::Delete => {
                    if let Some(text) = &before {
                        if !file_holds_text(entry.path(), text) {
                            return Err(WriteError::ChangedOnDisk(vec![entry
                                .path()
                                .to_path_buf()]));
                        }
                        std::fs::remove_file(entry.path())?;
                    }
                    done.push(Step {
                        path: entry.path.clone(),
                        operation: StepKind::Delete,
                        existed,
                        before,
                    });
                }
            }
        }
        Ok(())
    })();
    match outcome {
        Ok(()) => Ok(Applied { steps: done.len() }),
        Err(error) => Err(roll_back(done, created_folders, &error)),
    }
}

fn roll_back(done: Vec<Step>, created_folders: Vec<PathBuf>, cause: &WriteError) -> WriteError {
    let mut unrecovered: Vec<PathBuf> = Vec::new();
    for step in done.into_iter().rev() {
        let restored = restore_step(&step);
        if restored.is_err() {
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
    let reason = cause.to_string();
    if unrecovered.is_empty() {
        WriteError::RolledBack { reason }
    } else {
        WriteError::Inconsistent {
            reason,
            unrecovered,
        }
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
                put_back(&step.path, before, Expectation::Text(after.clone()))
            } else if path.exists() {
                std::fs::remove_file(path).map_err(WriteError::from)
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
                Some(before) => put_back(&step.path, before, Expectation::Absent),
                None => Ok(()),
            }
        }
    }
}

fn put_back(target: &WritablePath, text: &str, expectation: Expectation) -> Result<(), WriteError> {
    write_atomically(
        target,
        text,
        &AtomicWrite {
            expectation,
            ..AtomicWrite::default()
        },
    )
}
