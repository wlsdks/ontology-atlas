use super::*;
use crate::llm::chat::CHAT_TIMEOUT_SECONDS;
use crate::llm::curl::{curl_argv_with_timeout, host_of};
use crate::llm::verify::verify_request;

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
        serde_json::from_str(include_str!("../../../../../tests/fixtures/llm-provider-hosts.json"))
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
