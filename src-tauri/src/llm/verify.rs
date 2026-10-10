use super::curl::{AUDIT_BLOCKED_PREFIX, curl_argv, curl_config_for, host_of, run_curl};
use super::local_endpoint::{
    LOCAL_DEFAULT_BASE_URL, LOCAL_MODELS_PATH, LOCAL_PROVIDER, local_endpoint, normalize_base_url,
};
use crate::errors::coded;
use crate::llm_audit::{self, AuditDraft, AuditOutcome, AuditScope};
use crate::secrets;
use serde::Serialize;
use std::path::Path;
use std::time::Instant;

/// Auth check only: no model call, no billing, no body.
const ANTHROPIC_VERIFY_URL: &str = "https://api.anthropic.com/v1/models?limit=1";
const OPENAI_VERIFY_URL: &str = "https://api.openai.com/v1/models";
/// The key goes only in headers, never `?key=`: URLs persist in proxy logs and in
/// our audit line.
const GEMINI_VERIFY_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
/// A changed value yields 400 instead of 401.
pub(super) const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Per request, so the screen can tell `Rejected` (fix the key) from `Failed`.
pub(super) const AUTH_DENIED_STATUSES: &[u16] = &[401, 403];

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
pub(super) enum Target<'a> {
    Vendor { secret: &'a str },
    Address { base_url: &'a str },
}

pub(super) struct VerifyRequest {
    url: String,
    headers: Vec<(String, String)>,
    denied_statuses: &'static [u16],
    /// Only the address branch returns its model list.
    returns_body: bool,
}

struct HttpEcho {
    pub status: u16,
    pub body_chars: usize,
    /// Returned to the UI, not recorded.
    pub body: Option<String>,
}

impl HttpEcho {
    #[cfg(test)]
    pub fn status_only(status: u16, body_chars: usize) -> Self {
        Self {
            status,
            body_chars,
            body: None,
        }
    }
}

/// A newline would break curl's line-based config.
pub(super) fn checked_secret(secret: &str) -> Result<&str, String> {
    if secret.contains('\n') || secret.contains('\r') {
        return Err(coded("secret-has-newline", ""));
    }
    Ok(secret)
}

/// A mismatch never silently picks a side, or a key could go to a user address.
pub(super) fn wrong_target(provider: &str) -> String {
    if provider == LOCAL_PROVIDER {
        coded("endpoint-not-for-key", "")
    } else {
        coded("endpoint-fixed-for-provider", provider)
    }
}

pub(super) fn verify_request(provider: &str, target: &Target<'_>) -> Result<VerifyRequest, String> {
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
            headers: vec![],
            denied_statuses: AUTH_DENIED_STATUSES,
            returns_body: true,
        }),
        (LOCAL_PROVIDER, _) | ("anthropic" | "openai" | "gemini", _) => Err(wrong_target(provider)),
        (other, _) => Err(coded("unsupported-provider", other)),
    }
}

fn curl_config(request: &VerifyRequest) -> String {
    curl_config_for(&request.url, &request.headers, None)
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
fn verify_with<S>(
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

#[cfg(test)]
mod tests;
