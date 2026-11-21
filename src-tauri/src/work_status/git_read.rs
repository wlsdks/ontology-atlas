use std::fs::{File, OpenOptions};
use std::io::Read;
use std::path::Path;
use std::process::Stdio;

/// Administrative files hold one path or one line; anything larger is not Git's.
const ADMIN_FILE_CAP_BYTES: u64 = 4 * 1024;

pub(super) enum GitFailure {
    /// The `git` program could not be started.
    Missing,
    /// Git ran and refused.
    Refused,
}

/// A local read through the runner's hardened base (no hooks, no fsmonitor, no bare repository
/// planted in the tree) that also refuses lazy fetches and every transport.
pub(super) fn git_read(cwd: &Path, args: &[&str]) -> Result<String, GitFailure> {
    let output = crate::git::hardened_base_command()
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C")
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| GitFailure::Missing)?;
    if !output.status.success() {
        return Err(GitFailure::Refused);
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
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
