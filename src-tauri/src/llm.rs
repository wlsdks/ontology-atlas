// BYOK connection checks and chat round trips. The key never crosses IPC or argv
// (curl reads URL and headers from stdin, or `ps` would show it), an audit line is
// reserved before every send, and nothing runs without a user click.

use crate::errors::coded;
use crate::llm_audit::{self, AuditDraft, AuditOutcome, AuditScope, AuditToolRef};
use crate::secrets;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

mod http_output;
pub(crate) mod requests;
use std::time::Instant;

/// Auth check only: no model call, no billing, no body.
const ANTHROPIC_VERIFY_URL: &str = "https://api.anthropic.com/v1/models?limit=1";
const OPENAI_VERIFY_URL: &str = "https://api.openai.com/v1/models";
/// The key goes only in headers, never `?key=`: URLs persist in proxy logs and in
/// our audit line.
const GEMINI_VERIFY_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
/// A changed value yields 400 instead of 401.
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Same host as the verify URL, or chat goes somewhere key registration never promised.
const ANTHROPIC_CHAT_URL: &str = "https://api.anthropic.com/v1/messages";
const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
/// The model name flows into the path, so `validate_model_id` must narrow it first
/// or it could escape the path or inject a query.
const GEMINI_CHAT_URL_PREFIX: &str = "https://generativelanguage.googleapis.com/v1beta/models/";

/// Models may take tens of seconds on tool calls; [Stop] is the user-side bound
/// and this bounds a hanging socket.
const CHAT_TIMEOUT_SECONDS: &str = "180";
/// Local retries are free, so fail one round trip sooner than a remote model.
const LOCAL_CHAT_TIMEOUT_SECONDS: &str = "60";

/// Per request, so the screen can tell `Rejected` (fix the key) from `Failed`.
const AUTH_DENIED_STATUSES: &[u16] = &[401, 403];
/// Keyless connect-by-address: any OpenAI-compatible runner (Ollama, LM Studio,
/// vLLM) without naming vendors. No keychain and no auth header on this branch.
pub const LOCAL_PROVIDER: &str = "local";
pub const LOCAL_DEFAULT_BASE_URL: &str = "http://localhost:11434";
/// The OpenAI-compatible list, not Ollama's `/api/tags`, so any runner verifies the same way.
const LOCAL_MODELS_PATH: &str = "models";
const LOCAL_CHAT_PATH: &str = "chat/completions";

/// Gemini answers a wrong key with 400. Safe to read all 400s as denial because
/// the fixed bodiless GET varies only in the key.
const GEMINI_DENIED_STATUSES: &[u16] = &[400, 401, 403];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmVerifyResult {
    pub provider: String,
    pub ok: bool,
    pub http_status: Option<u16>,
    /// Vendor status differences are absorbed here so the UI does not re-derive them.
    pub denied: bool,
    /// Keys go only via stdin, so they cannot appear here.
    pub message: Option<String>,
    pub duration_ms: u64,
    /// Lets the UI state "recorded" as a fact.
    pub logged_at: String,
    /// Only the address branch returns the installed model list; named vendors keep
    /// account data in the response out of IPC.
    pub body: Option<String>,
}

/// Separate variants make a vendor key sent to a user address unrepresentable.
pub enum Target<'a> {
    Vendor { secret: &'a str },
    Address { base_url: &'a str },
}

pub struct VerifyRequest {
    url: String,
    headers: Vec<(String, String)>,
    denied_statuses: &'static [u16],
    /// Only the address branch returns its model list.
    returns_body: bool,
}

/// Derived from the URL so the audit `host` and the screen never drift from the real target.
fn host_of(url: &str) -> &str {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_scheme)
}

pub struct HttpEcho {
    pub status: u16,
    pub body_chars: usize,
    /// Returned to the UI, not recorded.
    pub body: Option<String>,
}

impl HttpEcho {
    /// Test-only shortcut; `send_via_curl` builds the real transmission.
    #[cfg(test)]
    pub fn status_only(status: u16, body_chars: usize) -> Self {
        Self {
            status,
            body_chars,
            body: None,
        }
    }
}

/// Rejects `http` beyond loopback (no plaintext vault excerpts on the internet),
/// userinfo (URL secrets leak into logs), whitespace or quotes (a new curl config
/// line) and query or fragment (an unconfigured endpoint).
fn normalize_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(coded("endpoint-empty", ""));
    }
    if trimmed.len() > 300 {
        return Err(coded("endpoint-too-long", ""));
    }
    if trimmed
        .chars()
        .any(|ch| ch.is_whitespace() || ch.is_control() || matches!(ch, '"' | '\\' | '?' | '#'))
    {
        return Err(coded("endpoint-invalid-characters", ""));
    }
    let (scheme, rest) = trimmed
        .split_once("://")
        .ok_or_else(|| coded("endpoint-scheme-unsupported", ""))?;
    if scheme != "http" && scheme != "https" {
        return Err(coded("endpoint-scheme-unsupported", ""));
    }
    let authority = rest.split('/').next().unwrap_or("");
    if authority.is_empty() {
        return Err(coded("endpoint-host-missing", ""));
    }
    if authority.contains('@') {
        return Err(coded("endpoint-credentials-in-url", ""));
    }
    if scheme == "http" && !is_loopback_authority(authority) {
        return Err(coded("endpoint-plaintext-blocked", ""));
    }
    Ok(trimmed.to_string())
}

fn is_loopback_authority(authority: &str) -> bool {
    let host = match authority.strip_prefix('[') {
        Some(rest) => rest.split(']').next().unwrap_or(""),
        None => authority.split(':').next().unwrap_or(""),
    };
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

/// Accepts both Ollama's bare address and LM Studio's `/v1` as pasted.
fn local_endpoint(base_url: &str, path: &str) -> String {
    if base_url.ends_with("/v1") {
        format!("{base_url}/{path}")
    } else {
        format!("{base_url}/v1/{path}")
    }
}

/// A newline would break curl's line-based config.
fn checked_secret(secret: &str) -> Result<&str, String> {
    if secret.contains('\n') || secret.contains('\r') {
        return Err(coded("secret-has-newline", ""));
    }
    Ok(secret)
}

/// A mismatch never silently picks a side, or a key could go to a user address.
fn wrong_target(provider: &str) -> String {
    if provider == LOCAL_PROVIDER {
        coded("endpoint-not-for-key", "")
    } else {
        coded("endpoint-fixed-for-provider", provider)
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
        // Gemini uses a dedicated header, not Bearer, so it has a named-vendor slot.
        ("gemini", Target::Vendor { secret }) => Ok(VerifyRequest {
            url: GEMINI_VERIFY_URL.to_string(),
            headers: vec![("x-goog-api-key".into(), checked_secret(secret)?.to_string())],
            denied_statuses: GEMINI_DENIED_STATUSES,
            returns_body: false,
        }),
        // One request answers liveness, compatibility (200 vs 404) and the model list,
        // with one audit line.
        (LOCAL_PROVIDER, Target::Address { base_url }) => Ok(VerifyRequest {
            url: local_endpoint(&normalize_base_url(base_url)?, LOCAL_MODELS_PATH),
            // No auth header: the reason this branch exists.
            headers: vec![],
            denied_statuses: AUTH_DENIED_STATUSES,
            returns_body: true,
        }),
        (LOCAL_PROVIDER, _) | ("anthropic" | "openai" | "gemini", _) => Err(wrong_target(provider)),
        (other, _) => Err(coded("unsupported-provider", other)),
    }
}

/// No secret on argv; URL, headers and body go via stdin.
pub(crate) fn curl_argv_with_timeout(timeout_seconds: &'static str) -> [&'static str; 9] {
    [
        // Only as the first argument does curl skip ~/.curlrc, whose entries could add
        // redirects or proxies that move the key.
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

/// Keys and vault excerpts travel only here, never argv or temp files.
pub(crate) fn curl_config_for(
    url: &str,
    headers: &[(String, String)],
    body: Option<&str>,
) -> String {
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

/// Codes, not sentences, so the screen can branch and translate; matching prose
/// would turn a vault-write failure into "check your network".
pub(crate) const AUDIT_BLOCKED_PREFIX: &str = "audit-blocked:";
pub(crate) const TIMED_OUT_PREFIX: &str = "timed-out:";

fn curl_failure_message(code: Option<i32>, stderr: &str) -> String {
    match code {
        Some(6) => coded("host-not-found", ""),
        Some(7) => coded("connection-refused", ""),
        // Written out because the screen matches `timed-out:` by prefix and needs the colon.
        Some(28) => format!("{TIMED_OUT_PREFIX} curl exit 28"),
        Some(35) | Some(60) => coded("tls-failed", ""),
        _ if stderr.is_empty() => coded("no-response", ""),
        _ => coded("no-response", stderr),
    }
}

pub(crate) fn run_curl(argv: [&'static str; 9], config: &str) -> Result<(u16, String), String> {
    let mut command = Command::new("curl");
    command.args(argv);
    let output = http_output::capture(command, config.as_bytes()).map_err(|err| match err {
        http_output::CaptureError::Request(err) => coded("request-failed", err),
        http_output::CaptureError::Response(err) => coded("no-response", err),
        http_output::CaptureError::Cancelled => coded("cancelled", ""),
    })?;
    interpret_curl_output(
        output.status.code(),
        output.status.success(),
        &String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr).trim(),
    )
}

/// Checks the exit code first: curl prints `000` on connection failure, which would
/// read as a fabricated HTTP 0.
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

/// Sender injected for tests. Order is the contract: reserve, send only on success, finalize.
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
    // A bodiless GET; the empty-payload hash proves 0 bytes were sent.
    let payload = "";
    let logged_at = llm_audit::now_iso();
    let draft = AuditDraft {
        v: 1,
        at: logged_at.clone(),
        provider: provider.to_string(),
        // Records the host, not the provider label: where the request really went.
        host: host_of(&request.url).to_string(),
        model: None,
        purpose: "verify".into(),
        question: None,
        scope: AuditScope {
            nodes: vec![],
            prompt_chars: 0,
            vault_chars: 0,
        },
        tools: None,
        payload_sha256: llm_audit::sha256_hex(payload),
    };
    // No transmission if recording fails.
    let reservation = llm_audit::reserve(vault_dir, draft)
        .map_err(|error| format!("{AUDIT_BLOCKED_PREFIX}{error}"))?;

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
            // Only successful bodies reach the UI; a failure body could be misread as a list.
            let body = if ok && request.returns_body {
                body
            } else {
                None
            };
            (label, ok, denied, Some(status), body_chars, None, body)
        }
        Err(err) => ("error", false, false, None, 0, Some(err), None),
    };

    // A failed finalize keeps the reservation line but must not report success.
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

/// Runs only on the user's click. Needs the vault path because the audit log lives
/// there; a named vendor with an address is rejected, or the key could leave.
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

// Rust owns confidentiality, transmission and audit only; the WebView builds
// bodies, parses responses and owns the loop, one command call per round trip.

/// Carries vault excerpts in its body.
pub struct ChatRequest {
    url: String,
    headers: Vec<(String, String)>,
    body: String,
}

/// The body is returned for normalization; only its length is logged.
pub struct ChatEcho {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatEcho {
    pub status: u16,
    pub body: String,
    /// The screen footer and audit line state the same value.
    pub host: String,
    pub duration_ms: u64,
    pub logged_at: String,
}

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

/// Placement decides which characters are allowed.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ModelPlacement {
    /// Runner names like `qwen3:8b` need `:` and `/`.
    Body,
    /// There `:` and `/` are syntax and would redirect the key.
    UrlPath,
}

fn model_placement(provider: &str) -> ModelPlacement {
    if provider == "gemini" {
        ModelPlacement::UrlPath
    } else {
        ModelPlacement::Body
    }
}

fn validate_model_id(model: &str, placement: ModelPlacement) -> Result<&str, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Err(coded("model-empty", ""));
    }
    let allowed = |ch: char| {
        ch.is_ascii_alphanumeric()
            || matches!(ch, '.' | '_' | '-')
            || (placement == ModelPlacement::Body && matches!(ch, ':' | '/'))
    };
    if trimmed.len() > 100 || !trimmed.chars().all(allowed) {
        return Err(coded("model-invalid", trimmed));
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
        // The OpenAI-compatible endpoint rather than Ollama's `/api/chat`, so any runner
        // works. No auth header.
        (LOCAL_PROVIDER, Target::Address { base_url }) => Ok(ChatRequest {
            url: local_endpoint(&normalize_base_url(base_url)?, LOCAL_CHAT_PATH),
            headers: vec![json],
            body: body.to_string(),
        }),
        (LOCAL_PROVIDER, _) | ("anthropic" | "openai" | "gemini", _) => Err(wrong_target(provider)),
        (other, _) => Err(coded("unsupported-provider", other)),
    }
}

fn curl_chat_config(request: &ChatRequest) -> String {
    curl_config_for(&request.url, &request.headers, Some(&request.body))
}

fn local_chat_timeout(construction: bool) -> &'static str {
    if construction { CHAT_TIMEOUT_SECONDS } else { LOCAL_CHAT_TIMEOUT_SECONDS }
}

fn send_chat_cancellable(
    request: &ChatRequest,
    timeout: &'static str,
    cancellation: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<ChatEcho, String> {
    send_chat_with_policy(request, timeout, cancellation, false)
}
fn construction_transport_policy(command: &mut Command, request: &ChatRequest) -> Result<(), String> {
    let endpoint = normalize_base_url(&request.url)?;
    let authority = endpoint.split_once("://").ok_or_else(|| coded("endpoint-host-missing", ""))?.1.split('/').next().unwrap_or("");
    if !is_loopback_authority(authority) { return Err(coded("construction-loopback-required", "")); }
    if request.body.len() > 64 * 1024 { return Err(coded("construction-request-limit", "")); }
    command.args(["--noproxy", "*"]);
    for key in ["http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY", "no_proxy", "NO_PROXY"] {
        command.env_remove(key);
    }
    Ok(())
}
fn send_chat_with_policy(
    request: &ChatRequest,
    timeout: &'static str,
    cancellation: &mut tokio::sync::oneshot::Receiver<()>,
    construction: bool,
) -> Result<ChatEcho, String> {
    let mut command = Command::new("curl");
    command.args(curl_argv_with_timeout(timeout));
    if construction { construction_transport_policy(&mut command, request)?; }
    let config = curl_chat_config(request);
    let output = tauri::async_runtime::block_on(http_output::capture_cancelled(
        command,
        config.as_bytes(),
        cancellation,
    ))
    .map_err(|error| match error {
        http_output::CaptureError::Request(error) => coded("request-failed", error),
        http_output::CaptureError::Response(error) => coded("no-response", error),
        http_output::CaptureError::Cancelled => coded("cancelled", ""),
    })?;
    let (status, body) = interpret_curl_output(
        output.status.code(),
        output.status.success(),
        &String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr).trim(),
    )?;
    Ok(ChatEcho { status, body })
}

/// Order is the contract: reserve, send only on success, finalize.
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
        // An empty list means "sent with no tools", unlike `None` on connection checks.
        tools: Some(scope.tools),
        // The only anchor that the bytes sent match the scope the screen showed.
        payload_sha256: llm_audit::sha256_hex(body),
    };
    // No recording, no transmission.
    let reservation = llm_audit::reserve(vault_dir, draft)
        .map_err(|error| format!("{AUDIT_BLOCKED_PREFIX}{error}"))?;

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

    // No status on network failure; never fabricate a 0.
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

/// Only within a turn where the user pressed [Send]; no vault path, no send.
#[tauri::command(async)]
pub async fn llm_chat(
    window: tauri::WebviewWindow,
    request_id: String,
    provider: String,
    vault_path: String,
    model: String,
    question: Option<String>,
    body: String,
    scope: AuditScopeInput,
    base_url: Option<String>,
    source_construction: Option<bool>,
) -> Result<LlmChatEcho, String> {
    let construction = source_construction.unwrap_or(false);
    if construction && provider != LOCAL_PROVIDER { return Err(wrong_target(&provider)); }
    let mut owned = requests::registry().claim(window.label(), &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
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
                |request| {
                    send_chat_with_policy(request, local_chat_timeout(construction), &mut owned.receiver, construction)
                },
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
            |request| send_chat_cancellable(request, CHAT_TIMEOUT_SECONDS, &mut owned.receiver),
        )
    })
    .await
    .map_err(|error| coded("request-failed", error))?
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    mod cancellation;
    mod construction_probe;
    use super::*;
    use std::cell::Cell;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn construction_uses_a_longer_bound_without_changing_the_local_audit_timeout() {
        assert_eq!(local_chat_timeout(true), "180");
        assert_eq!(local_chat_timeout(false), "60");
    }

    #[test]
    fn construction_transport_refuses_remote_https_and_large_payloads() {
        let remote = ChatRequest { url: "https://example.com/v1/chat/completions".into(), headers: vec![], body: "marker".into() };
        assert!(construction_transport_policy(&mut Command::new("curl"), &remote).is_err());
        let oversized = ChatRequest { url: "http://127.0.0.1:11434/v1/chat/completions".into(), headers: vec![], body: "x".repeat(64 * 1024 + 1) };
        assert!(construction_transport_policy(&mut Command::new("curl"), &oversized).is_err());
    }
    #[test]
    fn construction_transport_removes_every_inherited_proxy_override() {
        let request = ChatRequest { url: "http://127.0.0.1:11434/v1/chat/completions".into(), headers: vec![], body: "HARMLESS_SOURCE_MARKER".into() };
        let mut command = Command::new("curl");
        for key in ["http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY", "no_proxy", "NO_PROXY"] { command.env(key, "untrusted-proxy-value"); }
        construction_transport_policy(&mut command, &request).unwrap();
        assert!(command.get_envs().all(|(_, value)| value.is_none()));
        assert_eq!(command.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect::<Vec<_>>(), ["--noproxy", "*"]);
    }

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
        let request = verify_request(
            "anthropic",
            &Target::Vendor {
                secret: "sk-ant-secret-value",
            },
        )
        .unwrap();
        for arg in curl_argv() {
            assert!(!arg.contains("sk-ant"), "argv carries the key: {arg}");
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
        // One line each, so a value cannot add an option line.
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
        // Header only: the URL is kept verbatim in audit and proxy logs.
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
            "the URL must not carry the key"
        );
        assert!(!request.url.contains("AIza-secret-value"));
        for arg in curl_argv() {
            assert!(!arg.contains("AIza"), "argv carries the key: {arg}");
        }
        let config = curl_config(&request);
        assert!(
            config.contains("x-goog-api-key: AIza-secret-value"),
            "{config}"
        );
    }

    #[test]
    fn curl_never_follows_a_redirect() {
        // A followed redirect would resend the key to a host we did not choose.
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
                "{provider} probe URL is plaintext: {}",
                request.url
            );
        }
    }

    #[test]
    fn the_recorded_host_is_derived_from_the_url_the_request_actually_uses() {
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
        // Web tests read the same fixture, so the promised destination matches.
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/llm-provider-hosts.json"))
                .unwrap();
        let hosts = fixture["hosts"].as_object().unwrap();
        assert_eq!(hosts.len(), 3, "fixture must cover every named vendor");
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
        assert!(result.denied, "400 must read as denied");
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "denied");
        assert_eq!(line["host"], "generativelanguage.googleapis.com");
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_400_from_a_bearer_vendor_is_still_a_plain_failure() {
        // Gemini's 400 rule must not leak to other vendors.
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
        assert_eq!(line["v"], 1);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn refuses_to_send_when_the_audit_line_cannot_be_written() {
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
        assert!(!sent.get(), "sent although the audit write failed");
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
        // A failed call still went out, so it is recorded.
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
        // Commands here return only types that cannot hold a key.
        let source = include_str!("llm.rs").replace("\r\n", "\n");
        let commands: Vec<usize> = source
            .match_indices("\n#[tauri::command")
            .filter(|(idx, _)| {
                source[*idx..].contains("]\npub fn ") || source[*idx..].contains("]\npub async fn ")
            })
            .map(|(idx, _)| idx)
            .collect();
        assert_eq!(
            commands.len(),
            2,
            "only the connection probe and chat round trip"
        );
        for idx in commands {
            let signature = &source[idx..(idx + 600).min(source.len())];
            assert!(
                signature.contains("Result<LlmVerifyResult, String>")
                    || signature.contains("Result<LlmChatEcho, String>"),
                "command return type is outside the allowlist: {}",
                &signature[..signature.find('{').unwrap_or(200).min(signature.len())]
            );
        }
    }

    #[test]
    fn a_chat_key_never_appears_in_argv_and_neither_does_the_vault_excerpt() {
        // A vault excerpt on argv would be readable with `ps`.
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
            assert!(!arg.contains("sk-ant"), "argv carries the key: {arg}");
            assert!(!arg.contains("결제"), "argv carries a vault excerpt: {arg}");
        }
        let config = curl_chat_config(&request);
        assert!(config.contains("sk-ant-secret-value"));
        assert!(config.contains("결제 처리 노드"));
        assert!(config.contains("request = \"POST\""));
    }

    #[test]
    fn a_json_body_survives_the_curl_config_escape_round_trip() {
        // Inside quotes curl turns `\n` back into a newline, so backslashes are escaped
        // first or the sent JSON breaks.
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
            .expect("a data line must exist");
        let quoted = data_line.trim_start_matches("data = ");
        let inner = &quoted[1..quoted.len() - 1];
        let mut restored = String::new();
        let mut chars = inner.chars();
        while let Some(ch) = chars.next() {
            if ch == '\\' {
                restored.push(chars.next().expect("an escape must not be truncated"));
            } else {
                restored.push(ch);
            }
        }
        assert_eq!(restored, body);
        // url, two headers, request, data: still one option per line.
        assert_eq!(config.lines().count(), 5, "{config}");
    }

    #[test]
    fn every_chat_endpoint_is_https_and_shares_the_verify_host() {
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
                "the URL must not carry the key"
            );
        }
    }

    #[test]
    fn a_model_name_cannot_escape_the_gemini_url_path() {
        // A slash or query in a Gemini model path would send the key elsewhere.
        for bad in ["../../v1/evil", "x?key=leak", "a b", "m#frag", ""] {
            assert!(
                validate_model_id(bad, ModelPlacement::UrlPath).is_err(),
                "must be rejected: {bad:?}"
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
        assert!(!sent.get(), "sent although the audit write failed");
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
        assert_eq!(raw.lines().count(), 1, "one round trip, one line");
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["purpose"], "agent");
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line["question"], "이 노드에 빠진 관계 이어줘");
        assert_eq!(line["scope"]["vaultChars"], 1_020);
        assert_eq!(line["scope"]["nodes"][0], "capabilities/payment");
        assert_eq!(line["tools"][0]["name"], "get_concept");
        assert_eq!(line["model"], "claude-sonnet-4-5");
        assert_eq!(line["payloadSha256"], llm_audit::sha256_hex(body));
        assert_eq!(line["responseChars"], 14);
        assert!(
            !raw.contains("content\\\":[]"),
            "the response body must not be logged"
        );
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn the_agent_line_this_module_writes_matches_the_shared_reader_fixture() {
        // Writer and reader (`llm-audit-log.ts`) share this fixture; only timestamp and
        // duration are excluded.
        let fixture = include_str!("../../tests/fixtures/llm-audit-log.sample.jsonl");
        let expected: serde_json::Value = fixture
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
            .find(|line| line["purpose"] == "agent")
            .expect("fixture must contain an agent line");

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
        assert_eq!(result.status, 401);
        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["outcome"], "denied");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn the_address_branch_carries_no_authorization_header_at_all() {
        let request = verify_request(
            LOCAL_PROVIDER,
            &Target::Address {
                base_url: LOCAL_DEFAULT_BASE_URL,
            },
        )
        .unwrap();
        assert!(request.headers.is_empty(), "{:?}", request.headers);
        assert_eq!(request.url, "http://localhost:11434/v1/models");
        assert!(request.returns_body, "the UI must receive the model list");
    }

    #[test]
    fn a_named_vendor_key_can_never_travel_to_an_address_the_user_typed() {
        // Otherwise a keychain key would go to a host the screen never promised.
        for provider in ["anthropic", "openai", "gemini"] {
            assert!(
                verify_request(
                    provider,
                    &Target::Address {
                        base_url: "http://localhost:11434",
                    },
                )
                .is_err(),
                "{provider} accepted an arbitrary URL"
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
        assert!(verify_request(LOCAL_PROVIDER, &Target::Vendor { secret: "sk" }).is_err());
        assert!(chat_request(LOCAL_PROVIDER, "m", &Target::Vendor { secret: "sk" }, "{}").is_err());
    }

    #[test]
    fn plaintext_http_is_allowed_only_to_this_machine() {
        // Plain `http` only on localhost.
        for ok in [
            "http://localhost:11434",
            "http://127.0.0.1:1234",
            "http://127.42.0.7:1234",
            "http://[::1]:11434",
            "https://box.example.com:8080",
        ] {
            assert!(normalize_base_url(ok).is_ok(), "must be accepted: {ok}");
        }
        for bad in [
            "http://example.com",
            "http://192.168.0.9:11434",
            "http://127.example.invalid:11434",
        ] {
            assert!(normalize_base_url(bad).is_err(), "must be rejected: {bad}");
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
            "http://local host:11434", // whitespace starts a new curl config token
            "http://localhost:11434\nheader = evil",
            "http://localhost:11434\" \nheader = evil",
        ] {
            assert!(
                normalize_base_url(bad).is_err(),
                "must be rejected: {bad:?}"
            );
        }
    }

    #[test]
    fn an_lm_studio_style_base_url_does_not_get_a_second_v1() {
        assert_eq!(
            local_endpoint("http://localhost:11434", LOCAL_CHAT_PATH),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            local_endpoint("http://localhost:1234/v1", LOCAL_CHAT_PATH),
            "http://localhost:1234/v1/chat/completions"
        );
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
        // The `:` ban applies only to Gemini's URL path.
        assert_eq!(
            validate_model_id("qwen3:8b", ModelPlacement::Body).unwrap(),
            "qwen3:8b"
        );
        assert!(validate_model_id("hf.co/user/repo:Q4", ModelPlacement::Body).is_ok());
        assert!(validate_model_id("qwen3:8b", ModelPlacement::UrlPath).is_err());
        for bad in ["", "a b", "m#frag", "x?key=leak"] {
            assert!(
                validate_model_id(bad, ModelPlacement::Body).is_err(),
                "{bad:?}"
            );
        }
        assert!(model_placement("gemini") == ModelPlacement::UrlPath);
        assert!(model_placement(LOCAL_PROVIDER) == ModelPlacement::Body);
    }

    #[test]
    fn curl_exit_codes_tell_off_from_wrong_port_from_timeout_apart() {
        // The exit code separates these cases; stderr collapses them.
        let refused = curl_failure_message(Some(7), "Couldn't connect to server");
        let unknown_host = curl_failure_message(Some(6), "Could not resolve host");
        let timeout = curl_failure_message(Some(28), "Operation timed out");
        // Codes, not wording: sentences live in `messages/<locale>.json`.
        assert_eq!(refused, "connection-refused");
        assert_eq!(unknown_host, "host-not-found");
        assert!(timeout.starts_with(TIMED_OUT_PREFIX));
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
        // The host in the log is the evidence nothing left the machine.
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
        assert_eq!(result.body.as_deref(), Some(listing));

        let raw = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(line["provider"], "local");
        assert_eq!(line["host"], "localhost:11434");
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line["scope"]["vaultChars"], 0);
        assert!(
            !raw.contains("qwen3:8b"),
            "the probe response body was logged"
        );
        assert_eq!(line["responseChars"], listing.chars().count());
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_local_check_that_hits_the_wrong_port_returns_a_status_not_a_list() {
        // Another program on the address answers 404; the failure body must not read as a list.
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
        assert!(
            result.body.is_none(),
            "a failure body does not reach the UI"
        );
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
        assert_eq!(line["v"], 1);
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_local_round_trip_still_refuses_to_send_when_the_audit_line_cannot_be_written() {
        // Log-before-send holds for local runners too.
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
        assert!(!sent.get(), "sent although the audit write failed");
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn a_connection_that_never_happened_is_not_http_zero() {
        // curl writes `000` on connection failure; it must not read as HTTP 0.
        let refused = interpret_curl_output(Some(7), false, "\n000", "Couldn't connect to server");
        assert!(refused.is_err());
        assert_eq!(refused.unwrap_err(), "connection-refused");

        let ok = interpret_curl_output(Some(0), true, "{\"data\":[]}\n200", "").unwrap();
        assert_eq!(ok.0, 200);
        assert_eq!(ok.1, "{\"data\":[]}");
    }
}
