// LLM call audit log — `.ontology-atlas/llm-audit.jsonl` inside the vault (#80 S2).
//
// ## Why Rust owns the log
//
// Trust Charter ② states "silent collection 0 · transmission is opt-in + local audit log." To make this
// a **code path** rather than a discipline (a promise humans keep), the party holding the key
// must also hold the record. If we entrust logs to the WebView, a front-end bug or bypass call
// alone can create "transmission without recording."
//
// Thus, there is one contract: **log-before-send — if an audit line cannot be left, do not send.**
// If `reserve()` fails, the caller does not invoke the sender and fails immediately.
//
// ## Why reserve + finalize two-step?
//
// Before transmission, we do not know the result (status code · duration), and writing for the first time after
// transmission opens a window for "transmission without recording." Therefore, just before transmission, we
// commit (sync) a line containing **only pre-transmission facts** to disk, and when the response arrives,
// we cut that line and rewrite it as a completed single line. On Unix, we hold file locks during this entire
// interval so two requests in the same vault cannot truncate each other's reservations. Past lines are untouched
// (Charter ⑤ prohibition on retroactive changes). If the process dies before receiving a response, a line without
// an outcome remains, and the reader interprets it as `unknown`.
//
// ## What is not recorded
//
// **Response bodies are not recorded.** This file is an audit of "what went out and how much," not
// a conversation store — starting to accumulate conversations creates a second source of truth outside the vault
// (Charter ④). We only keep the length (`responseChars`).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// The sidecar directory inside the vault — where `activity.jsonl` already resides.
const SIDECAR_DIR: &str = ".ontology-atlas";
const AUDIT_FILE: &str = "llm-audit.jsonl";

/// Transmission scope — "what and how much went out from the vault." Connection checks are all 0.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditScope {
    pub nodes: Vec<String>,
    pub prompt_chars: usize,
    pub vault_chars: usize,
}

/// One tool call sent in this round trip — name and target only. We do not keep full arguments
/// (the vault body may mix with arguments, and this file is not a conversation store).
///
/// **Additive field** — it does not even exist on connection check lines (`Option::is_none` skip),
/// so the shape of lines already sitting on user disks does not change (Charter ⑤).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditToolRef {
    pub name: String,
    /// The target stated by the screen row (node slug, etc.). Empty string if absent.
    pub target: String,
}

/// Facts committed **before** transmission. This struct is all that constitutes the reservation line.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditDraft {
    pub v: u8,
    pub at: String,
    pub provider: String,
    /// The host the request actually targeted — the answer to "where did vault content go?"
    ///
    /// **Additive extension so `v` remains 1.** Old lines lacking this field must still be
    /// read (reader downgrades to `null`), and already written lines are untouched —
    /// this is how we uphold Charter ⑤ (prohibition on retroactive changes) in the schema. Raising `v`
    /// would turn existing records remaining on user disks into "unreadable lines" overnight.
    pub host: String,
    pub model: Option<String>,
    /// `"verify" | "agent"` — extensions add values (schema `v` is not raised).
    pub purpose: String,
    /// Only the user's own words. Connection checks are `null`.
    pub question: Option<String>,
    pub scope: AuditScope,
    /// Tool calls sent in this round trip. The field itself is absent on connection check lines.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AuditToolRef>>,
    /// SHA256 of the transmission payload — a post-hoc anchor for "is this the payload I saw in preview?"
    pub payload_sha256: String,
}

/// Facts that can only be known after the response arrives.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditOutcome {
    /// `"ok" | "denied" | "error"`. The field itself is absent on reservation lines.
    pub outcome: String,
    pub http_status: Option<u16>,
    pub response_chars: usize,
    pub duration_ms: u64,
}

/// Position of the committed reservation line on disk. `offset` is the byte where that line begins.
#[derive(Debug)]
pub struct AuditReservation {
    path: PathBuf,
    file: fs::File,
    offset: u64,
    reserved_line: Vec<u8>,
    draft: AuditDraft,
}

/// Completed line = pre-send facts + response facts. `flatten` writes the two structs
/// **in their declaration order** flatly — since this is a log for human reading, key order
/// determines readability.
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

/// 전송 전문의 sha256(소문자 hex). 연결 확인은 본문이 없으므로 빈 문자열의
/// 해시가 되고, 그것도 "0바이트를 보냈다" 는 검증 가능한 사실이다.
pub fn sha256_hex(payload: &str) -> String {
    let digest = Sha256::digest(payload.as_bytes());
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// 지금 시각(UTC, 밀리초) — `activity.jsonl` 과 같은 ISO-8601 문법.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(unix)]
fn open_audit_file(vault_dir: &Path) -> Result<(PathBuf, fs::File), String> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;

    let canonical_vault = fs::canonicalize(vault_dir)
        .map_err(|err| format!("볼트 폴더를 확정할 수 없어요: {err}"))?;
    if !canonical_vault.is_dir() {
        return Err("감사 기록 대상인 볼트가 폴더가 아니에요.".into());
    }

    let vault_c = CString::new(canonical_vault.as_os_str().as_bytes())
        .map_err(|_| "볼트 경로에 허용할 수 없는 문자가 있어요.".to_string())?;
    let root_fd = unsafe {
        libc::open(
            vault_c.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if root_fd < 0 {
        return Err(format!(
            "볼트 폴더를 안전하게 열 수 없어요: {}",
            std::io::Error::last_os_error()
        ));
    }
    let root = unsafe { fs::File::from_raw_fd(root_fd) };

    let sidecar_name = CString::new(SIDECAR_DIR).expect("상수에는 NUL이 없다");
    let made = unsafe { libc::mkdirat(root.as_raw_fd(), sidecar_name.as_ptr(), 0o700) };
    if made != 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(format!("감사 기록 폴더를 만들 수 없어요: {error}"));
        }
    }

    // 루트 FD의 직접 자식을 O_NOFOLLOW 로 연다. 사전 검사 후
    // 디렉터리가 링크로 바뀌는 경쟁 창도 여기서 닫힌다.
    let sidecar_fd = unsafe {
        libc::openat(
            root.as_raw_fd(),
            sidecar_name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if sidecar_fd < 0 {
        return Err(format!(
            "감사 기록 폴더가 심볼릭 링크이거나 폴더가 아니에요: {}",
            std::io::Error::last_os_error()
        ));
    }
    let sidecar = unsafe { fs::File::from_raw_fd(sidecar_fd) };

    let audit_name = CString::new(AUDIT_FILE).expect("상수에는 NUL이 없다");
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
        return Err(format!(
            "감사 기록 파일이 심볼릭 링크이거나 열 수 없어요: {}",
            std::io::Error::last_os_error()
        ));
    }
    let file = unsafe { fs::File::from_raw_fd(audit_fd) };
    let metadata = file
        .metadata()
        .map_err(|err| format!("감사 기록 파일을 확인할 수 없어요: {err}"))?;
    if !metadata.is_file() {
        return Err("감사 기록 대상이 일반 파일이 아니에요.".into());
    }
    use std::os::unix::fs::MetadataExt;
    if metadata.nlink() != 1 {
        return Err("감사 기록 파일이 다른 경로와 하드링크되어 있어요.".into());
    }
    if unsafe { libc::fchmod(file.as_raw_fd(), 0o600) } != 0 {
        return Err(format!(
            "감사 기록 파일 권한을 제한할 수 없어요: {}",
            std::io::Error::last_os_error()
        ));
    }

    // 예약부터 확정까지 한 요청만 파일 꼬리를 소유한다. LOCK_NB 로 UI 스레드를
    // 네트워크 제한 시간만큼 세우지 않고, 두 번째 요청은 보내기 전에 실패한다.
    let locked = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
    if locked != 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::WouldBlock {
            return Err("같은 볼트의 다른 LLM 요청이 감사 기록을 확정하고 있어요.".into());
        }
        return Err(format!("감사 기록 파일을 잠글 수 없어요: {error}"));
    }
    Ok((audit_log_path(&canonical_vault), file))
}

#[cfg(not(unix))]
fn open_audit_file(_vault_dir: &Path) -> Result<(PathBuf, fs::File), String> {
    // 경로 사전 검사 뒤 다시 여는 방식은 Windows reparse-point 경쟁을 닫지
    // 못한다. 네이티브 핸들 기반 no-follow + file-ID 검증이 생길 때까지는
    // 기록 없는 전송을 허용하는 대신 이 기능을 실패 폐쇄한다.
    Err("이 플랫폼에서는 안전한 LLM 감사 기록을 아직 지원하지 않아요.".into())
}

fn ensure_reservation_path(path: &Path, file: &fs::File) -> Result<(), String> {
    let path_metadata = fs::symlink_metadata(path)
        .map_err(|err| format!("예약한 감사 기록 경로를 확인할 수 없어요: {err}"))?;
    if path_metadata.file_type().is_symlink() || !path_metadata.is_file() {
        return Err("예약한 감사 기록 경로가 링크이거나 파일이 아니에요.".into());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let opened = file
            .metadata()
            .map_err(|err| format!("예약한 감사 기록 파일을 확인할 수 없어요: {err}"))?;
        if opened.dev() != path_metadata.dev() || opened.ino() != path_metadata.ino() {
            return Err("예약한 감사 기록 파일이 다른 파일로 교체됐어요.".into());
        }
        if opened.nlink() != 1 || path_metadata.nlink() != 1 {
            return Err("예약한 감사 기록 파일이 다른 경로와 하드링크되어 있어요.".into());
        }
    }
    Ok(())
}

/// **전송 직전** 호출. 감사 줄을 디스크에 확정(sync)하고 그 위치를 돌려준다.
/// 실패하면 호출자는 **아무것도 보내면 안 된다** — 그게 이 함수의 존재 이유다.
pub fn reserve(vault_dir: &Path, draft: AuditDraft) -> Result<AuditReservation, String> {
    let (path, mut file) = open_audit_file(vault_dir)?;
    ensure_reservation_path(&path, &file)?;
    let mut reserved_line =
        serde_json::to_string(&draft).map_err(|err| format!("감사 줄을 만들 수 없어요: {err}"))?;
    reserved_line.push('\n');
    let reserved_line = reserved_line.into_bytes();
    let offset = file
        .metadata()
        .map_err(|err| format!("감사 기록 파일을 읽을 수 없어요: {err}"))?
        .len();
    file.write_all(&reserved_line)
        .map_err(|err| format!("감사 기록을 남기지 못했어요: {err}"))?;
    // sync 까지 해야 "보내기 전에 기록됐다" 가 크래시 앞에서도 참이 된다.
    file.sync_all()
        .map_err(|err| format!("감사 기록을 저장하지 못했어요: {err}"))?;
    ensure_reservation_path(&path, &file)?;

    Ok(AuditReservation {
        path,
        file,
        offset,
        reserved_line,
        draft,
    })
}

/// 응답 도착 후 호출. 예약 줄(파일 끝의 그 줄)만 잘라내고 완성된 한 줄로
/// 다시 쓴다 — 과거 줄은 읽지도 건드리지도 않는다. 예약이 가진 배타 잠금과
/// 꼬리 바이트 재검증이 다른 요청이나 외부 변경을 남의 줄로 오인하지 않게 한다.
pub fn finalize(mut reservation: AuditReservation, outcome: &AuditOutcome) -> Result<(), String> {
    let line = serde_json::to_string(&AuditLine {
        draft: &reservation.draft,
        outcome,
    })
    .map_err(|err| format!("감사 줄을 완성하지 못했어요: {err}"))?;

    ensure_reservation_path(&reservation.path, &reservation.file)?;
    let expected_len = reservation.offset + reservation.reserved_line.len() as u64;
    let actual_len = reservation
        .file
        .metadata()
        .map_err(|err| format!("예약한 감사 기록 파일을 확인할 수 없어요: {err}"))?
        .len();
    if actual_len != expected_len {
        return Err("예약 뒤 감사 기록 파일의 길이가 바뀌었어요. 기존 기록을 보존했어요.".into());
    }
    reservation
        .file
        .seek(SeekFrom::Start(reservation.offset))
        .map_err(|err| format!("예약한 감사 줄을 확인하지 못했어요: {err}"))?;
    let mut actual_reserved_line = vec![0; reservation.reserved_line.len()];
    reservation
        .file
        .read_exact(&mut actual_reserved_line)
        .map_err(|err| format!("예약한 감사 줄을 확인하지 못했어요: {err}"))?;
    if actual_reserved_line != reservation.reserved_line {
        return Err("예약한 감사 줄이 바뀌었어요. 기존 기록을 보존했어요.".into());
    }
    reservation
        .file
        .set_len(reservation.offset)
        .map_err(|err| format!("감사 기록을 정리하지 못했어요: {err}"))?;
    reservation
        .file
        .seek(SeekFrom::End(0))
        .map_err(|err| format!("감사 기록을 정리하지 못했어요: {err}"))?;
    reservation
        .file
        .write_all(line.as_bytes())
        .and_then(|()| reservation.file.write_all(b"\n"))
        .map_err(|err| format!("감사 기록을 완성하지 못했어요: {err}"))?;
    reservation
        .file
        .sync_all()
        .map_err(|err| format!("감사 기록을 저장하지 못했어요: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

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
        // `tools` 는 추가형이다 — 연결 확인 줄에 빈 배열조차 넣지 않는다.
        // 넣으면 이미 디스크에 앉은 줄과 모양이 갈라지고(헌장 ⑤), "도구를 0개
        // 썼다" 라는 하지도 않은 주장을 기록이 하게 된다.
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
        // 응답 본문은 기록하지 않는다 — 길이만.
        assert_eq!(line["responseChars"], 812);
        assert!(line.get("responseBody").is_none());
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn sha256_matches_the_published_test_vectors() {
        // 페이로드 앵커가 진짜 sha256 이어야 사후 대조가 의미를 가진다.
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
        // 전송 전에는 결과를 모른다 — 없는 사실을 지어내지 않는다.
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
            "확정은 줄을 늘리지 않는다 (한 호출 = 한 줄)"
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
        // 사이드카 자리에 파일이 있으면 폴더를 만들 수 없다 — 이때 예약이
        // 실패해야 호출자가 전송을 포기한다(log-before-send 의 앞단).
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
            "검증되지 않은 플랫폼에서 감사 경로를 만들면 안 된다"
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
        assert!(result.is_err(), "사이드카 링크를 따라가면 안 된다");
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
        assert!(result.is_err(), "로그 링크를 따라가면 안 된다");
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
        assert!(result.is_err(), "하드링크를 감사 파일로 쓰면 안 된다");
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
        assert_eq!(mode, 0o600, "감사 질문을 다른 계정이 읽게 두면 안 된다");
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
            "예약 후 교체된 로그 경로를 따라가면 안 된다"
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
            .expect("FIFO를 감사 파일로 열 때 독자를 기다리면 안 된다");

        fs::remove_file(&path).ok();
        fs::remove_dir_all(&vault).ok();
        assert!(result.is_err(), "FIFO는 감사 파일이 될 수 없다");
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
        assert!(result.is_err(), "FIFO는 감사 파일이 될 수 없다");
        assert!(
            leaked.is_empty(),
            "정규 파일 검증 전에 감사 데이터를 쓰면 안 된다"
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
            "두 예약이 같은 파일 꼬리를 소유하면 안 된다"
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
        assert!(result.is_err(), "바뀐 예약 줄을 잘라내면 안 된다");
        assert_eq!(after, before, "실패할 때 기존 바이트를 보존해야 한다");
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
        assert!(result.is_err(), "예상 밖 꼬리를 잘라내면 안 된다");
        assert_eq!(after, before, "실패할 때 기존 바이트를 보존해야 한다");
    }

    #[cfg(unix)]
    #[test]
    fn writer_matches_the_shared_reader_fixture() {
        // writer(Rust) ↔ reader(웹 `llm-audit-log.ts`) drift 차단. 같은 픽스처를
        // 양쪽이 본다 — 이 assert 가 깨지면 TS 계약 테스트도 같이 갱신해야 한다.
        //
        // 앞 두 줄만 writer 가 만드는 모습이다. 뒤의 줄들은 리더가 감당해야 할
        // 실제 파일의 모습(옛 줄·다른 벤더)이라 여기서 쓰지 않는다.
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
        // 헌장 ⑤ — `host` 는 추가형이라 이미 사용자 디스크에 앉아 있는 줄을
        // 고치지 않는다. 그 줄이 계속 읽힌다는 증거를 픽스처가 들고 있어야
        // 리더가 부재를 처리하는 코드를 지우지 못한다.
        let fixture = include_str!("../../tests/fixtures/llm-audit-log.sample.jsonl");
        let legacy = fixture
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .find(|line| line.get("host").is_none());
        let legacy = legacy.expect("host 없는 옛 줄이 픽스처에 있어야 한다");
        assert_eq!(legacy["v"], 1, "옛 줄도 같은 스키마 버전이다");
        assert_eq!(legacy["outcome"], "ok");
    }
}
