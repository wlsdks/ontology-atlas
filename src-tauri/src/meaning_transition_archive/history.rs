#[cfg(not(unix))]
use super::confined::read_confined;
#[cfg(unix)]
use super::confined::{
    archive_directory_identity, open_existing_parent, verify_archive_directory_identity,
};
use super::envelope::{validate_record_envelope, validate_record_file_name};
use super::{checked_root, MeaningTransitionRootIdentity, DIRECTORY, RECORD_LIMIT};
use serde::Serialize;
use std::fs;
#[cfg(unix)]
use std::io::Read;

const MAX_HISTORY_PAGE: usize = 100;
const MAX_HISTORY_MEMBERS: usize = 10_000;
#[cfg(test)]
std::thread_local! {
    static HISTORY_MEMBER_READS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionHistoryEntry {
    file_name: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    problem: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionHistoryPage {
    entries: Vec<MeaningTransitionHistoryEntry>,
    pub(super) total_members: usize,
    next_offset: Option<usize>,
}

#[tauri::command(async)]
pub(crate) fn list_meaning_transition_history(
    root_path: String,
    expected_root_identity: MeaningTransitionRootIdentity,
    offset: usize,
    limit: usize,
) -> Result<MeaningTransitionHistoryPage, String> {
    let root = checked_root(&root_path, &expected_root_identity)?;
    if limit == 0 || limit > MAX_HISTORY_PAGE {
        return Err("meaning transition history limit must be between 1 and 100".into());
    }
    #[cfg(not(unix))]
    let directory = root.join(DIRECTORY);
    #[cfg(unix)]
    let archive_identity = match archive_directory_identity(&root)? {
        Some(identity) => identity,
        None => {
            return Ok(MeaningTransitionHistoryPage {
                entries: Vec::new(),
                total_members: 0,
                next_offset: None,
            });
        }
    };
    #[cfg(not(unix))]
    let _ = &directory;
    #[cfg(unix)]
    let archive_handle = {
        use std::os::unix::fs::MetadataExt;
        let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
        let (handle, _) =
            open_existing_parent(&root_handle, &format!("{DIRECTORY}/.history-entry"))?;
        let metadata = handle.metadata().map_err(|error| error.to_string())?;
        if (metadata.dev(), metadata.ino()) != archive_identity {
            return Err("meaning transition archive changed before history was listed".into());
        }
        handle
    };
    let mut entries = Vec::new();
    #[cfg(unix)]
    let names = directory_entry_names(&archive_handle)?;
    #[cfg(not(unix))]
    let names = fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .map(|item| {
            item.map_err(|error| error.to_string()).and_then(|item| {
                item.file_name().into_string().map_err(|_| {
                    "meaning transition history contains a non-UTF-8 member".to_string()
                })
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut names = names
        .into_iter()
        .filter(|name| name != "artifacts")
        .collect::<Vec<_>>();
    if names.len() > MAX_HISTORY_MEMBERS {
        return Err("meaning transition history exceeds the supported member budget".into());
    }
    names.sort_by(|left, right| right.cmp(left));
    let total_members = names.len();
    for name in names.into_iter().skip(offset).take(limit) {
        let problem = match validate_record_file_name(&name) {
            Err(error) => Some(error),
            Ok(()) => match read_history_member(
                #[cfg(unix)]
                &archive_handle,
                #[cfg(not(unix))]
                &root_path,
                #[cfg(not(unix))]
                &expected_root_identity,
                &name,
            ) {
                Ok(bytes) => match String::from_utf8(bytes) {
                    Ok(content) => validate_record_envelope(&name, &content).err(),
                    Err(_) => Some("meaning transition record is not UTF-8".into()),
                },
                Err(error) => Some(error),
            },
        };
        entries.push(MeaningTransitionHistoryEntry {
            file_name: name,
            kind: if problem.is_some() {
                "malformed"
            } else {
                "record"
            },
            problem,
        });
    }
    checked_root(&root_path, &expected_root_identity)?;
    #[cfg(unix)]
    verify_archive_directory_identity(&root, archive_identity)
        .map_err(|_| "meaning transition archive changed while history was listed".to_string())?;
    let page = entries;
    let consumed = offset.saturating_add(page.len());
    Ok(MeaningTransitionHistoryPage {
        entries: page,
        total_members,
        next_offset: (consumed < total_members).then_some(consumed),
    })
}

#[cfg(unix)]
fn directory_entry_names(directory: &fs::File) -> Result<Vec<String>, String> {
    use std::os::fd::AsRawFd;
    let duplicated = unsafe { libc::dup(directory.as_raw_fd()) };
    if duplicated < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let stream = unsafe { libc::fdopendir(duplicated) };
    if stream.is_null() {
        unsafe {
            libc::close(duplicated);
        }
        return Err(std::io::Error::last_os_error().to_string());
    }
    let result = (|| {
        let mut names = Vec::new();
        loop {
            set_errno_zero();
            let entry = unsafe { libc::readdir(stream) };
            if entry.is_null() {
                let errno = current_errno();
                if errno != 0 {
                    return Err(std::io::Error::from_raw_os_error(errno).to_string());
                }
                break;
            }
            let name = unsafe { std::ffi::CStr::from_ptr((*entry).d_name.as_ptr()) }
                .to_str()
                .map_err(|_| {
                    "meaning transition history contains a non-UTF-8 member".to_string()
                })?;
            if name != "." && name != ".." {
                if names.len() >= MAX_HISTORY_MEMBERS + 1 {
                    return Err(
                        "meaning transition history exceeds the supported member budget".into(),
                    );
                }
                names.push(name.to_string());
            }
        }
        Ok(names)
    })();
    if unsafe { libc::closedir(stream) } != 0 && result.is_ok() {
        return Err(std::io::Error::last_os_error().to_string());
    }
    result
}

#[cfg(all(unix, target_os = "macos"))]
fn set_errno_zero() {
    unsafe { *libc::__error() = 0 }
}

#[cfg(all(unix, target_os = "macos"))]
fn current_errno() -> i32 {
    unsafe { *libc::__error() }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn set_errno_zero() {
    unsafe { *libc::__errno_location() = 0 }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn current_errno() -> i32 {
    unsafe { *libc::__errno_location() }
}

#[cfg(unix)]
fn read_history_member(parent: &fs::File, name: &str) -> Result<Vec<u8>, String> {
    #[cfg(test)]
    HISTORY_MEMBER_READS.with(|reads| reads.set(reads.get() + 1));
    use std::os::fd::{AsRawFd, FromRawFd};
    let name = std::ffi::CString::new(name).map_err(|error| error.to_string())?;
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
    if !before.is_file() || before.nlink() != 1 || before.len() > RECORD_LIMIT as u64 {
        return Err("meaning transition record is not a bounded regular file".into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take((RECORD_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > RECORD_LIMIT {
        return Err("meaning transition record exceeds byte budget".into());
    }
    let after = file.metadata().map_err(|error| error.to_string())?;
    if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
        return Err("meaning transition record changed while it was read".into());
    }
    Ok(bytes)
}

#[cfg(not(unix))]
fn read_history_member(
    root_path: &str,
    expected: &MeaningTransitionRootIdentity,
    name: &str,
) -> Result<Vec<u8>, String> {
    read_confined(
        root_path,
        expected,
        &format!("{DIRECTORY}/{name}"),
        RECORD_LIMIT,
    )
}

#[cfg(all(test, unix))]
mod tests;
