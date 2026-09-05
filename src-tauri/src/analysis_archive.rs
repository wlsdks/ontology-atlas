//! App-owned append-only diagnostic Markdown. A model cannot choose a path,
//! replace a prior run, or use this command to write an ontology concept.

use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
#[cfg(not(unix))]
use std::path::Path;

const LIMIT: usize = 2_000_000;
const DIRECTORY: &str = ".ontology-atlas/analyses";

fn validate_file_name(name: &str) -> Result<(), String> {
    if !name.is_ascii() || name.len() != 64 || !name.ends_with(".md") {
        return Err("invalid analysis file name".into());
    }
    let bytes = name.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        let valid = match index {
            4 | 7 | 13 | 16 | 19 | 24 | 33 | 38 | 43 | 48 => *byte == b'-',
            10 => *byte == b'T',
            23 => *byte == b'Z',
            61 => *byte == b'.',
            62 => *byte == b'm',
            63 => *byte == b'd',
            25..=60 => byte.is_ascii_digit() || (b'a'..=b'f').contains(byte),
            _ => byte.is_ascii_digit(),
        };
        if !valid { return Err("invalid analysis file name".into()); }
    }
    if bytes[39] != b'4' || !matches!(bytes[44], b'8' | b'9' | b'a' | b'b') {
        return Err("analysis file name must carry a UUIDv4".into());
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppendResult {
    pub file_name: String,
    pub created: bool,
}

fn header_string(content: &str, key: &str) -> Result<String, String> {
    let header = content
        .strip_prefix("---\n")
        .and_then(|rest| rest.split_once("\n---\n").map(|(header, _)| header))
        .ok_or_else(|| "analysis metadata is missing".to_string())?;
    let prefix = format!("{key}: ");
    let mut matching = header.lines().filter_map(|line| line.strip_prefix(&prefix));
    let value = matching
        .next()
        .ok_or_else(|| format!("analysis metadata is missing {key}"))?;
    if matching.next().is_some() {
        return Err(format!("analysis metadata repeats {key}"));
    }
    serde_json::from_str::<String>(value).map_err(|_| format!("invalid analysis {key}"))
}

fn validate_envelope(file_name: &str, content: &str) -> Result<(), String> {
    validate_file_name(file_name)?;
    if content.len() > LIMIT {
        return Err("analysis record exceeds the supported byte budget".into());
    }
    if header_string(content, "analysis_schema")? != "atlas-analysis/v1" {
        return Err("unsupported analysis schema".into());
    }
    if !matches!(header_string(content, "record_type")?.as_str(), "run" | "review") {
        return Err("unsupported analysis record type".into());
    }
    let id = header_string(content, "id")?;
    let bytes = id.as_bytes();
    if bytes.len() != 36
        || bytes.iter().enumerate().any(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                *byte != b'-'
            } else {
                !byte.is_ascii_digit() && !(b'a'..=b'f').contains(byte)
            }
        })
        || bytes[14] != b'4'
        || !matches!(bytes[19], b'8' | b'9' | b'a' | b'b')
    {
        return Err("analysis id must be a UUIDv4".into());
    }
    let created_at = header_string(content, "created_at")?;
    let parsed = chrono::DateTime::parse_from_rfc3339(&created_at)
        .map_err(|_| "invalid analysis creation time".to_string())?;
    if parsed.to_rfc3339_opts(chrono::SecondsFormat::Millis, true) != created_at {
        return Err("analysis creation time must be an exact UTC timestamp".into());
    }
    let expected = format!("{}-{id}.md", created_at.replace([':', '.'], "-"));
    if file_name != expected {
        return Err("analysis file name must match its generated identity".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn append_analysis_record(
    root_path: String,
    file_name: String,
    content: String,
) -> Result<AppendResult, String> {
    append_after_open(root_path, file_name, content, || {})
}

#[tauri::command]
pub(crate) fn read_analysis_record_text(root_path: String, file_name: String) -> Result<String, String> {
    validate_file_name(&file_name)?;
    let root = super::canonical_root(&root_path)?;
    #[cfg(unix)]
    {
        use std::os::fd::{AsRawFd, FromRawFd};
        let parent = crate::agent_setup::open_absolute_directory_no_follow(&root.join(DIRECTORY))?;
        let name = std::ffi::CString::new(file_name).map_err(|error| error.to_string())?;
        let fd = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK) };
        if fd < 0 { return Err(std::io::Error::last_os_error().to_string()); }
        let mut file = unsafe { fs::File::from_raw_fd(fd) };
        let metadata = file.metadata().map_err(|error| error.to_string())?;
        if !metadata.is_file() || metadata.len() > LIMIT as u64 { return Err("analysis record is not a bounded regular file".into()); }
        let mut text = String::new();
        (&mut file).take((LIMIT + 1) as u64).read_to_string(&mut text).map_err(|error| error.to_string())?;
        if text.len() > LIMIT { return Err("analysis record exceeds the supported byte budget".into()); }
        let after = file.metadata().map_err(|error| error.to_string())?;
        if after.len() != metadata.len() || after.modified().ok() != metadata.modified().ok() {
            return Err("analysis record changed while it was read".into());
        }
        Ok(text)
    }
    #[cfg(not(unix))]
    {
        let relative = format!("{DIRECTORY}/{file_name}");
        let target = super::resolve_existing_target_inside(&root_path, &relative)?;
        let metadata = fs::symlink_metadata(&target).map_err(|error| error.to_string())?;
        if !metadata.is_file() || metadata.len() > LIMIT as u64 { return Err("analysis record is not a bounded regular file".into()); }
        let mut text = String::new();
        fs::File::open(target).map_err(|error| error.to_string())?.take((LIMIT + 1) as u64).read_to_string(&mut text).map_err(|error| error.to_string())?;
        if text.len() > LIMIT { return Err("analysis record exceeds the supported byte budget".into()); }
        Ok(text)
    }
}

fn append_after_open(
    root_path: String,
    file_name: String,
    content: String,
    after_open: impl FnOnce(),
) -> Result<AppendResult, String> {
    validate_envelope(&file_name, &content)?;
    let root = super::canonical_root(&root_path)?;
    if let Some(reason) = super::vault_root_rejection(&root) {
        return Err(format!("vault root is not eligible: {reason}"));
    }
    let relative = format!("{DIRECTORY}/{file_name}");

    #[cfg(unix)]
    let created = {
        let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
        let (parent, name) = crate::agent_setup::open_entry_parent(&root_handle, &relative)?;
        after_open();
        // The FD pins the destination. A replaced name must not be reported as
        // the file we wrote, even when the old directory is still inside the vault.
        use std::os::unix::fs::MetadataExt;
        let pinned = parent.metadata().map_err(|error| error.to_string())?;
        let named_path = root.join(DIRECTORY);
        let named = fs::symlink_metadata(&named_path).map_err(|error| error.to_string())?;
        if named.file_type().is_symlink()
            || named.dev() != pinned.dev()
            || named.ino() != pinned.ino()
        {
            return Err("analysis directory changed before append".into());
        }
        publish_exclusively(&parent, &name, &content)?
    };

    #[cfg(not(unix))]
    let created = {
        let directory = super::resolve_directory_target_inside(&root_path, DIRECTORY)?;
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        super::ensure_inside_canonical(&root_path, &directory)?;
        after_open();
        let target = super::resolve_write_target_inside(&root_path, &relative)?;
        publish_portable(&target, &content)?
    };

    Ok(AppendResult { file_name, created })
}

#[cfg(unix)]
fn existing_matches(
    parent: &fs::File,
    name: &std::ffi::CStr,
    contents: &str,
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
        return Err("existing analysis record cannot be read safely".into());
    }
    let mut file = unsafe { fs::File::from_raw_fd(fd) };
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() as usize != contents.len() {
        return Err("analysis identity conflict; the existing record was preserved".into());
    }
    let mut existing = String::new();
    (&mut file)
        .take((LIMIT + 1) as u64)
        .read_to_string(&mut existing)
        .map_err(|error| error.to_string())?;
    if existing != contents {
        return Err("analysis identity conflict; the existing record was preserved".into());
    }
    Ok(false)
}

#[cfg(unix)]
fn publish_exclusively(
    parent: &fs::File,
    name: &std::ffi::CStr,
    contents: &str,
) -> Result<bool, String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::fs::MetadataExt;
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let temporary_name = std::ffi::CString::new(format!(
        ".analysis-{}-{nonce:x}-{sequence:x}.tmp",
        std::process::id()
    ))
    .map_err(|error| error.to_string())?;
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            temporary_name.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            0o600 as libc::c_uint,
        )
    };
    if fd < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut temporary = unsafe { fs::File::from_raw_fd(fd) };
    let result = (|| -> Result<bool, String> {
        if temporary.metadata().map_err(|error| error.to_string())?.nlink() != 1 {
            return Err("analysis temporary identity changed".into());
        }
        temporary.write_all(contents.as_bytes()).map_err(|error| error.to_string())?;
        temporary.sync_all().map_err(|error| error.to_string())?;
        if temporary.metadata().map_err(|error| error.to_string())?.nlink() != 1 {
            return Err("analysis temporary identity changed".into());
        }
        // linkat publishes a complete inode and cannot replace an existing name.
        let linked = unsafe {
            libc::linkat(parent.as_raw_fd(), temporary_name.as_ptr(), parent.as_raw_fd(), name.as_ptr(), 0)
        };
        if linked == 0 {
            parent.sync_all().map_err(|error| error.to_string())?;
            Ok(true)
        } else if std::io::Error::last_os_error().kind() == std::io::ErrorKind::AlreadyExists {
            existing_matches(parent, name, contents)
        } else {
            Err(std::io::Error::last_os_error().to_string())
        }
    })();
    let removed = unsafe { libc::unlinkat(parent.as_raw_fd(), temporary_name.as_ptr(), 0) };
    if removed != 0 && result.is_ok() {
        return Err("analysis temporary cleanup failed; retry the same record".into());
    }
    result
}

#[cfg(not(unix))]
fn publish_portable(target: &Path, contents: &str) -> Result<bool, String> {
    use std::fs::OpenOptions;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let temporary = target.with_extension(format!("{}-{nonce}.tmp", std::process::id()));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|error| error.to_string())?;
    let result = (|| -> Result<bool, String> {
        file.write_all(contents.as_bytes()).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        match fs::hard_link(&temporary, target) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let metadata = fs::symlink_metadata(target).map_err(|error| error.to_string())?;
                if !metadata.is_file() || metadata.len() as usize != contents.len() {
                    return Err("analysis identity conflict; the existing record was preserved".into());
                }
                if fs::read_to_string(target).map_err(|error| error.to_string())? != contents {
                    return Err("analysis identity conflict; the existing record was preserved".into());
                }
                Ok(false)
            }
            Err(error) => Err(error.to_string()),
        }
    })();
    drop(file);
    fs::remove_file(temporary).map_err(|error| error.to_string())?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (std::path::PathBuf, String, String) {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("atlas-analysis-{}-{n}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let name = "2026-09-05T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md".to_string();
        let body = "---\nanalysis_schema: \"atlas-analysis/v1\"\nrecord_type: \"run\"\nid: \"95f4ba81-41f7-483b-a617-2a4be815be32\"\ncreated_at: \"2026-09-05T08:00:00.000Z\"\n---\nOriginal answer\n".to_string();
        (root, name, body)
    }

    #[test]
    fn append_is_create_only_and_identical_retries_are_idempotent() {
        let (root, name, body) = fixture();
        let path = root.to_string_lossy().to_string();
        assert!(append_analysis_record(path.clone(), name.clone(), body.clone()).unwrap().created);
        assert!(!append_analysis_record(path.clone(), name.clone(), body.clone()).unwrap().created);
        assert!(append_analysis_record(path, name.clone(), body.replace("Original", "Modified")).is_err());
        assert_eq!(fs::read_to_string(root.join(DIRECTORY).join(name)).unwrap(), body);
        assert_eq!(fs::read_dir(root.join(DIRECTORY)).unwrap().count(), 1);
        assert_eq!(read_analysis_record_text(root.to_string_lossy().to_string(), analysis_name()).unwrap(), body);
        fs::remove_dir_all(root).unwrap();
    }

    fn analysis_name() -> String {
        "2026-09-05T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md".into()
    }

    #[test]
    fn record_reads_do_not_create_directories_and_bound_the_payload() {
        let (root, name, body) = fixture();
        assert!(read_analysis_record_text(root.to_string_lossy().to_string(), name.clone()).is_err());
        assert!(!root.join(".ontology-atlas").exists());
        append_analysis_record(root.to_string_lossy().to_string(), name.clone(), body).unwrap();
        fs::write(root.join(DIRECTORY).join(&name), vec![b'x'; LIMIT + 1]).unwrap();
        assert!(read_analysis_record_text(root.to_string_lossy().to_string(), name).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn generated_name_and_envelope_are_required_before_any_write() {
        let (root, name, body) = fixture();
        assert!(append_analysis_record(root.to_string_lossy().to_string(), format!("../{name}"), body.clone()).is_err());
        assert!(append_analysis_record(root.to_string_lossy().to_string(), name, body.replace("atlas-analysis/v1", "unknown")).is_err());
        assert!(!root.join(DIRECTORY).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlink_archive_and_replaced_parent_cannot_redirect_append() {
        use std::os::unix::fs::symlink;
        let (root, name, body) = fixture();
        let outside = root.join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::create_dir_all(root.join(".ontology-atlas")).unwrap();
        symlink(&outside, root.join(DIRECTORY)).unwrap();
        assert!(append_analysis_record(root.to_string_lossy().to_string(), name.clone(), body.clone()).is_err());
        fs::remove_file(root.join(DIRECTORY)).unwrap();
        fs::create_dir(root.join(DIRECTORY)).unwrap();
        let moved = root.join("original-analyses");
        let result = append_after_open(root.to_string_lossy().to_string(), name.clone(), body, || {
            fs::rename(root.join(DIRECTORY), &moved).unwrap();
            symlink(&outside, root.join(DIRECTORY)).unwrap();
        });
        assert!(result.is_err());
        assert!(!outside.join(name).exists());
        assert_eq!(fs::read_dir(moved).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }
}
