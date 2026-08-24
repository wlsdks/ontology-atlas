// Verify BYOK connection (#80 S2) — check if the key actually works with one click and
// leave that call in the bolt's audit log.
//
// ## Invariants this file upholds
//
// 1. **The key is not passed via IPC.** Keychain reading and transmission end within Rust,
//    and only `LlmVerifyResult` (pass/fail, status code, elapsed time) goes to the WebView.
// 2. **log-before-send.** If audit line reservation (`llm_audit::reserve`) fails, the sender
//    is not called at all. This turns Trust Charter §2 from a principle into a code path.
// 3. **Zero bolt data.** Connection verification is an auth check with no body. The screen
//    can say "0 bytes of bolt data" because `AuditScope` has three zeros.
// 4. **No automatic invocation.** It runs only when the user clicks [Verify Connection].
//
// ## Why curl shell-out?
//
// ① No new HTTP client crate is added, keeping the supply chain surface at zero (git.rs
// already has precedent for shell-ing out to system git), and ② crucially, **the key never enters argv** — URL and headers are passed to stdin via `--config -`, so other processes on the same machine can't see the key with `ps`. Common implementations passing the key as a `-H` argument are themselves a leak path.

use crate::llm_audit::{self, AuditDraft, AuditOutcome, AuditScope, AuditToolRef};
use crate::secrets;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

/// Minimal endpoint for auth verification only — since it's not a model call, there's no
/// token billing/generation,
/// and no body to send.
const ANTHROPIC_VERIFY_URL: &str = "https://api.anthropic.com/v1/models?limit=1";
const OPENAI_VERIFY_URL: &str = "https://api.openai.com/v1/models";
/// Gemini official model list endpoint (public docs `ai.google.dev/api/models`).
/// The key is sent **only in headers** — the `?key=` query form in docs is not used. Secrets
/// embedded in URLs remain in proxy logs, referrers, and crash reports,
/// and since our audit log also keeps the destination URL, this eliminates places where the key could be recorded.
const GEMINI_VERIFY_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
/// Version header required by Anthropic API. If the value changes, a 400 comes instead of 401.
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Chat endpoint — uses the **same host** as the verification URL. If the host diverges,
/// the destination promised during key registration differs from where the actual chat goes.
const ANTHROPIC_CHAT_URL: &str = "https://api.anthropic.com/v1/messages";
const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
/// Gemini puts the model name **in the path** — so this constant is a prefix,
/// followed by `{model}:generateContent`. Since the model string flows into the path,
/// narrow it first with `validate_model_id` (block path escape/query injection).
const GEMINI_CHAT_URL_PREFIX: &str = "https://generativelanguage.googleapis.com/v1beta/models/";

/// curl timeout for chat round-trip (seconds). Longer than verification (20s) — it's normal for models to take
/// tens of seconds to decide on tool calls; cutting here makes the user see an unexplained failure. Still not infinite: [Stop] is the user-side upper bound,
/// and this value is the upper bound for hanging sockets.
const CHAT_TIMEOUT_SECONDS: &str = "180";
/// The local runner runs on the user's same machine and retries are free. It's more
/// honest to close one round-trip as a failure and prompt for smaller models/questions than to hold the panel for 3 minutes.
/// Separate from remote models' long generation allowances.
const LOCAL_CHAT_TIMEOUT_SECONDS: &str = "60";

/// Status codes that should be read as "key is wrong." Vendors differ, so carry it with the request —
/// this gives the screen a basis to distinguish `Rejected` (user fixes key) from `Failed` (our/network issue).
const AUTH_DENIED_STATUSES: &[u16] = &[401, 403];
/// ── Connect by address (keyless local runner) ──────────────────────────────────────
///
/// This is the branch left behind when `secrets.rs` froze vendor names at 3:
/// **The user enters the address directly.** The reason to open one door instead of adding another vendor name is long-tail — Ollama · LM Studio · llama.cpp server ·
/// vLLM · LocalAI all offer the same OpenAI-compatible syntax (`/v1/chat/completions`), so if the address is variable, the runner list doesn't need to be in our code.
///
/// **No key in this branch.** It doesn't pass through the keychain (not in `secrets::PROVIDERS`) and doesn't attach auth headers. So a spot opens where the existing shape "provider = secret key" doesn't hold.
pub const LOCAL_PROVIDER: &str = "local";
/// Default port for Ollama. **It's a default, not a constant** — the user changes it.
pub const LOCAL_DEFAULT_BASE_URL: &str = "http://localhost:11434";
/// List of installed models. Uses an **OpenAI-compatible** list, not Ollama native (`/api/tags`) —
/// the same single verification must work for runners other than Ollama for this branch to become a door for "open-source ones" (2026-08-01 measurement: Ollama
/// 0.12 returns 7 models with 200 on `/v1/models`).
const LOCAL_MODELS_PATH: &str = "models";
const LOCAL_CHAT_PATH: &str = "chat/completions";

/// Gemini **gives 400 for wrong keys** (2026-07-26 measurement: body
/// `{"error":{"code":400,"status":"INVALID_ARGUMENT","details":[…"reason":
/// "API_KEY_INVALID"…]}}`). If judged only by 401/403, wrong keys fall into the misleading "Couldn't verify" message.
///
/// Why it's safe to read 400 entirely as rejection: this call is a fixed GET with no body,
/// and URL/header names are all code constants, so the **only changing value in the request is the key**.
/// There's no other input on our side that could produce a 400.
const GEMINI_DENIED_STATUSES: &[u16] = &[400, 401, 403];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmVerifyResult {
    pub provider: String,
    /// Whether auth passed. Give `http_status` along with it so the screen can distinguish rejection (401/403) from other failures.
    pub ok: bool,
    pub http_status: Option<u16>,
    /// Whether the key itself was rejected — absorb vendor-specific status code differences (Gemini is 400) here.
    /// If the UI reinterprets the status code, that knowledge splits across two places every time a new vendor is added.
    pub denied: bool,
    /// A single line for network failures, etc. Since keys only go via stdin, they cannot be included here.
    pub message: Option<String>,
    pub duration_ms: u64,
    /// The timestamp of the audit line left by this call — ensures the UI states "recorded" as a fact.
    pub logged_at: String,
    /// The **body** of the confirmation response — populated only in the address branch.
    ///
    /// Why named vendors are `None`: that confirmation is a call that only checks authentication, so the UI
    /// has no business with the body, and there is no reason to expose account information mixed into the response via IPC.
    /// The address branch is different — this body is the **installed model list**, which the UI must select so users don't fail due to a single typo when manually typing model names. Parsing is not done here (see § why this file doesn't know vendor schemas) — the web adapter does.
    pub body: Option<String>,
}

/// How this request exits — **preventing invalid combinations entirely** via type
/// separation. Named vendors attach keys and use hardcoded addresses; the address branch
/// goes to user-provided addresses without keys. Requests mixing both (named vendor keys with arbitrary
/// addresses) cannot be created.
pub enum Target<'a> {
    /// Named vendor — attaches the key, and the address is a constant in this file.
    Vendor { secret: &'a str },
    /// Connect via address — goes only to the base URL provided by the user, with no auth headers.
    Address { base_url: &'a str },
}

/// The request to send. It has no body (`GET`).
pub struct VerifyRequest {
    url: String,
    headers: Vec<(String, String)>,
    /// Status codes that mean "the key is wrong" for this vendor.
    denied_statuses: &'static [u16],
    /// Returns the response body to the UI — true only for the address branch receiving the model list.
    returns_body: bool,
}

/// The host in the URL — **derived from a single URL constant** so that the `host` in the audit line and the UI's "where it goes" write the same value. Keeping the host as a separate constant risks silent drift when updating the URL, causing records to point to a different destination than the actual target.
fn host_of(url: &str) -> &str {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_scheme)
}

/// What remains in the **audit line** from the response — only status code and length. The body is not recorded.
pub struct HttpEcho {
    pub status: u16,
    pub body_chars: usize,
    /// The body to return to the UI — populated only for requests that `returns_body` (the model list in the address branch).
    /// This is not a recorded value.
    pub body: Option<String>,
}

impl HttpEcho {
    /// Confirmation that does not return a body — shape of the named vendor set. Actual transmission
    /// is built directly by `send_via_curl`; this shortcut is used only when tests mimic that shape.
    #[cfg(test)]
    pub fn status_only(status: u16, body_chars: usize) -> Self {
        Self {
            status,
            body_chars,
            body: None,
        }
    }
}

/// Narrows the user-provided address into a form usable in requests.
///
/// Rejections here and their reasons:
/// - **`http` is only for loopback.** Does not open paths to send plaintext vault excerpts over the internet.
///   Plaintext is normal within the same machine (runners don't use TLS); outside, `https` is required.
/// - **No userinfo (`user:pass@host`).** Secrets in URLs remain visible in audit lines and proxy
///   logs. Same discipline as sending Gemini keys only via headers.
/// - **No whitespace, newlines, quotes, or backslashes.** curl config is line-based; a single value could
///   create a new option line.
/// - **No query strings or fragments.** Since paths are appended later, `?` or `#` would result in an endpoint we didn't configure.
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

/// Is this machine itself. Only checks the host (port is irrelevant).
fn is_loopback_authority(authority: &str) -> bool {
    let host = match authority.strip_prefix('[') {
        // IPv6 literal — `[::1]:11434`
        Some(rest) => rest.split(']').next().unwrap_or(""),
        None => authority.split(':').next().unwrap_or(""),
    };
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

/// base URL + OpenAI compatible path. Do not append if it already ends with `/v1` —
/// Ollama provides `http://localhost:11434` and LM Studio provides `http://localhost:1234/v1`
/// as guidance, so both should work as-is when pasted.
fn local_endpoint(base_url: &str, path: &str) -> String {
    if base_url.ends_with("/v1") {
        format!("{base_url}/{path}")
    } else {
        format!("{base_url}/v1/{path}")
    }
}

/// curl config files are line-based, so values containing newlines break syntax. The save path
/// trims, so normal keys won't have this, but stopping here is better than sending malformed requests.
fn checked_secret(secret: &str) -> Result<&str, String> {
    if secret.contains('\n') || secret.contains('\r') {
        return Err("키에 줄바꿈이 섞여 있어요. 다시 저장해 주세요.".into());
    }
    Ok(secret)
}

/// A single line for when the address branch arrives at a named vendor or vice versa. If combinations are mismatched,
/// it does not silently pick one side — the accident of keys going to user-provided addresses
/// arises precisely from that "silence".
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
        // Gemini uses a dedicated header, not Bearer — authentication that cannot be
        // absorbed into the OpenAI-compatible branch, so it gets a named-vendor slot.
        ("gemini", Target::Vendor { secret }) => Ok(VerifyRequest {
            url: GEMINI_VERIFY_URL.to_string(),
            headers: vec![("x-goog-api-key".into(), checked_secret(secret)?.to_string())],
            denied_statuses: GEMINI_DENIED_STATUSES,
            returns_body: false,
        }),
        // Connection check for the address branch = **fetching the installed model list**.
        // One request settles three things at once: is the runner alive (connection) ·
        // is this address OpenAI-compatible (200 vs 404) · which models can be chosen
        // (the body). Splitting check and listing into two commands would also mean two
        // audit lines, and the user would meet the unexplainable state
        // "verification passed but the list is empty".
        (LOCAL_PROVIDER, Target::Address { base_url }) => Ok(VerifyRequest {
            url: local_endpoint(&normalize_base_url(base_url)?, LOCAL_MODELS_PATH),
            // There is **no** auth header. That is the very reason this branch exists.
            headers: vec![],
            denied_statuses: AUTH_DENIED_STATUSES,
            returns_body: true,
        }),
        (LOCAL_PROVIDER, _) | ("anthropic" | "openai" | "gemini", _) => Err(wrong_target(provider)),
        (other, _) => Err(format!("지원하지 않는 제공자예요: {other}")),
    }
}

/// Arguments that go on argv — **not a single secret among them**. URL, headers, and
/// body go via stdin. Chat round-trips differ only in the timeout.
fn curl_argv_with_timeout(timeout_seconds: &'static str) -> [&'static str; 9] {
    [
        // curl skips ~/.curlrc only when this option is the **first argument**. It keeps
        // user config from adding redirect/proxy/header entries that would change the
        // key's transmission boundary.
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

/// curl config passed via stdin — keys are only here, and in conversation round-trips, **vault excerpts in the body** also go only here (no argv or temp file intermediaries).
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

/// curl exit code → a single line enabling humans to **know what to do next**.
///
/// Why not use stderr messages directly: the three most common failures in local runners (down · port mismatch · address typo) all collapse into a single "Couldn't connect to
/// server" message in stderr. The exit code is the only stable signal separating these three (curl manual § EXIT CODES).
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

/// What curl left behind → (status code, body) or a **failure that carries a reason**.
///
/// ⚠️ Checking the exit code first is the whole point here. Even when the connection
/// itself fails, curl **prints `000`** in the `--write-out %{http_code}` slot — parsing
/// that as-is yields the plausible number `0`, fabricating the nonexistent fact
/// "it responded with HTTP 0", and the screen shows `failure: 0` instead of saying the
/// runner is down (2026-08-01 measurement: checking against a closed port gave
/// `status=Some(0), message=None`).
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

/// The body of the verification flow — the sender is injected so the contract can be
/// tested without a network. **The order is the contract**: reserve → (only on success)
/// send → finalize.
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
    // GET without body — characters sent from vault are 0. Even the hash of an empty payload
    // is a fact that can be post-verified as "sent 0 bytes".
    let payload = "";
    let logged_at = llm_audit::now_iso();
    let draft = AuditDraft {
        v: 1,
        at: logged_at.clone(),
        provider: provider.to_string(),
        // Records the destination by **host**, not provider name. Names are labels we assign, but hosts are where the request actually went, so when a branch for manually entering addresses opens later, it can be read honestly with the same syntax.
        host: host_of(&request.url).to_string(),
        // No model name for calls that don't invoke models — do not fabricate a missing value.
        model: None,
        purpose: "verify".into(),
        question: None,
        scope: AuditScope {
            nodes: vec![],
            prompt_chars: 0,
            vault_chars: 0,
        },
        // Calls that don't use tools — leave even an empty list (see § llm_audit).
        tools: None,
        payload_sha256: llm_audit::sha256_hex(payload),
    };
    // No transmission if recording fails. This `?` is the code path for Charter ②.
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
            // The body goes to the UI **only on success**. Failure bodies vary by runner and can be misread as a list by the UI; what's needed then is not a list but a status code.
            let body = if ok && request.returns_body {
                body
            } else {
                None
            };
            (label, ok, denied, Some(status), body_chars, None, body)
        }
        Err(err) => ("error", false, false, None, 0, Some(err), None),
    };

    // If confirmation fails, the promise of "a completed recording call" breaks — the reservation line
    // remains, so the fact is preserved, but the UI does not report success.
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

/// Connection check — **only when the user clicks [Connection Check]**. The reason vault paths are needed:
/// audit logs live inside the vault: if there's nowhere to record, don't send.
///
/// `base_url` comes **only from the address branch**. If an address arrives with a named vendor,
/// reject it — allowing it would cause keys from the keychain to go to hosts the UI never promised.
#[tauri::command(async)]
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

// ── Conversation Round-Trip (Bolt Agent) ─────────────────────────────────────────────
//
// Rust does only three things here: **confidentiality · transmission · audit.** It does not
// construct the request body, nor interpret the response — that is WebView's job (vendor format differences
// are better absorbed in one place by the adapter; if Rust starts knowing vendor schemas,
// the app must be rebuilt every time a vendor changes).
//
// **Rust knows nothing of loops.** One round-trip = one invocation of this command. The concepts of upper bound, interruption, and turn
// all belong to WebView, so without user turns, there is no path for this command to loop in the first place.

/// Conversation request. Unlike confirmation requests, it **has a body** — vault excerpts are included in that body.
pub struct ChatRequest {
    url: String,
    headers: Vec<(String, String)>,
    body: String,
}

/// What is returned from the response to the WebView — status code and **body**. The body is passed for normalization
/// purposes only, and only its length remains in the audit log (not a conversation store).
pub struct ChatEcho {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatEcho {
    pub status: u16,
    pub body: String,
    /// The destination of this round trip — the screen footer and audit line both state the same value.
    pub host: String,
    pub duration_ms: u64,
    /// The timestamp of the audit line left by this round trip. It is the basis for the screen to assert "recorded" as fact.
    pub logged_at: String,
}

/// The transmission scope measured and passed by the WebView + tool calls carried in this round trip.
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

/// Where the model name is embedded in the request — the reason allowed characters differ.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ModelPlacement {
    /// Inside the JSON body. Since runners use names like `qwen3:8b` · `hf.co/user/repo`,
    /// `:` and `/` are valid characters.
    Body,
    /// Inside the URL path (Gemini). Since `:` and `/` are **syntax**, passing them causes keys to go to
    /// endpoints we did not intend.
    UrlPath,
}

fn model_placement(provider: &str) -> ModelPlacement {
    if provider == "gemini" {
        ModelPlacement::UrlPath
    } else {
        ModelPlacement::Body
    }
}

/// Narrow the model name. The degree of narrowing depends on where the name is embedded.
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
        // The address branch goes to the **OpenAI-compatible chat endpoint**. Why the
        // native one (`/api/chat`) was not chosen: that is Ollama's syntax alone, so a
        // change of runner would mean writing yet another adapter, while the compatible
        // branch is already offered in the same shape by LM Studio · llama.cpp server ·
        // vLLM. There is no auth header here either.
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

/// The body of the conversation round trip — sender-injected. **Order is a contract**: reserve → (only if successful) transmit → finalize. We intentionally repeat syntax like `verify_with`.
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
        // An empty list is the fact "a round trip sent with no tools", so it stays as-is —
        // a different meaning from the absence (`None`) on connection-check lines.
        tools: Some(scope.tools),
        // Hash of the **full transmitted payload**. The only anchor for checking after the
        // fact that the bytes that actually went out match the scope the screen showed.
        payload_sha256: llm_audit::sha256_hex(body),
    };
    // No recording, no transmission.
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

    // If the network itself failed there is no status code — we do not fabricate a 0,
    // we return failure to the caller (the screen says "the connection failed").
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

/// One chat round trip — **only within a turn where the user pressed [Send]**. The vault
/// path is required for the same reason as the verification flow: with nowhere to record,
/// nothing is sent.
#[tauri::command(async)]
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
        // Other processes must not be able to see the key with `ps` — secrets go only in the stdin config.
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
        // Header/URL take one line each — a value cannot add lines to create a new option.
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
        // The official docs also describe the `?key=` query form, but we use only the
        // header — the URL is a place preserved verbatim in audit lines and proxy logs,
        // so no secret may ride on it.
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
        // Following a redirect would retransmit the key to a host we did not choose.
        // This assertion pins the absence of that option against regression.
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
        // Keeping the host as a separate constant drifts silently when the URL is fixed —
        // being a derived value, the record cannot depart from the actual destination.
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
        // The screen states "where this key goes" **before** the key is pasted. Whether
        // that sentence matches the actual destination is caught jointly by the web-side
        // tests using the same fixture.
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

    #[cfg(unix)]
    #[test]
    fn a_gemini_key_rejected_with_400_is_a_rejection_not_a_failure() {
        // 2026-07-26 measurement: Gemini gives 400 (`API_KEY_INVALID`) for a wrong key.
        // Judging only by 401/403, the user sees "Couldn't verify" and assumes the app is
        // broken rather than their key.
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

    #[cfg(unix)]
    #[test]
    fn a_400_from_a_bearer_vendor_is_still_a_plain_failure() {
        // Denied statuses are a per-vendor list — if Gemini's 400 rule leaked to other
        // vendors, even a request mistake on our side would be misdiagnosed as "the key is wrong".
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

    #[cfg(unix)]
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
        // An additive extension, so the schema version stays the same — old lines must keep reading.
        assert_eq!(line["v"], 1);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn refuses_to_send_when_the_audit_line_cannot_be_written() {
        // The heart of log-before-send: if it cannot be recorded, **there is no transmission at all**.
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

    #[cfg(unix)]
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
        // The basis for the screen to say "0 characters of vault data".
        assert_eq!(line["scope"]["vaultChars"], 0);
        assert_eq!(line["scope"]["promptChars"], 0);
        assert_eq!(line["question"], serde_json::Value::Null);
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
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

    #[cfg(unix)]
    #[test]
    fn a_network_failure_is_still_recorded() {
        // A failed call is still the fact that "something went out" — omitting it from the record makes the audit a lie.
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
        // The same discipline as the source-reflection contract in secrets.rs: commands in
        // this file return only types that cannot hold a key. Even as new commands are
        // added, a return type outside this allowlist gets caught here.
        let source = include_str!("llm.rs").replace("\r\n", "\n");
        // Both spellings count. `#[tauri::command(async)]` moves the body off the macOS main
        // thread, and a matcher that saw only the bare form would report zero commands here and
        // pass while checking nothing — the failure this assertion exists to prevent.
        let commands: Vec<usize> = source
            .match_indices("\n#[tauri::command")
            .filter(|(idx, _)| source[*idx..].contains("]\npub fn "))
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

    // ── Chat round trip ───────────────────────────────────────────────────

    #[test]
    fn a_chat_key_never_appears_in_argv_and_neither_does_the_vault_excerpt() {
        // If a vault excerpt rode on argv, another process on the same machine could read
        // the user's documents with `ps` — like the key, it must ride only in the stdin config.
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
        // Inside quotes, curl config turns `\n` back into a real newline. Without escaping
        // backslashes first, a `\n` inside a JSON string becomes a raw newline and the
        // body we send is itself broken JSON.
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
        // Unescape by the same rule curl applies and check it matches the original.
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
        // The config is still line-based — the body cannot create a new option line.
        // url · header×2 · request · data = 5.
        assert_eq!(config.lines().count(), 5, "{config}");
    }

    #[test]
    fn every_chat_endpoint_is_https_and_shares_the_verify_host() {
        // The destination the key-registration screen promised and where chat goes must be the same.
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
        // Only Gemini puts the model in the path — if slashes or queries pass through,
        // the key goes out to an endpoint we did not choose.
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
        // log-before-send — exactly the same on the chat path.
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

    #[cfg(unix)]
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
        // The payload anchor must be the hash of the **string actually sent** for post-hoc comparison to work.
        assert_eq!(line["payloadSha256"], llm_audit::sha256_hex(body));
        // Only the length of the response body remains — this is not a conversation store.
        assert_eq!(line["responseChars"], 14);
        assert!(
            !raw.contains("content\\\":[]"),
            "응답 본문이 기록되면 안 된다"
        );
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn the_agent_line_this_module_writes_matches_the_shared_reader_fixture() {
        // Blocks drift between writer (here) ↔ reader (web `llm-audit-log.ts`). The
        // fixture's `purpose:"agent"` line must match what this code actually writes —
        // only timestamp and duration vary per call, so those two are excluded from the comparison.
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

    #[cfg(unix)]
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

    #[cfg(unix)]
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
        // A denial is still a response — passed through as-is so the screen can pick guidance by status code.
        assert_eq!(result.status, 401);
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "denied");
        fs::remove_dir_all(&vault).ok();
    }

    // ── Connect by address (keyless local runner) ────────────────────────

    #[test]
    fn the_address_branch_carries_no_authorization_header_at_all() {
        // This is the very reason this branch exists. If even one header is attached, the
        // old shape "provider = one secret key" has quietly come back to life.
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
        // This assertion is the single most important one in this slice. If it passed,
        // a keychain key would go out to a host the screen never promised.
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
        // The opposite direction is blocked too — the address branch has no place to carry a key.
        assert!(verify_request(LOCAL_PROVIDER, &Target::Vendor { secret: "sk" }).is_err());
        assert!(chat_request(LOCAL_PROVIDER, "m", &Target::Vendor { secret: "sk" }, "{}").is_err());
    }

    #[test]
    fn plaintext_http_is_allowed_only_to_this_machine() {
        // What the charter allows is **localhost**. We do not open a path that sends vault
        // excerpts in plaintext across the internet — going outside requires https.
        for ok in [
            "http://localhost:11434",
            "http://127.0.0.1:1234",
            "http://127.42.0.7:1234",
            "http://[::1]:11434",
            "https://box.example.com:8080",
        ] {
            assert!(normalize_base_url(ok).is_ok(), "거절하면 안 된다: {ok}");
        }
        for bad in [
            "http://example.com",
            "http://192.168.0.9:11434",
            "http://127.example.invalid:11434",
        ] {
            assert!(normalize_base_url(bad).is_err(), "통과하면 안 된다: {bad}");
        }
    }

    #[test]
    fn a_base_url_cannot_smuggle_credentials_or_a_new_curl_option() {
        for bad in [
            "",
            "localhost:11434",                 // no scheme
            "ftp://localhost:11434",           // a scheme we cannot speak
            "http://user:pw@localhost:11434",  // a secret carried in the URL
            "http://localhost:11434?key=leak", // a query we did not choose
            "http://localhost:11434#frag",
            "http://local host:11434", // whitespace = a new token in curl config
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
        // Ollama documents `http://localhost:11434`, LM Studio documents `…/v1`. Both must
        // work exactly as pasted for this to become the door for "the open-source ones".
        assert_eq!(
            local_endpoint("http://localhost:11434", LOCAL_CHAT_PATH),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            local_endpoint("http://localhost:1234/v1", LOCAL_CHAT_PATH),
            "http://localhost:1234/v1/chat/completions"
        );
        // People also commonly append a trailing slash.
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
        // Ollama's names look like `qwen3:8b`. Keeping the old rule (`:` forbidden) as-is
        // would make this branch fail entirely on the first round trip — that `:` ban
        // exists because of Gemini, where the model goes into the **URL path**, so the
        // right fix is to split by placement.
        assert_eq!(
            validate_model_id("qwen3:8b", ModelPlacement::Body).unwrap(),
            "qwen3:8b"
        );
        assert!(validate_model_id("hf.co/user/repo:Q4", ModelPlacement::Body).is_ok());
        assert!(validate_model_id("qwen3:8b", ModelPlacement::UrlPath).is_err());
        // Things blocked regardless of placement.
        for bad in ["", "a b", "m#frag", "x?key=leak"] {
            assert!(
                validate_model_id(bad, ModelPlacement::Body).is_err(),
                "{bad:?}"
            );
        }
        // Does the actual wiring pick the right placement.
        assert!(model_placement("gemini") == ModelPlacement::UrlPath);
        assert!(model_placement(LOCAL_PROVIDER) == ModelPlacement::Body);
    }

    #[test]
    fn curl_exit_codes_tell_off_from_wrong_port_from_timeout_apart() {
        // The only stable signal that lets the screen say "why it is failing". The stderr
        // sentence flattens these three into a single message.
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

    #[cfg(unix)]
    #[test]
    fn a_local_check_records_localhost_and_hands_back_the_model_list() {
        // The place where this product's trust story is proven by the log — because the
        // destination is a host, not a provider **name**, this line itself is the evidence
        // that "nothing left the machine".
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
        // The screen parses the list — Rust does not know vendor schemas.
        assert_eq!(result.body.as_deref(), Some(listing));

        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["provider"], "local");
        assert_eq!(line["host"], "localhost:11434");
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line["scope"]["vaultChars"], 0);
        // The list body is **not recorded** — only the length remains.
        assert!(!raw.contains("qwen3:8b"), "확인 응답 본문이 기록됐다");
        assert_eq!(line["responseChars"], listing.chars().count());
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_local_check_that_hits_the_wrong_port_returns_a_status_not_a_list() {
        // Common case where another program runs on the same address — connection succeeds but returns 404.
        // In that case, what the screen needs is not a list but a status code, and we eliminate
        // any room for misreading the failure body as a list.
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

    #[cfg(unix)]
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
                // This round trip also lacks an auth header — only content-type.
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
        // Since old lines must continue to be read, the schema version remains unchanged (additive extension).
        assert_eq!(line["v"], 1);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_local_round_trip_still_refuses_to_send_when_the_audit_line_cannot_be_written() {
        // log-before-send is the same regardless of branch count. If we relax it under the
        // rationale that "it won't go out anyway" because it's local, the sales logic of this branch —
        // that records are evidence — collapses.
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
        // curl writes `000` in the `%{http_code}` position even on connection failure. Parsing it as-is
        // creates the false fact that "HTTP 0 was returned," and the screen
        // displays `failure: 0` instead of saying the runner is down — then this branch's
        // promise to "explain why it failed" breaks immediately at the first failure.
        let refused = interpret_curl_output(Some(7), false, "\n000", "Couldn't connect to server");
        assert!(refused.is_err());
        assert!(refused.unwrap_err().contains("꺼져 있거나 포트가 달라요"));

        // Normal responses pass through as-is.
        let ok = interpret_curl_output(Some(0), true, "{\"data\":[]}\n200", "").unwrap();
        assert_eq!(ok.0, 200);
        assert_eq!(ok.1, "{\"data\":[]}");
    }
}
