//! Optional Jev judgment. The saved key stays in Keychain; only an explicit
//! app action sends the exact previewed JSON to the fixed TypeSafe endpoint.

use crate::errors::coded;
use crate::llm::{curl_argv_with_timeout, curl_config_for, run_curl};
use crate::llm_audit::{self, AuditDraft, AuditOutcome, AuditScope};
use crate::secrets::{is_cleared, Step};
use keyring::Entry;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use std::time::Instant;

const SERVICE: &str = "Ontology Atlas";
const ACCOUNT: &str = "jev-judgment";
const URL: &str = "https://api.typesafe.ai/v1/systemone";
const HOST: &str = "api.typesafe.ai";
const MODEL: &str = "jev-latest";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|err| coded("keychain-unavailable", err))
}

fn tail4(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    chars[chars.len().saturating_sub(4)..].iter().collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JevSecretStatus {
    stored: bool,
    last4: Option<String>,
}

#[tauri::command]
pub fn jev_secret_set(secret: String) -> Result<JevSecretStatus, String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() || trimmed.contains(['\r', '\n']) {
        return Err(coded("secret-empty", "enter one key without line breaks"));
    }
    entry()?
        .set_password(trimmed)
        .map_err(|err| coded("keychain-write-failed", err))?;
    Ok(JevSecretStatus { stored: true, last4: Some(tail4(trimmed)) })
}

#[tauri::command]
pub fn jev_secret_status() -> Result<JevSecretStatus, String> {
    match entry()?.get_password() {
        Ok(secret) => Ok(JevSecretStatus { stored: true, last4: Some(tail4(&secret)) }),
        Err(keyring::Error::NoEntry) => Ok(JevSecretStatus { stored: false, last4: None }),
        Err(err) => Err(coded("keychain-unavailable", err)),
    }
}

#[tauri::command]
pub fn jev_secret_clear() -> Result<JevSecretStatus, String> {
    let handle = entry()?;
    let deleted = match handle.delete_credential() {
        Ok(()) => Step::Done,
        Err(keyring::Error::NoEntry) => Step::Missing,
        Err(_) => Step::Failed,
    };
    let readback = if deleted == Step::Done {
        match handle.get_password() {
            Ok(_) => Step::Done,
            Err(keyring::Error::NoEntry) => Step::Missing,
            Err(_) => Step::Failed,
        }
    } else {
        Step::Failed
    };
    if !is_cleared(deleted, readback) {
        return Err(coded("keychain-clear-failed", ""));
    }
    Ok(JevSecretStatus { stored: false, last4: None })
}

fn validate_payload(payload: &str) -> Result<(usize, usize), String> {
    if payload.len() > 16_384 {
        return Err(coded("jev-payload-invalid", "request exceeds 16 KiB"));
    }
    let request: Value = serde_json::from_str(payload).map_err(|_| coded("jev-payload-invalid", "invalid JSON"))?;
    let obj = request.as_object().ok_or_else(|| coded("jev-payload-invalid", "not an object"))?;
    if obj.len() != 3 || request["model"] != MODEL {
        return Err(coded("jev-payload-invalid", "unexpected request fields"));
    }
    let state = request["state"].as_object().ok_or_else(|| coded("jev-payload-invalid", "missing state"))?;
    if state.len() != 2 {
        return Err(coded("jev-payload-invalid", "unexpected state fields"));
    }
    let claim = state.get("claim").and_then(Value::as_str).ok_or_else(|| coded("jev-payload-invalid", "missing claim"))?;
    let evidence = state.get("evidence").and_then(Value::as_str).ok_or_else(|| coded("jev-payload-invalid", "missing evidence"))?;
    if claim.trim().is_empty() || evidence.trim().is_empty() || claim.chars().count() > 2_000 || evidence.chars().count() > 8_000 {
        return Err(coded("jev-payload-invalid", "claim or evidence length"));
    }
    let questions = request["questions"].as_object().ok_or_else(|| coded("jev-payload-invalid", "missing questions"))?;
    if questions.len() != 1 || !questions.contains_key("claim_judgment") {
        return Err(coded("jev-payload-invalid", "unexpected questions"));
    }
    let q = &questions["claim_judgment"];
    if q["type"] != "choice" || q["instructions"] != "Given only the evidence, how does it relate to the claim?" ||
        q["criteria"]["supported"] != "The evidence directly supports the claim." ||
        q["criteria"]["contradicted"] != "The evidence directly conflicts with the claim." ||
        q["criteria"]["insufficient"] != "The evidence cannot settle the claim." ||
        q["criteria"].as_object().is_none_or(|c| c.len() != 3) || q.as_object().is_none_or(|q| q.len() != 3) {
        return Err(coded("jev-payload-invalid", "unexpected judgment format"));
    }
    Ok((claim.chars().count(), evidence.chars().count()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JevJudgment {
    choice: String,
    confidence: f64,
    probabilities: Value,
    response_model: String,
    logged_at: String,
}

fn parse_answer(body: &str, logged_at: String) -> Result<JevJudgment, String> {
    let value: Value = serde_json::from_str(body).map_err(|_| coded("jev-response-invalid", "invalid JSON"))?;
    let answer = &value["answers"]["claim_judgment"];
    let choice = answer["choice"].as_str().filter(|v| matches!(*v, "supported" | "contradicted" | "insufficient"))
        .ok_or_else(|| coded("jev-response-invalid", "unknown choice"))?;
    let confidence = answer["confidence"].as_f64().filter(|v| (0.0..=1.0).contains(v))
        .ok_or_else(|| coded("jev-response-invalid", "invalid confidence"))?;
    let probabilities = &answer["probabilities"];
    let vals: Vec<f64> = ["supported", "contradicted", "insufficient"].iter()
        .map(|key| probabilities[*key].as_f64().filter(|v| (0.0..=1.0).contains(v)))
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| coded("jev-response-invalid", "invalid probabilities"))?;
    if answer["type"] != "choice" || probabilities.as_object().is_none_or(|p| p.len() != 3) ||
        (vals.iter().sum::<f64>() - 1.0).abs() > 0.02 {
        return Err(coded("jev-response-invalid", "invalid distribution"));
    }
    let response_model = value["model"].as_str().filter(|s| !s.is_empty()).ok_or_else(|| coded("jev-response-invalid", "missing model"))?;
    Ok(JevJudgment { choice: choice.into(), confidence, probabilities: probabilities.clone(), response_model: response_model.into(), logged_at })
}

fn judge_with<F>(vault_path: &Path, payload: &str, secret: &str, send: F) -> Result<JevJudgment, String>
where F: FnOnce(&str) -> Result<(u16, String), String> {
    let (_, evidence_chars) = validate_payload(payload)?;
    let logged_at = llm_audit::now_iso();
    let reservation = llm_audit::reserve(vault_path, AuditDraft {
        v: 1,
        at: logged_at.clone(),
        provider: "jev".into(),
        host: HOST.into(),
        model: Some(MODEL.into()),
        purpose: "judgment".into(),
        question: None,
        scope: AuditScope { nodes: vec![], prompt_chars: payload.chars().count(), vault_chars: evidence_chars },
        tools: None,
        payload_sha256: llm_audit::sha256_hex(payload),
    }).map_err(|err| format!("audit-blocked:{err}"))?;
    let config = curl_config_for(URL, &[
        ("authorization".into(), format!("Bearer {secret}")),
        ("content-type".into(), "application/json".into()),
    ], Some(payload));
    let started = Instant::now();
    let echo = send(&config);
    let duration_ms = started.elapsed().as_millis() as u64;
    let (status, body) = match &echo {
        Ok((status, body)) => (Some(*status), body.as_str()),
        Err(_) => (None, ""),
    };
    let parsed = if status.is_some_and(|s| (200..300).contains(&s)) {
        Some(parse_answer(body, logged_at.clone()))
    } else {
        None
    };
    llm_audit::finalize(reservation, &AuditOutcome {
        outcome: if parsed.as_ref().is_some_and(Result::is_ok) { "ok" } else if status.is_some_and(|s| s == 401 || s == 403) { "denied" } else { "error" }.into(),
        http_status: status,
        response_chars: body.chars().count(),
        duration_ms,
    })?;
    let (status, _) = echo?;
    if !(200..300).contains(&status) {
        return Err(coded("jev-http-failed", status));
    }
    parsed.ok_or_else(|| coded("jev-response-invalid", "missing parsed answer"))?
}

#[tauri::command]
pub fn jev_judge(vault_path: String, payload: String) -> Result<JevJudgment, String> {
    validate_payload(&payload)?;
    let secret = entry()?.get_password().map_err(|_| coded("secret-missing", "Jev"))?;
    if secret.contains(['\r', '\n']) { return Err(coded("secret-has-newline", "")); }
    judge_with(Path::new(&vault_path), &payload, &secret, |config| {
        run_curl(curl_argv_with_timeout("30"), config)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unexpected_transfer_shapes() {
        assert!(validate_payload(r#"{"model":"jev-latest","state":{"claim":"a","evidence":"b"},"questions":{}}"#).is_err());
        assert!(validate_payload(r#"{"model":"jev-latest","state":{"claim":"a","evidence":"b"},"questions":{},"url":"https://elsewhere"}"#).is_err());
    }

    #[test]
    fn a_saved_key_cannot_enter_curl_argv() {
        let args = curl_argv_with_timeout("30");
        assert!(!args.join(" ").contains("sample-secret"));
        let config = curl_config_for(URL, &[("authorization".into(), "Bearer sample-secret".into())], Some("{}"));
        assert!(config.contains("sample-secret"));
        assert!(config.contains(URL));
    }
}
