use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

pub(super) const HARNESS_TEXT_MAX_BYTES: u64 = 4 * 1024 * 1024;

pub(super) struct BoundedText {
    pub text: String,
    pub last_modified: u64,
    pub bytes: u64,
}

fn io_failure(relative: &Path, error: &std::io::Error) -> String {
    format!("harness-read-failed: {}: {error}", relative.display())
}

// The file already passed the allowlist on its canonical path, so a link swapped in afterwards
// fails here rather than being followed.
#[cfg(unix)]
fn open_no_follow(root: &Path, relative: &Path) -> Result<fs::File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    let changed = || "harness-path-changed".to_string();
    let root_fd =
        crate::agent_setup::open_absolute_directory_no_follow(root).map_err(|_| changed())?;
    let parent = crate::agent_setup::open_relative_directory(
        &root_fd,
        relative.parent().unwrap_or(Path::new("")),
    )
    .map_err(|_| changed())?
    .ok_or_else(changed)?;
    let name = std::ffi::CString::new(relative.file_name().ok_or_else(changed)?.as_encoded_bytes())
        .map_err(|_| changed())?;
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
        )
    };
    if fd < 0 {
        let error = std::io::Error::last_os_error();
        return Err(
            if error.kind() == std::io::ErrorKind::NotFound
                || error.raw_os_error() == Some(libc::ELOOP)
            {
                changed()
            } else {
                io_failure(relative, &error)
            },
        );
    }
    Ok(unsafe { fs::File::from_raw_fd(fd) })
}

#[cfg(not(unix))]
fn open_no_follow(root: &Path, relative: &Path) -> Result<fs::File, String> {
    fs::File::open(root.join(relative)).map_err(|error| io_failure(relative, &error))
}

/// The error never carries file content.
pub(super) fn read_bounded_text(root: &Path, relative: &Path) -> Result<BoundedText, String> {
    let file = open_no_follow(root, relative)?;
    let metadata = file
        .metadata()
        .map_err(|error| io_failure(relative, &error))?;
    if !metadata.is_file() {
        return Err("harness-not-a-file".into());
    }
    if metadata.len() > HARNESS_TEXT_MAX_BYTES {
        return Err("harness-file-too-large".into());
    }
    let mut bytes = Vec::new();
    file.take(HARNESS_TEXT_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| io_failure(relative, &error))?;
    if bytes.len() as u64 > HARNESS_TEXT_MAX_BYTES {
        return Err("harness-file-too-large".into());
    }
    if bytes.contains(&0) {
        return Err("harness-not-text".into());
    }
    let text = String::from_utf8(bytes).map_err(|_| "harness-not-text".to_string())?;
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |elapsed| elapsed.as_millis() as u64);
    Ok(BoundedText {
        text,
        last_modified,
        bytes: metadata.len(),
    })
}
