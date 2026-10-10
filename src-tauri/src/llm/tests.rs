use std::fs;
use std::path::PathBuf;

pub(super) fn temp_vault(tag: &str) -> PathBuf {
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
fn no_command_here_hands_the_key_back_to_the_webview() {
    // Commands here return only types that cannot hold a key.
    let files = [
        include_str!("../llm.rs"),
        include_str!("chat.rs"),
        include_str!("chat/request.rs"),
        include_str!("curl.rs"),
        include_str!("http_output.rs"),
        include_str!("local_endpoint.rs"),
        include_str!("requests.rs"),
        include_str!("verify.rs"),
    ];
    let mut signatures = Vec::new();
    for file in files {
        let source = file.replace("\r\n", "\n");
        for (idx, _) in source.match_indices("\n#[tauri::command") {
            if source[idx..].contains("]\npub fn ") || source[idx..].contains("]\npub async fn ") {
                signatures.push(source[idx..(idx + 600).min(source.len())].to_string());
            }
        }
    }
    assert_eq!(
        signatures.len(),
        4,
        "only the connection probe, chat round trip, and the chat request prepare and cancel"
    );
    for signature in signatures {
        assert!(
            signature.contains("Result<LlmVerifyResult, String>")
                || signature.contains("Result<LlmChatEcho, String>")
                || signature.contains("Result<String, String>")
                || signature.contains(") -> bool"),
            "command return type is outside the allowlist: {}",
            &signature[..signature.find('{').unwrap_or(200).min(signature.len())]
        );
    }
}
