use super::{checked_root, MeaningTransitionRootIdentity};
use std::fs;
#[cfg(unix)]
use std::io::Read;
use std::io::Write;
#[cfg(not(unix))]
use std::path::Path;

#[cfg(unix)]
pub(super) fn archive_directory_identity(
    root: &std::path::Path,
) -> Result<Option<(u64, u64)>, String> {
    use std::os::unix::fs::MetadataExt;
    let mut path = root.to_path_buf();
    for component in [".ontology-atlas", "meaning-transitions"] {
        path.push(component);
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.to_string()),
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(
                "meaning transition archive path must contain only real directories".into(),
            );
        }
        if component == "meaning-transitions" {
            return Ok(Some((metadata.dev(), metadata.ino())));
        }
    }
    Ok(None)
}

#[cfg(unix)]
pub(super) fn verify_archive_directory_identity(
    root: &std::path::Path,
    expected: (u64, u64),
) -> Result<(), String> {
    if archive_directory_identity(root)? != Some(expected) {
        return Err("meaning transition archive directory identity changed".into());
    }
    Ok(())
}

#[cfg(unix)]
pub(super) fn publish_confined(
    root_path: &str,
    root: &std::path::Path,
    expected: &MeaningTransitionRootIdentity,
    relative: &str,
    bytes: &[u8],
    limit: usize,
) -> Result<bool, String> {
    use std::os::unix::fs::MetadataExt;
    if bytes.len() > limit {
        return Err("archive payload exceeds byte budget".into());
    }
    checked_root(root_path, expected)?;
    let root_handle = crate::agent_setup::open_absolute_directory_no_follow(root)?;
    let (parent, name) = crate::agent_setup::open_entry_parent(&root_handle, relative)?;
    checked_root(root_path, expected)?;
    verify_named_parent(root, relative, &parent)?;
    let metadata = parent.metadata().map_err(|error| error.to_string())?;
    if metadata.nlink() == 0 {
        return Err("meaning transition archive parent identity changed".into());
    }
    publish_in_open_parent(&parent, &name, bytes, limit)
}

#[cfg(unix)]
pub(super) fn publish_in_open_parent(
    parent: &fs::File,
    name: &std::ffi::CStr,
    bytes: &[u8],
    limit: usize,
) -> Result<bool, String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::fs::MetadataExt;
    if bytes.len() > limit {
        return Err("archive payload exceeds byte budget".into());
    }
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let temporary_name = std::ffi::CString::new(format!(
        ".transition-{}-{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ))
    .unwrap();
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            temporary_name.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            0o600,
        )
    };
    if fd < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut temporary = unsafe { fs::File::from_raw_fd(fd) };
    let result = (|| {
        temporary
            .write_all(bytes)
            .map_err(|error| error.to_string())?;
        temporary.sync_all().map_err(|error| error.to_string())?;
        if temporary
            .metadata()
            .map_err(|error| error.to_string())?
            .nlink()
            != 1
        {
            return Err("meaning transition temporary identity changed".into());
        }
        let linked = unsafe {
            libc::linkat(
                parent.as_raw_fd(),
                temporary_name.as_ptr(),
                parent.as_raw_fd(),
                name.as_ptr(),
                0,
            )
        };
        if linked == 0 {
            parent.sync_all().map_err(|error| error.to_string())?;
            Ok(true)
        } else if std::io::Error::last_os_error().kind() == std::io::ErrorKind::AlreadyExists {
            existing_matches(parent, name, bytes, limit)
        } else {
            Err(std::io::Error::last_os_error().to_string())
        }
    })();
    let removed = unsafe { libc::unlinkat(parent.as_raw_fd(), temporary_name.as_ptr(), 0) };
    if removed != 0 && result.is_ok() {
        return Err("meaning transition temporary cleanup failed; retry the same bundle".into());
    }
    result
}

#[cfg(unix)]
fn existing_matches(
    parent: &fs::File,
    name: &std::ffi::CStr,
    expected: &[u8],
    limit: usize,
) -> Result<bool, String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
        )
    };
    if fd < 0 {
        return Err("existing meaning transition member cannot be read safely".into());
    }
    let mut file = unsafe { fs::File::from_raw_fd(fd) };
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    #[cfg(unix)]
    use std::os::unix::fs::MetadataExt;
    if !metadata.is_file()
        || metadata.nlink() != 1
        || metadata.len() as usize != expected.len()
        || metadata.len() as usize > limit
    {
        return Err("meaning transition identity conflict; existing bytes were preserved".into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes != expected {
        return Err("meaning transition identity conflict; existing bytes were preserved".into());
    }
    Ok(false)
}

#[cfg(unix)]
fn verify_named_parent(
    root: &std::path::Path,
    relative: &str,
    pinned: &fs::File,
) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    let relative_parent = std::path::Path::new(relative)
        .parent()
        .ok_or_else(|| "meaning transition path has no parent".to_string())?;
    let named =
        fs::symlink_metadata(root.join(relative_parent)).map_err(|error| error.to_string())?;
    let held = pinned.metadata().map_err(|error| error.to_string())?;
    if named.file_type().is_symlink()
        || !named.is_dir()
        || named.dev() != held.dev()
        || named.ino() != held.ino()
    {
        return Err("meaning transition archive parent changed before publication".into());
    }
    Ok(())
}

#[cfg(unix)]
pub(super) fn read_confined(
    root_path: &str,
    expected: &MeaningTransitionRootIdentity,
    relative: &str,
    limit: usize,
) -> Result<Vec<u8>, String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    checked_root(root_path, expected)?;
    let root = std::path::PathBuf::from(&expected.canonical_path);
    let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
    let (parent, name) = open_existing_parent(&root_handle, relative)?;
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
        )
    };
    if fd < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut file = unsafe { fs::File::from_raw_fd(fd) };
    let before = file.metadata().map_err(|error| error.to_string())?;
    use std::os::unix::fs::MetadataExt;
    if !before.is_file() || before.nlink() != 1 || before.len() > limit as u64 {
        return Err("meaning transition member is not a bounded regular file".into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("meaning transition member exceeds byte budget".into());
    }
    let after = file.metadata().map_err(|error| error.to_string())?;
    if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
        return Err("meaning transition member changed while it was read".into());
    }
    checked_root(root_path, expected)?;
    Ok(bytes)
}

#[cfg(unix)]
pub(super) fn open_existing_parent(
    root: &fs::File,
    relative: &str,
) -> Result<(fs::File, std::ffi::CString), String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;
    let path = std::path::Path::new(relative);
    if !path.is_relative() {
        return Err("meaning transition path must be relative".into());
    }
    let mut components = path.components().collect::<Vec<_>>();
    let file_name = match components.pop() {
        Some(std::path::Component::Normal(name)) => {
            std::ffi::CString::new(name.as_bytes()).map_err(|error| error.to_string())?
        }
        _ => return Err("meaning transition path has no safe file name".into()),
    };
    let mut current = root.try_clone().map_err(|error| error.to_string())?;
    for component in components {
        let name = match component {
            std::path::Component::Normal(name) => {
                std::ffi::CString::new(name.as_bytes()).map_err(|error| error.to_string())?
            }
            _ => return Err("meaning transition path contains an unsafe component".into()),
        };
        let fd = unsafe {
            libc::openat(
                current.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if fd < 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        current = unsafe { fs::File::from_raw_fd(fd) };
    }
    Ok((current, file_name))
}

#[cfg(not(unix))]
pub(super) fn publish_confined(
    root_path: &str,
    _root: &Path,
    expected: &MeaningTransitionRootIdentity,
    relative: &str,
    bytes: &[u8],
    limit: usize,
) -> Result<bool, String> {
    use std::fs::OpenOptions;
    if bytes.len() > limit {
        return Err("archive payload exceeds byte budget".into());
    }
    let parent_relative = Path::new(relative)
        .parent()
        .ok_or_else(|| "meaning transition path has no parent".to_string())?;
    let parent_relative = parent_relative
        .to_str()
        .ok_or_else(|| "meaning transition path is not UTF-8".to_string())?;
    let directory = crate::resolve_directory_target_inside(root_path, parent_relative)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    crate::ensure_inside_canonical(root_path, &directory)?;
    let target = crate::resolve_write_target_inside(root_path, relative)?;
    checked_root(root_path, expected)?;
    let temporary = target.with_extension(format!(
        "{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    let result = match fs::hard_link(&temporary, &target) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if fs::read(&target).map_err(|e| e.to_string())? == bytes {
                Ok(false)
            } else {
                Err("meaning transition identity conflict; existing bytes were preserved".into())
            }
        }
        Err(error) => Err(error.to_string()),
    };
    fs::remove_file(temporary).map_err(|e| e.to_string())?;
    result
}

#[cfg(not(unix))]
pub(super) fn read_confined(
    root_path: &str,
    expected: &MeaningTransitionRootIdentity,
    relative: &str,
    limit: usize,
) -> Result<Vec<u8>, String> {
    checked_root(root_path, expected)?;
    let target = crate::resolve_existing_inside(root_path, relative)?;
    let metadata = fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > limit as u64 {
        return Err("meaning transition member is not a bounded regular file".into());
    }
    let bytes = fs::read(target).map_err(|e| e.to_string())?;
    if bytes.len() > limit {
        return Err("meaning transition member exceeds byte budget".into());
    }
    Ok(bytes)
}
