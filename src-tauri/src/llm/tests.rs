use super::host_of;
use std::fs;
use std::path::{Path, PathBuf};

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
    // Each command is bound to its return type; the bare String is the request id, never a key.
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = vec![fs::read_to_string(root.join("llm.rs")).unwrap()];
    production_sources(&root.join("llm"), &mut files);
    let mut signatures = Vec::new();
    for file in files {
        let source = format!("\n{}", file.replace("\r\n", "\n"));
        for (idx, _) in source.match_indices("\n#[tauri::command") {
            let rest = &source[idx..];
            let signature = &rest[..rest.find('{').unwrap_or(rest.len())];
            if signature.contains("]\npub fn ") || signature.contains("]\npub async fn ") {
                signatures.push(signature.to_string());
            }
        }
    }
    assert_eq!(
        signatures.len(),
        4,
        "only the connection probe, chat round trip, and the chat request prepare and cancel"
    );
    let allowed = [
        ("fn secret_verify(", "Result<LlmVerifyResult, String>"),
        ("fn llm_chat(", "Result<LlmChatEcho, String>"),
        ("fn llm_chat_prepare(", "Result<String, String>"),
        ("fn llm_chat_cancel(", ") -> bool"),
    ];
    for signature in signatures {
        assert!(
            allowed
                .iter()
                .any(|(name, ret)| signature.contains(name) && signature.contains(ret)),
            "command return type is outside the allowlist: {signature}"
        );
    }
}

/// Every production file under `dir`; tests are skipped so test text cannot satisfy the check.
fn production_sources(dir: &Path, out: &mut Vec<String>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        if path.is_dir() {
            if name != "tests" {
                production_sources(&path, out);
            }
        } else if name.ends_with(".rs") && name != "tests.rs" && !name.ends_with("_tests.rs") {
            out.push(fs::read_to_string(&path).unwrap());
        }
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
