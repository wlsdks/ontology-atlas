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
    Ok(JevSecretStatus {
        stored: true,
        last4: Some(tail4(trimmed)),
    })
}

#[tauri::command]
pub fn jev_secret_status() -> Result<JevSecretStatus, String> {
    match entry()?.get_password() {
        Ok(secret) => Ok(JevSecretStatus {
            stored: true,
            last4: Some(tail4(&secret)),
        }),
        Err(keyring::Error::NoEntry) => Ok(JevSecretStatus {
            stored: false,
            last4: None,
        }),
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
    Ok(JevSecretStatus {
        stored: false,
        last4: None,
    })
}

fn validate_payload(payload: &str) -> Result<(usize, usize), String> {
    if payload.len() > 16_384 {
        return Err(coded("jev-payload-invalid", "request exceeds 16 KiB"));
    }
    let request: Value =
        serde_json::from_str(payload).map_err(|_| coded("jev-payload-invalid", "invalid JSON"))?;
    let obj = request
        .as_object()
        .ok_or_else(|| coded("jev-payload-invalid", "not an object"))?;
    if obj.len() != 3 || request["model"] != MODEL {
        return Err(coded("jev-payload-invalid", "unexpected request fields"));
    }
    let state = request["state"]
        .as_object()
        .ok_or_else(|| coded("jev-payload-invalid", "missing state"))?;
    if state.len() != 2 {
        return Err(coded("jev-payload-invalid", "unexpected state fields"));
    }
    let claim = state
        .get("claim")
        .and_then(Value::as_str)
        .ok_or_else(|| coded("jev-payload-invalid", "missing claim"))?;
    let evidence = state
        .get("evidence")
        .and_then(Value::as_str)
        .ok_or_else(|| coded("jev-payload-invalid", "missing evidence"))?;
    if claim.trim().is_empty()
        || evidence.trim().is_empty()
        || claim.chars().count() > 2_000
        || evidence.chars().count() > 8_000
    {
        return Err(coded("jev-payload-invalid", "claim or evidence length"));
    }
    let questions = request["questions"]
        .as_object()
        .ok_or_else(|| coded("jev-payload-invalid", "missing questions"))?;
    if questions.len() != 1 || !questions.contains_key("claim_judgment") {
        return Err(coded("jev-payload-invalid", "unexpected questions"));
    }
    let q = &questions["claim_judgment"];
    if q["type"] != "choice"
        || q["instructions"] != "Given only the evidence, how does it relate to the claim?"
        || q["criteria"]["supported"] != "The evidence directly supports the claim."
        || q["criteria"]["contradicted"] != "The evidence directly conflicts with the claim."
        || q["criteria"]["insufficient"] != "The evidence cannot settle the claim."
        || q["criteria"].as_object().is_none_or(|c| c.len() != 3)
        || q.as_object().is_none_or(|q| q.len() != 3)
    {
        return Err(coded("jev-payload-invalid", "unexpected judgment format"));
    }
    Ok((claim.chars().count(), evidence.chars().count()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JevJudgment {
    choice: String,
    confidence: f64,
    probabilities: Value,
    response_model: String,
    logged_at: String,
}

fn parse_answer(body: &str, logged_at: String) -> Result<JevJudgment, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|_| coded("jev-response-invalid", "invalid JSON"))?;
    let answer = &value["answers"]["claim_judgment"];
    let choice = answer["choice"]
        .as_str()
        .filter(|v| matches!(*v, "supported" | "contradicted" | "insufficient"))
        .ok_or_else(|| coded("jev-response-invalid", "unknown choice"))?;
    let confidence = answer["confidence"]
        .as_f64()
        .filter(|v| (0.0..=1.0).contains(v))
        .ok_or_else(|| coded("jev-response-invalid", "invalid confidence"))?;
    let probabilities = &answer["probabilities"];
    let vals: Vec<f64> = ["supported", "contradicted", "insufficient"]
        .iter()
        .map(|key| {
            probabilities[*key]
                .as_f64()
                .filter(|v| (0.0..=1.0).contains(v))
        })
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| coded("jev-response-invalid", "invalid probabilities"))?;
    if answer["type"] != "choice"
        || probabilities.as_object().is_none_or(|p| p.len() != 3)
        || (vals.iter().sum::<f64>() - 1.0).abs() > 0.02
    {
        return Err(coded("jev-response-invalid", "invalid distribution"));
    }
    let response_model = value["model"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| coded("jev-response-invalid", "missing model"))?;
    Ok(JevJudgment {
        choice: choice.into(),
        confidence,
        probabilities: probabilities.clone(),
        response_model: response_model.into(),
        logged_at,
    })
}

fn judge_with<F>(
    vault_path: &Path,
    payload: &str,
    secret: &str,
    send: F,
) -> Result<JevJudgment, String>
where
    F: FnOnce(&str) -> Result<(u16, String), String>,
{
    let (claim_chars, evidence_chars) = validate_payload(payload)?;
    let logged_at = llm_audit::now_iso();
    // What left is what the person typed or pasted, not vault content: Atlas reads no file for
    // this check. So the scope says `vault_chars: 0` and counts the claim and evidence as the
    // person's own words — the sent log must not read "N folder characters" beside a screen
    // that says the folder is not read.
    let reservation = llm_audit::reserve(
        vault_path,
        AuditDraft {
            v: 1,
            at: logged_at.clone(),
            provider: "jev".into(),
            host: HOST.into(),
            model: Some(MODEL.into()),
            purpose: "judgment".into(),
            question: None,
            scope: AuditScope {
                nodes: vec![],
                prompt_chars: claim_chars + evidence_chars,
                vault_chars: 0,
            },
            tools: None,
            payload_sha256: llm_audit::sha256_hex(payload),
        },
    )
    .map_err(|err| format!("audit-blocked:{err}"))?;
    let config = curl_config_for(
        URL,
        &[
            ("authorization".into(), format!("Bearer {secret}")),
            ("content-type".into(), "application/json".into()),
        ],
        Some(payload),
    );
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
    llm_audit::finalize(
        reservation,
        &AuditOutcome {
            outcome: if parsed.as_ref().is_some_and(Result::is_ok) {
                "ok"
            } else if status.is_some_and(|s| s == 401 || s == 403) {
                "denied"
            } else {
                "error"
            }
            .into(),
            http_status: status,
            response_chars: body.chars().count(),
            duration_ms,
        },
    )?;
    let (status, _) = echo?;
    if !(200..300).contains(&status) {
        return Err(coded("jev-http-failed", status));
    }
    parsed.ok_or_else(|| coded("jev-response-invalid", "missing parsed answer"))?
}

/// `async` moves the body off the macOS main thread: the request waits on the network for up to
/// 30 seconds, and a sync command would freeze the whole window for that long (the same reason
/// `secret_verify` and `llm_chat` are async in `llm.rs`).
#[tauri::command(async)]
pub fn jev_judge(vault_path: String, payload: String) -> Result<JevJudgment, String> {
    validate_payload(&payload)?;
    let secret = entry()?
        .get_password()
        .map_err(|_| coded("secret-missing", "Jev"))?;
    if secret.contains(['\r', '\n']) {
        return Err(coded("secret-has-newline", ""));
    }
    judge_with(Path::new(&vault_path), &payload, &secret, |config| {
        run_curl(curl_argv_with_timeout("30"), config)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::fs;
    use std::path::PathBuf;

    /// The request the web side builds (`buildJevPayload` in `src/shared/lib/tauri-jev.ts`) for the
    /// guide's example pair. Both suites read this one file, so the shape the screen previews and
    /// the shape this bridge accepts cannot drift apart silently.
    const SAMPLE_REQUEST: &str = include_str!("../../tests/fixtures/jev-request.sample.json");

    const OK_ANSWER: &str = r#"{"model":"jev-1.13.0","answers":{"claim_judgment":{"type":"choice","choice":"contradicted","confidence":0.91,"probabilities":{"supported":0.04,"contradicted":0.91,"insufficient":0.05}}}}"#;

    /// A fresh vault directory under the platform's own temp root. `Path::join` builds every child
    /// path, so the same test reads correctly on macOS, Linux and Windows.
    fn temp_vault(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "atlas-jev-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_request_the_screen_previews_is_the_request_this_bridge_accepts() {
        let (claim_chars, evidence_chars) = validate_payload(SAMPLE_REQUEST.trim()).unwrap();
        assert_eq!(
            claim_chars,
            "A refund request immediately restores inventory."
                .chars()
                .count()
        );
        assert_eq!(
            evidence_chars,
            "After refund approval, a stock-restoration job is queued."
                .chars()
                .count()
        );
    }

    #[test]
    fn rejects_unexpected_transfer_shapes() {
        assert!(validate_payload(
            r#"{"model":"jev-latest","state":{"claim":"a","evidence":"b"},"questions":{}}"#
        )
        .is_err());
        assert!(validate_payload(r#"{"model":"jev-latest","state":{"claim":"a","evidence":"b"},"questions":{},"url":"https://elsewhere"}"#).is_err());
        // A second model or a smuggled extra state field is refused before any key is read.
        let other_model = SAMPLE_REQUEST.replace("jev-latest", "jev-other");
        assert!(validate_payload(other_model.trim()).is_err());
        let extra_state =
            SAMPLE_REQUEST.replace(r#""state":{"#, r#""state":{"vault":"all of it","#);
        assert!(validate_payload(extra_state.trim()).is_err());
        let empty_claim =
            SAMPLE_REQUEST.replace("A refund request immediately restores inventory.", "  ");
        assert!(validate_payload(empty_claim.trim()).is_err());
        let oversized = format!("{}{}", SAMPLE_REQUEST.trim(), " ".repeat(16_385));
        assert!(validate_payload(&oversized).is_err());
    }

    /// Source reflection, the same discipline as `secrets.rs` and `llm.rs`: every command here
    /// returns a type that cannot hold the key, and the one that waits on the network is `async`
    /// so it never blocks the main thread. Both spellings of the attribute are counted, so a
    /// matcher that saw only one would not pass while checking nothing.
    #[test]
    fn commands_never_hand_the_key_back_and_the_network_one_is_async() {
        let source = include_str!("jev.rs").replace("\r\n", "\n");
        let commands: Vec<usize> = source
            .match_indices("\n#[tauri::command")
            .map(|(idx, _)| idx)
            .collect();
        assert_eq!(commands.len(), 4, "status, set, clear and judge");
        for idx in commands {
            let signature = &source[idx..(idx + 400).min(source.len())];
            assert!(
                signature.contains("Result<JevSecretStatus, String>")
                    || signature.contains("Result<JevJudgment, String>"),
                "a command returns a type outside the allowlist: {signature}"
            );
            if signature.contains("pub fn jev_judge(") {
                assert!(signature.starts_with("\n#[tauri::command(async)]"));
            }
        }
    }

    #[test]
    fn a_saved_key_cannot_enter_curl_argv() {
        let args = curl_argv_with_timeout("30");
        assert!(!args.join(" ").contains("sample-secret"));
        let config = curl_config_for(
            URL,
            &[("authorization".into(), "Bearer sample-secret".into())],
            Some("{}"),
        );
        assert!(config.contains("sample-secret"));
        assert!(config.contains(URL));
    }

    #[test]
    fn reads_only_a_well_formed_three_way_answer() {
        let judgment = parse_answer(OK_ANSWER, "2026-09-25T00:00:00.000Z".into()).unwrap();
        assert_eq!(judgment.choice, "contradicted");
        assert_eq!(judgment.response_model, "jev-1.13.0");
        assert!(parse_answer(
            &OK_ANSWER.replace("\"choice\":\"contradicted\"", "\"choice\":\"maybe\""),
            String::new()
        )
        .is_err());
        assert!(parse_answer(&OK_ANSWER.replace("0.04", "0.40"), String::new()).is_err());
        assert!(parse_answer(r#"{"answers":{}}"#, String::new()).is_err());
    }

    /// Where the audit log can be written (unix), the line is reserved **before** the send runs,
    /// finished after it, and carries neither the key nor the claim text.
    #[cfg(unix)]
    #[test]
    fn records_the_transfer_before_sending_and_keeps_the_text_out_of_the_record() {
        let vault = temp_vault("ok");
        let audit_path = crate::llm_audit::audit_log_path(&vault);
        let sent = Cell::new(false);
        let judgment = judge_with(&vault, SAMPLE_REQUEST.trim(), "sample-secret", |config| {
            // The reservation is on disk at the moment of sending.
            let reserved = fs::read_to_string(&audit_path).unwrap();
            assert!(reserved.contains("\"provider\":\"jev\""));
            assert!(!reserved.contains("\"outcome\""));
            assert!(config.contains("Bearer sample-secret"));
            sent.set(true);
            Ok((200, OK_ANSWER.into()))
        })
        .unwrap();
        assert!(sent.get());
        assert_eq!(judgment.choice, "contradicted");
        let line = fs::read_to_string(&audit_path).unwrap();
        assert_eq!(line.lines().count(), 1);
        assert!(line.contains("\"host\":\"api.typesafe.ai\""));
        assert!(line.contains("\"purpose\":\"judgment\""));
        assert!(line.contains("\"outcome\":\"ok\""));
        // Nothing came from the vault; what left is the person's own claim and evidence.
        assert!(line.contains("\"vaultChars\":0"));
        let typed = "A refund request immediately restores inventory."
            .chars()
            .count()
            + "After refund approval, a stock-restoration job is queued."
                .chars()
                .count();
        assert!(line.contains(&format!("\"promptChars\":{typed}")));
        // The receipt's hash is the hash of exactly the previewed request.
        assert!(line.contains(&crate::llm_audit::sha256_hex(SAMPLE_REQUEST.trim())));
        assert!(!line.contains("sample-secret"));
        assert!(!line.contains("restores inventory"));
        fs::remove_dir_all(&vault).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_refused_key_is_recorded_as_denied_and_returns_no_judgment() {
        let vault = temp_vault("denied");
        let result = judge_with(&vault, SAMPLE_REQUEST.trim(), "sample-secret", |_| {
            Ok((401, "{}".into()))
        });
        assert!(result.unwrap_err().starts_with("jev-http-failed"));
        let line = fs::read_to_string(crate::llm_audit::audit_log_path(&vault)).unwrap();
        assert!(line.contains("\"outcome\":\"denied\""));
        fs::remove_dir_all(&vault).ok();
    }

    /// Where the audit log cannot yet be written safely (Windows fails closed in `llm_audit`),
    /// nothing is sent: a transfer without a record is structurally impossible.
    #[cfg(not(unix))]
    #[test]
    fn sends_nothing_where_the_record_cannot_be_written() {
        let vault = temp_vault("closed");
        let sent = Cell::new(false);
        let result = judge_with(&vault, SAMPLE_REQUEST.trim(), "sample-secret", |_| {
            sent.set(true);
            Ok((200, OK_ANSWER.into()))
        });
        assert!(result.unwrap_err().starts_with("audit-blocked:"));
        assert!(!sent.get());
        fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn an_invalid_request_sends_nothing_and_records_nothing() {
        let vault = temp_vault("invalid");
        let sent = Cell::new(false);
        let result = judge_with(&vault, "{}", "sample-secret", |_| {
            sent.set(true);
            Ok((200, OK_ANSWER.into()))
        });
        assert!(result.unwrap_err().starts_with("jev-payload-invalid"));
        assert!(!sent.get());
        assert!(!crate::llm_audit::audit_log_path(&vault).exists());
        fs::remove_dir_all(&vault).ok();
    }
}
