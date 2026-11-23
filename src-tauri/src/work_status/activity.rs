//! What one worktree is doing: the subjects of its newest commits beyond the base branch (or the
//! base branch's own newest, for the worktree standing on it), how many files it has not
//! committed, and which of them changed last. Read for one worktree at a time,
//! only when the page asks after that worktree's `HEAD`, `index` or reflog moved or on its beat.

#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::SystemTime;

use serde::Serialize;

use super::fingerprint::common_dir;
use super::git_read::{git_read, read_admin_file};
use super::worktrees::{is_plain_ref_name, points_back};

/// A commit subject is text anyone with push access wrote; the page shows at most this much of it.
pub(crate) const SUBJECT_MAX_CHARS: usize = 200;
/// The most commits a screen lists: three in a row of rooms, up to this many in a room alone on the stage.
const COMMITS_READ: usize = 20;
/// A worktree with more uncommitted entries than this is counted in full, but only these are
/// stat'd for the one that changed last.
const STAT_LIMIT: usize = 500;
/// The most uncommitted paths the page lists by name: three columns of twenty rows on a room that
/// is alone on the page. The count still covers them all.
const FILES_LISTED: usize = 60;
const MAIN_ID: &str = "main";
/// The files that move when a worktree commits, switches branch or stages a change.
const STAMP_FILES: &[&str] = &["HEAD", "index", "logs/HEAD"];
const FIELD: char = '\u{1f}';

/// One read at a time across the app, however many pages ask.
static READING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommitLine {
    pub(crate) hash: String,
    /// Plain text: control and direction-override characters removed, at most 200 characters.
    pub(crate) subject: String,
    /// Seconds since the epoch.
    pub(crate) at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangedFile {
    /// Relative to the worktree, in Git's `/` spelling.
    pub(crate) path: String,
    /// When the file was last written, in seconds since the epoch.
    pub(crate) changed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeActivity {
    /// The stamp of `HEAD`, `index` and the reflog this read followed.
    pub(crate) stamp: String,
    /// Newest first; `None` when the base branch is unknown or the log could not be read.
    pub(crate) commits: Option<Vec<CommitLine>>,
    /// Whether the worktree stands on the base branch, so `commits` are that branch's own newest
    /// rather than the commits beyond it.
    pub(crate) on_base: bool,
    /// Tracked files changed and untracked entries (an untracked folder counts once).
    pub(crate) uncommitted: Option<u32>,
    /// The uncommitted path, relative to the worktree in Git's `/` spelling, that changed last.
    pub(crate) latest_file: Option<String>,
    /// The uncommitted files, last changed first, at most `FILES_LISTED`.
    pub(crate) files: Vec<ChangedFile>,
}

/// Stats only: one stamp per worktree, keyed by its administrative id (`main` for the main
/// checkout), so the page knows which worktree's activity to read again.
pub(super) fn activity_stamps(root: &Path) -> Option<BTreeMap<String, String>> {
    let common = common_dir(root)?;
    let mut stamps = BTreeMap::new();
    if main_folder(&common).is_some() {
        stamps.insert(MAIN_ID.to_string(), stamp_of(&common));
    }
    let entries = std::fs::read_dir(common.join("worktrees")).ok();
    for entry in entries.into_iter().flatten().flatten() {
        let id = entry.file_name().to_string_lossy().into_owned();
        if is_admin_id(&id) {
            stamps.insert(id, stamp_of(&entry.path()));
        }
    }
    Some(stamps)
}

/// Reads one worktree, named by its administrative id, never by a path the page sends. Returns
/// `None` while another read runs, or when the id names no worktree of this repository.
pub(super) fn read_activity(
    root: &Path,
    id: &str,
    base_branch: Option<&str>,
) -> Option<WorktreeActivity> {
    if READING.swap(true, Ordering::Acquire) {
        return None;
    }
    let base_branch =
        base_branch.filter(|branch| is_plain_ref_name(branch) && !branch.starts_with('-'));
    let read = resolve(root, id).map(|(admin, folder)| {
        let on_base = base_branch.is_some_and(|branch| stands_on(&admin, branch));
        WorktreeActivity {
            stamp: stamp_of(&admin),
            commits: base_branch.and_then(|branch| {
                let range = if on_base {
                    "HEAD".to_string()
                } else {
                    format!("refs/heads/{branch}..HEAD")
                };
                newest_commits(&folder, &range)
            }),
            on_base,
            ..uncommitted(&folder)
        }
    });
    READING.store(false, Ordering::Release);
    read
}

/// Whether the worktree's `HEAD` is attached to this branch.
fn stands_on(admin: &Path, branch: &str) -> bool {
    read_admin_file(&admin.join("HEAD"))
        .is_some_and(|head| head.trim().strip_prefix("ref: refs/heads/") == Some(branch))
}

/// The worktree's administrative folder and its working folder. A linked worktree counts only
/// when its record and its `.git` file point at each other.
fn resolve(root: &Path, id: &str) -> Option<(PathBuf, PathBuf)> {
    let common = common_dir(root)?;
    if id == MAIN_ID {
        let folder = main_folder(&common)?;
        return Some((common, folder));
    }
    if !is_admin_id(id) {
        return None;
    }
    let admin = common.join("worktrees").join(id);
    if !std::fs::symlink_metadata(&admin).ok()?.is_dir() {
        return None;
    }
    let gitdir = read_admin_file(&admin.join("gitdir"))?;
    let folder = Path::new(gitdir.trim()).parent()?.to_path_buf();
    let is_folder = std::fs::symlink_metadata(&folder).ok()?.is_dir();
    (is_folder && points_back(&folder, &common, id)).then_some((admin, folder))
}

/// The main checkout is the folder holding the common `.git` directory; a bare repository has none.
fn main_folder(common: &Path) -> Option<PathBuf> {
    if common.file_name()? != ".git" {
        return None;
    }
    common.parent().map(Path::to_path_buf)
}

/// Git names a worktree's record after its folder: one plain path component.
fn is_admin_id(id: &str) -> bool {
    !id.is_empty() && id != "." && id != ".." && !id.contains(['/', '\\'])
}

fn stamp_of(admin: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    for name in STAMP_FILES {
        let meta = std::fs::symlink_metadata(admin.join(name)).ok();
        meta.as_ref()
            .and_then(|meta| meta.modified().ok())
            .map(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
            .hash(&mut hasher);
        meta.map(|meta| meta.len()).hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

fn newest_commits(folder: &Path, range: &str) -> Option<Vec<CommitLine>> {
    let count = format!("-{COMMITS_READ}");
    let text = git_read(
        folder,
        &[
            "log",
            &count,
            "--no-show-signature",
            "--no-color",
            "-z",
            "--format=%h%x1f%ct%x1f%s",
            range,
            "--",
        ],
    )
    .ok()?;
    Some(parse_log(&text))
}

/// Parses `git log -z --format=%h%x1f%ct%x1f%s`: NUL-ended records whose subject comes last, so a
/// subject holding the field separator stays whole.
pub(crate) fn parse_log(text: &str) -> Vec<CommitLine> {
    text.split('\0')
        .filter_map(|record| {
            let mut fields = record.trim_start_matches('\n').splitn(3, FIELD);
            let hash = fields.next()?;
            let at = fields.next()?;
            let subject = fields.next()?;
            let is_hash =
                (4..=64).contains(&hash.len()) && hash.chars().all(|c| c.is_ascii_hexdigit());
            is_hash.then(|| CommitLine {
                hash: hash.to_string(),
                subject: clean_subject(subject),
                at: at.parse().ok(),
            })
        })
        .take(COMMITS_READ)
        .collect()
}

/// A subject as plain text: control characters become spaces, characters that reorder or hide
/// text are dropped, runs of space collapse, and at most `SUBJECT_MAX_CHARS` remain.
pub(crate) fn clean_subject(raw: &str) -> String {
    let spaced: String = raw
        .chars()
        .filter(|c| !is_hidden_format(*c))
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let words: Vec<&str> = spaced.split_whitespace().collect();
    words.join(" ").chars().take(SUBJECT_MAX_CHARS).collect()
}

/// Bidirectional overrides and isolates, and zero-width marks: they can make a subject read as
/// something it is not.
fn is_hidden_format(c: char) -> bool {
    matches!(c, '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{2069}' | '\u{feff}')
}

fn uncommitted(folder: &Path) -> WorktreeActivity {
    let status = git_read(
        folder,
        &[
            "status",
            "--porcelain=v2",
            "-z",
            "--no-renames",
            "--ignore-submodules=all",
            "--untracked-files=normal",
        ],
    )
    .ok();
    let paths = status.as_deref().map(parse_status).unwrap_or_default();
    let files = last_changed_first(folder, &paths);
    WorktreeActivity {
        stamp: String::new(),
        commits: None,
        on_base: false,
        uncommitted: status.map(|_| u32::try_from(paths.len()).unwrap_or(u32::MAX)),
        latest_file: files.first().map(|file| file.path.clone()),
        files,
    }
}

/// The paths `git status --porcelain=v2 -z` lists as changed, unmerged or untracked.
pub(crate) fn parse_status(text: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let mut fields = text.split('\0');
    while let Some(field) = fields.next() {
        // Fields before the path: `1` has eight, `2` nine (then its source path), `u` ten.
        let before = match field.as_bytes().first() {
            Some(b'1') => 8,
            Some(b'2') => 9,
            Some(b'u') => 10,
            Some(b'?') => 1,
            _ => continue,
        };
        if let Some(path) = field
            .splitn(before + 1, ' ')
            .nth(before)
            .filter(|path| !path.is_empty())
        {
            paths.push(path.to_string());
        }
        if field.starts_with('2') {
            fields.next();
        }
    }
    paths
}

/// The `FILES_LISTED` paths that changed last, newest first. A path that no longer stats (a
/// deletion) has no time and is left out. One stat per path, then a sort of at most `STAT_LIMIT`.
fn last_changed_first(folder: &Path, paths: &[String]) -> Vec<ChangedFile> {
    let mut timed: Vec<_> = paths
        .iter()
        .take(STAT_LIMIT)
        .filter_map(|path| {
            let modified = std::fs::symlink_metadata(join_git_path(folder, path))
                .and_then(|meta| meta.modified())
                .ok()?;
            Some((modified, path))
        })
        .collect();
    timed.sort_by_key(|a| std::cmp::Reverse(a.0));
    timed
        .into_iter()
        .take(FILES_LISTED)
        .map(|(modified, path)| ChangedFile {
            path: path.clone(),
            changed_at: modified
                .duration_since(SystemTime::UNIX_EPOCH)
                .ok()
                .and_then(|since| i64::try_from(since.as_secs()).ok()),
        })
        .collect()
}

/// Joins Git's `/`-separated relative path one component at a time, so it reads the same on
/// Windows, and never climbs out of the folder.
pub(crate) fn join_git_path(folder: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .fold(folder.to_path_buf(), |joined, part| joined.join(part))
}
