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
/// 로컬 러너는 사용자의 같은 기계에서 돌고 재시도가 무료다. 3분 동안 패널을
/// 붙잡는 것보다 한 왕복을 실패로 닫고 더 작은 모델/질문을 고르게 하는 편이
/// 정직하다. 원격 모델의 긴 생성 여유와 분리한다.
const LOCAL_CHAT_TIMEOUT_SECONDS: &str = "60";

/// "키가 틀렸다" 로 읽어야 할 상태 코드. 벤더마다 다르므로 요청에 붙여 다닌다 —
/// 화면이 `거부됨`(사용자가 키를 고치면 되는 일)과 `실패`(우리/네트워크 문제)를
/// 다르게 말할 수 있는 근거다.
const AUTH_DENIED_STATUSES: &[u16] = &[401, 403];
/// ── 주소로 연결 (키 없는 로컬 러너) ──────────────────────────────────────
///
/// `secrets.rs` 가 명명 벤더를 3에서 동결하면서 남겨 둔 갈래가 이것이다:
/// **사용자가 주소를 직접 적는다.** 벤더 이름을 하나 더 박는 대신 문 하나를
/// 여는 이유는 롱테일 때문이다 — Ollama · LM Studio · llama.cpp server ·
/// vLLM · LocalAI 가 전부 같은 OpenAI 호환 문법(`/v1/chat/completions`)을
/// 내놓으므로, 주소가 변수이면 러너 목록은 우리 코드에 없어도 된다.
///
/// **이 갈래에는 키가 없다.** 키체인을 지나가지 않고(`secrets::PROVIDERS` 에
/// 없다), 인증 헤더를 붙이지 않는다. 그래서 "제공자 = 비밀키 하나" 라는 기존
/// 모양이 성립하지 않던 자리가 열린다.
pub const LOCAL_PROVIDER: &str = "local";
/// Ollama 의 기본 포트. **기본값일 뿐 상수가 아니다** — 사용자가 바꾼다.
pub const LOCAL_DEFAULT_BASE_URL: &str = "http://localhost:11434";
/// 설치된 모델 목록. Ollama 네이티브(`/api/tags`)가 아니라 **OpenAI 호환**
/// 목록을 쓴다 — 같은 한 번의 확인이 Ollama 말고 다른 러너에서도 그대로
/// 동작해야 이 갈래가 "오픈소스들" 의 문이 된다 (2026-08-01 실측: Ollama
/// 0.12 가 `/v1/models` 에 7개 모델을 200 으로 준다).
const LOCAL_MODELS_PATH: &str = "models";
const LOCAL_CHAT_PATH: &str = "chat/completions";

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
    /// 확인 응답의 **본문** — 주소 갈래에서만 채운다.
    ///
    /// 왜 명명 벤더는 `None` 인가: 그쪽 확인은 인증만 보는 호출이라 화면이
    /// 본문으로 할 일이 없고, 응답에 계정 정보가 섞일 수 있는 자리를 IPC 로
    /// 내보낼 이유가 없다. 주소 갈래는 반대다 — 이 본문이 곧 **설치된 모델
    /// 목록**이고, 그걸 화면이 골라야 사용자가 모델 이름을 손으로 타이핑하다
    /// 오타 하나로 실패하지 않는다. 파싱은 여기서 하지 않는다(§ 이 파일이
    /// 벤더 스키마를 모르는 이유) — 웹 어댑터가 한다.
    pub body: Option<String>,
}

/// 이 요청이 어떤 문으로 나가는가 — **잘못된 조합이 아예 표현되지 않게** 타입
/// 으로 가른다. 명명 벤더는 키를 붙이고 주소가 코드 상수이며, 주소 갈래는
/// 사용자가 적은 주소로 가고 키가 없다. 둘을 섞은 요청(명명 벤더 키를 임의
/// 주소로)은 만들 수 없다.
pub enum Target<'a> {
    /// 명명 벤더 — 키를 붙이고, 주소는 이 파일의 상수다.
    Vendor { secret: &'a str },
    /// 주소로 연결 — 사용자가 적은 base URL 로만 가고, 인증 헤더가 없다.
    Address { base_url: &'a str },
}

/// 전송할 요청. 본문은 없다(`GET`).
pub struct VerifyRequest {
    url: String,
    headers: Vec<(String, String)>,
    /// 이 벤더에서 "키가 틀렸다" 를 뜻하는 상태 코드들.
    denied_statuses: &'static [u16],
    /// 응답 본문을 화면에 돌려주나 — 모델 목록을 받는 주소 갈래만 true.
    returns_body: bool,
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

/// 응답에서 **감사 줄에** 남기는 것 — 상태 코드와 길이뿐. 본문은 기록되지
/// 않는다.
pub struct HttpEcho {
    pub status: u16,
    pub body_chars: usize,
    /// 화면으로 돌려줄 본문 — `returns_body` 인 요청(주소 갈래의 모델 목록)
    /// 에서만 채워진다. 기록되는 값이 아니다.
    pub body: Option<String>,
}

impl HttpEcho {
    /// 본문을 돌려주지 않는 확인 — 명명 벤더 셋의 모양. 실물 전송은
    /// `send_via_curl` 이 직접 짓고, 이 지름길은 시험이 그 모양을 흉내낼 때만
    /// 쓴다.
    #[cfg(test)]
    pub fn status_only(status: u16, body_chars: usize) -> Self {
        Self {
            status,
            body_chars,
            body: None,
        }
    }
}

/// 사용자가 적은 주소를 요청에 쓸 수 있는 모양으로 좁힌다.
///
/// 여기서 거절하는 것들과 그 이유:
/// - **`http` 는 루프백에서만.** 평문으로 인터넷 너머에 볼트 발췌를 보내는
///   경로를 열지 않는다. 같은 기계 안이면 평문이 정상이고(러너들이 TLS 를
///   안 쓴다), 밖이면 `https` 를 요구한다.
/// - **userinfo(`user:pass@host`) 금지.** URL 에 실린 비밀은 감사 줄·프록시
///   로그에 그대로 남는다. Gemini 키를 헤더로만 보내는 이유와 같은 규율이다.
/// - **공백·줄바꿈·따옴표·역슬래시 금지.** curl 설정은 줄 단위라 값 하나가
///   새 옵션 줄을 만들 수 있다.
/// - **쿼리·프래그먼트 금지.** 뒤에 경로를 붙일 자리라 `?`·`#` 이 있으면
///   우리가 고르지 않은 엔드포인트가 된다.
fn normalize_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("주소가 비어 있어요.".into());
    }
    if trimmed.len() > 300 {
        return Err("주소가 너무 길어요.".into());
    }
    if trimmed
        .chars()
        .any(|ch| ch.is_whitespace() || ch.is_control() || matches!(ch, '"' | '\\' | '?' | '#'))
    {
        return Err("주소에 쓸 수 없는 문자가 있어요.".into());
    }
    let (scheme, rest) = trimmed
        .split_once("://")
        .ok_or_else(|| "주소는 http:// 또는 https:// 로 시작해야 해요.".to_string())?;
    if scheme != "http" && scheme != "https" {
        return Err("주소는 http:// 또는 https:// 로 시작해야 해요.".into());
    }
    let authority = rest.split('/').next().unwrap_or("");
    if authority.is_empty() {
        return Err("주소에 호스트가 없어요.".into());
    }
    if authority.contains('@') {
        return Err("주소에 아이디·비밀번호를 담지 마세요. 기록에 그대로 남아요.".into());
    }
    if scheme == "http" && !is_loopback_authority(authority) {
        return Err(
            "이 컴퓨터(localhost) 밖으로는 https:// 로만 보낼 수 있어요. 평문으로 나가는 길은 열지 않아요."
                .into(),
        );
    }
    Ok(trimmed.to_string())
}

/// 이 기계 자신인가. 호스트만 본다(포트는 무관).
fn is_loopback_authority(authority: &str) -> bool {
    let host = match authority.strip_prefix('[') {
        // IPv6 리터럴 — `[::1]:11434`
        Some(rest) => rest.split(']').next().unwrap_or(""),
        None => authority.split(':').next().unwrap_or(""),
    };
    host == "localhost" || host == "::1" || host.starts_with("127.")
}

/// base URL + OpenAI 호환 경로. 이미 `/v1` 로 끝나면 덧붙이지 않는다 —
/// Ollama 는 `http://localhost:11434` 를, LM Studio 는 `http://localhost:1234/v1`
/// 를 안내하므로 둘 다 그대로 붙여넣어 동작해야 한다.
fn local_endpoint(base_url: &str, path: &str) -> String {
    if base_url.ends_with("/v1") {
        format!("{base_url}/{path}")
    } else {
        format!("{base_url}/v1/{path}")
    }
}

/// curl 설정 파일은 줄 단위라 줄바꿈이 든 값은 문법을 깨뜨린다. 저장 경로가
/// trim 하므로 정상 키에는 없지만, 깨진 설정으로 엉뚱한 요청이 나가는 것보다
/// 여기서 멈추는 게 낫다.
fn checked_secret(secret: &str) -> Result<&str, String> {
    if secret.contains('\n') || secret.contains('\r') {
        return Err("키에 줄바꿈이 섞여 있어요. 다시 저장해 주세요.".into());
    }
    Ok(secret)
}

/// 명명 벤더에 주소 갈래가 왔거나 그 반대일 때의 한 줄. 조합이 어긋나면
/// 조용히 한쪽을 고르지 않는다 — 키가 사용자가 적은 주소로 나가는 사고가
/// 정확히 그 "조용히" 에서 생긴다.
fn wrong_target(provider: &str) -> String {
    if provider == LOCAL_PROVIDER {
        "주소로 연결하는 갈래에는 키를 쓰지 않아요.".into()
    } else {
        format!("{provider} 는 주소를 바꿀 수 없어요 — 키는 코드에 박힌 공식 주소로만 가요.")
    }
}

fn verify_request(provider: &str, target: &Target<'_>) -> Result<VerifyRequest, String> {
    match (provider, target) {
        ("anthropic", Target::Vendor { secret }) => Ok(VerifyRequest {
            url: ANTHROPIC_VERIFY_URL.to_string(),
            headers: vec![
                ("x-api-key".into(), checked_secret(secret)?.to_string()),
                ("anthropic-version".into(), ANTHROPIC_VERSION.into()),
            ],
            denied_statuses: AUTH_DENIED_STATUSES,
            returns_body: false,
        }),
        ("openai", Target::Vendor { secret }) => Ok(VerifyRequest {
            url: OPENAI_VERIFY_URL.to_string(),
            headers: vec![(
                "authorization".into(),
                format!("Bearer {}", checked_secret(secret)?),
            )],
            denied_statuses: AUTH_DENIED_STATUSES,
            returns_body: false,
        }),
        // Gemini 는 Bearer 가 아니라 전용 헤더를 쓴다 — OpenAI 호환 갈래로
        // 흡수되지 않는 인증이라 명명 벤더 자리를 받는다.
        ("gemini", Target::Vendor { secret }) => Ok(VerifyRequest {
            url: GEMINI_VERIFY_URL.to_string(),
            headers: vec![("x-goog-api-key".into(), checked_secret(secret)?.to_string())],
            denied_statuses: GEMINI_DENIED_STATUSES,
            returns_body: false,
        }),
        // 주소 갈래의 연결 확인 = **설치된 모델 목록 받아오기**. 요청 하나로
        // 세 가지가 한꺼번에 판정된다: 러너가 살아 있는가(연결) · 이 주소가
        // OpenAI 호환인가(200 vs 404) · 어떤 모델을 고를 수 있는가(본문).
        // 확인과 목록을 두 커맨드로 쪼개면 감사 줄도 둘이 되고, 사용자는
        // "확인은 됐는데 목록은 비었다" 는 설명 불가한 상태를 만난다.
        (LOCAL_PROVIDER, Target::Address { base_url }) => Ok(VerifyRequest {
            url: local_endpoint(&normalize_base_url(base_url)?, LOCAL_MODELS_PATH),
            // 인증 헤더가 **없다**. 이 갈래가 존재하는 이유 자체다.
            headers: vec![],
            denied_statuses: AUTH_DENIED_STATUSES,
            returns_body: true,
        }),
        (LOCAL_PROVIDER, _) | ("anthropic" | "openai" | "gemini", _) => Err(wrong_target(provider)),
        (other, _) => Err(format!("지원하지 않는 제공자예요: {other}")),
    }
}

/// argv 에 올라가는 인자 — **비밀이 하나도 없다**. URL·헤더·본문은 stdin 으로
/// 간다. 대화 왕복은 제한 시간만 다르다.
fn curl_argv_with_timeout(timeout_seconds: &'static str) -> [&'static str; 9] {
    [
        // curl 은 이 옵션이 **첫 인자**일 때만 ~/.curlrc 를 읽지 않는다. 사용자
        // 설정이 redirect/proxy/header 를 보태 키의 전송 경계를 바꾸지 못하게 한다.
        "--disable",
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

fn curl_argv() -> [&'static str; 9] {
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
        config.push_str(&format!(
            "header = {}\n",
            curl_quote(&format!("{name}: {value}"))
        ));
    }
    if let Some(body) = body {
        config.push_str("request = \"POST\"\n");
        config.push_str(&format!("data = {}\n", curl_quote(body)));
    }
    config
}

fn curl_config(request: &VerifyRequest) -> String {
    curl_config_for(&request.url, &request.headers, None)
}

/// curl 종료 코드 → 사람이 **다음에 뭘 할지 아는** 한 줄.
///
/// 왜 stderr 문장을 그대로 쓰지 않나: 로컬 러너에서 가장 흔한 세 실패(꺼져
/// 있음 · 포트 다름 · 주소 오타)가 stderr 에서는 전부 "Couldn't connect to
/// server" 한 문장으로 뭉개진다. 종료 코드는 그 셋을 갈라 주는 유일하게
/// 안정적인 신호다(curl 매뉴얼 § EXIT CODES).
fn curl_failure_message(code: Option<i32>, stderr: &str) -> String {
    match code {
        Some(6) => "그 주소의 호스트를 찾지 못했어요 — 주소를 다시 확인해 주세요.".into(),
        Some(7) => "그 주소에서 응답이 없어요 — 러너가 꺼져 있거나 포트가 달라요.".into(),
        Some(28) => "시간 안에 응답이 오지 않았어요.".into(),
        Some(35) | Some(60) => "보안 연결(TLS)을 맺지 못했어요.".into(),
        _ if stderr.is_empty() => "응답을 받지 못했어요 (네트워크 확인).".to_string(),
        _ => format!("응답을 받지 못했어요: {stderr}"),
    }
}

fn run_curl(argv: [&'static str; 9], config: &str) -> Result<(u16, String), String> {
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
    interpret_curl_output(
        output.status.code(),
        output.status.success(),
        &String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr).trim(),
    )
}

/// curl 이 남긴 것 → (상태 코드, 본문) 또는 **이유가 담긴 실패**.
///
/// ⚠️ 여기서 종료 코드를 먼저 보는 것이 요점이다. curl 은 연결 자체가 실패해도
/// `--write-out %{http_code}` 자리에 **`000` 을 찍는다** — 그걸 그냥 파싱하면
/// `0` 이라는 그럴듯한 숫자가 나와 "HTTP 0 으로 응답했다" 는 없는 사실이
/// 만들어지고, 화면은 러너가 꺼져 있다는 말 대신 `실패: 0` 을 보여준다
/// (2026-08-01 실측: 닫힌 포트로 확인했더니 `status=Some(0), message=None`).
fn interpret_curl_output(
    exit_code: Option<i32>,
    success: bool,
    stdout: &str,
    stderr: &str,
) -> Result<(u16, String), String> {
    if !success {
        return Err(curl_failure_message(exit_code, stderr));
    }
    let (body, status_text) = match stdout.rsplit_once('\n') {
        Some(parts) => parts,
        None => ("", stdout),
    };
    let status: u16 = status_text
        .trim()
        .parse()
        .map_err(|_| curl_failure_message(exit_code, stderr))?;
    Ok((status, body.to_string()))
}

fn send_via_curl(request: &VerifyRequest) -> Result<HttpEcho, String> {
    let (status, body) = run_curl(curl_argv(), &curl_config(request))?;
    Ok(HttpEcho {
        status,
        body_chars: body.chars().count(),
        body: if request.returns_body {
            Some(body)
        } else {
            None
        },
    })
}

/// 확인 흐름의 본체 — sender 를 주입받아 네트워크 없이도 계약을 시험할 수 있게
/// 한다. **순서가 계약이다**: 예약 → (성공했을 때만) 전송 → 확정.
pub fn verify_with<S>(
    provider: &str,
    vault_dir: &Path,
    target: &Target<'_>,
    send: S,
) -> Result<LlmVerifyResult, String>
where
    S: FnOnce(&VerifyRequest) -> Result<HttpEcho, String>,
{
    let request = verify_request(provider, target)?;
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
        host: host_of(&request.url).to_string(),
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

    let (outcome, ok, denied, http_status, response_chars, message, body) = match echo {
        Ok(HttpEcho {
            status,
            body_chars,
            body,
        }) => {
            let ok = (200..300).contains(&status);
            let denied = !ok && request.denied_statuses.contains(&status);
            let label = if ok {
                "ok"
            } else if denied {
                "denied"
            } else {
                "error"
            };
            // 본문은 **성공했을 때만** 화면으로 간다. 실패 본문은 러너마다
            // 모양이 달라 화면이 목록으로 오독할 수 있고, 그때 필요한 것은
            // 목록이 아니라 상태 코드다.
            let body = if ok && request.returns_body {
                body
            } else {
                None
            };
            (label, ok, denied, Some(status), body_chars, None, body)
        }
        Err(err) => ("error", false, false, None, 0, Some(err), None),
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
        body,
    })
}

/// 연결 확인 — **사용자가 [연결 확인]을 누를 때만**. 볼트 경로가 필요한 이유는
/// 감사 로그가 볼트 안에 살기 때문이다: 기록할 곳이 없으면 보내지 않는다.
///
/// `base_url` 은 **주소 갈래에서만** 온다. 명명 벤더에 주소가 함께 오면
/// 거절한다 — 통과시키면 키체인의 키가 화면이 약속한 적 없는 호스트로 나간다.
#[tauri::command]
pub fn secret_verify(
    provider: String,
    vault_path: String,
    base_url: Option<String>,
) -> Result<LlmVerifyResult, String> {
    let vault_dir = crate::git::validate_vault_dir(&vault_path)?;
    if provider == LOCAL_PROVIDER {
        let base_url = base_url.unwrap_or_else(|| LOCAL_DEFAULT_BASE_URL.to_string());
        return verify_with(
            LOCAL_PROVIDER,
            &vault_dir,
            &Target::Address {
                base_url: &base_url,
            },
            send_via_curl,
        );
    }
    if base_url.is_some() {
        return Err(wrong_target(&provider));
    }
    let known = secrets::validate_provider(&provider)?;
    let secret = secrets::read_secret(known)?;
    verify_with(
        known,
        &vault_dir,
        &Target::Vendor { secret: &secret },
        send_via_curl,
    )
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

/// 모델 이름이 요청의 어디에 실리나 — 허용 문자가 갈리는 이유다.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ModelPlacement {
    /// JSON 본문 안. 러너들이 `qwen3:8b` · `hf.co/user/repo` 같은 이름을 쓰므로
    /// `:` `/` 가 정상 문자다.
    Body,
    /// URL 경로 안(Gemini). `:` `/` 가 **문법**이라 통과시키면 우리가 고르지
    /// 않은 엔드포인트로 키가 나간다.
    UrlPath,
}

fn model_placement(provider: &str) -> ModelPlacement {
    if provider == "gemini" {
        ModelPlacement::UrlPath
    } else {
        ModelPlacement::Body
    }
}

/// 모델 이름을 좁힌다. 좁히는 정도는 그 이름이 실리는 자리에 달렸다
/// (§ `ModelPlacement`).
fn validate_model_id(model: &str, placement: ModelPlacement) -> Result<&str, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Err("모델 이름이 비어 있어요.".into());
    }
    let allowed = |ch: char| {
        ch.is_ascii_alphanumeric()
            || matches!(ch, '.' | '_' | '-')
            || (placement == ModelPlacement::Body && matches!(ch, ':' | '/'))
    };
    if trimmed.len() > 100 || !trimmed.chars().all(allowed) {
        return Err(format!("모델 이름에 쓸 수 없는 문자가 있어요: {trimmed}"));
    }
    Ok(trimmed)
}

fn chat_request(
    provider: &str,
    model: &str,
    target: &Target<'_>,
    body: &str,
) -> Result<ChatRequest, String> {
    let model = validate_model_id(model, model_placement(provider))?;
    let json = ("content-type".to_string(), "application/json".to_string());
    match (provider, target) {
        ("anthropic", Target::Vendor { secret }) => Ok(ChatRequest {
            url: ANTHROPIC_CHAT_URL.to_string(),
            headers: vec![
                ("x-api-key".into(), checked_secret(secret)?.to_string()),
                ("anthropic-version".into(), ANTHROPIC_VERSION.into()),
                json,
            ],
            body: body.to_string(),
        }),
        ("openai", Target::Vendor { secret }) => Ok(ChatRequest {
            url: OPENAI_CHAT_URL.to_string(),
            headers: vec![
                (
                    "authorization".into(),
                    format!("Bearer {}", checked_secret(secret)?),
                ),
                json,
            ],
            body: body.to_string(),
        }),
        ("gemini", Target::Vendor { secret }) => Ok(ChatRequest {
            url: format!("{GEMINI_CHAT_URL_PREFIX}{model}:generateContent"),
            headers: vec![
                ("x-goog-api-key".into(), checked_secret(secret)?.to_string()),
                json,
            ],
            body: body.to_string(),
        }),
        // 주소 갈래는 **OpenAI 호환 대화 엔드포인트**로 간다. 네이티브
        // (`/api/chat`)를 고르지 않은 이유: 그건 Ollama 하나만의 문법이라
        // 러너가 바뀌면 어댑터를 또 써야 하고, 호환 갈래는 LM Studio ·
        // llama.cpp server · vLLM 이 같은 모양으로 이미 내놓는다. 인증
        // 헤더는 여기서도 없다.
        (LOCAL_PROVIDER, Target::Address { base_url }) => Ok(ChatRequest {
            url: local_endpoint(&normalize_base_url(base_url)?, LOCAL_CHAT_PATH),
            headers: vec![json],
            body: body.to_string(),
        }),
        (LOCAL_PROVIDER, _) | ("anthropic" | "openai" | "gemini", _) => Err(wrong_target(provider)),
        (other, _) => Err(format!("지원하지 않는 제공자예요: {other}")),
    }
}

fn curl_chat_config(request: &ChatRequest) -> String {
    curl_config_for(&request.url, &request.headers, Some(&request.body))
}

fn send_chat_via_curl_with_timeout(
    request: &ChatRequest,
    timeout_seconds: &'static str,
) -> Result<ChatEcho, String> {
    let (status, body) = run_curl(
        curl_argv_with_timeout(timeout_seconds),
        &curl_chat_config(request),
    )?;
    Ok(ChatEcho { status, body })
}

fn send_chat_via_curl(request: &ChatRequest) -> Result<ChatEcho, String> {
    send_chat_via_curl_with_timeout(request, CHAT_TIMEOUT_SECONDS)
}

fn send_local_chat_via_curl(request: &ChatRequest) -> Result<ChatEcho, String> {
    send_chat_via_curl_with_timeout(request, LOCAL_CHAT_TIMEOUT_SECONDS)
}

/// 대화 왕복의 본체 — sender 주입형. **순서가 계약이다**: 예약 → (성공했을
/// 때만) 전송 → 확정. `verify_with` 와 같은 문법을 일부러 반복한다.
#[allow(clippy::too_many_arguments)]
pub fn chat_with<S>(
    provider: &str,
    vault_dir: &Path,
    model: &str,
    question: Option<&str>,
    target: &Target<'_>,
    body: &str,
    scope: AuditScopeInput,
    send: S,
) -> Result<LlmChatEcho, String>
where
    S: FnOnce(&ChatRequest) -> Result<ChatEcho, String>,
{
    let request = chat_request(provider, model, target, body)?;
    let host = host_of(&request.url).to_string();
    let logged_at = llm_audit::now_iso();
    let draft = AuditDraft {
        v: 1,
        at: logged_at.clone(),
        provider: provider.to_string(),
        host: host.clone(),
        model: Some(validate_model_id(model, model_placement(provider))?.to_string()),
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
    base_url: Option<String>,
) -> Result<LlmChatEcho, String> {
    let vault_dir = crate::git::validate_vault_dir(&vault_path)?;
    if provider == LOCAL_PROVIDER {
        let base_url = base_url.unwrap_or_else(|| LOCAL_DEFAULT_BASE_URL.to_string());
        return chat_with(
            LOCAL_PROVIDER,
            &vault_dir,
            &model,
            question.as_deref(),
            &Target::Address {
                base_url: &base_url,
            },
            &body,
            scope,
            send_local_chat_via_curl,
        );
    }
    if base_url.is_some() {
        return Err(wrong_target(&provider));
    }
    let known = secrets::validate_provider(&provider)?;
    let secret = secrets::read_secret(known)?;
    chat_with(
        known,
        &vault_dir,
        &model,
        question.as_deref(),
        &Target::Vendor { secret: &secret },
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
        let request = verify_request(
            "anthropic",
            &Target::Vendor {
                secret: "sk-ant-secret-value",
            },
        )
        .unwrap();
        for arg in curl_argv() {
            assert!(!arg.contains("sk-ant"), "argv 에 키가 실렸다: {arg}");
        }
        assert!(curl_config(&request).contains("sk-ant-secret-value"));
    }

    #[test]
    fn curl_disables_ambient_config_before_every_other_argument() {
        let argv = curl_argv();
        assert_eq!(argv.first(), Some(&"--disable"));
        assert_eq!(argv.iter().filter(|arg| **arg == "--disable").count(), 1);
    }

    #[test]
    fn curl_config_quotes_values_so_a_key_cannot_inject_options() {
        let request = verify_request(
            "openai",
            &Target::Vendor {
                secret: "abc\"def\\ghi",
            },
        )
        .unwrap();
        let config = curl_config(&request);
        assert!(config.contains(r#"Bearer abc\"def\\ghi"#), "{config}");
        // 헤더/URL 은 각각 한 줄씩 — 값이 줄을 늘려 새 옵션을 만들 수 없다.
        assert_eq!(config.lines().count(), 2);
    }

    #[test]
    fn a_key_with_newlines_is_refused_before_any_request_is_built() {
        assert!(verify_request(
            "anthropic",
            &Target::Vendor {
                secret: "sk-ant\nheader = evil"
            }
        )
        .is_err());
    }

    #[test]
    fn the_gemini_key_travels_in_a_header_never_in_the_url() {
        // 공식 문서는 `?key=` 쿼리 형태도 안내하지만 우리는 헤더만 쓴다 — URL 은
        // 감사 줄·프록시 로그에 그대로 남는 자리라 비밀이 실리면 안 된다.
        let request = verify_request(
            "gemini",
            &Target::Vendor {
                secret: "AIza-secret-value",
            },
        )
        .unwrap();
        assert_eq!(request.url, GEMINI_VERIFY_URL);
        assert!(
            !request.url.contains("key="),
            "URL 에 키 자리가 있으면 안 된다"
        );
        assert!(!request.url.contains("AIza-secret-value"));
        for arg in curl_argv() {
            assert!(!arg.contains("AIza"), "argv 에 키가 실렸다: {arg}");
        }
        let config = curl_config(&request);
        assert!(
            config.contains("x-goog-api-key: AIza-secret-value"),
            "{config}"
        );
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
            let request = verify_request(provider, &Target::Vendor { secret: "secret" }).unwrap();
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
        assert_eq!(
            host_of("https://api.anthropic.com/v1/models?limit=1"),
            "api.anthropic.com"
        );
        assert_eq!(
            host_of("https://api.openai.com/v1/models"),
            "api.openai.com"
        );
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
            let request = verify_request(provider, &Target::Vendor { secret: "secret" }).unwrap();
            assert_eq!(
                host_of(&request.url),
                expected.as_str().unwrap(),
                "{provider}"
            );
        }
    }

    #[test]
    fn a_gemini_key_rejected_with_400_is_a_rejection_not_a_failure() {
        // 2026-07-26 실측: Gemini 는 틀린 키에 400(`API_KEY_INVALID`)을 준다.
        // 401/403 로만 판정하면 사용자가 "확인하지 못했어요" 를 보고 자기 키가
        // 아니라 앱이 고장난 줄 안다.
        let vault = temp_vault("gemini400");
        let result = verify_with(
            "gemini",
            &vault,
            &Target::Vendor { secret: "AIza-bad" },
            |request| {
                assert_eq!(request.url, GEMINI_VERIFY_URL);
                Ok(HttpEcho::status_only(400, 118))
            },
        )
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
        let result = verify_with(
            "openai",
            &vault,
            &Target::Vendor { secret: "sk-test" },
            |_| Ok(HttpEcho::status_only(400, 10)),
        )
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
        verify_with(
            "openai",
            &vault,
            &Target::Vendor { secret: "sk-test" },
            |_| Ok(HttpEcho::status_only(200, 42)),
        )
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
        let result = verify_with(
            "anthropic",
            &vault,
            &Target::Vendor {
                secret: "sk-ant-test",
            },
            |_| {
                sent.set(true);
                Ok(HttpEcho::status_only(200, 10))
            },
        );
        assert!(result.is_err());
        assert!(!sent.get(), "감사 기록에 실패했는데 전송이 일어났다");
        assert!(!llm_audit::audit_log_path(&vault).exists());
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_successful_check_leaves_exactly_one_complete_line() {
        let vault = temp_vault("ok");
        let result = verify_with(
            "anthropic",
            &vault,
            &Target::Vendor {
                secret: "sk-ant-test",
            },
            |request| {
                assert_eq!(request.url, ANTHROPIC_VERIFY_URL);
                Ok(HttpEcho::status_only(200, 42))
            },
        )
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
        let result = verify_with(
            "openai",
            &vault,
            &Target::Vendor { secret: "sk-bad" },
            |_| Ok(HttpEcho::status_only(401, 118)),
        )
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
        let result = verify_with(
            "anthropic",
            &vault,
            &Target::Vendor {
                secret: "sk-ant-test",
            },
            |_| Err("응답을 받지 못했어요: offline".into()),
        )
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
        let source = include_str!("llm.rs").replace("\r\n", "\n");
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
            &Target::Vendor {
                secret: "sk-ant-secret-value",
            },
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
        let request = chat_request(
            "openai",
            "gpt-4.1",
            &Target::Vendor { secret: "sk-test" },
            body,
        )
        .unwrap();
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
            let request = chat_request(
                provider,
                "some-model-1.5",
                &Target::Vendor { secret: "secret" },
                "{}",
            )
            .unwrap();
            assert!(request.url.starts_with("https://"), "{provider}");
            assert_eq!(
                host_of(&request.url),
                expected.as_str().unwrap(),
                "{provider}"
            );
            assert!(
                !request.url.contains("key="),
                "URL 에 키 자리가 있으면 안 된다"
            );
        }
    }

    #[test]
    fn a_model_name_cannot_escape_the_gemini_url_path() {
        // Gemini 만 모델이 경로로 들어간다 — 슬래시·쿼리가 통과하면 우리가
        // 고르지 않은 엔드포인트로 키가 나간다.
        for bad in ["../../v1/evil", "x?key=leak", "a b", "m#frag", ""] {
            assert!(
                validate_model_id(bad, ModelPlacement::UrlPath).is_err(),
                "통과하면 안 된다: {bad:?}"
            );
        }
        let request = chat_request(
            "gemini",
            "gemini-2.5-flash",
            &Target::Vendor {
                secret: "AIza-secret",
            },
            "{}",
        )
        .unwrap();
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
            &Target::Vendor {
                secret: "sk-ant-test",
            },
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
            &Target::Vendor {
                secret: "sk-ant-test",
            },
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
        assert!(
            !raw.contains("content\\\":[]"),
            "응답 본문이 기록되면 안 된다"
        );
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
            &Target::Vendor {
                secret: "sk-ant-test",
            },
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
        let mut actual: serde_json::Value = serde_json::from_str(
            fs::read_to_string(llm_audit::audit_log_path(&vault))
                .unwrap()
                .trim(),
        )
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
            &Target::Vendor { secret: "sk-test" },
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
            &Target::Vendor { secret: "sk-bad" },
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

    // ── 주소로 연결 (키 없는 로컬 러너) ──────────────────────────────────

    #[test]
    fn the_address_branch_carries_no_authorization_header_at_all() {
        // 이 갈래가 존재하는 이유 자체다. 헤더가 하나라도 붙으면 "제공자 =
        // 비밀키 하나" 라는 옛 모양이 슬그머니 되살아난 것이다.
        let request = verify_request(
            LOCAL_PROVIDER,
            &Target::Address {
                base_url: LOCAL_DEFAULT_BASE_URL,
            },
        )
        .unwrap();
        assert!(request.headers.is_empty(), "{:?}", request.headers);
        assert_eq!(request.url, "http://localhost:11434/v1/models");
        assert!(request.returns_body, "모델 목록을 화면이 받아야 한다");
    }

    #[test]
    fn a_named_vendor_key_can_never_travel_to_an_address_the_user_typed() {
        // 이 단언이 이 슬라이스에서 가장 중요한 하나다. 통과하면 키체인의 키가
        // 화면이 약속한 적 없는 호스트로 나간다.
        for provider in ["anthropic", "openai", "gemini"] {
            assert!(
                verify_request(
                    provider,
                    &Target::Address {
                        base_url: "http://localhost:11434",
                    },
                )
                .is_err(),
                "{provider} 가 임의 주소를 받아들였다"
            );
            assert!(chat_request(
                provider,
                "m",
                &Target::Address {
                    base_url: "http://localhost:11434",
                },
                "{}",
            )
            .is_err());
        }
        // 반대 방향도 막힌다 — 주소 갈래에 키를 실을 자리는 없다.
        assert!(verify_request(LOCAL_PROVIDER, &Target::Vendor { secret: "sk" }).is_err());
        assert!(chat_request(LOCAL_PROVIDER, "m", &Target::Vendor { secret: "sk" }, "{}").is_err());
    }

    #[test]
    fn plaintext_http_is_allowed_only_to_this_machine() {
        // 헌장이 허용한 것은 **localhost** 다. 평문으로 인터넷 너머에 볼트
        // 발췌를 보내는 길은 열지 않는다 — 밖으로 나가려면 https 다.
        for ok in [
            "http://localhost:11434",
            "http://127.0.0.1:1234",
            "http://[::1]:11434",
            "https://box.example.com:8080",
        ] {
            assert!(normalize_base_url(ok).is_ok(), "거절하면 안 된다: {ok}");
        }
        for bad in ["http://example.com", "http://192.168.0.9:11434"] {
            assert!(normalize_base_url(bad).is_err(), "통과하면 안 된다: {bad}");
        }
    }

    #[test]
    fn a_base_url_cannot_smuggle_credentials_or_a_new_curl_option() {
        for bad in [
            "",
            "localhost:11434",                 // 스킴 없음
            "ftp://localhost:11434",           // 우리가 말할 수 없는 스킴
            "http://user:pw@localhost:11434",  // URL 에 실린 비밀
            "http://localhost:11434?key=leak", // 우리가 고르지 않은 쿼리
            "http://localhost:11434#frag",
            "http://local host:11434", // 공백 = curl 설정의 새 토큰
            "http://localhost:11434\nheader = evil",
            "http://localhost:11434\" \nheader = evil",
        ] {
            assert!(
                normalize_base_url(bad).is_err(),
                "통과하면 안 된다: {bad:?}"
            );
        }
    }

    #[test]
    fn an_lm_studio_style_base_url_does_not_get_a_second_v1() {
        // Ollama 는 `http://localhost:11434` 를, LM Studio 는 `…/v1` 을
        // 안내한다. 둘 다 붙여넣은 그대로 동작해야 "오픈소스들" 의 문이 된다.
        assert_eq!(
            local_endpoint("http://localhost:11434", LOCAL_CHAT_PATH),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            local_endpoint("http://localhost:1234/v1", LOCAL_CHAT_PATH),
            "http://localhost:1234/v1/chat/completions"
        );
        // 끝 슬래시도 사람이 흔히 붙인다.
        assert_eq!(
            local_endpoint(
                &normalize_base_url("http://localhost:11434/").unwrap(),
                LOCAL_MODELS_PATH
            ),
            "http://localhost:11434/v1/models"
        );
    }

    #[test]
    fn a_local_model_name_may_carry_a_colon_but_a_gemini_one_may_not() {
        // Ollama 의 이름은 `qwen3:8b` 다. 옛 규칙(`:` 금지)을 그대로 두면 이
        // 갈래는 첫 왕복에서 전부 실패한다 — 그 `:` 금지는 모델이 **URL 경로**
        // 로 들어가는 Gemini 때문에 있는 것이라, 자리를 나눠야 맞다.
        assert_eq!(
            validate_model_id("qwen3:8b", ModelPlacement::Body).unwrap(),
            "qwen3:8b"
        );
        assert!(validate_model_id("hf.co/user/repo:Q4", ModelPlacement::Body).is_ok());
        assert!(validate_model_id("qwen3:8b", ModelPlacement::UrlPath).is_err());
        // 자리와 무관하게 막히는 것들.
        for bad in ["", "a b", "m#frag", "x?key=leak"] {
            assert!(
                validate_model_id(bad, ModelPlacement::Body).is_err(),
                "{bad:?}"
            );
        }
        // 실제 배선이 자리를 맞게 고르나.
        assert!(model_placement("gemini") == ModelPlacement::UrlPath);
        assert!(model_placement(LOCAL_PROVIDER) == ModelPlacement::Body);
    }

    #[test]
    fn curl_exit_codes_tell_off_from_wrong_port_from_timeout_apart() {
        // 화면이 "왜 안 되는지" 를 말할 수 있는 유일한 안정 신호. stderr 문장은
        // 이 셋을 한 문장으로 뭉갠다.
        let refused = curl_failure_message(Some(7), "Couldn't connect to server");
        let unknown_host = curl_failure_message(Some(6), "Could not resolve host");
        let timeout = curl_failure_message(Some(28), "Operation timed out");
        assert!(refused.contains("꺼져 있거나 포트가 달라요"));
        assert!(unknown_host.contains("호스트를 찾지 못했어요"));
        assert!(timeout.contains("시간 안에"));
        assert_ne!(refused, unknown_host);
        assert_ne!(refused, timeout);
    }

    #[test]
    fn a_local_chat_cannot_hold_the_panel_for_three_minutes() {
        assert_eq!(LOCAL_CHAT_TIMEOUT_SECONDS, "60");
        assert_eq!(curl_argv_with_timeout(LOCAL_CHAT_TIMEOUT_SECONDS)[4], "60");
        assert_eq!(curl_argv_with_timeout(CHAT_TIMEOUT_SECONDS)[4], "180");
    }

    #[test]
    fn a_local_check_records_localhost_and_hands_back_the_model_list() {
        // 이 제품의 신뢰 서사가 로그로 증명되는 자리 — 목적지가 제공자 **이름**
        // 이 아니라 호스트라서, 이 줄이 곧 "아무 데도 안 나갔다" 의 증거다.
        let vault = temp_vault("local-ok");
        let listing = r#"{"object":"list","data":[{"id":"qwen3:8b"},{"id":"gemma4:12b"}]}"#;
        let result = verify_with(
            LOCAL_PROVIDER,
            &vault,
            &Target::Address {
                base_url: "http://localhost:11434",
            },
            |request| {
                assert_eq!(request.url, "http://localhost:11434/v1/models");
                Ok(HttpEcho {
                    status: 200,
                    body_chars: listing.chars().count(),
                    body: Some(listing.to_string()),
                })
            },
        )
        .unwrap();
        assert!(result.ok);
        // 목록은 화면이 파싱한다 — Rust 는 벤더 스키마를 모른다.
        assert_eq!(result.body.as_deref(), Some(listing));

        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["provider"], "local");
        assert_eq!(line["host"], "localhost:11434");
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line["scope"]["vaultChars"], 0);
        // 목록 본문은 **기록되지 않는다** — 길이만 남는다.
        assert!(!raw.contains("qwen3:8b"), "확인 응답 본문이 기록됐다");
        assert_eq!(line["responseChars"], listing.chars().count());
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_local_check_that_hits_the_wrong_port_returns_a_status_not_a_list() {
        // 같은 주소에 다른 프로그램이 떠 있는 흔한 경우 — 연결은 되는데 404 다.
        // 그때 화면에 필요한 것은 목록이 아니라 상태 코드이고, 실패 본문을
        // 목록으로 오독할 자리를 아예 없앤다.
        let vault = temp_vault("local-404");
        let result = verify_with(
            LOCAL_PROVIDER,
            &vault,
            &Target::Address {
                base_url: "http://localhost:11434",
            },
            |_| {
                Ok(HttpEcho {
                    status: 404,
                    body_chars: 9,
                    body: Some("not found".into()),
                })
            },
        )
        .unwrap();
        assert!(!result.ok);
        assert_eq!(result.http_status, Some(404));
        assert!(result.body.is_none(), "실패 본문은 화면으로 가지 않는다");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_local_chat_round_trip_goes_to_the_compatible_endpoint_and_logs_localhost() {
        let vault = temp_vault("local-chat");
        let body = r#"{"model":"qwen3:8b","messages":[]}"#;
        let result = chat_with(
            LOCAL_PROVIDER,
            &vault,
            "qwen3:8b",
            Some("빠진 관계 이어줘"),
            &Target::Address {
                base_url: "http://localhost:11434",
            },
            body,
            AuditScopeInput {
                nodes: vec!["capabilities/payment".into()],
                prompt_chars: 2_100,
                vault_chars: 1_020,
                tools: vec![],
            },
            |request| {
                assert_eq!(request.url, "http://localhost:11434/v1/chat/completions");
                // 이 왕복에도 인증 헤더가 없다 — content-type 하나뿐.
                assert_eq!(request.headers.len(), 1);
                assert_eq!(request.headers[0].0, "content-type");
                Ok(ChatEcho {
                    status: 200,
                    body: "{\"choices\":[]}".into(),
                })
            },
        )
        .unwrap();
        assert_eq!(result.host, "localhost:11434");

        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["provider"], "local");
        assert_eq!(line["host"], "localhost:11434");
        assert_eq!(line["model"], "qwen3:8b");
        assert_eq!(line["scope"]["vaultChars"], 1_020);
        // 옛 줄이 계속 읽혀야 하므로 스키마 버전은 그대로다(추가형 확장).
        assert_eq!(line["v"], 1);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_local_round_trip_still_refuses_to_send_when_the_audit_line_cannot_be_written() {
        // log-before-send 는 갈래가 늘어도 같다. 로컬이라 "어차피 안 나간다" 는
        // 이유로 느슨해지면, 기록이 곧 증거라는 이 갈래의 판매 논리가 무너진다.
        let vault = temp_vault("local-blocked");
        fs::write(vault.join(".ontology-atlas"), b"not a directory").unwrap();
        let sent = Cell::new(false);
        let result = verify_with(
            LOCAL_PROVIDER,
            &vault,
            &Target::Address {
                base_url: "http://localhost:11434",
            },
            |_| {
                sent.set(true);
                Ok(HttpEcho::status_only(200, 10))
            },
        );
        assert!(result.is_err());
        assert!(!sent.get(), "감사 기록에 실패했는데 전송이 일어났다");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_connection_that_never_happened_is_not_http_zero() {
        // curl 은 연결 실패에도 `%{http_code}` 자리에 `000` 을 찍는다. 그대로
        // 파싱하면 "HTTP 0 으로 응답했다" 는 없는 사실이 만들어지고, 화면은
        // 러너가 꺼져 있다는 말 대신 `실패: 0` 을 보여준다 — 그러면 이 갈래가
        // 약속한 "왜 안 되는지 말한다" 가 첫 실패에서 바로 깨진다.
        let refused = interpret_curl_output(Some(7), false, "\n000", "Couldn't connect to server");
        assert!(refused.is_err());
        assert!(refused.unwrap_err().contains("꺼져 있거나 포트가 달라요"));

        // 정상 응답은 그대로 통과한다.
        let ok = interpret_curl_output(Some(0), true, "{\"data\":[]}\n200", "").unwrap();
        assert_eq!(ok.0, 200);
        assert_eq!(ok.1, "{\"data\":[]}");
    }
}
