use std::path::{Path, PathBuf};

use super::bounded_command::{bounded_output, KEYCHAIN_PROBE_TIMEOUT, LOGIN_PROBE_TIMEOUT};
use super::credential_mirror::{claude_credentials_service, mirror_terminal_login};
use super::registry::chat_eligible;

/// Only measured executors: guessed env vars or credential files silently break login.
#[derive(Debug, Clone, Copy)]
pub(super) struct IsolationSpec {
    pub id: &'static str,
    pub config_env: &'static str,
    /// Linked, not copied, so isolation keeps the login working.
    pub credentials_file: &'static str,
    pub user_config_dir: &'static str,
}

const ISOLATION: &[IsolationSpec] = &[
    IsolationSpec {
        id: "claude-acp",
        config_env: "CLAUDE_CONFIG_DIR",
        credentials_file: ".credentials.json",
        user_config_dir: ".claude",
    },
    IsolationSpec {
        id: "codex-acp",
        config_env: "CODEX_HOME",
        credentials_file: "auth.json",
        user_config_dir: ".codex",
    },
];

pub(super) fn isolation_for(id: &str) -> Option<&'static IsolationSpec> {
    ISOLATION.iter().find(|s| s.id == id)
}

/// Sessions never inherit the user's global settings: pre-allowed entries such as `Bash(*)`
/// pass in every mode, so these settings, not the protocol, make the gate.
const ISOLATED_CLAUDE_SETTINGS: &str = r#"{
  "permissions": {
    "defaultMode": "default",
    "allow": [],
    "deny": [],
    "ask": []
  }
}
"#;

/// Not inherited from `~/.codex/config.toml`. The `ontology-atlas` block gates the vault's own
/// project registration, which a session loads even from an isolated home (decision (111)).
/// Its `command`/`args` are placeholders: codex merges this env into the vault's own entry, and `mcp/src/write-consent.mjs` reads the switch.
const ISOLATED_CODEX_CONFIG: &str = r#"approval_policy = "on-request"
sandbox_mode = "read-only"

[mcp_servers.ontology-atlas]
command = "node"
args = []

[mcp_servers.ontology-atlas.env]
OATLAS_WRITE_CONSENT = "on"
"#;

/// Rewrites our settings every time so the gate cannot be left open by an edit, and
/// links credentials instead of copying secrets. No original credentials means no link.
pub(crate) fn prepare_isolated_config(
    runtime_id: &str,
    app_data_dir: &Path,
    home: Option<&Path>,
    cli: Option<&Path>,
    path_env: &str,
) -> Result<PathBuf, String> {
    // Unmeasured executors report not isolated: a guessed env var silently breaks login.
    let spec =
        isolation_for(runtime_id).ok_or_else(|| format!("isolation-unsupported:{runtime_id}"))?;

    let dir = app_data_dir.join("agent-config").join(spec.id);
    std::fs::create_dir_all(&dir).map_err(|err| format!("config-dir-failed:{err}"))?;

    if spec.id == "claude-acp" {
        std::fs::write(dir.join("settings.json"), ISOLATED_CLAUDE_SETTINGS)
            .map_err(|err| format!("settings-write-failed:{err}"))?;
    }
    if spec.id == "codex-acp" {
        std::fs::write(dir.join("config.toml"), ISOLATED_CODEX_CONFIG)
            .map_err(|err| format!("settings-write-failed:{err}"))?;
    }

    if let Some(home) = home {
        let mirrored = spec.id == "claude-acp" && mirror_terminal_login(&dir, home);
        let source = home.join(spec.user_config_dir).join(spec.credentials_file);
        let link = dir.join(spec.credentials_file);
        if mirrored {
            // Once the keychain carries the login, the symlink comes down, or Claude Code
            // migrates the linked file over the mirror. Only a symlink is removed, never a real file.
            if std::fs::symlink_metadata(&link)
                .map(|meta| meta.file_type().is_symlink())
                .unwrap_or(false)
            {
                let _ = std::fs::remove_file(&link);
            }
        } else if source.exists() {
            link_credentials(&source, &link)?;
            // Clear the shadow only once the link exists; otherwise the app-side entry may be
            // the only working login.
            clear_shadowing_credentials(&dir, cli, path_env);
        }
    }

    Ok(dir)
}

/// Claude Code reads the keychain before the linked file, so an app-folder item
/// shadows the link. Failure is silent so a blocked keychain never stops the app.
fn clear_shadowing_credentials(config_dir: &Path, cli: Option<&Path>, path_env: &str) {
    #[cfg(target_os = "macos")]
    {
        let service = claude_credentials_service(config_dir);
        // Check first: deleting a missing item can raise a macOS approval dialog.
        let mut find = std::process::Command::new("security");
        find.args(["find-generic-password", "-s", &service]);
        // An `svce` line means the item exists.
        let found = bounded_output(find, KEYCHAIN_PROBE_TIMEOUT);
        if !found.map(|out| out.contains(&service)).unwrap_or(false) {
            return;
        }

        // Never delete an item that still works; ask the CLI rather than trust timestamps,
        // which a failed refresh re-stamps. Without the CLI, do nothing.
        let Some(cli) = cli else {
            return;
        };
        let mut probe = std::process::Command::new(cli);
        probe
            .args(["auth", "status"])
            .env("PATH", path_env)
            .env("CLAUDE_CONFIG_DIR", config_dir);
        let Some(stdout) = bounded_output(probe, LOGIN_PROBE_TIMEOUT) else {
            return;
        };
        if !claude_status_is_logged_out(&stdout) {
            return;
        }

        let _ = std::process::Command::new("security")
            .args(["delete-generic-password", "-s", &service])
            .output();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (config_dir, cli, path_env);
    }
}

/// Unconditional, because it runs only on an explicit "reconnect".
pub(crate) fn remove_shadow_credentials(config_dir: &Path) {
    #[cfg(target_os = "macos")]
    {
        let service = claude_credentials_service(config_dir);
        let mut find = std::process::Command::new("security");
        find.args(["find-generic-password", "-s", &service]);
        if !bounded_output(find, KEYCHAIN_PROBE_TIMEOUT)
            .map(|out| out.contains(&service))
            .unwrap_or(false)
        {
            return;
        }
        let mut del = std::process::Command::new("security");
        del.args(["delete-generic-password", "-s", &service]);
        let _ = bounded_output(del, KEYCHAIN_PROBE_TIMEOUT);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = config_dir;
    }
}

/// Measures the folder the app uses, not the user's. `None` when it cannot ask.
pub(crate) fn probe_isolated_logged_out(
    cli: &Path,
    config_dir: &Path,
    path_env: &str,
) -> Option<bool> {
    let mut command = std::process::Command::new(cli);
    command
        .args(["auth", "status"])
        .env("PATH", path_env)
        .env("CLAUDE_CONFIG_DIR", config_dir);
    let stdout = bounded_output(command, LOGIN_PROBE_TIMEOUT)?;
    // Unparseable is neither logged in nor out.
    serde_json::from_str::<serde_json::Value>(stdout.trim())
        .ok()?
        .get("loggedIn")?
        .as_bool()
        .map(|logged_in| !logged_in)
}

/// `None` outside macOS.
pub(crate) fn shadow_credentials_present(config_dir: &Path) -> Option<bool> {
    #[cfg(target_os = "macos")]
    {
        let service = claude_credentials_service(config_dir);
        let mut find = std::process::Command::new("security");
        find.args(["find-generic-password", "-s", &service]);
        let out = bounded_output(find, KEYCHAIN_PROBE_TIMEOUT)?;
        Some(out.contains(&service))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = config_dir;
        None
    }
}

/// True only for an explicit `loggedIn: false`; a wrong "dead" would delete a working login.
fn claude_status_is_logged_out(stdout: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return false;
    };
    value.get("loggedIn") == Some(&serde_json::Value::Bool(false))
}

pub(crate) fn config_env_for(runtime_id: &str) -> Option<&'static str> {
    isolation_for(runtime_id).map(|s| s.config_env)
}

/// Rejects a runtime without verified isolation even if UI filtering fails; a
/// session mode alone let an Atlas MCP write through unasked.
pub(crate) fn prepare_runtime_isolation(
    runtime_id: &str,
    app_data_dir: &Path,
    home: Option<&Path>,
    cli: Option<&Path>,
    path_env: &str,
) -> Result<(&'static str, PathBuf), String> {
    // Eligibility first: an unmeasured gate must never reach a conversation, even if
    // the app could isolate its config (decision (111)).
    if !chat_eligible(runtime_id) {
        return Err(format!("permission-gate-unsupported:{runtime_id}"));
    }
    let env = config_env_for(runtime_id)
        .ok_or_else(|| format!("permission-gate-unsupported:{runtime_id}"))?;
    let dir = prepare_isolated_config(runtime_id, app_data_dir, home, cli, path_env)
        .map_err(|reason| format!("isolation-failed:{reason}"))?;
    Ok((env, dir))
}

fn link_credentials(source: &Path, link: &Path) -> Result<(), String> {
    if let Ok(existing) = std::fs::read_link(link) {
        if existing == source {
            return Ok(());
        }
    }
    // A broken link leaves login broken with settings that look fine.
    let _ = std::fs::remove_file(link);

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, link)
            .map_err(|err| format!("credentials-link-failed:{err}"))
    }
    #[cfg(windows)]
    {
        // Windows symlinks need a privilege; without one, proceed unlinked rather than
        // copying secrets, and report the reason.
        std::os::windows::fs::symlink_file(source, link)
            .map_err(|err| format!("credentials-link-failed:{err}"))
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (source, link);
        Err("credentials-link-unsupported".into())
    }
}

#[cfg(test)]
mod tests;
