use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use super::git_read::read_admin_file;

/// Files whose modified time moves when a worktree commits, switches branch, or is locked.
const PER_WORKTREE_FILES: &[&str] = &["HEAD", "locked", "logs/HEAD"];
const REPOSITORY_FILES: &[&str] = &["HEAD", "logs/HEAD", "packed-refs", "worktrees"];

/// Stats a fixed set of administrative files; reads no content beyond the `.git` pointer.
pub(super) fn admin_fingerprint(root: &Path) -> Option<String> {
    let common = common_dir(root)?;
    let mut hasher = DefaultHasher::new();
    for name in REPOSITORY_FILES {
        modified(&common.join(name)).hash(&mut hasher);
    }
    let mut ids: Vec<_> = std::fs::read_dir(common.join("worktrees"))
        .map(|entries| entries.flatten().map(|entry| entry.file_name()).collect())
        .unwrap_or_default();
    ids.sort();
    for id in ids {
        id.hash(&mut hasher);
        let admin = common.join("worktrees").join(&id);
        for name in PER_WORKTREE_FILES {
            modified(&admin.join(name)).hash(&mut hasher);
        }
    }
    Some(format!("{:016x}", hasher.finish()))
}

fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::symlink_metadata(path).and_then(|meta| meta.modified()).ok()
}

/// `.git` is the common directory in the main checkout; in a linked worktree it is a file naming
/// that worktree's record, whose `commondir` leads back.
fn common_dir(root: &Path) -> Option<PathBuf> {
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
