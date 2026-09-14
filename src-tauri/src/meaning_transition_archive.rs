//! App-owned immutable meaning-transition evidence. Callers select a vault,
//! never an archive path; artifacts become durable before a record is visible.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
#[cfg(not(unix))]
use std::path::Path;

const RECORD_LIMIT: usize = 1_000_000;
const ARTIFACT_LIMIT: usize = 1_000_000;
const MAX_ARTIFACTS: usize = 32;
const MAX_HISTORY_PAGE: usize = 100;
const MAX_HISTORY_MEMBERS: usize = 10_000;
const DIRECTORY: &str = ".ontology-atlas/meaning-transitions";
const ARTIFACT_DIRECTORY: &str = ".ontology-atlas/meaning-transitions/artifacts";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionRootIdentity {
    canonical_path: String,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MeaningTransitionArtifactInput {
    digest: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionArtifactResult {
    digest: String,
    file_name: String,
    created: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionAppendResult {
    record_file_name: String,
    record_created: bool,
    artifacts: Vec<MeaningTransitionArtifactResult>,
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
    total_members: usize,
    next_offset: Option<usize>,
}

fn digest_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn validate_digest(value: &str) -> Result<&str, String> {
    let hex = value
        .strip_prefix("sha256:")
        .ok_or_else(|| "artifact digest must use sha256:<lowercase hex>".to_string())?;
    if hex.len() != 64
        || !hex
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("artifact digest must use sha256:<lowercase hex>".into());
    }
    Ok(hex)
}

fn artifact_file_name(digest: &str) -> Result<String, String> {
    Ok(format!("{}.artifact", validate_digest(digest)?))
}

fn validate_record_file_name(name: &str) -> Result<(), String> {
    if !name.is_ascii() || name.len() != 64 || !name.ends_with(".md") {
        return Err("invalid meaning transition record file name".into());
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
        if !valid {
            return Err("invalid meaning transition record file name".into());
        }
    }
    if bytes[39] != b'4' || !matches!(bytes[44], b'8' | b'9' | b'a' | b'b') {
        return Err("meaning transition record name must carry a UUIDv4".into());
    }
    Ok(())
}

fn header_string(content: &str, key: &str) -> Result<String, String> {
    serde_json::from_value(header_value(content, key)?)
        .map_err(|_| format!("invalid meaning transition {key}"))
}

fn header_value(content: &str, key: &str) -> Result<serde_json::Value, String> {
    let header = content
        .strip_prefix("---\n")
        .and_then(|rest| rest.split_once("\n---\n").map(|pair| pair.0))
        .ok_or_else(|| "meaning transition metadata is missing".to_string())?;
    let prefix = format!("{key}: ");
    let mut values = header.lines().filter_map(|line| line.strip_prefix(&prefix));
    let value = values
        .next()
        .ok_or_else(|| format!("meaning transition metadata is missing {key}"))?;
    if values.next().is_some() {
        return Err(format!("meaning transition metadata repeats {key}"));
    }
    serde_json::from_str(value).map_err(|_| format!("invalid meaning transition {key}"))
}

fn referenced_artifact_digests(content: &str) -> Result<std::collections::HashSet<String>, String> {
    let schema = header_string(content, "schema")?;
    let proposal = header_value(content, "proposal")?;
    let mut result = std::collections::HashSet::new();
    if schema == "atlas-meaning-transition/v2" {
        let artifacts = proposal
            .get("artifacts")
            .and_then(|value| value.as_object())
            .ok_or_else(|| "meaning transition v2 artifacts are missing".to_string())?;
        if artifacts.len() != 3
            || !["retainedBefore", "preview", "decision"]
                .iter()
                .all(|key| artifacts.contains_key(*key))
        {
            return Err("meaning transition v2 requires exact retained before, preview, and decision artifacts".into());
        }
        for artifact in artifacts.values() {
            let digest = artifact
                .get("contentDigest")
                .and_then(|value| value.as_str())
                .ok_or_else(|| "meaning transition v2 artifact digest is missing".to_string())?;
            validate_digest(digest)?;
            result.insert(digest.to_string());
        }
        if result.len() != 3 {
            return Err("meaning transition v2 artifacts must use distinct content digests".into());
        }
    } else {
        let code = header_value(content, "codeEvidence")?;
        let proposal_digest = proposal
            .pointer("/artifact/contentDigest")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "meaning transition proposal artifact digest is missing".to_string())?;
        validate_digest(proposal_digest)?;
        result.insert(proposal_digest.to_string());
        if let Some(diff) = code.get("diffArtifact").filter(|value| !value.is_null()) {
            let digest = diff
                .get("contentDigest")
                .and_then(|value| value.as_str())
                .ok_or_else(|| "meaning transition diff artifact digest is missing".to_string())?;
            validate_digest(digest)?;
            result.insert(digest.to_string());
        }
    }
    Ok(result)
}

fn validate_record_envelope(name: &str, content: &str) -> Result<(), String> {
    validate_record_file_name(name)?;
    if content.len() > RECORD_LIMIT {
        return Err("meaning transition record exceeds the supported byte budget".into());
    }
    if !matches!(
        header_string(content, "schema")?.as_str(),
        "atlas-meaning-transition/v1" | "atlas-meaning-transition/v2"
    ) {
        return Err("unsupported meaning transition schema".into());
    }
    let id = header_string(content, "event_id")?;
    let created_at = header_string(content, "created_at")?;
    let parsed = chrono::DateTime::parse_from_rfc3339(&created_at)
        .map_err(|_| "invalid meaning transition creation time".to_string())?;
    if parsed.to_rfc3339_opts(chrono::SecondsFormat::Millis, true) != created_at {
        return Err("meaning transition creation time must be an exact UTC timestamp".into());
    }
    let expected = format!("{}-{id}.md", created_at.replace([':', '.'], "-"));
    if name != expected {
        return Err("meaning transition record name must match its generated identity".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn observe_meaning_transition_root(
    root_path: String,
) -> Result<MeaningTransitionRootIdentity, String> {
    let root = super::canonical_root(&root_path)?;
    if let Some(reason) = super::vault_root_rejection(&root) {
        return Err(format!("vault root is not eligible: {reason}"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = fs::metadata(&root).map_err(|error| error.to_string())?;
        Ok(MeaningTransitionRootIdentity {
            canonical_path: root.to_string_lossy().into_owned(),
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(not(unix))]
    {
        let _ = root;
        Err("meaning transition archival is unavailable on this platform because stable vault identity is not implemented".into())
    }
}

fn checked_root(
    root_path: &str,
    expected: &MeaningTransitionRootIdentity,
) -> Result<std::path::PathBuf, String> {
    let observed = observe_meaning_transition_root(root_path.to_string())?;
    if &observed != expected {
        return Err("selected vault identity changed".into());
    }
    Ok(std::path::PathBuf::from(observed.canonical_path))
}

#[tauri::command]
pub(crate) fn append_meaning_transition_bundle(
    root_path: String,
    expected_root_identity: MeaningTransitionRootIdentity,
    record_file_name: String,
    record_content: String,
    artifacts: Vec<MeaningTransitionArtifactInput>,
) -> Result<MeaningTransitionAppendResult, String> {
    append_bundle_after_artifacts(
        root_path,
        expected_root_identity,
        record_file_name,
        record_content,
        artifacts,
        || Ok(()),
    )
}

fn append_bundle_after_artifacts(
    root_path: String,
    expected: MeaningTransitionRootIdentity,
    record_file_name: String,
    record_content: String,
    artifacts: Vec<MeaningTransitionArtifactInput>,
    before_record: impl FnOnce() -> Result<(), String>,
) -> Result<MeaningTransitionAppendResult, String> {
    validate_record_envelope(&record_file_name, &record_content)?;
    if artifacts.is_empty() || artifacts.len() > MAX_ARTIFACTS {
        return Err("meaning transition bundle must contain 1 to 32 artifacts".into());
    }
    let mut prepared = Vec::with_capacity(artifacts.len());
    let mut names = std::collections::HashSet::new();
    for artifact in artifacts {
        if artifact.content.len() > ARTIFACT_LIMIT {
            return Err("meaning transition artifact exceeds the supported byte budget".into());
        }
        let file_name = artifact_file_name(&artifact.digest)?;
        if digest_hex(artifact.content.as_bytes()) != validate_digest(&artifact.digest)? {
            return Err("meaning transition artifact digest does not match its bytes".into());
        }
        if !names.insert(file_name.clone()) {
            return Err("meaning transition bundle repeats an artifact digest".into());
        }
        prepared.push((artifact, file_name));
    }
    let supplied = prepared
        .iter()
        .map(|(artifact, _)| artifact.digest.clone())
        .collect::<std::collections::HashSet<_>>();
    if supplied != referenced_artifact_digests(&record_content)? {
        return Err(
            "meaning transition bundle artifacts must exactly match record references".into(),
        );
    }
    let root = checked_root(&root_path, &expected)?;
    #[cfg(unix)]
    let archive_handle = {
        let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
        let (handle, _) =
            crate::agent_setup::open_entry_parent(&root_handle, &format!("{DIRECTORY}/.record"))?;
        handle
    };
    #[cfg(unix)]
    let archive_identity = {
        use std::os::unix::fs::MetadataExt;
        let metadata = archive_handle
            .metadata()
            .map_err(|error| error.to_string())?;
        (metadata.dev(), metadata.ino())
    };
    #[cfg(unix)]
    verify_archive_directory_identity(&root, archive_identity)?;
    let mut results = Vec::with_capacity(prepared.len());
    for (artifact, file_name) in &prepared {
        let relative = format!("{ARTIFACT_DIRECTORY}/{file_name}");
        let created = publish_confined(
            &root_path,
            &root,
            &expected,
            &relative,
            artifact.content.as_bytes(),
            ARTIFACT_LIMIT,
        )?;
        let reopened = read_confined(&root_path, &expected, &relative, ARTIFACT_LIMIT)?;
        if reopened != artifact.content.as_bytes()
            || digest_hex(&reopened) != validate_digest(&artifact.digest)?
        {
            return Err("meaning transition artifact failed publication readback".into());
        }
        results.push(MeaningTransitionArtifactResult {
            digest: artifact.digest.clone(),
            file_name: file_name.clone(),
            created,
        });
    }
    before_record()?;
    checked_root(&root_path, &expected)?;
    #[cfg(unix)]
    verify_archive_directory_identity(&root, archive_identity)?;
    for (artifact, file_name) in &prepared {
        let reopened = read_confined(
            &root_path,
            &expected,
            &format!("{ARTIFACT_DIRECTORY}/{file_name}"),
            ARTIFACT_LIMIT,
        )?;
        if digest_hex(&reopened) != validate_digest(&artifact.digest)? {
            return Err("meaning transition artifact changed before record publication".into());
        }
    }
    #[cfg(unix)]
    let record_created = {
        verify_archive_directory_identity(&root, archive_identity)?;
        let name = std::ffi::CString::new(record_file_name.as_bytes())
            .map_err(|error| error.to_string())?;
        publish_in_open_parent(
            &archive_handle,
            &name,
            record_content.as_bytes(),
            RECORD_LIMIT,
        )?
    };
    #[cfg(not(unix))]
    let record_created = publish_confined(
        &root_path,
        &root,
        &expected,
        &format!("{DIRECTORY}/{record_file_name}"),
        record_content.as_bytes(),
        RECORD_LIMIT,
    )?;
    let reopened = read_confined(
        &root_path,
        &expected,
        &format!("{DIRECTORY}/{record_file_name}"),
        RECORD_LIMIT,
    )?;
    if reopened != record_content.as_bytes() {
        return Err("meaning transition record failed publication readback".into());
    }
    Ok(MeaningTransitionAppendResult {
        record_file_name,
        record_created,
        artifacts: results,
    })
}

#[tauri::command]
pub(crate) fn read_meaning_transition_record_text(
    root_path: String,
    expected_root_identity: MeaningTransitionRootIdentity,
    file_name: String,
) -> Result<String, String> {
    validate_record_file_name(&file_name)?;
    let bytes = read_confined(
        &root_path,
        &expected_root_identity,
        &format!("{DIRECTORY}/{file_name}"),
        RECORD_LIMIT,
    )?;
    String::from_utf8(bytes).map_err(|_| "meaning transition record is not UTF-8".into())
}

#[tauri::command]
pub(crate) fn read_meaning_transition_artifact_text(
    root_path: String,
    expected_root_identity: MeaningTransitionRootIdentity,
    digest: String,
) -> Result<String, String> {
    let name = artifact_file_name(&digest)?;
    let bytes = read_confined(
        &root_path,
        &expected_root_identity,
        &format!("{ARTIFACT_DIRECTORY}/{name}"),
        ARTIFACT_LIMIT,
    )?;
    if digest_hex(&bytes) != validate_digest(&digest)? {
        return Err("meaning transition artifact digest does not match stored bytes".into());
    }
    String::from_utf8(bytes).map_err(|_| "meaning transition artifact is not UTF-8".into())
}

#[tauri::command]
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
    for name in names {
        if entries.len() == MAX_HISTORY_MEMBERS {
            return Err("meaning transition history exceeds the supported member budget".into());
        }
        if name == "artifacts" {
            continue;
        }
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
    entries.sort_by(|left, right| right.file_name.cmp(&left.file_name));
    let total_members = entries.len();
    let page = entries
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
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

#[cfg(unix)]
fn archive_directory_identity(root: &std::path::Path) -> Result<Option<(u64, u64)>, String> {
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
fn verify_archive_directory_identity(
    root: &std::path::Path,
    expected: (u64, u64),
) -> Result<(), String> {
    if archive_directory_identity(root)? != Some(expected) {
        return Err("meaning transition archive directory identity changed".into());
    }
    Ok(())
}

#[cfg(unix)]
fn publish_confined(
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
fn publish_in_open_parent(
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
fn read_confined(
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
fn open_existing_parent(
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
fn publish_confined(
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
    let directory = super::resolve_directory_target_inside(root_path, parent_relative)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    super::ensure_inside_canonical(root_path, &directory)?;
    let target = super::resolve_write_target_inside(root_path, relative)?;
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
fn read_confined(
    root_path: &str,
    expected: &MeaningTransitionRootIdentity,
    relative: &str,
    limit: usize,
) -> Result<Vec<u8>, String> {
    checked_root(root_path, expected)?;
    let target = super::resolve_existing_inside(root_path, relative)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    fn fixture() -> (
        std::path::PathBuf,
        String,
        String,
        MeaningTransitionArtifactInput,
    ) {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let root = std::env::temp_dir().join(format!(
            "atlas-transition-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        let id = "95f4ba81-41f7-483b-a617-2a4be815be32";
        let name = format!("2026-09-14T08-00-00-000Z-{id}.md");
        let content = "proposal bytes".to_string();
        let digest = format!("sha256:{}", digest_hex(content.as_bytes()));
        let body = format!("---\nschema: \"atlas-meaning-transition/v1\"\nevent_id: \"{id}\"\ncreated_at: \"2026-09-14T08:00:00.000Z\"\nproposal: {{\"artifact\":{{\"contentDigest\":\"{digest}\"}}}}\ncodeEvidence: {{\"diffArtifact\":null}}\n---\n## Remaining questions\n\nNone recorded.\n");
        let artifact = MeaningTransitionArtifactInput { digest, content };
        (root, name, body, artifact)
    }
    #[cfg(unix)]
    fn identity(root: &std::path::Path) -> MeaningTransitionRootIdentity {
        observe_meaning_transition_root(root.to_string_lossy().into_owned()).unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn bundle_is_artifact_first_record_last_and_idempotent() {
        let (root, name, body, artifact) = fixture();
        let id = identity(&root);
        let path = root.to_string_lossy().into_owned();
        let digest = artifact.digest.clone();
        let first = append_meaning_transition_bundle(
            path.clone(),
            id.clone(),
            name.clone(),
            body.clone(),
            vec![artifact],
        )
        .unwrap();
        assert!(first.record_created && first.artifacts[0].created);
        let retry_artifact = MeaningTransitionArtifactInput {
            digest: digest.clone(),
            content: "proposal bytes".into(),
        };
        let retry = append_meaning_transition_bundle(
            path.clone(),
            id.clone(),
            name.clone(),
            body.clone(),
            vec![retry_artifact],
        )
        .unwrap();
        assert!(!retry.record_created && !retry.artifacts[0].created);
        assert_eq!(
            read_meaning_transition_artifact_text(path.clone(), id.clone(), digest).unwrap(),
            "proposal bytes"
        );
        assert_eq!(
            read_meaning_transition_record_text(path, id, name).unwrap(),
            body
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn v2_envelope_retains_three_exact_artifacts_without_changing_v1() {
        let (root, name, _, _) = fixture();
        let id = identity(&root);
        let path = root.to_string_lossy().into_owned();
        let artifacts = ["before bytes", "preview bytes", "decision bytes"]
            .into_iter()
            .map(|content| MeaningTransitionArtifactInput {
                digest: format!("sha256:{}", digest_hex(content.as_bytes())),
                content: content.to_string(),
            })
            .collect::<Vec<_>>();
        let body = format!(
            "---\nschema: \"atlas-meaning-transition/v2\"\nevent_id: \"95f4ba81-41f7-483b-a617-2a4be815be32\"\ncreated_at: \"2026-09-14T08:00:00.000Z\"\nproposal: {{\"artifacts\":{{\"retainedBefore\":{{\"contentDigest\":\"{}\"}},\"preview\":{{\"contentDigest\":\"{}\"}},\"decision\":{{\"contentDigest\":\"{}\"}}}}}}\n---\n## Remaining questions\n\nNone recorded.\n",
            artifacts[0].digest, artifacts[1].digest, artifacts[2].digest,
        );
        let result = append_meaning_transition_bundle(
            path.clone(),
            id.clone(),
            name.clone(),
            body.clone(),
            artifacts,
        )
        .unwrap();
        assert!(result.record_created);
        assert_eq!(result.artifacts.len(), 3);
        assert_eq!(
            read_meaning_transition_record_text(path, id, name).unwrap(),
            body
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn conflicting_record_and_bad_artifact_preserve_published_bytes() {
        let (root, name, body, artifact) = fixture();
        let id = identity(&root);
        let path = root.to_string_lossy().into_owned();
        append_meaning_transition_bundle(
            path.clone(),
            id.clone(),
            name.clone(),
            body.clone(),
            vec![artifact],
        )
        .unwrap();
        let content = "other".to_string();
        let bad = MeaningTransitionArtifactInput {
            digest: format!("sha256:{}", digest_hex(b"proposal bytes")),
            content,
        };
        assert!(append_meaning_transition_bundle(
            path.clone(),
            id.clone(),
            name.clone(),
            body.replace("None", "Changed"),
            vec![bad]
        )
        .is_err());
        assert_eq!(
            read_meaning_transition_record_text(path, id, name).unwrap(),
            body
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn invalid_names_oversize_and_malformed_history_are_fail_visible() {
        let (root, name, body, artifact) = fixture();
        let id = identity(&root);
        let path = root.to_string_lossy().into_owned();
        assert!(append_meaning_transition_bundle(
            path.clone(),
            id.clone(),
            format!("../{name}"),
            body.clone(),
            vec![artifact]
        )
        .is_err());
        let oversize = format!("{body}{}", "x".repeat(RECORD_LIMIT));
        let content = "proposal bytes".to_string();
        let oversize_artifact = MeaningTransitionArtifactInput {
            digest: format!("sha256:{}", digest_hex(content.as_bytes())),
            content,
        };
        assert!(append_meaning_transition_bundle(
            path.clone(),
            id.clone(),
            name,
            oversize,
            vec![oversize_artifact]
        )
        .is_err());
        assert!(!root.join(DIRECTORY).exists());
        fs::create_dir_all(root.join(DIRECTORY)).unwrap();
        fs::write(root.join(DIRECTORY).join("broken.md"), "bad").unwrap();
        let page = list_meaning_transition_history(path, id, 0, 10).unwrap();
        assert_eq!(page.total_members, 1);
        assert_eq!(page.entries[0].kind, "malformed");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn interruption_before_record_leaves_no_visible_transition() {
        let (root, name, body, artifact) = fixture();
        let id = identity(&root);
        let path = root.to_string_lossy().into_owned();
        let digest = artifact.digest.clone();
        let result = append_bundle_after_artifacts(
            path.clone(),
            id.clone(),
            name,
            body,
            vec![artifact],
            || Err("simulated interruption".into()),
        );
        assert!(result.is_err());
        assert_eq!(
            list_meaning_transition_history(path.clone(), id.clone(), 0, 10)
                .unwrap()
                .total_members,
            0
        );
        assert_eq!(
            read_meaning_transition_artifact_text(path, id, digest).unwrap(),
            "proposal bytes"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn mutated_artifact_blocks_record_publication() {
        let (root, name, body, artifact) = fixture();
        let id = identity(&root);
        let path = root.to_string_lossy().into_owned();
        let artifact_name = artifact_file_name(&artifact.digest).unwrap();
        let result = append_bundle_after_artifacts(
            path.clone(),
            id.clone(),
            name,
            body,
            vec![artifact],
            || {
                fs::write(
                    root.join(ARTIFACT_DIRECTORY).join(&artifact_name),
                    "mutated",
                )
                .map_err(|error| error.to_string())
            },
        );
        assert!(result.is_err());
        assert_eq!(
            list_meaning_transition_history(path, id, 0, 10)
                .unwrap()
                .total_members,
            0
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn replaced_same_path_vault_and_symlink_members_are_rejected() {
        use std::os::unix::fs::symlink;
        let (root, name, _body, _artifact) = fixture();
        let id = identity(&root);
        let moved = root.with_extension("old");
        fs::rename(&root, &moved).unwrap();
        fs::create_dir(&root).unwrap();
        assert!(read_meaning_transition_record_text(
            root.to_string_lossy().into_owned(),
            id,
            name.clone()
        )
        .is_err());
        let replacement_id = identity(&root);
        fs::create_dir_all(root.join(DIRECTORY)).unwrap();
        fs::write(root.join("outside"), "x").unwrap();
        symlink(root.join("outside"), root.join(DIRECTORY).join(name)).unwrap();
        assert!(read_meaning_transition_record_text(
            root.to_string_lossy().into_owned(),
            replacement_id,
            "2026-09-14T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md".into()
        )
        .is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(moved).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn history_refuses_a_symlinked_sidecar_ancestor() {
        use std::os::unix::fs::symlink;
        let (root, _, _, _) = fixture();
        let id = identity(&root);
        let outside = root.with_extension("outside");
        fs::create_dir_all(outside.join("meaning-transitions")).unwrap();
        symlink(&outside, root.join(".ontology-atlas")).unwrap();
        assert!(
            list_meaning_transition_history(root.to_string_lossy().into_owned(), id, 0, 10)
                .is_err()
        );
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn archive_replacement_between_artifact_and_record_is_rejected() {
        let (root, name, body, artifact) = fixture();
        let id = identity(&root);
        let path = root.to_string_lossy().into_owned();
        let artifact_name = artifact_file_name(&artifact.digest).unwrap();
        let moved = root.join("original-transition-archive");
        let result = append_bundle_after_artifacts(path, id, name, body, vec![artifact], || {
            fs::rename(root.join(DIRECTORY), &moved).map_err(|error| error.to_string())?;
            fs::create_dir_all(root.join(ARTIFACT_DIRECTORY)).map_err(|error| error.to_string())?;
            fs::copy(
                moved.join("artifacts").join(&artifact_name),
                root.join(ARTIFACT_DIRECTORY).join(artifact_name),
            )
            .map_err(|error| error.to_string())?;
            Ok(())
        });
        assert!(result.is_err());
        assert_eq!(fs::read_dir(root.join(DIRECTORY)).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(not(unix))]
    #[test]
    fn unsupported_platform_refuses_every_archive_entrypoint_without_creating_files() {
        let root = std::env::temp_dir().join(format!(
            "atlas-transition-unsupported-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let path = root.to_string_lossy().into_owned();
        let expected = MeaningTransitionRootIdentity {
            canonical_path: fs::canonicalize(&root)
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        };
        let id = "95f4ba81-41f7-483b-a617-2a4be815be32";
        let name = format!("2026-09-14T08-00-00-000Z-{id}.md");
        let content = "proposal bytes".to_string();
        let digest = format!("sha256:{}", digest_hex(content.as_bytes()));
        let body = format!("---\nschema: \"atlas-meaning-transition/v1\"\nevent_id: \"{id}\"\ncreated_at: \"2026-09-14T08:00:00.000Z\"\nproposal: {{\"artifact\":{{\"contentDigest\":\"{digest}\"}}}}\ncodeEvidence: {{\"diffArtifact\":null}}\n---\n## Remaining questions\n\nNone recorded.\n");
        let artifact = || MeaningTransitionArtifactInput {
            digest: digest.clone(),
            content: content.clone(),
        };

        assert!(observe_meaning_transition_root(path.clone()).is_err());
        assert!(append_meaning_transition_bundle(
            path.clone(),
            expected.clone(),
            name.clone(),
            body,
            vec![artifact()]
        )
        .is_err());
        assert!(read_meaning_transition_record_text(path.clone(), expected.clone(), name).is_err());
        assert!(
            read_meaning_transition_artifact_text(path.clone(), expected.clone(), digest).is_err()
        );
        assert!(list_meaning_transition_history(path, expected, 0, 10).is_err());
        assert!(!root.join(".ontology-atlas").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
