//! Files under a granted root, opened through directory handles that never follow a link: each
//! component is opened with `openat(O_NOFOLLOW)`, so a parent swapped for a symlink after it was
//! inspected cannot redirect a write. Other platforms use the checked-path functions of
//! `vault::scope`.

use std::fs;
use std::io::Write;
use std::path::Path;

fn err_str(message: impl Into<String>) -> String {
    message.into()
}

fn unix_name(value: &std::ffi::OsStr) -> Result<std::ffi::CString, String> {
    use std::os::unix::ffi::OsStrExt;

    std::ffi::CString::new(value.as_bytes())
        .map_err(|_| err_str("agent config path contains an unsupported NUL byte"))
}

/// Opens each component with `openat(O_NOFOLLOW)` from `/`, or a parent swapped to
/// a link after inspection would redirect the write.
pub(crate) fn open_absolute_directory_no_follow(path: &Path) -> Result<fs::File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    if !path.is_absolute() {
        return Err(err_str("native write root must be absolute"));
    }

    // Not `CString::new(..).expect(..)`: callers are sync commands on the macOS main
    // thread, where a panic aborts the app.
    let slash = c"/";
    let root_fd = unsafe {
        libc::open(
            slash.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if root_fd < 0 {
        return Err(err_str(format!(
            "could not open filesystem root safely: {}",
            std::io::Error::last_os_error()
        )));
    }
    let mut current = unsafe { fs::File::from_raw_fd(root_fd) };

    for component in path.components() {
        let std::path::Component::Normal(part) = component else {
            if matches!(component, std::path::Component::RootDir) {
                continue;
            }
            return Err(err_str(
                "native write root contains an unsupported path component",
            ));
        };
        let name = unix_name(part)?;
        let next_fd = unsafe {
            libc::openat(
                current.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if next_fd < 0 {
            return Err(err_str(format!(
                "could not open {} without following links: {}",
                path.display(),
                std::io::Error::last_os_error()
            )));
        }
        current = unsafe { fs::File::from_raw_fd(next_fd) };
    }

    Ok(current)
}

pub(crate) fn open_or_create_relative_directory(
    root: &fs::File,
    relative_path: &Path,
    create_mode: libc::mode_t,
) -> Result<fs::File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    let mut current = root
        .try_clone()
        .map_err(|error| err_str(format!("could not clone root directory handle: {error}")))?;
    for component in relative_path.components() {
        let std::path::Component::Normal(part) = component else {
            return Err(err_str("directory target must be a normal relative path"));
        };
        let name = unix_name(part)?;
        let made = unsafe { libc::mkdirat(current.as_raw_fd(), name.as_ptr(), create_mode) };
        if made != 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(err_str(format!(
                    "could not create target directory {:?}: {error}",
                    part
                )));
            }
        }
        let next_fd = unsafe {
            libc::openat(
                current.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if next_fd < 0 {
            return Err(err_str(format!(
                "target directory {:?} is a link or is not a directory: {}",
                part,
                std::io::Error::last_os_error()
            )));
        }
        current = unsafe { fs::File::from_raw_fd(next_fd) };
    }

    Ok(current)
}

pub(crate) fn open_relative_directory(
    root: &fs::File,
    relative_path: &Path,
) -> Result<Option<fs::File>, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    let mut current = root
        .try_clone()
        .map_err(|error| err_str(error.to_string()))?;
    for component in relative_path.components() {
        let std::path::Component::Normal(part) = component else {
            return Err(err_str("directory target must be a normal relative path"));
        };
        let name = unix_name(part)?;
        let fd = unsafe {
            libc::openat(
                current.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if fd < 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() == std::io::ErrorKind::NotFound {
                return Ok(None);
            }
            return Err(err_str(error.to_string()));
        }
        current = unsafe { fs::File::from_raw_fd(fd) };
    }
    Ok(Some(current))
}

/// Missing folders are created from the open parent FD, not the path string.
pub(crate) fn open_entry_parent(
    config_root: &fs::File,
    relative_path: &str,
) -> Result<(fs::File, std::ffi::CString), String> {
    let target = Path::new(relative_path);
    if !target.is_relative() {
        return Err(err_str("agent config target must be relative"));
    }
    let file_name = target
        .file_name()
        .ok_or_else(|| err_str("agent config target has no file name"))?;
    let parent = target.parent().unwrap_or_else(|| Path::new(""));
    let parent = open_or_create_relative_directory(config_root, parent, 0o700)?;
    Ok((parent, unix_name(file_name)?))
}

/// Replaces only the name via `renameat`, so a hardlinked target's inode is not truncated.
fn ensure_private_temporary(file: &fs::File, stage: &str) -> std::io::Result<()> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.nlink() != 1 {
        return Err(std::io::Error::other(format!(
            "private temporary file was linked {stage}"
        )));
    }
    Ok(())
}

pub(crate) fn write_entry_atomically(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
    contents: &str,
    create_mode: libc::mode_t,
) -> Result<(), String> {
    write_entry_atomically_with(parent, file_name, create_mode, |file| {
        file.write_all(contents.as_bytes())
    })
}

pub(crate) fn read_entry_text(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
) -> Result<Option<String>, String> {
    use std::io::Read;
    use std::os::fd::{AsRawFd, FromRawFd};

    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            file_name.as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
        )
    };
    if fd < 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::NotFound {
            return Ok(None);
        }
        return Err(err_str(error.to_string()));
    }
    let file = unsafe { fs::File::from_raw_fd(fd) };
    let metadata = file
        .metadata()
        .map_err(|error| err_str(error.to_string()))?;
    if !metadata.is_file() {
        return Err(err_str(
            "collection preferences target is not a regular file",
        ));
    }
    if metadata.len() > 1024 * 1024 {
        return Err(err_str("collection preferences exceed the 1 MiB limit"));
    }
    let mut text = String::new();
    file.take(1024 * 1024 + 1)
        .read_to_string(&mut text)
        .map_err(|error| err_str(error.to_string()))?;
    if text.len() > 1024 * 1024 {
        return Err(err_str("collection preferences exceed the 1 MiB limit"));
    }
    Ok(Some(text))
}

/// Unlike renameat, linkat cannot replace an entry another writer created first.
pub(crate) fn create_entry_atomically(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
    contents: &str,
    create_mode: libc::mode_t,
) -> Result<bool, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| err_str(error.to_string()))?
        .as_nanos();
    let mut created = None;
    for _ in 0..64 {
        let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let name =
            std::ffi::CString::new(crate::vault::temporary_files::names::create_temporary_name(
                std::process::id(),
                nonce,
                sequence,
            ))
            .map_err(|error| err_str(error.to_string()))?;
        let fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                name.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
                create_mode as libc::c_uint,
            )
        };
        if fd >= 0 {
            created = Some((name, unsafe { fs::File::from_raw_fd(fd) }));
            break;
        }
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(err_str(error.to_string()));
        }
    }
    let (name, mut temporary) = created
        .ok_or_else(|| err_str("could not reserve a private temporary name for file creation"))?;
    let result = (|| -> std::io::Result<bool> {
        ensure_private_temporary(&temporary, "before writing")?;
        temporary.write_all(contents.as_bytes())?;
        temporary.sync_all()?;
        ensure_private_temporary(&temporary, "before commit")?;
        let linked = unsafe {
            libc::linkat(
                parent.as_raw_fd(),
                name.as_ptr(),
                parent.as_raw_fd(),
                file_name.as_ptr(),
                0,
            )
        };
        if linked == 0 {
            Ok(true)
        } else {
            let error = std::io::Error::last_os_error();
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                Ok(false)
            } else {
                Err(error)
            }
        }
    })();
    // The destination is never cleanup collateral, including after publication.
    let removed = unsafe { libc::unlinkat(parent.as_raw_fd(), name.as_ptr(), 0) };
    if removed != 0 {
        return Err(err_str(format!(
            "could not clean the private creation temporary: {}",
            std::io::Error::last_os_error()
        )));
    }
    let published = result.map_err(|error| err_str(error.to_string()))?;
    if published {
        parent
            .sync_all()
            .map_err(|error| err_str(error.to_string()))?;
    }
    Ok(published)
}

/// Not `fs::write`: the open parent FD, `O_NOFOLLOW` and atomic rename are the protections.
/// Windows uses `resolve_write_target_inside` in `library.rs`.
pub(crate) fn write_entry_atomically_with<T>(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
    create_mode: libc::mode_t,
    fill: impl FnOnce(&mut fs::File) -> std::io::Result<T>,
) -> Result<T, String> {
    write_entry_atomically_with_guard(parent, file_name, create_mode, fill, || Ok(()))
}

pub(crate) fn write_entry_atomically_with_guard<T>(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
    create_mode: libc::mode_t,
    fill: impl FnOnce(&mut fs::File) -> std::io::Result<T>,
    before_publish: impl FnOnce() -> std::io::Result<()>,
) -> Result<T, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    static TEMP_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| err_str(error.to_string()))?
        .as_nanos();
    let printable_name = file_name.to_string_lossy();
    let mut created = None;

    for _ in 0..64 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        // Cannot fail for a `&CStr` name, but stays an error: a panic on the macOS main
        // thread aborts the app.
        let temporary_name = match std::ffi::CString::new(
            crate::vault::temporary_files::names::atomic_temporary_name(
                &printable_name,
                std::process::id(),
                nonce,
                sequence,
            ),
        ) {
            Ok(name) => name,
            Err(_) => {
                return Err(err_str(
                    "temporary file name contained an unsupported NUL byte",
                ))
            }
        };
        let temporary_fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                temporary_name.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
                create_mode as libc::c_uint,
            )
        };
        if temporary_fd >= 0 {
            created = Some((temporary_name, unsafe {
                fs::File::from_raw_fd(temporary_fd)
            }));
            break;
        }
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(err_str(format!(
                "could not create a private temporary file: {error}"
            )));
        }
    }

    let (temporary_name, mut temporary) = created.ok_or_else(|| {
        err_str("could not reserve a private temporary name for the native write")
    })?;
    let result = (|| -> std::io::Result<T> {
        ensure_private_temporary(&temporary, "before writing")?;
        let filled = fill(&mut temporary)?;
        temporary.sync_all()?;
        ensure_private_temporary(&temporary, "before commit")?;
        before_publish()?;
        let renamed = unsafe {
            libc::renameat(
                parent.as_raw_fd(),
                temporary_name.as_ptr(),
                parent.as_raw_fd(),
                file_name.as_ptr(),
            )
        };
        if renamed != 0 {
            return Err(std::io::Error::last_os_error());
        }
        parent.sync_all()?;
        Ok(filled)
    })();

    if result.is_err() {
        let _ = unsafe { libc::unlinkat(parent.as_raw_fd(), temporary_name.as_ptr(), 0) };
    }
    result.map_err(|error| {
        err_str(format!(
            "could not atomically replace {}: {error}",
            printable_name
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_open_config_parent_cannot_be_redirected_by_a_later_symlink_swap() {
        use std::os::unix::fs::symlink;

        let base =
            std::env::temp_dir().join(format!("oa-agent-setup-parent-race-{}", std::process::id()));
        let vault = base.join("vault");
        let original_parent = vault.join(".codex-original");
        let outside = base.join("outside");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(vault.join(".codex")).unwrap();
        fs::create_dir_all(&outside).unwrap();

        let canonical_vault = fs::canonicalize(&vault).unwrap();
        let root = open_absolute_directory_no_follow(&canonical_vault).unwrap();
        let (parent, file_name) = open_entry_parent(&root, ".codex/config.toml").unwrap();

        // The already-open parent FD must hold the original directory after the rename.
        fs::rename(vault.join(".codex"), &original_parent).unwrap();
        symlink(&outside, vault.join(".codex")).unwrap();
        write_entry_atomically(&parent, &file_name, "inside", 0o600).unwrap();

        assert!(!outside.join("config.toml").exists());
        assert_eq!(
            fs::read_to_string(original_parent.join("config.toml")).unwrap(),
            "inside"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_linked_config_temporary_is_not_eligible_for_commit() {
        let base =
            std::env::temp_dir().join(format!("oa-agent-setup-temp-link-{}", std::process::id()));
        let temporary = base.join("temporary");
        let outside_link = base.join("outside-link");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        fs::write(&temporary, "").unwrap();
        fs::hard_link(&temporary, &outside_link).unwrap();

        let file = fs::File::open(&temporary).unwrap();
        let error = ensure_private_temporary(&file, "before commit").unwrap_err();
        assert!(error.to_string().contains("linked before commit"));
        let _ = fs::remove_dir_all(&base);
    }
}
