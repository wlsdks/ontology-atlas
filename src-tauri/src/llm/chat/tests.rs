#[cfg(unix)]
mod cancellation;
mod construction_probe;
use super::*;
use super::request::ANTHROPIC_CHAT_URL;
use crate::llm::tests::temp_vault;
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
    let fixture = include_str!("../../../../tests/fixtures/llm-audit-log.sample.jsonl");
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
fn a_local_chat_cannot_hold_the_panel_for_three_minutes() {
    assert_eq!(LOCAL_CHAT_TIMEOUT_SECONDS, "60");
    assert_eq!(curl_argv_with_timeout(LOCAL_CHAT_TIMEOUT_SECONDS)[4], "60");
    assert_eq!(curl_argv_with_timeout(CHAT_TIMEOUT_SECONDS)[4], "180");
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
