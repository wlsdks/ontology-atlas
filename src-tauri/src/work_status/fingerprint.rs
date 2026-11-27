use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use super::agent_processes::AgentProcess;
use super::git_read::read_admin_file;
use super::worktrees::lock::{parse_lock_reason, process_start};

/// Files whose modified time moves when a worktree commits, switches branch, or is locked.
const PER_WORKTREE_FILES: &[&str] = &["HEAD", "locked", "logs/HEAD"];
const REPOSITORY_FILES: &[&str] = &["HEAD", "logs/HEAD", "packed-refs", "worktrees"];
/// A merge landed by `git fetch origin main:main` moves only the base's loose ref, and a plain
/// fetch only `origin/<base>`'s.
const BASE_CANDIDATES: &[&str] = &["main", "master"];
const REMOTE_HEAD_PREFIX: &str = "ref: refs/remotes/origin/";

/// Stats a fixed set of administrative files and asks whether each locked pid still runs, so an
/// ended session changes the digest even though no file did; adds which agent works in which
/// worktree folder. Reads no content beyond the `.git` pointer, `origin/HEAD`, the lock reasons and
/// each record's `gitdir`.
pub(super) fn admin_fingerprint(root: &Path, processes: &[AgentProcess]) -> Option<String> {
    let common = common_dir(root)?;
    let mut hasher = DefaultHasher::new();
    for name in REPOSITORY_FILES {
        modified(&common.join(name)).hash(&mut hasher);
    }
    for branch in base_branches(&common) {
        modified(&common.join("refs").join("heads").join(&branch)).hash(&mut hasher);
        modified(&common.join("refs/remotes/origin").join(&branch)).hash(&mut hasher);
    }
    let mut ids: Vec<_> = std::fs::read_dir(common.join("worktrees"))
        .map(|entries| entries.flatten().map(|entry| entry.file_name()).collect())
        .unwrap_or_default();
    ids.sort();
    let mut folders: Vec<PathBuf> = vec![root.to_path_buf()];
    for id in &ids {
        let gitdir = read_admin_file(&common.join("worktrees").join(id).join("gitdir"));
        let folder = gitdir
            .as_deref()
            .and_then(|text| Path::new(text.trim()).parent());
        // A removed worktree keeps its folder, so work there never counts for its parent.
        folders.extend(
            folder.map(|folder| std::fs::canonicalize(folder).unwrap_or_else(|_| folder.into())),
        );
    }
    let mut placed: Vec<(u32, &PathBuf)> = processes
        .iter()
        .filter_map(|process| {
            let worktree = folders
                .iter()
                .filter(|folder| process.folder.starts_with(folder))
                .max_by_key(|folder| folder.components().count())?;
            Some((process.pid, worktree))
        })
        .collect();
    placed.sort();
    placed.dedup();
    placed.hash(&mut hasher);
    for id in ids {
        id.hash(&mut hasher);
        let admin = common.join("worktrees").join(&id);
        for name in PER_WORKTREE_FILES {
            modified(&admin.join(name)).hash(&mut hasher);
        }
        read_admin_file(&admin.join("locked"))
            .and_then(|reason| parse_lock_reason(&reason))
            .map(|reason| process_start(reason.pid))
            .hash(&mut hasher);
    }
    Some(format!("{:016x}", hasher.finish()))
}

fn base_branches(common: &Path) -> Vec<String> {
    let remote_head = read_admin_file(&common.join("refs/remotes/origin/HEAD"))
        .and_then(|text| {
            text.trim()
                .strip_prefix(REMOTE_HEAD_PREFIX)
                .map(str::to_string)
        })
        .filter(|name| !name.split('/').any(|part| part.is_empty() || part == ".."));
    remote_head
        .into_iter()
        .chain(BASE_CANDIDATES.iter().map(|name| name.to_string()))
        .collect()
}

fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::symlink_metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
}

/// `.git` is the common directory in the main checkout; in a linked worktree it is a file naming
/// that worktree's record, whose `commondir` leads back.
pub(super) fn common_dir(root: &Path) -> Option<PathBuf> {
    let dot_git = root.join(".git");
    let meta = std::fs::symlink_metadata(&dot_git).ok()?;
    if meta.is_dir() {
        return Some(dot_git);
    }
    let pointer = read_admin_file(&dot_git)?;
    let record = root.join(pointer.trim().strip_prefix("gitdir:")?.trim());
    let common = read_admin_file(&record.join("commondir"))?;
    std::fs::canonicalize(record.join(common.trim())).ok()
}
