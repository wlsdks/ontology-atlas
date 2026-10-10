// Rust owns confidentiality, transmission and audit only; the WebView builds
// bodies, parses responses and owns the loop, one command call per round trip.

mod request;

use super::curl::{curl_argv_with_timeout, interpret_curl_output};
use super::{AUDIT_BLOCKED_PREFIX, host_of};
use super::http_output;
use super::local_endpoint::{
    LOCAL_DEFAULT_BASE_URL, LOCAL_PROVIDER, is_loopback_authority, normalize_base_url,
};
use super::requests;
use super::verify::{AUTH_DENIED_STATUSES, Target, wrong_target};
use crate::errors::coded;
use crate::llm_audit::{self, AuditDraft, AuditOutcome, AuditScope, AuditToolRef};
use crate::secrets;
use request::{ChatRequest, chat_request, curl_chat_config, model_placement, validate_model_id};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::Instant;

/// Models may take tens of seconds on tool calls; [Stop] is the user-side bound
/// and this bounds a hanging socket.
const CHAT_TIMEOUT_SECONDS: &str = "180";
/// Local retries are free, so fail one round trip sooner than a remote model.
const LOCAL_CHAT_TIMEOUT_SECONDS: &str = "60";

/// The body is returned for normalization; only its length is logged.
struct ChatEcho {
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
fn chat_with<S>(
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
mod tests;
