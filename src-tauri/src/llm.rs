// BYOK 연결 확인 (#80 S2) — 키가 실제로 동작하는지 1클릭으로 확인하고,
// 그 호출을 볼트 안 감사 로그에 남긴다.
//
// ## 이 파일이 지키는 불변식
//
// 1. **키는 IPC 를 다시 넘지 않는다.** 키체인 읽기도 전송도 Rust 안에서 끝나고,
//    WebView 로 나가는 것은 `LlmVerifyResult`(통과 여부·상태 코드·소요 시간)뿐.
// 2. **log-before-send.** 감사 줄 예약(`llm_audit::reserve`)이 실패하면 sender
//    를 아예 호출하지 않는다. 신뢰 헌장 ②를 규율이 아니라 코드 경로로 만든다.
// 3. **볼트 데이터 0자.** 연결 확인은 본문 없는 인증 확인 요청이다. 화면이
//    "볼트 데이터 0자" 라고 말할 수 있는 근거가 `AuditScope` 의 0 세 개다.
// 4. **자동 호출 금지.** 사용자가 [연결 확인]을 누를 때만 실행된다.
//
// ## 왜 curl 셸아웃인가
//
// ① HTTP 클라이언트 크레이트를 새로 들이지 않아 공급망 표면이 0 이고(git.rs 가
// 이미 시스템 git 을 셸아웃하는 선례), ② 무엇보다 **키가 argv 에 절대 오르지
// 않는다** — URL·헤더를 `--config -` 로 stdin 에 넘기므로 같은 기계의 다른
// 프로세스가 `ps` 로 키를 볼 수 없다. 키를 `-H` 인자로 넘기는 흔한 구현은 그
// 자체가 유출 경로다.

use crate::llm_audit::{self, AuditDraft, AuditOutcome, AuditScope};
use crate::secrets;
use serde::Serialize;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

/// 인증만 확인하는 최소 엔드포인트 — 모델 호출이 아니므로 토큰 과금·생성이
/// 없고, 보낼 본문도 없다.
const ANTHROPIC_VERIFY_URL: &str = "https://api.anthropic.com/v1/models?limit=1";
const OPENAI_VERIFY_URL: &str = "https://api.openai.com/v1/models";
/// 앤트로픽 API 가 요구하는 버전 헤더. 값이 바뀌면 401 이 아니라 400 이 온다.
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmVerifyResult {
    pub provider: String,
    /// 인증이 통과했나. 거부(401/403)와 그 외 실패를 화면이 다르게 말하도록
    /// `http_status` 를 같이 준다.
    pub ok: bool,
    pub http_status: Option<u16>,
    /// 네트워크 실패 등의 한 줄. 키는 stdin 으로만 가므로 여기 담길 수 없다.
    pub message: Option<String>,
    pub duration_ms: u64,
    /// 이 호출이 남긴 감사 줄의 시각 — 화면이 "기록됨" 을 사실로 말하게 한다.
    pub logged_at: String,
}

/// 전송할 요청. 본문은 없다(`GET`).
pub struct VerifyRequest {
    url: &'static str,
    headers: Vec<(String, String)>,
}

/// 응답에서 남기는 것 — 상태 코드와 **길이**뿐. 본문은 어디에도 저장하지 않는다.
pub struct HttpEcho {
    pub status: u16,
    pub body_chars: usize,
}

fn verify_request(provider: &str, secret: &str) -> Result<VerifyRequest, String> {
    // curl 설정 파일은 줄 단위라 줄바꿈이 든 값은 문법을 깨뜨린다. 저장 경로가
    // trim 하므로 정상 키에는 없지만, 깨진 설정으로 엉뚱한 요청이 나가는 것보다
    // 여기서 멈추는 게 낫다.
    if secret.contains('\n') || secret.contains('\r') {
        return Err("키에 줄바꿈이 섞여 있어요. 다시 저장해 주세요.".into());
    }
    match provider {
        "anthropic" => Ok(VerifyRequest {
            url: ANTHROPIC_VERIFY_URL,
            headers: vec![
                ("x-api-key".into(), secret.to_string()),
                ("anthropic-version".into(), ANTHROPIC_VERSION.into()),
            ],
        }),
        "openai" => Ok(VerifyRequest {
            url: OPENAI_VERIFY_URL,
            headers: vec![("authorization".into(), format!("Bearer {secret}"))],
        }),
        other => Err(format!("지원하지 않는 제공자예요: {other}")),
    }
}

/// argv 에 올라가는 인자 — **비밀이 하나도 없다**. URL 과 헤더는 stdin 으로 간다.
fn curl_argv() -> [&'static str; 8] {
    [
        "--silent",
        "--show-error",
        "--max-time",
        "20",
        "--write-out",
        "\n%{http_code}",
        "--config",
        "-",
    ]
}

fn curl_quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

/// stdin 으로 넘길 curl 설정 — 여기에만 키가 있다.
fn curl_config(request: &VerifyRequest) -> String {
    let mut config = format!("url = {}\n", curl_quote(request.url));
    for (name, value) in &request.headers {
        config.push_str(&format!("header = {}\n", curl_quote(&format!("{name}: {value}"))));
    }
    config
}

fn send_via_curl(request: &VerifyRequest) -> Result<HttpEcho, String> {
    let mut child = Command::new("curl")
        .args(curl_argv())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("요청을 보낼 수 없어요: {err}"))?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "요청을 보낼 수 없어요.".to_string())?
        .write_all(curl_config(request).as_bytes())
        .map_err(|err| format!("요청을 보낼 수 없어요: {err}"))?;
    let output = child
        .wait_with_output()
        .map_err(|err| format!("응답을 받지 못했어요: {err}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let (body, status_text) = match stdout.rsplit_once('\n') {
        Some(parts) => parts,
        None => ("", stdout.as_ref()),
    };
    let status: u16 = status_text.trim().parse().map_err(|_| {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            "응답을 받지 못했어요 (네트워크 확인).".to_string()
        } else {
            format!("응답을 받지 못했어요: {stderr}")
        }
    })?;
    Ok(HttpEcho {
        status,
        body_chars: body.chars().count(),
    })
}

/// 확인 흐름의 본체 — sender 를 주입받아 네트워크 없이도 계약을 시험할 수 있게
/// 한다. **순서가 계약이다**: 예약 → (성공했을 때만) 전송 → 확정.
pub fn verify_with<S>(
    provider: &str,
    vault_dir: &Path,
    secret: &str,
    send: S,
) -> Result<LlmVerifyResult, String>
where
    S: FnOnce(&VerifyRequest) -> Result<HttpEcho, String>,
{
    let request = verify_request(provider, secret)?;
    // 본문 없는 GET — 볼트에서 나가는 글자는 0자다. 빈 페이로드의 해시도
    // "0바이트를 보냈다" 를 사후 대조할 수 있는 사실이다.
    let payload = "";
    let logged_at = llm_audit::now_iso();
    let draft = AuditDraft {
        v: 1,
        at: logged_at.clone(),
        provider: provider.to_string(),
        // 모델을 부르지 않는 호출이므로 모델 이름이 없다 — 없는 값을 지어내지 않는다.
        model: None,
        purpose: "verify".into(),
        question: None,
        scope: AuditScope {
            nodes: vec![],
            prompt_chars: 0,
            vault_chars: 0,
        },
        payload_sha256: llm_audit::sha256_hex(payload),
    };
    // 기록이 안 되면 전송도 없다. 이 `?` 가 헌장 ②의 코드 경로다.
    let reservation = llm_audit::reserve(vault_dir, draft)?;

    let started = Instant::now();
    let echo = send(&request);
    let duration_ms = started.elapsed().as_millis() as u64;

    let (outcome, ok, http_status, response_chars, message) = match echo {
        Ok(HttpEcho { status, body_chars }) => {
            let ok = (200..300).contains(&status);
            let label = if ok {
                "ok"
            } else if status == 401 || status == 403 {
                "denied"
            } else {
                "error"
            };
            (label, ok, Some(status), body_chars, None)
        }
        Err(err) => ("error", false, None, 0, Some(err)),
    };

    // 확정에 실패하면 "기록이 완성된 호출" 이라는 약속이 깨진다 — 예약 줄은
    // 남아 있으니 사실은 보존되지만, 화면에는 성공이라고 말하지 않는다.
    llm_audit::finalize(
        reservation,
        &AuditOutcome {
            outcome: outcome.to_string(),
            http_status,
            response_chars,
            duration_ms,
        },
    )?;

    Ok(LlmVerifyResult {
        provider: provider.to_string(),
        ok,
        http_status,
        message,
        duration_ms,
        logged_at,
    })
}

/// 연결 확인 — **사용자가 [연결 확인]을 누를 때만**. 볼트 경로가 필요한 이유는
/// 감사 로그가 볼트 안에 살기 때문이다: 기록할 곳이 없으면 보내지 않는다.
#[tauri::command]
pub fn secret_verify(provider: String, vault_path: String) -> Result<LlmVerifyResult, String> {
    let known = secrets::validate_provider(&provider)?;
    let vault_dir = crate::git::validate_vault_dir(&vault_path)?;
    let secret = secrets::read_secret(known)?;
    verify_with(known, &vault_dir, &secret, send_via_curl)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::fs;
    use std::path::PathBuf;

    fn temp_vault(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "atlas-llm-verify-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_key_never_appears_in_argv() {
        // `ps` 로 다른 프로세스가 키를 볼 수 없어야 한다 — 비밀은 stdin 설정에만.
        let request = verify_request("anthropic", "sk-ant-secret-value").unwrap();
        for arg in curl_argv() {
            assert!(!arg.contains("sk-ant"), "argv 에 키가 실렸다: {arg}");
        }
        assert!(curl_config(&request).contains("sk-ant-secret-value"));
    }

    #[test]
    fn curl_config_quotes_values_so_a_key_cannot_inject_options() {
        let request = verify_request("openai", "abc\"def\\ghi").unwrap();
        let config = curl_config(&request);
        assert!(config.contains(r#"Bearer abc\"def\\ghi"#), "{config}");
        // 헤더/URL 은 각각 한 줄씩 — 값이 줄을 늘려 새 옵션을 만들 수 없다.
        assert_eq!(config.lines().count(), 2);
    }

    #[test]
    fn a_key_with_newlines_is_refused_before_any_request_is_built() {
        assert!(verify_request("anthropic", "sk-ant\nheader = evil").is_err());
    }

    #[test]
    fn refuses_to_send_when_the_audit_line_cannot_be_written() {
        // log-before-send 의 핵심: 기록할 수 없으면 **전송 자체가 없다**.
        let vault = temp_vault("blocked");
        fs::write(vault.join(".ontology-atlas"), b"not a directory").unwrap();
        let sent = Cell::new(false);
        let result = verify_with("anthropic", &vault, "sk-ant-test", |_| {
            sent.set(true);
            Ok(HttpEcho {
                status: 200,
                body_chars: 10,
            })
        });
        assert!(result.is_err());
        assert!(!sent.get(), "감사 기록에 실패했는데 전송이 일어났다");
        assert!(!llm_audit::audit_log_path(&vault).exists());
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_successful_check_leaves_exactly_one_complete_line() {
        let vault = temp_vault("ok");
        let result = verify_with("anthropic", &vault, "sk-ant-test", |request| {
            assert_eq!(request.url, ANTHROPIC_VERIFY_URL);
            Ok(HttpEcho {
                status: 200,
                body_chars: 42,
            })
        })
        .unwrap();
        assert!(result.ok);
        assert_eq!(result.http_status, Some(200));

        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        assert_eq!(raw.lines().count(), 1);
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line["purpose"], "verify");
        // 화면이 "볼트 데이터 0자" 라고 말하는 근거.
        assert_eq!(line["scope"]["vaultChars"], 0);
        assert_eq!(line["scope"]["promptChars"], 0);
        assert_eq!(line["question"], serde_json::Value::Null);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_rejected_key_is_recorded_as_denied_not_as_an_error() {
        let vault = temp_vault("denied");
        let result = verify_with("openai", &vault, "sk-bad", |_| {
            Ok(HttpEcho {
                status: 401,
                body_chars: 118,
            })
        })
        .unwrap();
        assert!(!result.ok);
        assert_eq!(result.http_status, Some(401));
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "denied");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_network_failure_is_still_recorded() {
        // 실패한 호출도 "나갔다" 는 사실이다 — 기록에서 빠지면 감사가 거짓말이 된다.
        let vault = temp_vault("neterr");
        let result = verify_with("anthropic", &vault, "sk-ant-test", |_| {
            Err("응답을 받지 못했어요: offline".into())
        })
        .unwrap();
        assert!(!result.ok);
        assert!(result.message.is_some());
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "error");
        assert_eq!(line["httpStatus"], serde_json::Value::Null);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn no_command_here_hands_the_key_back_to_the_webview() {
        // secrets.rs 의 소스-리플렉션 계약과 같은 규율: 이 파일의 커맨드는
        // `LlmVerifyResult`(키 없음)만 반환한다.
        let source = include_str!("llm.rs");
        let commands: Vec<usize> = source
            .match_indices("\n#[tauri::command]\npub fn ")
            .map(|(idx, _)| idx)
            .collect();
        assert_eq!(commands.len(), 1, "이 파일의 커맨드는 연결 확인 하나뿐이다");
        for idx in commands {
            let signature = &source[idx..(idx + 400).min(source.len())];
            assert!(
                signature.contains("Result<LlmVerifyResult, String>"),
                "모든 커맨드는 LlmVerifyResult 만 반환해야 한다"
            );
        }
    }
}
