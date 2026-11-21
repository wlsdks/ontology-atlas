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

use super::git_read::{git_read, read_admin_file, GitFailure};
use lock::{judge_lock, parse_lock_reason, process_start, LockState, LockTool};

const AUTHOR_MAX_CHARS: usize = 200;
const BASE_CANDIDATES: &[&str] = &["main", "master"];

/// Where a worktree's head stands against the base branch (`main` in most repositories).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Standing {
    /// The main checkout, or a worktree on the base branch itself; never a merged row.
    Base,
    /// The head is an ancestor of the base and not on its first-parent line: merged.
    Merged,
    /// The head is on the base's first-parent line, so the branch has nothing of its own.
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

pub(crate) fn standing_of(is_base: bool, ahead: Option<u32>, on_first_parent: bool) -> Standing {
    if is_base {
        return Standing::Base;
    }
    match ahead {
        None => Standing::Unknown,
        Some(0) if on_first_parent => Standing::NoCommits,
        Some(0) => Standing::Merged,
        Some(_) => Standing::Ahead,
    }
}

fn failure_status(failure: GitFailure) -> &'static str {
    match failure {
        GitFailure::Missing => "git-missing",
        GitFailure::Refused => "no-history",
    }
}

pub(super) fn read_repository(
    chosen: &Path,
    acp_roots: &[(u32, PathBuf)],
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

    let base_branch = base_branch(&root);
    let base_head = base_branch
        .as_deref()
        .and_then(|branch| verified_branch_head(&root, branch));
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
                && !path.starts_with(&root)
                && !points_back(&path, &common_dir, &id)
            {
                return None;
            }
            Some(base_row(entry, id, main_checkout, missing, &common_dir))
        })
        .collect();

    measure_heads(
        &root,
        &mut rows,
        base_branch.as_deref(),
        base_head.as_deref(),
    );
    attach_acp_sessions(&mut rows, acp_roots);
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

fn normalize(path: &str) -> PathBuf {
    let path = PathBuf::from(path);
    std::fs::canonicalize(&path).unwrap_or(path)
}

/// `<common>/worktrees/<id>/gitdir` names `<worktree>/.git`; this maps each worktree back to its id.
fn admin_ids_by_worktree(common_dir: &Path) -> HashMap<PathBuf, String> {
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
fn points_back(worktree: &Path, common_dir: &Path, id: &str) -> bool {
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
        let locked_at = std::fs::metadata(common_dir.join("worktrees").join(&id).join("locked"))
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
    }
}

fn base_branch(root: &Path) -> Option<String> {
    let remote_head = git_read(
        root,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    )
    .ok();
    let from_remote = remote_head
        .as_deref()
        .and_then(|name| name.trim().strip_prefix("refs/remotes/origin/"))
        .map(str::to_string);
    from_remote
        .into_iter()
        .chain(BASE_CANDIDATES.iter().map(|name| name.to_string()))
        .find(|name| verified_branch_head(root, name).is_some())
}

fn verified_branch_head(root: &Path, branch: &str) -> Option<String> {
    let reference = format!("refs/heads/{branch}");
    git_read(root, &["rev-parse", "--verify", "--quiet", &reference])
        .ok()
        .map(|head| head.trim().to_string())
        .filter(|head| !head.is_empty())
}

/// Two reads per row (commits beyond the base, and the last commit's time and author), run in
/// parallel; the first-parent line is read once, only when some head has nothing beyond the base.
fn measure_heads(
    root: &Path,
    rows: &mut [WorktreeRow],
    base: Option<&str>,
    base_head: Option<&str>,
) {
    std::thread::scope(|scope| {
        for row in rows.iter_mut() {
            scope.spawn(move || measure_head(root, row, base, base_head));
        }
    });
    let Some(base_head) = base_head else {
        for row in rows.iter_mut() {
            row.standing = standing_of(row.main_checkout, None, false);
        }
        return;
    };
    let needs_line = rows
        .iter()
        .any(|row| !is_base_row(row, base) && row.ahead == Some(0));
    let first_parent: HashSet<String> = if needs_line {
        git_read(root, &["rev-list", "--first-parent", base_head])
            .map(|text| text.lines().map(str::to_string).collect())
            .unwrap_or_default()
    } else {
        HashSet::new()
    };
    for row in rows.iter_mut() {
        let on_line = row
            .head
            .as_ref()
            .is_some_and(|head| first_parent.contains(head));
        row.standing = standing_of(is_base_row(row, base), row.ahead, on_line);
    }
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

/// An Atlas agent session belongs to the deepest worktree containing its folder, on whole components.
fn attach_acp_sessions(rows: &mut [WorktreeRow], acp_roots: &[(u32, PathBuf)]) {
    for (pid, folder) in acp_roots {
        let deepest = rows
            .iter_mut()
            .filter(|row| !row.missing && folder.starts_with(normalize(&row.path)))
            .max_by_key(|row| Path::new(&row.path).components().count());
        if let Some(row) = deepest {
            row.acp_pid = Some(*pid);
        }
    }
}
