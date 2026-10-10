use super::*;
use crate::llm::tests::temp_vault;
use std::cell::Cell;
use std::fs;

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
fn the_hosts_match_the_shared_fixture_the_screen_promises() {
    // Web tests read the same fixture, so the promised destination matches.
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../../tests/fixtures/llm-provider-hosts.json"))
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
