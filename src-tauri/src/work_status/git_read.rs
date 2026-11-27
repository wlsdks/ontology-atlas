use std::fs::{File, OpenOptions};
use std::io::Read;
use std::path::Path;
use std::process::Stdio;

/// Administrative files hold one path or one line; anything larger is not Git's.
const ADMIN_FILE_CAP_BYTES: u64 = 4 * 1024;
/// A reflog line is two object ids, an identity, a time and a short message.
const FIRST_LINE_CAP_BYTES: u64 = 1024;

pub(super) enum GitFailure {
    /// No `git` program on the path.
    Missing,
    /// `git` exists but could not be started.
    Unstartable,
    /// Git ran and refused.
    Refused,
}

/// A local read through the runner's hardened base (no hooks, no fsmonitor, no bare repository
/// planted in the tree) that also refuses lazy fetches and every transport, and never runs a diff,
/// textconv or signature program the repository names.
pub(super) fn git_read(cwd: &Path, args: &[&str]) -> Result<String, GitFailure> {
    let output = crate::git::hardened_base_command()
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C")
        .args(crate::git::with_diff_family_guard(args))
        .current_dir(cwd)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => GitFailure::Missing,
            _ => GitFailure::Unstartable,
        })?;
    if !output.status.success() {
        return Err(GitFailure::Refused);
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// The reference the base branch is measured at. Pull requests merge on the remote and the
/// local branch is often left behind, so a fetched `origin/<branch>` that contains the local one
/// wins; a local branch holding commits the remote lacks stays the base.
pub(super) fn base_reference(cwd: &Path, branch: &str) -> Option<String> {
    let local = format!("refs/heads/{branch}");
    let remote = format!("refs/remotes/origin/{branch}");
    let exists = |reference: &str| {
        git_read(cwd, &["rev-parse", "--verify", "--quiet", reference])
            .is_ok_and(|head| !head.trim().is_empty())
    };
    match (exists(&local), exists(&remote)) {
        (true, true) => {
            let local_is_behind =
                git_read(cwd, &["merge-base", "--is-ancestor", &local, &remote]).is_ok();
            Some(if local_is_behind { remote } else { local })
        }
        (true, false) => Some(local),
        (false, true) => Some(remote),
        (false, false) => None,
    }
}

/// Reads a small file without following a link at its last component.
pub(super) fn read_admin_file(path: &Path) -> Option<String> {
    let file = open_no_follow(path).ok()?;
    if !file.metadata().ok()?.is_file() {
        return None;
    }
    let mut text = String::new();
    file.take(ADMIN_FILE_CAP_BYTES + 1)
        .read_to_string(&mut text)
        .ok()?;
    (text.len() as u64 <= ADMIN_FILE_CAP_BYTES).then_some(text)
}

/// The first line of a log Git appends to, without reading the rest of it.
pub(super) fn read_first_line(path: &Path) -> Option<String> {
    let file = open_no_follow(path).ok()?;
    let mut head = Vec::new();
    file.take(FIRST_LINE_CAP_BYTES)
        .read_to_end(&mut head)
        .ok()?;
    let head = String::from_utf8_lossy(&head);
    head.lines().next().map(str::to_string)
}

#[cfg(unix)]
fn open_no_follow(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
}

#[cfg(not(unix))]
fn open_no_follow(path: &Path) -> std::io::Result<File> {
    if std::fs::symlink_metadata(path)?.file_type().is_symlink() {
        return Err(std::io::Error::other("symlink"));
    }
    OpenOptions::new().read(true).open(path)
}
