mod file_guards;
mod lock_retry;

use super::log_file::{AUDIT_FILE_C, SIDECAR_DIR_C};
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
        embed: None,
        download: None,
    }
}

#[test]
fn a_verify_line_still_has_no_tools_key_at_all() {
    // An empty array would claim "0 tools were used" and change the on-disk shape.
    let line = serde_json::to_string(&verify_draft()).unwrap();
    assert!(!line.contains("\"tools\""), "{line}");
}

#[cfg(any(unix, windows))]
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

#[cfg(any(unix, windows))]
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

#[cfg(any(unix, windows))]
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

#[cfg(not(any(unix, windows)))]
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

#[cfg(any(unix, windows))]
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

#[cfg(any(unix, windows))]
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

#[cfg(any(unix, windows))]
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

#[cfg(any(unix, windows))]
#[test]
fn writer_matches_the_shared_reader_fixture() {
    // Writer and reader (`llm-audit-log.ts`) share this fixture; update the TS
    // contract with it. Only the first two lines are writer output.
    let fixture = include_str!("../../../tests/fixtures/llm-audit-log.sample.jsonl");
    let lines: Vec<&str> = fixture.lines().filter(|l| !l.trim().is_empty()).collect();
    let expected_final: Value = serde_json::from_str(lines[0]).unwrap();
    let expected_pending: Value = serde_json::from_str(lines[1]).unwrap();

    let vault = temp_vault("fixture");
    let reservation = reserve(&vault, verify_draft()).unwrap();
    let pending: Value =
        serde_json::from_str(fs::read_to_string(audit_log_path(&vault)).unwrap().trim()).unwrap();
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
        serde_json::from_str(fs::read_to_string(audit_log_path(&vault)).unwrap().trim()).unwrap();

    assert_eq!(final_line, expected_final);
    assert_eq!(pending, expected_pending);
    fs::remove_dir_all(&vault).ok();
}

#[test]
fn the_fixture_keeps_a_line_from_before_host_existed() {
    // `host` is additive; the fixture proves a legacy line keeps being read.
    let fixture = include_str!("../../../tests/fixtures/llm-audit-log.sample.jsonl");
    let legacy = fixture
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .find(|line| line.get("host").is_none());
    let legacy = legacy.expect("fixture must contain a legacy line without host");
    assert_eq!(legacy["v"], 1, "legacy lines share the schema version");
    assert_eq!(legacy["outcome"], "ok");
}
