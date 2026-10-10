use super::*;
use crate::acp::launch::AcpLaunch;
use crate::acp::login_probe::LOGIN_PROBE;
use crate::acp::npx_cache::npx_launch_package;
use crate::acp::registry::registry_agent;
use std::collections::HashSet;
use std::path::PathBuf;

fn sample_parent_environment() -> Vec<(OsString, OsString)> {
    [
        ("HOME", "/home/me"),
        ("USERPROFILE", "C:\\Users\\me"),
        ("TMPDIR", "/tmp/runtime"),
        ("LANG", "ko_KR.UTF-8"),
        ("LC_CTYPE", "UTF-8"),
        ("HTTPS_PROXY", "http://proxy.example"),
        ("NO_PROXY", "localhost"),
        ("SSL_CERT_FILE", "/etc/company-ca.pem"),
        ("NODE_EXTRA_CA_CERTS", "/etc/node-ca.pem"),
        ("CODEX_HOME", "/home/me/.codex-custom"),
        ("CODEX_CA_CERTIFICATE", "/etc/codex-ca.pem"),
        ("OPENAI_API_KEY", "openai-secret"),
        ("CODEX_ACCESS_TOKEN", "codex-secret"),
        ("ANTHROPIC_API_KEY", "anthropic-secret"),
        ("ANTHROPIC_BASE_URL", "https://redirect.example"),
        ("GH_TOKEN", "github-secret"),
        ("AWS_SECRET_ACCESS_KEY", "aws-secret"),
        ("NODE_OPTIONS", "--require=/tmp/inject.cjs"),
        ("DYLD_INSERT_LIBRARIES", "/tmp/inject.dylib"),
        ("BASH_ENV", "/tmp/inject.sh"),
        ("SSH_AUTH_SOCK", "/tmp/agent.sock"),
        ("ATLAS_TEST_SECRET", "ambient-secret"),
    ]
    .into_iter()
    .map(|(key, value)| (OsString::from(key), OsString::from(value)))
    .collect()
}

fn environment_keys(environment: &[(OsString, OsString)]) -> HashSet<String> {
    environment
        .iter()
        .map(|(key, _)| key.to_string_lossy().to_ascii_uppercase())
        .collect()
}

#[test]
fn verified_subscription_runtimes_drop_ambient_credentials_and_injection_inputs() {
    for runtime_id in ["claude-acp", "codex-acp"] {
        let environment =
            sanitized_runtime_environment(runtime_id, sample_parent_environment())
                .expect("verified subscription runtime must use an explicit environment");
        let keys = environment_keys(&environment);

        for preserved in [
            "HOME",
            "USERPROFILE",
            "TMPDIR",
            "LANG",
            "LC_CTYPE",
            "HTTPS_PROXY",
            "NO_PROXY",
            "SSL_CERT_FILE",
            "NODE_EXTRA_CA_CERTS",
        ] {
            assert!(keys.contains(preserved), "{runtime_id}: lost {preserved}");
        }
        for blocked in [
            "OPENAI_API_KEY",
            "CODEX_ACCESS_TOKEN",
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_BASE_URL",
            "GH_TOKEN",
            "AWS_SECRET_ACCESS_KEY",
            "NODE_OPTIONS",
            "DYLD_INSERT_LIBRARIES",
            "BASH_ENV",
            "SSH_AUTH_SOCK",
            "ATLAS_TEST_SECRET",
        ] {
            assert!(!keys.contains(blocked), "{runtime_id}: inherited {blocked}");
        }
    }
}

#[test]
fn explicit_environment_profiles_exist_only_for_verified_login_probes() {
    assert!(!SANITIZED_ENV_RUNTIMES.is_empty());
    for runtime_id in SANITIZED_ENV_RUNTIMES {
        let agent =
            registry_agent(runtime_id).expect("environment profile needs a registry row");
        assert!(
            agent.verified,
            "{runtime_id}: unverified runtime got an environment profile"
        );
        assert!(
            LOGIN_PROBE.iter().any(|(id, _)| id == runtime_id),
            "{runtime_id}: environment was changed without a measured login probe"
        );
    }
}

#[test]
fn codex_keeps_its_cached_login_location_and_ca_without_forwarding_tokens() {
    let environment = sanitized_runtime_environment("codex-acp", sample_parent_environment())
        .expect("codex must use an explicit environment");
    let keys = environment_keys(&environment);
    assert!(keys.contains("CODEX_HOME"));
    assert!(keys.contains("CODEX_CA_CERTIFICATE"));

    let claude = sanitized_runtime_environment("claude-acp", sample_parent_environment())
        .expect("claude must use an explicit environment");
    let claude_keys = environment_keys(&claude);
    assert!(!claude_keys.contains("CODEX_HOME"));
    assert!(!claude_keys.contains("CODEX_CA_CERTIFICATE"));
}

#[test]
fn environment_policy_is_case_insensitive_and_does_not_invent_profiles() {
    let mixed_case = vec![
        (OsString::from("cOdEx_HoMe"), OsString::from("custom")),
        (OsString::from("OpenAI_Api_Key"), OsString::from("secret")),
    ];
    let codex = sanitized_runtime_environment("codex-acp", mixed_case)
        .expect("codex must use an explicit environment");
    let keys = environment_keys(&codex);
    assert!(keys.contains("CODEX_HOME"));
    assert!(!keys.contains("OPENAI_API_KEY"));

    assert!(sanitized_runtime_environment("gemini", sample_parent_environment()).is_none());
}

#[test]
fn applied_runtime_environment_clears_command_overrides_before_spawn() {
    let mut command = std::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--exact",
            "acp::runtime_environment::tests::runtime_environment_probe_child",
            "--nocapture",
        ])
        .env("ATLAS_TEST_SECRET", "must-not-cross")
        .env("NODE_OPTIONS", "--require=/tmp/inject.cjs")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    apply_runtime_environment(&mut command, "claude-acp", "/atlas/verified/bin");
    // Set after the policy, or the child fails to launch and the check is falsely green.
    command.env("ATLAS_ENV_PROBE_CHILD", "1");

    let output = command.output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "stdout={stdout}\nstderr={stderr}");
    assert!(stdout.contains("PATH=/atlas/verified/bin"), "{stdout}");
    assert!(!stdout.contains("ATLAS_TEST_SECRET="), "{stdout}");
    assert!(!stdout.contains("NODE_OPTIONS="), "{stdout}");
}

#[test]
fn codex_runtime_environment_forces_the_measured_read_only_adapter_mode() {
    let mut command = std::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--exact",
            "acp::runtime_environment::tests::runtime_environment_probe_child",
            "--nocapture",
        ])
        .env("INITIAL_AGENT_MODE", "agent")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    apply_runtime_environment(&mut command, "codex-acp", "/atlas/verified/bin");
    command.env("ATLAS_ENV_PROBE_CHILD", "1");

    let output = command.output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "stdout={stdout}\nstderr={stderr}");
    assert!(stdout.contains("INITIAL_AGENT_MODE=read-only"), "{stdout}");
    assert!(!stdout.contains("INITIAL_AGENT_MODE=agent"), "{stdout}");
}

#[test]
fn hardened_npx_launches_resolve_only_up_to_the_snapshot() {
    let cutoff = snapshot()
        .npm_dependency_cutoff
        .as_deref()
        .expect("the registry snapshot records its npm dependency cutoff");
    chrono::DateTime::parse_from_rfc3339(cutoff).expect("the cutoff is an RFC 3339 instant");
    for runtime in NPM_HARDENED_RUNTIMES {
        assert_eq!(
            npx_hardening_flags(runtime),
            [format!("--before={cutoff}")],
            "{runtime}"
        );

        let mut command = std::process::Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "acp::runtime_environment::tests::runtime_environment_probe_child",
                "--nocapture",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        apply_runtime_environment(&mut command, runtime, "/atlas/verified/bin");
        command.env("ATLAS_ENV_PROBE_CHILD", "1");

        let output = command.output().unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(output.status.success(), "stdout={stdout}\nstderr={stderr}");
        assert!(
            !stdout.to_ascii_lowercase().contains("npm_config_"),
            "{runtime}: the commands the adapter runs keep the user's npm settings: {stdout}"
        );
    }
}

#[test]
fn unmeasured_runtimes_keep_their_own_npm_settings() {
    assert!(npx_hardening_flags("gemini").is_empty());
    let mut command = std::process::Command::new("npx");
    apply_runtime_environment(&mut command, "gemini", "/atlas/verified/bin");
    assert!(command
        .get_envs()
        .all(|(key, _)| !key.to_string_lossy().starts_with("npm_config_")));
    let flagged = AcpLaunch {
        program: PathBuf::from("/usr/local/bin/npx"),
        args: vec![
            "-y".into(),
            "--before=2026-01-01T00:00:00.000Z".into(),
            "pkg@1.0.0".into(),
            "--acp".into(),
        ],
        path_env: String::new(),
    };
    assert_eq!(npx_launch_package(&flagged), Some("pkg@1.0.0"));
}

#[test]
fn runtime_environment_probe_child() {
    if std::env::var_os("ATLAS_ENV_PROBE_CHILD").is_none() {
        return;
    }
    let mut environment: Vec<_> = std::env::vars_os()
        .map(|(key, value)| format!("{}={}", key.to_string_lossy(), value.to_string_lossy()))
        .collect();
    environment.sort();
    println!("{}", environment.join("\n"));
}
