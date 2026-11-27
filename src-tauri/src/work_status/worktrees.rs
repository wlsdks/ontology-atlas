//! One row per worktree `git worktree list` reports, with where its head stands against the
//! base branch and who holds it.

pub(crate) mod lock;
mod remote;

#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use super::agent_processes::{AgentProcess, AgentTool};
use super::git_read::{git_read, read_admin_file, read_first_line, GitFailure};
use lock::{judge_lock, parse_lock_reason, process_start, LockState, LockTool};

const AUTHOR_MAX_CHARS: usize = 200;
/// Each row runs two `git` processes; this bounds how many run at once on a busy Mac.
const MEASURE_WORKERS: usize = 6;
/// Where a worktree's head stands against the base branch (`main` in most repositories).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Standing {
    /// The main checkout, or a worktree on the base branch itself; never a merged row.
    Base,
    /// The branch moved after it was created, and its head is an ancestor of the base off the
    /// base's first-parent line: merged.
    Merged,
    /// Nothing beyond the base: the head is on the first-parent line, or never moved from where
    /// the branch was created.
    NoCommits,
    /// The head has commits the base does not.
    Ahead,
    /// No base branch, or the head could not be measured.
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeLock {
    state: LockState,
    tool: LockTool,
    agent_id: Option<String>,
    pid: Option<u32>,
    /// Seconds since the epoch, from the reason.
    session_started_at: Option<i64>,
    /// Milliseconds since the epoch: the `locked` file's modified time.
    locked_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeRow {
    /// Git's administrative id, or `main` for the main checkout.
    id: String,
    path: String,
    branch: Option<String>,
    head: Option<String>,
    main_checkout: bool,
    missing: bool,
    standing: Standing,
    ahead: Option<u32>,
    last_commit_at: Option<i64>,
    last_commit_author: Option<String>,
    lock: Option<WorktreeLock>,
    /// The pid of an Atlas agent session whose folder lies in this worktree.
    acp_pid: Option<u32>,
    /// Agent programs whose own working folder lies in this worktree and in no deeper one.
    agent_processes: Vec<WorktreeProcess>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeProcess {
    pid: u32,
    tool: AgentTool,
    /// Seconds since the epoch.
    started_at: Option<i64>,
}

pub(super) struct RepositoryRead {
    pub(super) root: PathBuf,
    pub(super) repository: String,
    pub(super) host: Option<String>,
    pub(super) base_branch: Option<String>,
    pub(super) rows: Vec<WorktreeRow>,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct PorcelainEntry {
    pub(crate) path: String,
    pub(crate) head: Option<String>,
    pub(crate) branch: Option<String>,
    pub(crate) bare: bool,
    pub(crate) locked: Option<String>,
}

/// Parses `git worktree list --porcelain -z`: NUL-ended fields, an empty field between records.
pub(crate) fn parse_porcelain(text: &str) -> Vec<PorcelainEntry> {
    let mut entries = Vec::new();
    let mut current: Option<PorcelainEntry> = None;
    for field in text.split('\0') {
        if field.is_empty() {
            entries.extend(current.take());
            continue;
        }
        let (key, value) = field.split_once(' ').unwrap_or((field, ""));
        if key == "worktree" {
            entries.extend(current.take());
            current = Some(PorcelainEntry {
                path: value.to_string(),
                ..PorcelainEntry::default()
            });
            continue;
        }
        let Some(entry) = current.as_mut() else {
            continue;
        };
        match key {
            "HEAD" => entry.head = Some(value.to_string()),
            "branch" => {
                entry.branch = Some(
                    value
                        .strip_prefix("refs/heads/")
                        .unwrap_or(value)
                        .to_string(),
                )
            }
            "bare" => entry.bare = true,
            "locked" => entry.locked = Some(value.to_string()),
            _ => {}
        }
    }
    entries.extend(current);
    entries
}

/// What a head with nothing beyond the base can be told apart by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ZeroAheadEvidence {
    /// `None` when the base's first-parent line could not be read.
    pub(crate) on_first_parent: Option<bool>,
    /// The branch's head differs from where its reflog says it was created.
    pub(crate) moved_since_created: bool,
}

pub(crate) fn standing_of(
    is_base: bool,
    ahead: Option<u32>,
    evidence: ZeroAheadEvidence,
) -> Standing {
    if is_base {
        return Standing::Base;
    }
    match ahead {
        None => Standing::Unknown,
        Some(0) => match evidence.on_first_parent {
            None => Standing::Unknown,
            Some(true) => Standing::NoCommits,
            Some(false) if evidence.moved_since_created => Standing::Merged,
            Some(false) => Standing::NoCommits,
        },
        Some(_) => Standing::Ahead,
    }
}

fn failure_status(failure: GitFailure) -> &'static str {
    match failure {
        GitFailure::Missing => "git-missing",
        GitFailure::Unstartable => "unreadable",
        GitFailure::Refused => "no-history",
    }
}

pub(super) fn read_repository(
    chosen: &Path,
    acp_roots: &[(u32, PathBuf)],
    processes: &[AgentProcess],
) -> Result<RepositoryRead, &'static str> {
    let toplevel = git_read(chosen, &["rev-parse", "--show-toplevel"]).map_err(failure_status)?;
    let root = crate::canonical_source_root(toplevel.trim()).map_err(|_| "ungranted")?;
    let common_dir = git_read(
        &root,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )
    .map_err(failure_status)?;
    let common_dir = PathBuf::from(common_dir.trim());
    let listing =
        git_read(&root, &["worktree", "list", "--porcelain", "-z"]).map_err(failure_status)?;
    let entries = parse_porcelain(&listing);

    let base = crate::git::base_line::base_line(&|args: &[&str]| git_read(&root, args).ok());
    let base_head = base
        .as_ref()
        .and_then(|line| verified_head(&root, &line.reference));
    let base_branch = base.map(|line| line.branch);
    let admin_ids = admin_ids_by_worktree(&common_dir);
    let (host, slug) = remote::origin(&root);
    let repository = slug.unwrap_or_else(|| folder_name(&root));

    let mut rows: Vec<WorktreeRow> = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| !entry.bare)
        .filter_map(|(index, entry)| {
            let main_checkout = index == 0;
            let id = if main_checkout {
                "main".to_string()
            } else {
                admin_ids.get(&normalize(&entry.path)).cloned()?
            };
            let path = PathBuf::from(&entry.path);
            let missing = !path.exists();
            if !main_checkout
                && !missing
                && !normalize(&entry.path).starts_with(&root)
                && !points_back(&path, &common_dir, &id)
            {
                return None;
            }
            Some(base_row(entry, id, main_checkout, missing, &common_dir))
        })
        .collect();

    measure_heads(
        &root,
        &common_dir,
        &mut rows,
        base_branch.as_deref(),
        base_head.as_deref(),
    );
    attach_acp_sessions(&mut rows, acp_roots);
    attach_agent_processes(&mut rows, processes);
    Ok(RepositoryRead {
        root,
        repository,
        host,
        base_branch,
        rows,
    })
}

fn folder_name(root: &Path) -> String {
    root.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The canonical path, or for a folder that is gone, its nearest existing ancestor's canonical
/// path with the rest joined on, so a removed worktree compares in the same spelling as live ones
/// (Windows canonical paths are `\\?\C:\...`, Git's listing `C:/...`).
pub(super) fn normalize(path: &str) -> PathBuf {
    let path = PathBuf::from(path);
    if let Ok(canonical) = std::fs::canonicalize(&path) {
        return canonical;
    }
    let mut rest = Vec::new();
    let mut current = path.as_path();
    while let Some(parent) = current.parent() {
        rest.extend(current.file_name());
        if let Ok(canonical) = std::fs::canonicalize(parent) {
            return rest
                .iter()
                .rev()
                .fold(canonical, |joined, part| joined.join(part));
        }
        current = parent;
    }
    path
}

/// `<common>/worktrees/<id>/gitdir` names `<worktree>/.git`; this maps each worktree back to its id.
pub(super) fn admin_ids_by_worktree(common_dir: &Path) -> HashMap<PathBuf, String> {
    let Ok(entries) = std::fs::read_dir(common_dir.join("worktrees")) else {
        return HashMap::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().into_owned();
            let gitdir = read_admin_file(&entry.path().join("gitdir"))?;
            let worktree = Path::new(gitdir.trim())
                .parent()?
                .to_string_lossy()
                .into_owned();
            Some((normalize(&worktree), id))
        })
        .collect()
}

/// A worktree outside the chosen folder counts only when its `.git` file names this repository's
/// record for it, so a stray record cannot pull an unrelated folder onto the screen.
pub(super) fn points_back(worktree: &Path, common_dir: &Path, id: &str) -> bool {
    let Some(text) = read_admin_file(&worktree.join(".git")) else {
        return false;
    };
    let Some(target) = text.trim().strip_prefix("gitdir:") else {
        return false;
    };
    let expected = common_dir.join("worktrees").join(id);
    normalize(target.trim()) == normalize(&expected.to_string_lossy())
}

fn base_row(
    entry: &PorcelainEntry,
    id: String,
    main_checkout: bool,
    missing: bool,
    common_dir: &Path,
) -> WorktreeRow {
    let lock = entry.locked.as_ref().map(|reason| {
        let parsed = parse_lock_reason(reason);
        let state = judge_lock(parsed.as_ref(), process_start);
        let locked_at =
            std::fs::symlink_metadata(common_dir.join("worktrees").join(&id).join("locked"))
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|elapsed| elapsed.as_millis() as u64);
        WorktreeLock {
            state,
            tool: parsed
                .as_ref()
                .map_or(LockTool::Unknown, |reason| reason.tool),
            agent_id: parsed.as_ref().and_then(|reason| reason.agent_id.clone()),
            pid: parsed.as_ref().map(|reason| reason.pid),
            session_started_at: parsed.as_ref().map(|reason| reason.started_at),
            locked_at,
        }
    });
    WorktreeRow {
        id,
        path: entry.path.clone(),
        branch: entry.branch.clone(),
        head: entry.head.clone(),
        main_checkout,
        missing,
        standing: Standing::Unknown,
        ahead: None,
        last_commit_at: None,
        last_commit_author: None,
        lock,
        acp_pid: None,
        agent_processes: vec![],
    }
}

fn verified_head(root: &Path, reference: &str) -> Option<String> {
    git_read(root, &["rev-parse", "--verify", "--quiet", reference])
        .ok()
        .map(|head| head.trim().to_string())
        .filter(|head| !head.is_empty())
}

/// Two reads per row (commits beyond the base, and the last commit's time and author), spread over
/// at most `MEASURE_WORKERS` threads; the first-parent line is read once, only when some head has
/// nothing beyond the base.
fn measure_heads(
    root: &Path,
    common_dir: &Path,
    rows: &mut [WorktreeRow],
    base: Option<&str>,
    base_head: Option<&str>,
) {
    let per_worker = rows.len().div_ceil(MEASURE_WORKERS).max(1);
    std::thread::scope(|scope| {
        for chunk in rows.chunks_mut(per_worker) {
            scope.spawn(move || {
                for row in chunk {
                    measure_head(root, row, base, base_head);
                }
            });
        }
    });
    let Some(base_head) = base_head else {
        for row in rows.iter_mut() {
            row.standing = Standing::Unknown;
        }
        return;
    };
    let needs_line = rows
        .iter()
        .any(|row| !is_base_row(row, base) && row.ahead == Some(0));
    let first_parent: Option<HashSet<String>> = if needs_line {
        git_read(root, &["rev-list", "--first-parent", base_head])
            .ok()
            .map(|text| text.lines().map(str::to_string).collect())
    } else {
        Some(HashSet::new())
    };
    for row in rows.iter_mut() {
        let is_base = is_base_row(row, base);
        let evidence = ZeroAheadEvidence {
            on_first_parent: first_parent
                .as_ref()
                .map(|line| row.head.as_ref().is_some_and(|head| line.contains(head))),
            moved_since_created: !is_base
                && row.ahead == Some(0)
                && moved_since_created(common_dir, row),
        };
        row.standing = standing_of(is_base, row.ahead, evidence);
    }
}

/// The first reflog entry's new id is where the branch was created; a head still there never
/// moved, so it has nothing that could have been merged. A detached head reads its own log.
fn moved_since_created(common_dir: &Path, row: &WorktreeRow) -> bool {
    let Some(head) = row.head.as_deref() else {
        return false;
    };
    let log = match row.branch.as_deref() {
        Some(branch) if is_plain_ref_name(branch) => common_dir
            .join("logs")
            .join("refs")
            .join("heads")
            .join(branch),
        Some(_) => return false,
        None => common_dir
            .join("worktrees")
            .join(&row.id)
            .join("logs")
            .join("HEAD"),
    };
    read_first_line(&log)
        .and_then(|line| line.split_whitespace().nth(1).map(str::to_string))
        .is_some_and(|created| created != head)
}

/// Git refuses `..` and empty components in a branch name; this keeps the reflog path inside
/// `logs/refs/heads` even for a listing Atlas did not expect.
pub(super) fn is_plain_ref_name(branch: &str) -> bool {
    branch
        .split('/')
        .all(|part| !part.is_empty() && part != "." && part != ".." && !part.contains('\\'))
}

fn is_base_row(row: &WorktreeRow, base: Option<&str>) -> bool {
    row.main_checkout || (base.is_some() && row.branch.as_deref() == base)
}

fn measure_head(root: &Path, row: &mut WorktreeRow, base: Option<&str>, base_head: Option<&str>) {
    let Some(head) = row.head.clone() else {
        return;
    };
    if let Some(base_head) = base_head.filter(|_| base.is_some()) {
        let range = format!("{base_head}..{head}");
        row.ahead = git_read(root, &["rev-list", "--count", &range])
            .ok()
            .and_then(|count| count.trim().parse().ok());
    }
    let last = git_read(
        root,
        &[
            "log",
            "-1",
            "--no-show-signature",
            "--format=%ct%x00%an",
            &head,
            "--",
        ],
    );
    if let Ok(text) = last {
        let (time, author) = text
            .trim_end()
            .split_once('\0')
            .unwrap_or((text.trim_end(), ""));
        row.last_commit_at = time.parse().ok();
        row.last_commit_author = Some(author.chars().take(AUTHOR_MAX_CHARS).collect())
            .filter(|author: &String| !author.is_empty());
    }
}

/// Index of the deepest worktree containing a folder, on whole path components. A missing worktree
/// still claims its folder, so work in a removed nested worktree never falls to its parent.
/// O(rows) per folder over paths normalized once.
fn deepest_row(paths: &[PathBuf], folder: &Path) -> Option<usize> {
    paths
        .iter()
        .enumerate()
        .filter(|(_, path)| folder.starts_with(path))
        .max_by_key(|(_, path)| path.components().count())
        .map(|(index, _)| index)
}

fn normalized_paths(rows: &[WorktreeRow]) -> Vec<PathBuf> {
    rows.iter().map(|row| normalize(&row.path)).collect()
}

fn attach_acp_sessions(rows: &mut [WorktreeRow], acp_roots: &[(u32, PathBuf)]) {
    let paths = normalized_paths(rows);
    for (pid, folder) in acp_roots {
        if let Some(row) = deepest_row(&paths, folder).and_then(|index| rows.get_mut(index)) {
            if !row.missing {
                row.acp_pid = Some(*pid);
            }
        }
    }
}

/// One entry per agent per worktree, however many of its folders the agent works in.
pub(crate) fn attach_agent_processes(rows: &mut [WorktreeRow], processes: &[AgentProcess]) {
    let paths = normalized_paths(rows);
    for process in processes {
        let folder = normalize(&process.folder.to_string_lossy());
        let Some(row) = deepest_row(&paths, &folder).and_then(|index| rows.get_mut(index)) else {
            continue;
        };
        if row.missing
            || row
                .agent_processes
                .iter()
                .any(|known| known.pid == process.pid)
        {
            continue;
        }
        row.agent_processes.push(WorktreeProcess {
            pid: process.pid,
            tool: process.tool,
            started_at: process.started_at,
        });
    }
    for row in rows.iter_mut() {
        row.agent_processes.sort_by_key(|process| process.pid);
    }
}
