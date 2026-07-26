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

use crate::llm_audit::{self, AuditDraft, AuditOutcome, AuditScope, AuditToolRef};
use crate::secrets;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

/// 인증만 확인하는 최소 엔드포인트 — 모델 호출이 아니므로 토큰 과금·생성이
/// 없고, 보낼 본문도 없다.
const ANTHROPIC_VERIFY_URL: &str = "https://api.anthropic.com/v1/models?limit=1";
const OPENAI_VERIFY_URL: &str = "https://api.openai.com/v1/models";
/// Gemini 공식 모델 목록 엔드포인트(공개 문서 `ai.google.dev/api/models`).
/// 키는 **헤더로만** 보낸다 — 문서의 `?key=` 쿼리 형태는 쓰지 않는다. URL 에
/// 실린 비밀은 프록시 로그·리퍼러·크래시 리포트에 그대로 남는 문법이고,
/// 우리 감사 로그에도 목적지 URL 이 남으므로 키가 기록에 섞일 자리를 없앤다.
const GEMINI_VERIFY_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
/// 앤트로픽 API 가 요구하는 버전 헤더. 값이 바뀌면 401 이 아니라 400 이 온다.
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// 대화 엔드포인트 — 확인 URL 과 **같은 호스트**를 쓴다. 호스트가 갈라지면
/// 화면이 키 등록 때 약속한 목적지와 실제 대화가 가는 곳이 달라진다.
const ANTHROPIC_CHAT_URL: &str = "https://api.anthropic.com/v1/messages";
const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
/// Gemini 는 모델 이름이 **경로에** 들어간다 — 그래서 이 상수는 접두어이고,
/// 뒤에 `{model}:generateContent` 가 붙는다. 모델 문자열이 경로로 흘러가므로
/// `validate_model_id` 로 먼저 좁힌다(경로 탈출·쿼리 주입 차단).
const GEMINI_CHAT_URL_PREFIX: &str = "https://generativelanguage.googleapis.com/v1beta/models/";

/// 대화 왕복의 curl 제한 시간(초). 확인(20초)보다 길다 — 모델이 도구 호출을
/// 결정하는 데 수십 초가 걸리는 것은 정상이고, 여기서 끊으면 사용자가 이유를
/// 알 수 없는 실패를 본다. 그래도 무한은 아니다: [멈추기]가 사용자 쪽 상한이고
/// 이 값은 매달린 소켓의 상한이다.
const CHAT_TIMEOUT_SECONDS: &str = "180";

/// "키가 틀렸다" 로 읽어야 할 상태 코드. 벤더마다 다르므로 요청에 붙여 다닌다 —
/// 화면이 `거부됨`(사용자가 키를 고치면 되는 일)과 `실패`(우리/네트워크 문제)를
/// 다르게 말할 수 있는 근거다.
const AUTH_DENIED_STATUSES: &[u16] = &[401, 403];
/// Gemini 는 **틀린 키에 400 을 준다** (2026-07-26 실측: 본문
/// `{"error":{"code":400,"status":"INVALID_ARGUMENT","details":[…"reason":
/// "API_KEY_INVALID"…]}}`). 401/403 로만 판정하면 틀린 키가 "확인하지 못했어요"
/// 라는 엉뚱한 안내로 떨어진다.
///
/// 400 을 통째로 거부로 읽어도 되는 이유: 이 호출은 본문 없는 고정 GET 이고
/// URL·헤더 이름이 전부 코드 상수라, 요청에서 **변하는 값이 키 하나뿐**이다.
/// 400 을 만들 다른 입력이 우리 쪽에 없다.
const GEMINI_DENIED_STATUSES: &[u16] = &[400, 401, 403];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmVerifyResult {
    pub provider: String,
    /// 인증이 통과했나. 거부(401/403)와 그 외 실패를 화면이 다르게 말하도록
    /// `http_status` 를 같이 준다.
    pub ok: bool,
    pub http_status: Option<u16>,
    /// 키 자체가 거부됐나 — 벤더별 상태 코드 차이(Gemini 는 400)를 여기서 한 번
    /// 흡수한다. 화면이 상태 코드를 다시 해석하면 벤더가 늘 때마다 같은 지식이
    /// 두 곳에서 갈라진다.
    pub denied: bool,
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
    /// 이 벤더에서 "키가 틀렸다" 를 뜻하는 상태 코드들.
    denied_statuses: &'static [u16],
}

/// URL 의 호스트 — 감사 줄의 `host` 와 화면의 "어디로 가는가" 가 같은 값을
/// 쓰도록 **URL 상수 하나에서 파생**시킨다. 호스트를 따로 상수로 두면 URL 을
/// 고칠 때 조용히 어긋나서, 기록이 실제 목적지와 다른 곳을 가리키게 된다.
fn host_of(url: &str) -> &str {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_scheme)
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
            denied_statuses: AUTH_DENIED_STATUSES,
        }),
        "openai" => Ok(VerifyRequest {
            url: OPENAI_VERIFY_URL,
            headers: vec![("authorization".into(), format!("Bearer {secret}"))],
            denied_statuses: AUTH_DENIED_STATUSES,
        }),
        // Gemini 는 Bearer 가 아니라 전용 헤더를 쓴다 — OpenAI 호환 갈래로
        // 흡수되지 않는 인증이라 명명 벤더 자리를 받는다.
        "gemini" => Ok(VerifyRequest {
            url: GEMINI_VERIFY_URL,
            headers: vec![("x-goog-api-key".into(), secret.to_string())],
            denied_statuses: GEMINI_DENIED_STATUSES,
        }),
        other => Err(format!("지원하지 않는 제공자예요: {other}")),
    }
}

/// argv 에 올라가는 인자 — **비밀이 하나도 없다**. URL·헤더·본문은 stdin 으로
/// 간다. 대화 왕복은 제한 시간만 다르다.
fn curl_argv_with_timeout(timeout_seconds: &'static str) -> [&'static str; 8] {
    [
        "--silent",
        "--show-error",
        "--max-time",
        timeout_seconds,
        "--write-out",
        "\n%{http_code}",
        "--config",
        "-",
    ]
}

fn curl_argv() -> [&'static str; 8] {
    curl_argv_with_timeout("20")
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

/// stdin 으로 넘길 curl 설정 — 여기에만 키가 있고, 대화 왕복에서는 **볼트
/// 발췌가 실린 본문도** 여기로만 간다(argv·임시 파일 경유 없음).
fn curl_config_for(url: &str, headers: &[(String, String)], body: Option<&str>) -> String {
    let mut config = format!("url = {}\n", curl_quote(url));
    for (name, value) in headers {
        config.push_str(&format!("header = {}\n", curl_quote(&format!("{name}: {value}"))));
    }
    if let Some(body) = body {
        config.push_str("request = \"POST\"\n");
        config.push_str(&format!("data = {}\n", curl_quote(body)));
    }
    config
}

fn curl_config(request: &VerifyRequest) -> String {
    curl_config_for(request.url, &request.headers, None)
}

fn run_curl(argv: [&'static str; 8], config: &str) -> Result<(u16, String), String> {
    let mut child = Command::new("curl")
        .args(argv)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("요청을 보낼 수 없어요: {err}"))?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "요청을 보낼 수 없어요.".to_string())?
        .write_all(config.as_bytes())
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
    Ok((status, body.to_string()))
}

fn send_via_curl(request: &VerifyRequest) -> Result<HttpEcho, String> {
    let (status, body) = run_curl(curl_argv(), &curl_config(request))?;
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
        // 목적지를 provider 이름이 아니라 **호스트로** 남긴다. 이름은 우리가
        // 붙인 라벨이지만 호스트는 요청이 실제로 향한 곳이라, 나중에 사용자가
        // 주소를 직접 적는 갈래가 열려도 같은 문법으로 정직하게 읽힌다.
        host: host_of(request.url).to_string(),
        // 모델을 부르지 않는 호출이므로 모델 이름이 없다 — 없는 값을 지어내지 않는다.
        model: None,
        purpose: "verify".into(),
        question: None,
        scope: AuditScope {
            nodes: vec![],
            prompt_chars: 0,
            vault_chars: 0,
        },
        // 도구를 쓰지 않는 호출이다 — 빈 목록조차 남기지 않는다(§ llm_audit).
        tools: None,
        payload_sha256: llm_audit::sha256_hex(payload),
    };
    // 기록이 안 되면 전송도 없다. 이 `?` 가 헌장 ②의 코드 경로다.
    let reservation = llm_audit::reserve(vault_dir, draft)?;

    let started = Instant::now();
    let echo = send(&request);
    let duration_ms = started.elapsed().as_millis() as u64;

    let (outcome, ok, denied, http_status, response_chars, message) = match echo {
        Ok(HttpEcho { status, body_chars }) => {
            let ok = (200..300).contains(&status);
            let denied = !ok && request.denied_statuses.contains(&status);
            let label = if ok {
                "ok"
            } else if denied {
                "denied"
            } else {
                "error"
            };
            (label, ok, denied, Some(status), body_chars, None)
        }
        Err(err) => ("error", false, false, None, 0, Some(err)),
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
        denied,
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

// ── 대화 왕복 (볼트 에이전트) ─────────────────────────────────────────────
//
// 여기서 Rust 가 하는 일은 셋뿐이다: **비밀 취급 · 전송 · 감사.** 요청 본문을
// 만들지도, 응답을 해석하지도 않는다 — 그건 WebView 의 일이다(벤더 형식 차이는
// 어댑터 한 곳에서 흡수하는 편이 낫고, Rust 가 벤더 스키마를 알기 시작하면
// 벤더가 바뀔 때마다 앱을 다시 빌드해야 한다).
//
// **Rust 는 루프를 모른다.** 왕복 1회 = 이 커맨드 호출 1회다. 상한·중단·턴
// 개념은 전부 WebView 소유라, 사용자 턴 없이 이 커맨드가 도는 경로가 애초에
// 만들어지지 않는다.

/// 대화 요청. 확인 요청과 달리 **본문이 있다** — 그 본문에 볼트 발췌가 실린다.
pub struct ChatRequest {
    url: String,
    headers: Vec<(String, String)>,
    body: String,
}

/// 응답에서 WebView 로 돌려주는 것 — 상태 코드와 **본문**. 본문은 정규화가
/// 필요해서 넘길 뿐이고, 감사 로그에는 길이만 남는다(대화 저장소가 아니다).
pub struct ChatEcho {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatEcho {
    pub status: u16,
    pub body: String,
    /// 이 왕복이 실제로 간 곳 — 화면 푸터와 감사 줄이 같은 값을 말한다.
    pub host: String,
    pub duration_ms: u64,
    /// 이 왕복이 남긴 감사 줄의 시각. 화면이 "기록됨" 을 사실로 말하는 근거다.
    pub logged_at: String,
}

/// WebView 가 실측해서 넘기는 전송 범위 + 이 왕복에 실린 도구 호출들.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditScopeInput {
    #[serde(default)]
    pub nodes: Vec<String>,
    #[serde(default)]
    pub prompt_chars: usize,
    #[serde(default)]
    pub vault_chars: usize,
    #[serde(default)]
    pub tools: Vec<AuditToolRef>,
}

/// 모델 이름은 Gemini 에서 **URL 경로**가 된다 — 그래서 좁힌다. 경로 구분자·
/// 쿼리·프래그먼트가 섞이면 우리가 고르지 않은 엔드포인트로 키가 나간다.
fn validate_model_id(model: &str) -> Result<&str, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Err("모델 이름이 비어 있어요.".into());
    }
    if trimmed.len() > 100
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Err(format!("모델 이름에 쓸 수 없는 문자가 있어요: {trimmed}"));
    }
    Ok(trimmed)
}

fn chat_request(provider: &str, model: &str, secret: &str, body: &str) -> Result<ChatRequest, String> {
    if secret.contains('\n') || secret.contains('\r') {
        return Err("키에 줄바꿈이 섞여 있어요. 다시 저장해 주세요.".into());
    }
    let model = validate_model_id(model)?;
    let json = ("content-type".to_string(), "application/json".to_string());
    match provider {
        "anthropic" => Ok(ChatRequest {
            url: ANTHROPIC_CHAT_URL.to_string(),
            headers: vec![
                ("x-api-key".into(), secret.to_string()),
                ("anthropic-version".into(), ANTHROPIC_VERSION.into()),
                json,
            ],
            body: body.to_string(),
        }),
        "openai" => Ok(ChatRequest {
            url: OPENAI_CHAT_URL.to_string(),
            headers: vec![("authorization".into(), format!("Bearer {secret}")), json],
            body: body.to_string(),
        }),
        "gemini" => Ok(ChatRequest {
            url: format!("{GEMINI_CHAT_URL_PREFIX}{model}:generateContent"),
            headers: vec![("x-goog-api-key".into(), secret.to_string()), json],
            body: body.to_string(),
        }),
        other => Err(format!("지원하지 않는 제공자예요: {other}")),
    }
}

fn curl_chat_config(request: &ChatRequest) -> String {
    curl_config_for(&request.url, &request.headers, Some(&request.body))
}

fn send_chat_via_curl(request: &ChatRequest) -> Result<ChatEcho, String> {
    let (status, body) = run_curl(
        curl_argv_with_timeout(CHAT_TIMEOUT_SECONDS),
        &curl_chat_config(request),
    )?;
    Ok(ChatEcho { status, body })
}

/// 대화 왕복의 본체 — sender 주입형. **순서가 계약이다**: 예약 → (성공했을
/// 때만) 전송 → 확정. `verify_with` 와 같은 문법을 일부러 반복한다.
#[allow(clippy::too_many_arguments)]
pub fn chat_with<S>(
    provider: &str,
    vault_dir: &Path,
    model: &str,
    question: Option<&str>,
    secret: &str,
    body: &str,
    scope: AuditScopeInput,
    send: S,
) -> Result<LlmChatEcho, String>
where
    S: FnOnce(&ChatRequest) -> Result<ChatEcho, String>,
{
    let request = chat_request(provider, model, secret, body)?;
    let host = host_of(&request.url).to_string();
    let logged_at = llm_audit::now_iso();
    let draft = AuditDraft {
        v: 1,
        at: logged_at.clone(),
        provider: provider.to_string(),
        host: host.clone(),
        model: Some(validate_model_id(model)?.to_string()),
        purpose: "agent".into(),
        question: question.map(str::to_string),
        scope: AuditScope {
            nodes: scope.nodes,
            prompt_chars: scope.prompt_chars,
            vault_chars: scope.vault_chars,
        },
        // 빈 목록은 "도구 없이 보낸 첫 왕복" 이라는 사실이므로 그대로 남긴다 —
        // 연결 확인 줄의 부재(`None`)와는 다른 뜻이다.
        tools: Some(scope.tools),
        // 전송 **전문**의 해시. 화면이 보여준 범위와 실제로 나간 바이트가 같은지
        // 사후에 대조할 수 있는 유일한 앵커다.
        payload_sha256: llm_audit::sha256_hex(body),
    };
    // 기록이 안 되면 전송도 없다.
    let reservation = llm_audit::reserve(vault_dir, draft)?;

    let started = Instant::now();
    let echo = send(&request);
    let duration_ms = started.elapsed().as_millis() as u64;

    let (outcome, status, response_body, message) = match echo {
        Ok(ChatEcho { status, body }) => {
            let label = if (200..300).contains(&status) {
                "ok"
            } else if AUTH_DENIED_STATUSES.contains(&status) {
                "denied"
            } else {
                "error"
            };
            (label, Some(status), body, None)
        }
        Err(err) => ("error", None, String::new(), Some(err)),
    };

    llm_audit::finalize(
        reservation,
        &AuditOutcome {
            outcome: outcome.to_string(),
            http_status: status,
            response_chars: response_body.chars().count(),
            duration_ms,
        },
    )?;

    // 네트워크 자체가 실패했으면 상태 코드가 없다 — 0 으로 지어내지 않고
    // 호출자에게 실패로 돌린다(화면은 "연결에 실패했어요" 를 말한다).
    if let Some(message) = message {
        return Err(message);
    }

    Ok(LlmChatEcho {
        status: status.unwrap_or_default(),
        body: response_body,
        host,
        duration_ms,
        logged_at,
    })
}

/// 대화 왕복 1회 — **사용자가 [보내기]를 누른 턴 안에서만**. 볼트 경로가
/// 필수인 이유는 확인 흐름과 같다: 기록할 곳이 없으면 보내지 않는다.
#[tauri::command]
pub fn llm_chat(
    provider: String,
    vault_path: String,
    model: String,
    question: Option<String>,
    body: String,
    scope: AuditScopeInput,
) -> Result<LlmChatEcho, String> {
    let known = secrets::validate_provider(&provider)?;
    let vault_dir = crate::git::validate_vault_dir(&vault_path)?;
    let secret = secrets::read_secret(known)?;
    chat_with(
        known,
        &vault_dir,
        &model,
        question.as_deref(),
        &secret,
        &body,
        scope,
        send_chat_via_curl,
    )
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
    fn the_gemini_key_travels_in_a_header_never_in_the_url() {
        // 공식 문서는 `?key=` 쿼리 형태도 안내하지만 우리는 헤더만 쓴다 — URL 은
        // 감사 줄·프록시 로그에 그대로 남는 자리라 비밀이 실리면 안 된다.
        let request = verify_request("gemini", "AIza-secret-value").unwrap();
        assert_eq!(request.url, GEMINI_VERIFY_URL);
        assert!(!request.url.contains("key="), "URL 에 키 자리가 있으면 안 된다");
        assert!(!request.url.contains("AIza-secret-value"));
        for arg in curl_argv() {
            assert!(!arg.contains("AIza"), "argv 에 키가 실렸다: {arg}");
        }
        let config = curl_config(&request);
        assert!(config.contains("x-goog-api-key: AIza-secret-value"), "{config}");
    }

    #[test]
    fn curl_never_follows_a_redirect() {
        // 리다이렉트를 따라가면 키가 우리가 고르지 않은 호스트로 다시 전송된다.
        // 이 단언이 그 옵션의 부재를 회귀 불가능하게 못박는다.
        for arg in curl_argv() {
            assert_ne!(arg, "-L");
            assert_ne!(arg, "--location");
        }
    }

    #[test]
    fn every_named_vendor_is_reachable_only_over_https() {
        for provider in ["anthropic", "openai", "gemini"] {
            let request = verify_request(provider, "secret").unwrap();
            assert!(
                request.url.starts_with("https://"),
                "{provider} 의 확인 주소가 평문이다: {}",
                request.url
            );
        }
    }

    #[test]
    fn the_recorded_host_is_derived_from_the_url_the_request_actually_uses() {
        // 호스트를 따로 상수로 두면 URL 을 고칠 때 조용히 어긋난다 — 파생값이라
        // 기록이 실제 목적지를 벗어날 수 없다.
        assert_eq!(host_of("https://api.anthropic.com/v1/models?limit=1"), "api.anthropic.com");
        assert_eq!(host_of("https://api.openai.com/v1/models"), "api.openai.com");
        assert_eq!(host_of("https://example.com"), "example.com");
        assert_eq!(host_of("https://example.com#frag"), "example.com");
    }

    #[test]
    fn the_hosts_match_the_shared_fixture_the_screen_promises() {
        // 화면은 키를 붙여넣기 **전에** "이 키가 가는 곳" 을 말한다. 그 문장이
        // 실제 목적지와 같은지는 웹 쪽 테스트가 같은 픽스처로 함께 잡는다.
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/llm-provider-hosts.json"))
                .unwrap();
        let hosts = fixture["hosts"].as_object().unwrap();
        assert_eq!(hosts.len(), 3, "픽스처가 명명 벤더 전부를 덮어야 한다");
        for (provider, expected) in hosts {
            let request = verify_request(provider, "secret").unwrap();
            assert_eq!(host_of(request.url), expected.as_str().unwrap(), "{provider}");
        }
    }

    #[test]
    fn a_gemini_key_rejected_with_400_is_a_rejection_not_a_failure() {
        // 2026-07-26 실측: Gemini 는 틀린 키에 400(`API_KEY_INVALID`)을 준다.
        // 401/403 로만 판정하면 사용자가 "확인하지 못했어요" 를 보고 자기 키가
        // 아니라 앱이 고장난 줄 안다.
        let vault = temp_vault("gemini400");
        let result = verify_with("gemini", &vault, "AIza-bad", |request| {
            assert_eq!(request.url, GEMINI_VERIFY_URL);
            Ok(HttpEcho {
                status: 400,
                body_chars: 118,
            })
        })
        .unwrap();
        assert!(!result.ok);
        assert!(result.denied, "400 이 거부로 읽혀야 한다");
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "denied");
        assert_eq!(line["host"], "generativelanguage.googleapis.com");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_400_from_a_bearer_vendor_is_still_a_plain_failure() {
        // 거부 상태는 벤더별 목록이다 — Gemini 의 400 규칙이 다른 벤더로 새면
        // 우리 쪽 요청 실수까지 "키가 틀렸다" 로 오진한다.
        let vault = temp_vault("openai400");
        let result = verify_with("openai", &vault, "sk-test", |_| {
            Ok(HttpEcho {
                status: 400,
                body_chars: 10,
            })
        })
        .unwrap();
        assert!(!result.denied);
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "error");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn every_recorded_call_names_the_host_it_went_to() {
        let vault = temp_vault("host");
        verify_with("openai", &vault, "sk-test", |_| {
            Ok(HttpEcho {
                status: 200,
                body_chars: 42,
            })
        })
        .unwrap();
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["host"], "api.openai.com");
        // 추가형 확장이라 스키마 버전은 그대로다 — 옛 줄이 계속 읽혀야 한다.
        assert_eq!(line["v"], 1);
        fs::remove_dir_all(&vault).ok();
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
        // 키를 담을 수 없는 타입만 반환한다. 새 커맨드가 늘어도 반환 타입이
        // 이 허용 목록 밖이면 여기서 걸린다.
        let source = include_str!("llm.rs");
        let commands: Vec<usize> = source
            .match_indices("\n#[tauri::command]\npub fn ")
            .map(|(idx, _)| idx)
            .collect();
        assert_eq!(commands.len(), 2, "연결 확인과 대화 왕복 둘뿐이다");
        for idx in commands {
            let signature = &source[idx..(idx + 600).min(source.len())];
            assert!(
                signature.contains("Result<LlmVerifyResult, String>")
                    || signature.contains("Result<LlmChatEcho, String>"),
                "커맨드 반환 타입이 허용 목록 밖이다: {}",
                &signature[..signature.find('{').unwrap_or(200).min(signature.len())]
            );
        }
    }

    // ── 대화 왕복 ─────────────────────────────────────────────────────────

    #[test]
    fn a_chat_key_never_appears_in_argv_and_neither_does_the_vault_excerpt() {
        // 볼트 발췌가 argv 에 오르면 같은 기계의 다른 프로세스가 `ps` 로 사용자
        // 문서를 읽는다 — 키와 똑같이 stdin 설정에만 실려야 한다.
        let request = chat_request(
            "anthropic",
            "claude-sonnet-4-5",
            "sk-ant-secret-value",
            r#"{"messages":[{"role":"user","content":"결제 처리 노드"}]}"#,
        )
        .unwrap();
        for arg in curl_argv_with_timeout(CHAT_TIMEOUT_SECONDS) {
            assert!(!arg.contains("sk-ant"), "argv 에 키가 실렸다: {arg}");
            assert!(!arg.contains("결제"), "argv 에 볼트 발췌가 실렸다: {arg}");
        }
        let config = curl_chat_config(&request);
        assert!(config.contains("sk-ant-secret-value"));
        assert!(config.contains("결제 처리 노드"));
        assert!(config.contains("request = \"POST\""));
    }

    #[test]
    fn a_json_body_survives_the_curl_config_escape_round_trip() {
        // curl 설정은 따옴표 안에서 `\n` 을 진짜 줄바꿈으로 되돌린다. 백슬래시를
        // 먼저 이스케이프하지 않으면 JSON 문자열 안의 `\n` 이 날것 줄바꿈이 되어
        // 보내는 본문 자체가 깨진 JSON 이 된다.
        let body = r#"{"text":"first\nsecond","quote":"say \"hi\""}"#;
        let request = chat_request("openai", "gpt-4.1", "sk-test", body).unwrap();
        let config = curl_chat_config(&request);
        let data_line = config
            .lines()
            .find(|line| line.starts_with("data = "))
            .expect("data 줄이 있어야 한다");
        // curl 이 되돌리는 것과 같은 규칙으로 풀어 원문과 같은지 본다.
        let quoted = data_line.trim_start_matches("data = ");
        let inner = &quoted[1..quoted.len() - 1];
        let mut restored = String::new();
        let mut chars = inner.chars();
        while let Some(ch) = chars.next() {
            if ch == '\\' {
                restored.push(chars.next().expect("이스케이프가 잘리면 안 된다"));
            } else {
                restored.push(ch);
            }
        }
        assert_eq!(restored, body);
        // 설정은 여전히 줄 단위다 — 본문이 새 옵션 줄을 만들 수 없다.
        // url · header×2 · request · data = 5.
        assert_eq!(config.lines().count(), 5, "{config}");
    }

    #[test]
    fn every_chat_endpoint_is_https_and_shares_the_verify_host() {
        // 키 등록 화면이 약속한 목적지와 대화가 가는 곳이 같아야 한다.
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/llm-provider-hosts.json"))
                .unwrap();
        let hosts = fixture["hosts"].as_object().unwrap();
        for (provider, expected) in hosts {
            let request = chat_request(provider, "some-model-1.5", "secret", "{}").unwrap();
            assert!(request.url.starts_with("https://"), "{provider}");
            assert_eq!(host_of(&request.url), expected.as_str().unwrap(), "{provider}");
            assert!(!request.url.contains("key="), "URL 에 키 자리가 있으면 안 된다");
        }
    }

    #[test]
    fn a_model_name_cannot_escape_the_gemini_url_path() {
        // Gemini 만 모델이 경로로 들어간다 — 슬래시·쿼리가 통과하면 우리가
        // 고르지 않은 엔드포인트로 키가 나간다.
        for bad in ["../../v1/evil", "x?key=leak", "a b", "m#frag", ""] {
            assert!(validate_model_id(bad).is_err(), "통과하면 안 된다: {bad:?}");
        }
        let request = chat_request("gemini", "gemini-2.5-flash", "AIza-secret", "{}").unwrap();
        assert_eq!(
            request.url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        );
    }

    #[test]
    fn a_chat_round_trip_refuses_to_send_when_the_audit_line_cannot_be_written() {
        // log-before-send — 대화 경로에서도 똑같다.
        let vault = temp_vault("chat-blocked");
        fs::write(vault.join(".ontology-atlas"), b"not a directory").unwrap();
        let sent = Cell::new(false);
        let result = chat_with(
            "anthropic",
            &vault,
            "claude-sonnet-4-5",
            Some("빠진 관계 이어줘"),
            "sk-ant-test",
            "{}",
            AuditScopeInput {
                nodes: vec![],
                prompt_chars: 0,
                vault_chars: 0,
                tools: vec![],
            },
            |_| {
                sent.set(true);
                Ok(ChatEcho {
                    status: 200,
                    body: "{}".into(),
                })
            },
        );
        assert!(result.is_err());
        assert!(!sent.get(), "감사 기록에 실패했는데 전송이 일어났다");
        assert!(!llm_audit::audit_log_path(&vault).exists());
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_chat_round_trip_records_purpose_scope_and_the_tools_that_rode_along() {
        let vault = temp_vault("chat-ok");
        let body = r#"{"model":"claude-sonnet-4-5","messages":[]}"#;
        let result = chat_with(
            "anthropic",
            &vault,
            "claude-sonnet-4-5",
            Some("이 노드에 빠진 관계 이어줘"),
            "sk-ant-test",
            body,
            AuditScopeInput {
                nodes: vec!["capabilities/payment".into()],
                prompt_chars: 2_100,
                vault_chars: 1_020,
                tools: vec![AuditToolRef {
                    name: "get_concept".into(),
                    target: "capabilities/payment".into(),
                }],
            },
            |request| {
                assert_eq!(request.url, ANTHROPIC_CHAT_URL);
                Ok(ChatEcho {
                    status: 200,
                    body: "{\"content\":[]}".into(),
                })
            },
        )
        .unwrap();
        assert_eq!(result.status, 200);
        assert_eq!(result.host, "api.anthropic.com");

        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        assert_eq!(raw.lines().count(), 1, "왕복 1회 = 줄 1개");
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["purpose"], "agent");
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line["question"], "이 노드에 빠진 관계 이어줘");
        assert_eq!(line["scope"]["vaultChars"], 1_020);
        assert_eq!(line["scope"]["nodes"][0], "capabilities/payment");
        assert_eq!(line["tools"][0]["name"], "get_concept");
        assert_eq!(line["model"], "claude-sonnet-4-5");
        // 페이로드 앵커는 **실제로 보낸 문자열**의 해시여야 사후 대조가 된다.
        assert_eq!(line["payloadSha256"], llm_audit::sha256_hex(body));
        // 응답 본문은 길이만 남는다 — 대화 저장소가 아니다.
        assert_eq!(line["responseChars"], 14);
        assert!(!raw.contains("content\\\":[]"), "응답 본문이 기록되면 안 된다");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn the_agent_line_this_module_writes_matches_the_shared_reader_fixture() {
        // writer(여기) ↔ reader(웹 `llm-audit-log.ts`) drift 차단. 픽스처의
        // `purpose:"agent"` 줄이 이 코드가 실제로 쓰는 모습과 같아야 한다 —
        // 시각·소요 시간만 호출마다 달라지므로 그 둘은 비교에서 뺀다.
        let fixture = include_str!("../../tests/fixtures/llm-audit-log.sample.jsonl");
        let expected: serde_json::Value = fixture
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
            .find(|line| line["purpose"] == "agent")
            .expect("픽스처에 에이전트 줄이 있어야 한다");

        let vault = temp_vault("chat-fixture");
        chat_with(
            "anthropic",
            &vault,
            "claude-sonnet-4-5",
            Some("이 노드에 빠진 관계 이어줘"),
            "sk-ant-test",
            r#"{"model":"claude-sonnet-4-5","messages":[]}"#,
            AuditScopeInput {
                nodes: vec!["capabilities/payment".into()],
                prompt_chars: 2_100,
                vault_chars: 1_020,
                tools: vec![AuditToolRef {
                    name: "get_concept".into(),
                    target: "capabilities/payment".into(),
                }],
            },
            |_| {
                Ok(ChatEcho {
                    status: 200,
                    body: "x".repeat(812),
                })
            },
        )
        .unwrap();
        let mut actual: serde_json::Value =
            serde_json::from_str(fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap().trim())
                .unwrap();
        let mut expected = expected;
        for volatile in ["at", "durationMs"] {
            actual[volatile] = serde_json::Value::Null;
            expected[volatile] = serde_json::Value::Null;
        }
        assert_eq!(actual, expected);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_failed_chat_is_still_recorded_before_the_error_surfaces() {
        let vault = temp_vault("chat-neterr");
        let result = chat_with(
            "openai",
            &vault,
            "gpt-4.1",
            None,
            "sk-test",
            "{}",
            AuditScopeInput {
                nodes: vec![],
                prompt_chars: 10,
                vault_chars: 0,
                tools: vec![],
            },
            |_| Err("응답을 받지 못했어요: offline".into()),
        );
        assert!(result.is_err());
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "error");
        assert_eq!(line["purpose"], "agent");
        assert_eq!(line["httpStatus"], serde_json::Value::Null);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_rejected_chat_key_is_recorded_as_denied() {
        let vault = temp_vault("chat-denied");
        let result = chat_with(
            "openai",
            &vault,
            "gpt-4.1",
            None,
            "sk-bad",
            "{}",
            AuditScopeInput {
                nodes: vec![],
                prompt_chars: 10,
                vault_chars: 0,
                tools: vec![],
            },
            |_| {
                Ok(ChatEcho {
                    status: 401,
                    body: "{\"error\":\"invalid\"}".into(),
                })
            },
        )
        .unwrap();
        // 거부도 응답이다 — 화면이 상태 코드로 안내를 고를 수 있게 그대로 준다.
        assert_eq!(result.status, 401);
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "denied");
        fs::remove_dir_all(&vault).ok();
    }
}
