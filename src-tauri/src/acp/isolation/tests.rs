use super::*;
use crate::acp::registry::registry_agent;

/// App sessions must not inherit global settings with pre-allowed `Bash(*)` or `Write(*)`.
#[test]
fn isolated_config_never_inherits_a_permissive_allow_list() {
    let settings: serde_json::Value = serde_json::from_str(ISOLATED_CLAUDE_SETTINGS)
        .expect("isolated settings must be valid JSON");
    let perms = &settings["permissions"];
    assert_eq!(
        perms["defaultMode"], "default",
        "model self-approval removes the gate"
    );
    for key in ["allow", "deny", "ask"] {
        assert_eq!(
            perms[key].as_array().map(|a| a.len()),
            Some(0),
            "{key} is not empty; pre-allowed entries pass in every mode"
        );
    }
}

#[test]
fn logged_out_is_only_true_when_the_tool_says_so() {
    // Measured `claude auth status` output.
    let out = r#"{"loggedIn": false, "authMethod": "none", "apiProvider": "firstParty"}"#;
    assert!(claude_status_is_logged_out(out));

    let ok = r#"{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "max"}"#;
    assert!(!claude_status_is_logged_out(ok));
}

#[test]
fn unknown_status_is_never_read_as_logged_out() {
    // Undecidable output must not read as dead.
    for noise in [
        "",
        "not json",
        "{}",
        r#"{"loggedIn": null}"#,
        r#"{"loggedIn": "false"}"#,
    ] {
        assert!(
            !claude_status_is_logged_out(noise),
            "read unknown output as signed out: {noise:?}"
        );
    }
}

#[test]
fn the_isolated_codex_config_gates_the_vaults_own_registration() {
    // A session loads the vault's project `.codex/config.toml` even from an isolated
    // home, so without this block its Atlas server is ungated (decision (111)).
    assert!(
        ISOLATED_CODEX_CONFIG.contains("[mcp_servers.ontology-atlas.env]"),
        "the vault's own registration has to inherit a gate"
    );
    assert!(
        ISOLATED_CODEX_CONFIG.contains("OATLAS_WRITE_CONSENT = \"on\""),
        "and the gate is the consent switch"
    );
    // Declared here, not in the vault file, which terminal runs share.
}

#[test]
fn an_isolated_codex_session_gets_a_sandbox_floor_not_an_inherited_config() {
    let base = std::env::temp_dir().join(format!("atlas-acp-codex-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let app_data = base.join("appdata");
    let home = base.join("home");
    std::fs::create_dir_all(home.join(".codex")).unwrap();
    std::fs::write(home.join(".codex").join("auth.json"), "{\"t\":1}").unwrap();
    std::fs::write(
        home.join(".codex").join("config.toml"),
        "approval_policy = \"never\"\nsandbox_mode = \"danger-full-access\"\n",
    )
    .unwrap();

    let dir = prepare_isolated_config("codex-acp", &app_data, Some(&home), None, "").unwrap();
    let written = std::fs::read_to_string(dir.join("config.toml")).unwrap();
    assert_eq!(written, ISOLATED_CODEX_CONFIG);
    assert!(
        written.contains("approval_policy = \"on-request\""),
        "the interactive policy has to be accepted by the shipped codex CLI"
    );
    assert!(
        !written.contains("approval_policy = \"untrusted\""),
        "codex 0.153 refuses this value before a session can start"
    );
    assert!(
        written.contains("sandbox_mode = \"read-only\""),
        "the floor is the sandbox"
    );
    assert!(
        written.contains("OATLAS_WRITE_CONSENT = \"on\""),
        "Atlas writes still have to stop at the server-owned checkpoint"
    );
    assert!(
        !written.contains("danger-full-access"),
        "the user's own grant must not leak in"
    );
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn prepare_isolated_config_writes_our_settings_and_links_credentials() {
    let base = std::env::temp_dir().join(format!("atlas-acp-cfg-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let app_data = base.join("appdata");
    let home = base.join("home");
    std::fs::create_dir_all(home.join(".claude")).unwrap();
    std::fs::write(home.join(".claude").join(".credentials.json"), "{\"t\":1}").unwrap();

    let dir = prepare_isolated_config("claude-acp", &app_data, Some(&home), None, "").unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.join("settings.json")).unwrap(),
        ISOLATED_CLAUDE_SETTINGS
    );
    #[cfg(unix)]
    {
        let link = dir.join(".credentials.json");
        assert_eq!(
            std::fs::read_link(&link).unwrap(),
            home.join(".claude").join(".credentials.json"),
            "credentials must be linked, not copied"
        );
    }

    // Rewritten every time so an edited gate cannot stay open.
    std::fs::write(
        dir.join("settings.json"),
        "{\"permissions\":{\"allow\":[\"Bash(*)\"]}}",
    )
    .unwrap();
    let dir2 = prepare_isolated_config("claude-acp", &app_data, Some(&home), None, "").unwrap();
    assert_eq!(
        std::fs::read_to_string(dir2.join("settings.json")).unwrap(),
        ISOLATED_CLAUDE_SETTINGS,
        "re-preparing must restore our settings"
    );

    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn prepare_isolated_config_without_credentials_does_not_invent_a_link() {
    // No credentials means no link; the screen says to log in.
    let base = std::env::temp_dir().join(format!("atlas-acp-nocred-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let home = base.join("home");
    std::fs::create_dir_all(&home).unwrap();
    let dir =
        prepare_isolated_config("claude-acp", &base.join("appdata"), Some(&home), None, "")
            .unwrap();
    assert!(!dir.join(".credentials.json").exists());
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn guarded_runtime_isolation_failure_blocks_launch_preparation() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let base = std::env::temp_dir().join(format!("atlas-acp-gate-{nonce}"));
    std::fs::create_dir_all(&base).unwrap();
    let app_data_file = base.join("not-a-directory");
    std::fs::write(&app_data_file, "blocked").unwrap();

    let error =
        prepare_runtime_isolation("claude-acp", &app_data_file, None, None, "").unwrap_err();
    assert!(
        error.starts_with("isolation-failed:config-dir-failed:"),
        "an isolation setup failure did not fail the start: {error}"
    );

    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn unguarded_runtime_cannot_cross_the_native_chat_boundary() {
    // `amp-acp` is unmeasured, and unmeasured means refused.
    let error = prepare_runtime_isolation(
        "amp-acp",
        Path::new("/path/that/does/not/need/to/exist"),
        None,
        None,
        "",
    )
    .unwrap_err();
    assert_eq!(error, "permission-gate-unsupported:amp-acp");
}

#[test]
fn every_isolation_entry_points_at_a_real_registry_agent() {
    // An isolation entry missing from the registry would stay unisolated unnoticed.
    for spec in ISOLATION {
        assert!(
            registry_agent(spec.id).is_some(),
            "isolation table entry {} is missing from the registry",
            spec.id
        );
        assert!(!spec.config_env.is_empty() && !spec.credentials_file.is_empty());
    }
}
