use super::*;

#[test]
fn cancellation_finalizes_the_reserved_audit_before_the_next_send() {
    let vault = temp_vault("cancelled-then-replaced");
    let scope = || AuditScopeInput {
        nodes: vec![],
        prompt_chars: 2,
        vault_chars: 0,
        tools: vec![],
    };
    let (sender, mut receiver) = tokio::sync::oneshot::channel();
    let result = chat_with(
        LOCAL_PROVIDER,
        &vault,
        "fixture",
        Some("stop"),
        &Target::Address {
            base_url: LOCAL_DEFAULT_BASE_URL,
        },
        "{}",
        scope(),
        |request| {
            let reserved = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
            let row: serde_json::Value = serde_json::from_str(reserved.trim()).unwrap();
            assert!(row.get("outcome").is_none());
            sender.send(()).unwrap();
            send_chat_cancellable(request, LOCAL_CHAT_TIMEOUT_SECONDS, &mut receiver)
        },
    );
    assert_eq!(result.unwrap_err(), "cancelled");
    chat_with(
        LOCAL_PROVIDER,
        &vault,
        "fixture",
        Some("replacement"),
        &Target::Address {
            base_url: LOCAL_DEFAULT_BASE_URL,
        },
        "{}",
        scope(),
        |_| {
            Ok(ChatEcho {
                status: 200,
                body: "{}".into(),
            })
        },
    )
    .unwrap();
    let audit = fs::read_to_string(llm_audit::audit_log_path(&vault)).unwrap();
    let rows: Vec<serde_json::Value> = audit
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["outcome"], "error");
    assert_eq!(rows[0]["httpStatus"], serde_json::Value::Null);
    assert_eq!(rows[1]["outcome"], "ok");
    fs::remove_dir_all(vault).unwrap();
}
