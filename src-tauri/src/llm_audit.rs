// LLM call audit log in the vault's `.ontology-atlas/llm-audit.jsonl`. Log before
// send: if `reserve()` cannot sync a line, the caller sends nothing. `finalize`
// rewrites only that tail line under a lock; response bodies are never recorded.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, MutexGuard};
use std::time::Duration;

use crate::errors::coded;

const SIDECAR_DIR: &str = ".ontology-atlas";
const AUDIT_FILE: &str = "llm-audit.jsonl";

/// NUL-terminated twins for `openat`/`mkdirat`, so no `CString::new(..).expect(..)`
/// exists: a panic unwinding through an Objective-C frame aborts the process. `names_stay_in_step`
/// pins each literal to its `&str` twin.
const SIDECAR_DIR_C: &std::ffi::CStr = c".ontology-atlas";
const AUDIT_FILE_C: &std::ffi::CStr = c"llm-audit.jsonl";

/// What left the vault and how much; connection checks are all 0.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditScope {
    pub nodes: Vec<String>,
    pub prompt_chars: usize,
    pub vault_chars: usize,
}

/// Name and target only: arguments may carry vault text. Additive and absent on
/// connection-check lines, so lines already on disk keep their shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditToolRef {
    pub name: String,
    pub target: String,
}

/// Committed before transmission; this is the whole reservation line.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditDraft {
    pub v: u8,
    pub at: String,
    pub provider: String,
    /// Where vault content went. Additive so `v` stays 1: raising it would make lines
    /// already on user disks unreadable.
    pub host: String,
    pub model: Option<String>,
    /// Extensions add values without raising `v`.
    pub purpose: String,
    /// Only the user's own words; `null` for connection checks.
    pub question: Option<String>,
    pub scope: AuditScope,
    /// Absent on connection-check lines.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AuditToolRef>>,
    /// Lets a person check the payload matches the preview.
    pub payload_sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditOutcome {
    /// Absent on reservation lines.
    pub outcome: String,
    pub http_status: Option<u16>,
    pub response_chars: usize,
    pub duration_ms: u64,
}

#[derive(Debug)]
pub struct AuditReservation {
    path: PathBuf,
    file: fs::File,
    offset: u64,
    reserved_line: Vec<u8>,
    draft: AuditDraft,
    /// Declared last: fields drop in order, so the `flock` closes before the path is
    /// handed to the next reservation.
    _claim: ReservedPath,
}

/// `flatten` keeps declaration order, which is the human reading order.
#[derive(Debug, Serialize)]
struct AuditLine<'a> {
    #[serde(flatten)]
    draft: &'a AuditDraft,
    #[serde(flatten)]
    outcome: &'a AuditOutcome,
}

pub fn audit_log_path(vault_dir: &Path) -> PathBuf {
    vault_dir.join(SIDECAR_DIR).join(AUDIT_FILE)
}

/// A connection check hashes the empty string: proof that 0 bytes were sent.
pub fn sha256_hex(payload: &str) -> String {
    let digest = Sha256::digest(payload.as_bytes());
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// Same ISO-8601 shape as `activity.jsonl`.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Refuses a second in-process reservation before any syscall, because `flock`
/// cannot tell it from a child holding an inherited lock; `flock` then answers
/// only for another Atlas process.
static RESERVED_AUDIT_PATHS: LazyLock<Mutex<HashSet<PathBuf>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

fn reserved_audit_paths() -> MutexGuard<'static, HashSet<PathBuf>> {
    // Nothing guarded can panic, so a poisoned set is still correct.
    RESERVED_AUDIT_PATHS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Released by `Drop`, so every exit path hands the path back.
#[derive(Debug)]
struct ReservedPath {
    path: PathBuf,
}

impl ReservedPath {
    /// Two spellings of one vault are one audit log.
    fn claim(path: &Path) -> Result<Self, String> {
        if !reserved_audit_paths().insert(path.to_path_buf()) {
            return Err(coded("audit-log-busy", ""));
        }
        Ok(Self {
            path: path.to_path_buf(),
        })
    }
}

impl Drop for ReservedPath {
    fn drop(&mut self) {
        reserved_audit_paths().remove(&self.path);
    }
}

/// A busy `flock` may be our own child between `fork` and `exec` holding an
/// inherited copy, so it is retried within a measured budget, then fails closed
/// (`docs/records/decisions/2026-09-13-audit-log-inherited-lock-59f33326-5629-4cb7-8601-33c3b2f005fd.md`).
const AUDIT_LOCK_RETRY_PAUSE: Duration = Duration::from_micros(250);
const AUDIT_LOCK_RETRIES: u32 = 52;

/// Lets the positive control prove the overlap really happened.
#[cfg(test)]
static ABSORBED_INHERITED_BUSY: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

/// Serializes the two tests that can move the counter.
#[cfg(test)]
static CONTENDING_TESTS: Mutex<()> = Mutex::new(());

/// The identity both the registry and the `openat` walk key on.
fn canonical_vault_dir(vault_dir: &Path) -> Result<PathBuf, String> {
    let canonical_vault =
        fs::canonicalize(vault_dir).map_err(|err| coded("audit-vault-unreadable", err))?;
    if !canonical_vault.is_dir() {
        return Err(coded("audit-vault-unreadable", "not a directory"));
    }
    Ok(canonical_vault)
}

#[cfg(unix)]
fn open_audit_file(canonical_vault: &Path) -> Result<(PathBuf, fs::File), String> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;

    let vault_c = CString::new(canonical_vault.as_os_str().as_bytes())
        .map_err(|_| coded("audit-vault-unreadable", "path contains a NUL byte"))?;
    let root_fd = unsafe {
        libc::open(
            vault_c.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if root_fd < 0 {
        return Err(coded(
            "audit-vault-unreadable",
            std::io::Error::last_os_error(),
        ));
    }
    let root = unsafe { fs::File::from_raw_fd(root_fd) };

    let sidecar_name = SIDECAR_DIR_C;
    let made = unsafe { libc::mkdirat(root.as_raw_fd(), sidecar_name.as_ptr(), 0o700) };
    if made != 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(coded("audit-log-write-failed", error));
        }
    }

    // O_NOFOLLOW closes the race where the directory is swapped for a link after the check.
    let sidecar_fd = unsafe {
        libc::openat(
            root.as_raw_fd(),
            sidecar_name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if sidecar_fd < 0 {
        return Err(coded(
            "audit-log-tampered",
            format!(
                ".ontology-atlas is a link or not a directory: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }
    let sidecar = unsafe { fs::File::from_raw_fd(sidecar_fd) };

    let audit_name = AUDIT_FILE_C;
    let audit_fd = unsafe {
        libc::openat(
            sidecar.as_raw_fd(),
            audit_name.as_ptr(),
            libc::O_RDWR
                | libc::O_CREAT
                | libc::O_APPEND
                | libc::O_CLOEXEC
                | libc::O_NOFOLLOW
                | libc::O_NONBLOCK,
            0o600,
        )
    };
    if audit_fd < 0 {
        return Err(coded(
            "audit-log-tampered",
            format!(
                "llm-audit.jsonl is a link or cannot be opened: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }
    let file = unsafe { fs::File::from_raw_fd(audit_fd) };
    let metadata = file
        .metadata()
        .map_err(|err| coded("audit-log-write-failed", err))?;
    if !metadata.is_file() {
        return Err(coded("audit-log-tampered", "not a regular file"));
    }
    use std::os::unix::fs::MetadataExt;
    if metadata.nlink() != 1 {
        return Err(coded("audit-log-tampered", "hard-linked from another path"));
    }
    if unsafe { libc::fchmod(file.as_raw_fd(), 0o600) } != 0 {
        return Err(coded(
            "audit-log-write-failed",
            format!(
                "cannot restrict the file mode: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }

    // LOCK_NB keeps a conflict from waiting as long as the network timeout; a busy
    // answer retries within the budget, then fails closed.
    let mut retries = 0;
    loop {
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 {
            break;
        }
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::WouldBlock {
            return Err(coded("audit-log-write-failed", error));
        }
        if retries == AUDIT_LOCK_RETRIES {
            return Err(coded("audit-log-busy", ""));
        }
        retries += 1;
        #[cfg(test)]
        ABSORBED_INHERITED_BUSY.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        std::thread::sleep(AUDIT_LOCK_RETRY_PAUSE);
    }
    Ok((audit_log_path(canonical_vault), file))
}

#[cfg(not(unix))]
fn open_audit_file(_canonical_vault: &Path) -> Result<(PathBuf, fs::File), String> {
    // Windows reparse-point races are not closed yet, so this fails closed rather
    // than sending without a record.
    Err(coded("audit-log-unsupported", ""))
}

fn ensure_reservation_path(path: &Path, file: &fs::File) -> Result<(), String> {
    let path_metadata =
        fs::symlink_metadata(path).map_err(|err| coded("audit-log-tampered", err))?;
    if path_metadata.file_type().is_symlink() || !path_metadata.is_file() {
        return Err(coded(
            "audit-log-tampered",
            "the reserved path became a link or stopped being a file",
        ));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let opened = file
            .metadata()
            .map_err(|err| coded("audit-log-tampered", err))?;
        if opened.dev() != path_metadata.dev() || opened.ino() != path_metadata.ino() {
            return Err(coded(
                "audit-log-tampered",
                "the reserved file was swapped for another",
            ));
        }
        if opened.nlink() != 1 || path_metadata.nlink() != 1 {
            return Err(coded(
                "audit-log-tampered",
                "the reserved file is hard-linked from another path",
            ));
        }
    }
    Ok(())
}

/// On failure the caller must send nothing.
pub fn reserve(vault_dir: &Path, draft: AuditDraft) -> Result<AuditReservation, String> {
    // Claim first, so a second reservation is refused here rather than by `flock`.
    let canonical_vault = canonical_vault_dir(vault_dir)?;
    let claim = ReservedPath::claim(&audit_log_path(&canonical_vault))?;
    let (path, mut file) = open_audit_file(&canonical_vault)?;
    ensure_reservation_path(&path, &file)?;
    let mut reserved_line =
        serde_json::to_string(&draft).map_err(|err| coded("audit-log-write-failed", err))?;
    reserved_line.push('\n');
    let reserved_line = reserved_line.into_bytes();
    let offset = file
        .metadata()
        .map_err(|err| coded("audit-log-write-failed", err))?
        .len();
    file.write_all(&reserved_line)
        .map_err(|err| coded("audit-log-write-failed", err))?;
    // The sync keeps "recorded before sending" true across a crash.
    file.sync_all()
        .map_err(|err| coded("audit-log-write-failed", err))?;
    ensure_reservation_path(&path, &file)?;

    Ok(AuditReservation {
        path,
        file,
        offset,
        reserved_line,
        draft,
        _claim: claim,
    })
}

/// Rewrites only the reserved tail line; the lock and a tail-byte recheck keep
/// another writer's line from being truncated.
pub fn finalize(mut reservation: AuditReservation, outcome: &AuditOutcome) -> Result<(), String> {
    let line = serde_json::to_string(&AuditLine {
        draft: &reservation.draft,
        outcome,
    })
    .map_err(|err| coded("audit-log-write-failed", err))?;

    ensure_reservation_path(&reservation.path, &reservation.file)?;
    let expected_len = reservation.offset + reservation.reserved_line.len() as u64;
    let actual_len = reservation
        .file
        .metadata()
        .map_err(|err| coded("audit-log-tampered", err))?
        .len();
    if actual_len != expected_len {
        return Err(coded(
            "audit-log-tampered",
            "the file changed length after the line was reserved; \
             the existing records were kept",
        ));
    }
    reservation
        .file
        .seek(SeekFrom::Start(reservation.offset))
        .map_err(|err| coded("audit-log-tampered", err))?;
    let mut actual_reserved_line = vec![0; reservation.reserved_line.len()];
    reservation
        .file
        .read_exact(&mut actual_reserved_line)
        .map_err(|err| coded("audit-log-tampered", err))?;
    if actual_reserved_line != reservation.reserved_line {
        return Err(coded(
            "audit-log-tampered",
            "the reserved line changed; the existing records were kept",
        ));
    }
    reservation
        .file
        .set_len(reservation.offset)
        .map_err(|err| coded("audit-log-write-failed", err))?;
    reservation
        .file
        .seek(SeekFrom::End(0))
        .map_err(|err| coded("audit-log-write-failed", err))?;
    reservation
        .file
        .write_all(line.as_bytes())
        .and_then(|()| reservation.file.write_all(b"\n"))
        .map_err(|err| coded("audit-log-write-failed", err))?;
    reservation
        .file
        .sync_all()
        .map_err(|err| coded("audit-log-write-failed", err))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn names_stay_in_step() {
        assert_eq!(SIDECAR_DIR_C.to_str(), Ok(SIDECAR_DIR));
        assert_eq!(AUDIT_FILE_C.to_str(), Ok(AUDIT_FILE));
    }

    fn temp_vault(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "atlas-llm-audit-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn verify_draft() -> AuditDraft {
        AuditDraft {
            v: 1,
            at: "2026-07-26T09:12:33.120Z".into(),
            provider: "anthropic".into(),
            host: "api.anthropic.com".into(),
            model: None,
            purpose: "verify".into(),
            question: None,
            scope: AuditScope {
                nodes: vec![],
                prompt_chars: 0,
                vault_chars: 0,
            },
            tools: None,
            payload_sha256: sha256_hex(""),
        }
    }

    #[test]
    fn a_verify_line_still_has_no_tools_key_at_all() {
        // An empty array would claim "0 tools were used" and change the on-disk shape.
        let line = serde_json::to_string(&verify_draft()).unwrap();
        assert!(!line.contains("\"tools\""), "{line}");
    }

    #[cfg(unix)]
    #[test]
    fn an_agent_line_records_which_tools_rode_along() {
        let vault = temp_vault("tools");
        let mut draft = verify_draft();
        draft.purpose = "agent".into();
        draft.question = Some("빠진 관계 이어줘".into());
        draft.tools = Some(vec![AuditToolRef {
            name: "get_concept".into(),
            target: "capabilities/payment".into(),
        }]);
        let reservation = reserve(&vault, draft).unwrap();
        finalize(
            reservation,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 812,
                duration_ms: 1240,
            },
        )
        .unwrap();
        let raw = fs::read_to_string(audit_log_path(&vault)).unwrap();
        let line: Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["purpose"], "agent");
        assert_eq!(line["tools"][0]["name"], "get_concept");
        assert_eq!(line["tools"][0]["target"], "capabilities/payment");
        assert_eq!(line["responseChars"], 812);
        assert!(line.get("responseBody").is_none());
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn sha256_matches_the_published_test_vectors() {
        assert_eq!(
            sha256_hex(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[cfg(unix)]
    #[test]
    fn reserved_line_is_on_disk_before_anything_is_sent() {
        let vault = temp_vault("reserve");
        let reservation = reserve(&vault, verify_draft()).unwrap();
        let raw = fs::read_to_string(audit_log_path(&vault)).unwrap();
        let parsed: Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(parsed["purpose"], "verify");
        assert!(parsed.get("outcome").is_none());
        assert_eq!(reservation.offset, 0);
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn finalize_replaces_only_the_reserved_line_and_keeps_history() {
        let vault = temp_vault("finalize");
        let first = reserve(&vault, verify_draft()).unwrap();
        finalize(
            first,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 42,
                duration_ms: 640,
            },
        )
        .unwrap();
        let second = reserve(&vault, verify_draft()).unwrap();
        finalize(
            second,
            &AuditOutcome {
                outcome: "denied".into(),
                http_status: Some(401),
                response_chars: 118,
                duration_ms: 210,
            },
        )
        .unwrap();

        let raw = fs::read_to_string(audit_log_path(&vault)).unwrap();
        let lines: Vec<&str> = raw.lines().collect();
        assert_eq!(
            lines.len(),
            2,
            "finalizing adds no line (one call, one line)"
        );
        let first_line: Value = serde_json::from_str(lines[0]).unwrap();
        let second_line: Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(first_line["outcome"], "ok");
        assert_eq!(first_line["httpStatus"], 200);
        assert_eq!(second_line["outcome"], "denied");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn reserve_fails_loudly_when_the_vault_cannot_hold_the_log() {
        // A file where the sidecar goes must fail the reservation, so nothing is sent.
        let vault = temp_vault("blocked");
        fs::write(vault.join(SIDECAR_DIR), b"not a directory").unwrap();
        assert!(reserve(&vault, verify_draft()).is_err());
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(not(unix))]
    #[test]
    fn unsupported_native_platforms_fail_before_creating_or_sending_anything() {
        let vault = temp_vault("unsupported-platform");
        let result = reserve(&vault, verify_draft());

        assert!(result.is_err());
        assert!(
            !vault.join(SIDECAR_DIR).exists(),
            "an unverified platform must not create the audit path"
        );
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn reserve_refuses_a_symlinked_sidecar_without_touching_its_target() {
        use std::os::unix::fs::symlink;

        let vault = temp_vault("sidecar-symlink");
        let outside = temp_vault("sidecar-symlink-target");
        let outside_log = outside.join(AUDIT_FILE);
        fs::write(&outside_log, b"outside-sentinel\n").unwrap();
        symlink(&outside, vault.join(SIDECAR_DIR)).unwrap();

        let result = reserve(&vault, verify_draft());
        let outside_after = fs::read(&outside_log).unwrap();

        fs::remove_file(vault.join(SIDECAR_DIR)).ok();
        fs::remove_dir_all(&vault).ok();
        fs::remove_dir_all(&outside).ok();
        assert!(result.is_err(), "must not follow a sidecar link");
        assert_eq!(outside_after, b"outside-sentinel\n");
    }

    #[cfg(unix)]
    #[test]
    fn reserve_refuses_a_symlinked_log_without_touching_its_target() {
        use std::os::unix::fs::symlink;

        let vault = temp_vault("log-symlink");
        let outside = temp_vault("log-symlink-target");
        fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
        let outside_log = outside.join("sentinel.jsonl");
        fs::write(&outside_log, b"outside-sentinel\n").unwrap();
        symlink(&outside_log, audit_log_path(&vault)).unwrap();

        let result = reserve(&vault, verify_draft());
        let outside_after = fs::read(&outside_log).unwrap();

        fs::remove_file(audit_log_path(&vault)).ok();
        fs::remove_dir_all(&vault).ok();
        fs::remove_dir_all(&outside).ok();
        assert!(result.is_err(), "must not follow a log link");
        assert_eq!(outside_after, b"outside-sentinel\n");
    }

    #[cfg(unix)]
    #[test]
    fn reserve_refuses_a_hard_linked_log_without_touching_its_target() {
        let vault = temp_vault("log-hardlink");
        let outside = temp_vault("log-hardlink-target");
        fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
        let outside_log = outside.join("sentinel.jsonl");
        fs::write(&outside_log, b"outside-sentinel\n").unwrap();
        fs::hard_link(&outside_log, audit_log_path(&vault)).unwrap();

        let result = reserve(&vault, verify_draft());
        let outside_after = fs::read(&outside_log).unwrap();

        fs::remove_file(audit_log_path(&vault)).ok();
        fs::remove_dir_all(&vault).ok();
        fs::remove_dir_all(&outside).ok();
        assert!(result.is_err(), "must not write a hard link as the audit file");
        assert_eq!(outside_after, b"outside-sentinel\n");
    }

    #[cfg(unix)]
    #[test]
    fn reserve_restricts_an_existing_audit_file_to_owner_only() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};

        let vault = temp_vault("existing-permissions");
        fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
        let path = audit_log_path(&vault);
        fs::write(&path, b"").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();

        let reservation = reserve(&vault, verify_draft()).unwrap();
        let mode = fs::metadata(&path).unwrap().mode() & 0o777;
        drop(reservation);

        fs::remove_dir_all(&vault).ok();
        assert_eq!(mode, 0o600, "audit questions must not be readable by other accounts");
    }

    #[cfg(unix)]
    #[test]
    fn finalize_refuses_a_replaced_log_path_without_touching_its_target() {
        use std::os::unix::fs::symlink;

        let vault = temp_vault("finalize-symlink");
        let outside = temp_vault("finalize-symlink-target");
        let reservation = reserve(&vault, verify_draft()).unwrap();
        fs::remove_file(audit_log_path(&vault)).unwrap();
        let outside_log = outside.join("sentinel.jsonl");
        fs::write(&outside_log, b"outside-sentinel\n").unwrap();
        symlink(&outside_log, audit_log_path(&vault)).unwrap();

        let result = finalize(
            reservation,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 42,
                duration_ms: 640,
            },
        );
        let outside_after = fs::read(&outside_log).unwrap();

        fs::remove_file(audit_log_path(&vault)).ok();
        fs::remove_dir_all(&vault).ok();
        fs::remove_dir_all(&outside).ok();
        assert!(
            result.is_err(),
            "must not follow a log path replaced after reservation"
        );
        assert_eq!(outside_after, b"outside-sentinel\n");
    }

    #[cfg(unix)]
    #[test]
    fn reserve_refuses_a_fifo_without_waiting_for_a_reader() {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;
        use std::sync::mpsc;
        use std::time::Duration;

        let vault = temp_vault("fifo-no-reader");
        fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
        let path = audit_log_path(&vault);
        let path_c = CString::new(path.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(path_c.as_ptr(), 0o600) }, 0);

        let (tx, rx) = mpsc::channel();
        let thread_vault = vault.clone();
        std::thread::spawn(move || {
            tx.send(reserve(&thread_vault, verify_draft()).map(|_| ()))
                .ok();
        });
        let result = rx
            .recv_timeout(Duration::from_secs(1))
            .expect("opening a FIFO as the audit file must not wait for a reader");

        fs::remove_file(&path).ok();
        fs::remove_dir_all(&vault).ok();
        assert!(result.is_err(), "a FIFO cannot be the audit file");
    }

    #[cfg(unix)]
    #[test]
    fn reserve_rejects_a_fifo_before_writing_audit_data() {
        use std::ffi::CString;
        use std::os::fd::{FromRawFd, RawFd};
        use std::os::unix::ffi::OsStrExt;

        let vault = temp_vault("fifo-reader");
        fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
        let path = audit_log_path(&vault);
        let path_c = CString::new(path.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(path_c.as_ptr(), 0o600) }, 0);
        let reader_fd: RawFd = unsafe {
            libc::open(
                path_c.as_ptr(),
                libc::O_RDONLY | libc::O_NONBLOCK | libc::O_CLOEXEC,
            )
        };
        assert!(reader_fd >= 0);
        let mut reader = unsafe { fs::File::from_raw_fd(reader_fd) };

        let result = reserve(&vault, verify_draft());
        let mut leaked = Vec::new();
        reader.read_to_end(&mut leaked).unwrap();

        fs::remove_file(&path).ok();
        fs::remove_dir_all(&vault).ok();
        assert!(result.is_err(), "a FIFO cannot be the audit file");
        assert!(
            leaked.is_empty(),
            "must not write audit data before the regular-file check"
        );
    }

    /// The ceiling is the measured worst hold (12 658 µs) rounded up to whole pauses;
    /// it must not grow into waiting for any holder.
    #[test]
    fn the_inherited_lock_retry_budget_stays_bounded() {
        let ceiling = AUDIT_LOCK_RETRY_PAUSE * AUDIT_LOCK_RETRIES;
        assert_eq!(
            ceiling,
            Duration::from_millis(13),
            "13 ms is the measured 12.658 ms worst hold rounded up to whole \
             {AUDIT_LOCK_RETRY_PAUSE:?} pauses; changing it needs a new measurement"
        );
        assert!(
            AUDIT_LOCK_RETRY_PAUSE <= Duration::from_micros(250),
            "a coarser pause spends the budget on sleeping, not on waiting out an exec"
        );
    }

    /// Refused for a path that does not exist, so only the registry can have answered.
    #[test]
    fn a_second_claim_on_one_path_is_refused_without_touching_the_file() {
        let path = std::env::temp_dir()
            .join("atlas-llm-audit-claim-only")
            .join(SIDECAR_DIR)
            .join(AUDIT_FILE);
        assert!(
            !path.exists(),
            "the proof needs a path with nothing behind it"
        );

        let first = ReservedPath::claim(&path).expect("the first claim takes the path");
        assert_eq!(
            ReservedPath::claim(&path).err().as_deref(),
            Some("audit-log-busy"),
            "a second reservation on one audit log fails closed"
        );
        drop(first);
        assert!(
            ReservedPath::claim(&path).is_ok(),
            "the claim is given back when the reservation drops"
        );
        assert!(!path.exists(), "claiming a path must not create anything");
    }

    /// A lock this process cannot account for is waited out for the whole budget and
    /// then refused; `open_audit_file` is called directly as a second process would.
    #[cfg(unix)]
    #[test]
    fn the_budget_is_spent_and_then_the_lock_still_fails_closed() {
        let _serialized = CONTENDING_TESTS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let vault = temp_vault("budget-spent");
        let canonical = canonical_vault_dir(&vault).unwrap();
        let holder = open_audit_file(&canonical).expect("the first owner takes the lock");

        let started = std::time::Instant::now();
        let refused = open_audit_file(&canonical);
        let waited = started.elapsed();

        drop(holder);
        fs::remove_dir_all(&vault).ok();

        assert_eq!(
            refused.err().as_deref(),
            Some("audit-log-busy"),
            "a lock we cannot account for still fails closed"
        );
        assert!(
            waited >= AUDIT_LOCK_RETRY_PAUSE * AUDIT_LOCK_RETRIES,
            "the whole budget has to be spent before giving up, not short-circuited; \
             waited {waited:?}"
        );
        // Boundedness, not a stopwatch: a tight ceiling would measure runner load.
        assert!(
            waited < Duration::from_secs(1),
            "the wait has to stay bounded; waited {waited:?}"
        );
    }

    /// Positive control for the inherited-lock defect: a second open file description
    /// held in process stands in for a mid-spawn child, because real children failed on
    /// timing (`docs/records/decisions/2026-09-13-audit-log-inherited-lock-59f33326-5629-4cb7-8601-33c3b2f005fd.md`).
    #[cfg(unix)]
    #[test]
    fn a_reserve_right_after_a_finalize_survives_a_foreign_hold_on_the_log() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        /// A healthy round releases in microseconds.
        const WATCH_LIMIT: Duration = Duration::from_secs(5);

        let _serialized = CONTENDING_TESTS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let vault = temp_vault("foreign-hold-busy");
        let canonical = canonical_vault_dir(&vault).unwrap();

        let mut refused = Vec::new();
        let mut absorbed = Vec::new();
        let rounds = 4;
        for round in 0..rounds {
            let reservation = reserve(&vault, verify_draft()).unwrap_or_else(|error| {
                panic!("round {round} could not open a reservation: {error}")
            });
            finalize(
                reservation,
                &AuditOutcome {
                    outcome: "ok".into(),
                    http_status: Some(200),
                    response_chars: round,
                    duration_ms: 1,
                },
            )
            .unwrap();

            let holder = open_audit_file(&canonical).expect("the foreign hold takes the lock");

            let before = ABSORBED_INHERITED_BUSY.load(Ordering::Relaxed);
            let asking = Arc::new(AtomicBool::new(false));
            let answered = Arc::new(AtomicBool::new(false));
            let worker = {
                let vault = vault.clone();
                let asking = Arc::clone(&asking);
                let answered = Arc::clone(&answered);
                std::thread::spawn(move || {
                    asking.store(true, Ordering::Release);
                    let second = reserve(&vault, verify_draft());
                    answered.store(true, Ordering::Release);
                    second
                })
            };

            // Spinning, not sleeping: a woken thread under load misses the retry budget.
            let watching = std::time::Instant::now();
            while ABSORBED_INHERITED_BUSY.load(Ordering::Relaxed) == before
                && !answered.load(Ordering::Acquire)
                && watching.elapsed() < WATCH_LIMIT
            {
                std::hint::spin_loop();
            }
            drop(holder);

            let second = worker.join().unwrap();
            absorbed.push(ABSORBED_INHERITED_BUSY.load(Ordering::Relaxed) - before);
            match second {
                Ok(second) => finalize(
                    second,
                    &AuditOutcome {
                        outcome: "ok".into(),
                        http_status: Some(200),
                        response_chars: round,
                        duration_ms: 2,
                    },
                )
                .unwrap(),
                Err(error) => refused.push(format!("round {round}: {error}")),
            }
        }

        let written = fs::read_to_string(audit_log_path(&canonical)).unwrap();
        let lines = written.lines().count();
        fs::remove_dir_all(&vault).ok();

        assert!(
            refused.is_empty(),
            "a foreign description that lets go must not manufacture a busy audit log: \
             {} of {rounds} reservations were refused ({})",
            refused.len(),
            refused.join("; ")
        );
        assert_eq!(
            lines,
            rounds * 2,
            "one reserved-then-finalized call is one line"
        );
        // Without this the test could pass without reproducing anything.
        assert!(
            absorbed.iter().all(|count| *count > 0),
            "every round had to actually meet the hold; absorbed per round: {absorbed:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_second_reservation_fails_closed_until_the_first_is_finalized() {
        let vault = temp_vault("concurrent-reservations");
        let first = reserve(&vault, verify_draft()).unwrap();

        let second = reserve(&vault, verify_draft());
        assert!(
            second.is_err(),
            "two reservations must not own the same file tail"
        );

        finalize(
            first,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 1,
                duration_ms: 1,
            },
        )
        .unwrap();
        let third = reserve(&vault, verify_draft()).unwrap();
        finalize(
            third,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 2,
                duration_ms: 2,
            },
        )
        .unwrap();

        let raw = fs::read_to_string(audit_log_path(&vault)).unwrap();
        assert_eq!(raw.lines().count(), 2);
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn finalize_preserves_the_file_when_the_reserved_tail_changed() {
        let vault = temp_vault("tail-changed");
        let reservation = reserve(&vault, verify_draft()).unwrap();
        let mut outsider = fs::OpenOptions::new()
            .write(true)
            .open(audit_log_path(&vault))
            .unwrap();
        outsider
            .seek(SeekFrom::Start(reservation.offset + 1))
            .unwrap();
        outsider.write_all(b"X").unwrap();
        outsider.sync_all().unwrap();
        let before = fs::read(audit_log_path(&vault)).unwrap();

        let result = finalize(
            reservation,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 42,
                duration_ms: 640,
            },
        );
        let after = fs::read(audit_log_path(&vault)).unwrap();

        fs::remove_dir_all(&vault).ok();
        assert!(result.is_err(), "must not truncate a changed reserved line");
        assert_eq!(after, before, "a failure must preserve existing bytes");
    }

    #[cfg(unix)]
    #[test]
    fn finalize_preserves_an_unexpected_appended_tail() {
        let vault = temp_vault("tail-appended");
        let reservation = reserve(&vault, verify_draft()).unwrap();
        let mut outsider = fs::OpenOptions::new()
            .append(true)
            .open(audit_log_path(&vault))
            .unwrap();
        outsider.write_all(b"{\"unexpected\":true}\n").unwrap();
        outsider.sync_all().unwrap();
        let before = fs::read(audit_log_path(&vault)).unwrap();

        let result = finalize(
            reservation,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 42,
                duration_ms: 640,
            },
        );
        let after = fs::read(audit_log_path(&vault)).unwrap();

        fs::remove_dir_all(&vault).ok();
        assert!(result.is_err(), "must not truncate an unexpected tail");
        assert_eq!(after, before, "a failure must preserve existing bytes");
    }

    #[cfg(unix)]
    #[test]
    fn writer_matches_the_shared_reader_fixture() {
        // Writer and reader (`llm-audit-log.ts`) share this fixture; update the TS
        // contract with it. Only the first two lines are writer output.
        let fixture = include_str!("../../tests/fixtures/llm-audit-log.sample.jsonl");
        let lines: Vec<&str> = fixture.lines().filter(|l| !l.trim().is_empty()).collect();
        let expected_final: Value = serde_json::from_str(lines[0]).unwrap();
        let expected_pending: Value = serde_json::from_str(lines[1]).unwrap();

        let vault = temp_vault("fixture");
        let reservation = reserve(&vault, verify_draft()).unwrap();
        let pending: Value =
            serde_json::from_str(fs::read_to_string(audit_log_path(&vault)).unwrap().trim())
                .unwrap();
        finalize(
            reservation,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 42,
                duration_ms: 640,
            },
        )
        .unwrap();
        let final_line: Value =
            serde_json::from_str(fs::read_to_string(audit_log_path(&vault)).unwrap().trim())
                .unwrap();

        assert_eq!(final_line, expected_final);
        assert_eq!(pending, expected_pending);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn the_fixture_keeps_a_line_from_before_host_existed() {
        // `host` is additive; the fixture proves a legacy line keeps being read.
        let fixture = include_str!("../../tests/fixtures/llm-audit-log.sample.jsonl");
        let legacy = fixture
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .find(|line| line.get("host").is_none());
        let legacy = legacy.expect("fixture must contain a legacy line without host");
        assert_eq!(legacy["v"], 1, "legacy lines share the schema version");
        assert_eq!(legacy["outcome"], "ok");
    }
}
