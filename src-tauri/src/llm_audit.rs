// LLM 호출 감사 로그 — 볼트 안 `.ontology-atlas/llm-audit.jsonl` (#80 S2).
//
// ## 왜 Rust 가 로그를 소유하는가
//
// 신뢰 헌장 ②는 "조용한 수집 0 · 전송은 opt-in + 로컬 감사 로그" 다. 이걸
// 규율(사람이 지키는 약속)이 아니라 **코드 경로**로 만들려면, 키를 쥔 쪽이
// 기록도 쥐어야 한다. WebView 에 로그를 맡기면 프런트 버그 하나·우회 호출
// 하나로 "기록 없는 전송" 이 생긴다.
//
// 그래서 계약이 하나다: **log-before-send — 감사 줄을 남기지 못하면 보내지
// 않는다.** `reserve()` 가 실패하면 호출자는 sender 를 부르지 않고 즉시 실패한다.
//
// ## 왜 예약(reserve) + 확정(finalize) 2단인가
//
// 전송 전에는 결과(상태 코드·소요 시간)를 모르고, 전송 후에 처음 쓰면
// "기록 없는 전송" 창이 열린다. 그래서 전송 직전에 **전송 전 사실만 담은 줄**을
// 디스크에 확정(sync)하고, 응답이 오면 **그 줄만** 잘라내고 완성된 한 줄로
// 다시 쓴다. 과거 줄은 건드리지 않는다(헌장 ⑤ 소급 변경 금지). 프로세스가
// 응답 전에 죽으면 outcome 없는 줄이 남고, 리더는 그것을 `unknown` 으로 읽는다.
//
// ## 무엇을 기록하지 않는가
//
// **응답 본문은 기록하지 않는다.** 이 파일은 "무엇이 얼마나 나갔나" 의 감사이지
// 대화 저장소가 아니다 — 대화를 쌓기 시작하면 볼트 밖에 제2 진실원이 생긴다
// (헌장 ④). 길이(`responseChars`)만 남긴다.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// 볼트 안 사이드카 디렉토리 — `activity.jsonl` 이 이미 사는 자리.
const SIDECAR_DIR: &str = ".ontology-atlas";
const AUDIT_FILE: &str = "llm-audit.jsonl";

/// 전송 범위 — "볼트에서 무엇이 얼마나 나갔나". 연결 확인은 전부 0 이다.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditScope {
    pub nodes: Vec<String>,
    pub prompt_chars: usize,
    pub vault_chars: usize,
}

/// 전송 **전에** 확정되는 사실들. 이 구조체가 예약 줄의 전부다.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditDraft {
    pub v: u8,
    pub at: String,
    pub provider: String,
    /// 요청이 실제로 향한 호스트 — "볼트의 무엇이 **어디로** 갔나" 의 뒷말.
    ///
    /// **추가형 확장이라 `v` 는 1 그대로다.** 이 필드가 없는 옛 줄도 그대로
    /// 읽혀야 하고(리더가 `null` 로 강등), 이미 쓰인 줄은 손대지 않는다 —
    /// 신뢰 헌장 ⑤(소급 변경 금지)를 스키마에서 지키는 방법이다. `v` 를 올리면
    /// 사용자 디스크에 남아 있는 기존 기록이 하루아침에 "못 읽는 줄" 이 된다.
    pub host: String,
    pub model: Option<String>,
    /// `"verify" | "ask"` — 확장은 값 추가로(스키마 `v` 는 올리지 않는다).
    pub purpose: String,
    /// 사용자 본인의 말만. 연결 확인은 `null`.
    pub question: Option<String>,
    pub scope: AuditScope,
    /// 전송 전문의 sha256 — "미리보기에서 본 그 페이로드가 맞나" 의 사후 앵커.
    pub payload_sha256: String,
}

/// 응답이 온 뒤에야 알 수 있는 사실들.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditOutcome {
    /// `"ok" | "denied" | "error"`. 예약 줄에는 이 필드 자체가 없다.
    pub outcome: String,
    pub http_status: Option<u16>,
    pub response_chars: usize,
    pub duration_ms: u64,
}

/// 디스크에 확정된 예약 줄의 위치. `offset` 은 그 줄이 시작하는 바이트다.
#[derive(Debug)]
pub struct AuditReservation {
    path: PathBuf,
    offset: u64,
    draft: AuditDraft,
}

/// 완성된 한 줄 = 전송 전 사실 + 응답 사실. `flatten` 이라 파일에는 두 구조체의
/// **선언 순서 그대로** 평평하게 찍힌다 — 사람이 열어 읽는 로그이므로 키 순서가
/// 곧 가독성이다.
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

/// **전송 직전** 호출. 감사 줄을 디스크에 확정(sync)하고 그 위치를 돌려준다.
/// 실패하면 호출자는 **아무것도 보내면 안 된다** — 그게 이 함수의 존재 이유다.
pub fn reserve(vault_dir: &Path, draft: AuditDraft) -> Result<AuditReservation, String> {
    fs::create_dir_all(vault_dir.join(SIDECAR_DIR))
        .map_err(|err| format!("감사 기록 폴더를 만들 수 없어요: {err}"))?;
    let path = audit_log_path(vault_dir);
    let line = serde_json::to_string(&draft)
        .map_err(|err| format!("감사 줄을 만들 수 없어요: {err}"))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|err| format!("감사 기록 파일을 열 수 없어요: {err}"))?;
    let offset = file
        .metadata()
        .map_err(|err| format!("감사 기록 파일을 읽을 수 없어요: {err}"))?
        .len();
    file.write_all(line.as_bytes())
        .and_then(|()| file.write_all(b"\n"))
        .map_err(|err| format!("감사 기록을 남기지 못했어요: {err}"))?;
    // sync 까지 해야 "보내기 전에 기록됐다" 가 크래시 앞에서도 참이 된다.
    file.sync_all()
        .map_err(|err| format!("감사 기록을 저장하지 못했어요: {err}"))?;

    Ok(AuditReservation {
        path,
        offset,
        draft,
    })
}

/// 응답 도착 후 호출. 예약 줄(파일 끝의 그 줄)만 잘라내고 완성된 한 줄로
/// 다시 쓴다 — 과거 줄은 읽지도 건드리지도 않는다. 이 파일에 쓰는 프로세스는
/// 이 앱 하나뿐이라(에이전트 활동 로그는 별도 파일) 잘라낼 꼬리가 남의 줄일
/// 수 없다.
pub fn finalize(reservation: AuditReservation, outcome: &AuditOutcome) -> Result<(), String> {
    let line = serde_json::to_string(&AuditLine {
        draft: &reservation.draft,
        outcome,
    })
    .map_err(|err| format!("감사 줄을 완성하지 못했어요: {err}"))?;

    let mut file = OpenOptions::new()
        .write(true)
        .open(&reservation.path)
        .map_err(|err| format!("감사 기록 파일을 열 수 없어요: {err}"))?;
    file.set_len(reservation.offset)
        .map_err(|err| format!("감사 기록을 정리하지 못했어요: {err}"))?;
    file.seek(SeekFrom::End(0))
        .map_err(|err| format!("감사 기록을 정리하지 못했어요: {err}"))?;
    file.write_all(line.as_bytes())
        .and_then(|()| file.write_all(b"\n"))
        .map_err(|err| format!("감사 기록을 완성하지 못했어요: {err}"))?;
    file.sync_all()
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
            payload_sha256: sha256_hex(""),
        }
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
        assert_eq!(lines.len(), 2, "확정은 줄을 늘리지 않는다 (한 호출 = 한 줄)");
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
