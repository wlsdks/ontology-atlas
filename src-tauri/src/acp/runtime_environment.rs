use std::ffi::{OsStr, OsString};

use super::registry::snapshot;

/// Measured to keep subscription login without the parent environment; clearing it
/// for others on a guess would break tools that rely on env API keys.
const SANITIZED_ENV_RUNTIMES: &[&str] = &["claude-acp", "codex-acp"];

/// Not a sandbox: HOME and proxies stay. It keeps inherited API keys, routing and
/// dynamic-loader inputs from changing the session's auth or execution boundary.
const SHARED_RUNTIME_ENV: &[&str] = &[
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "TZ",
    "USER",
    "USERNAME",
    "LOGNAME",
    "SHELL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
];

fn runtime_environment_key_allowed(runtime_id: &str, key: &OsStr) -> bool {
    // Windows names are case-insensitive, so mixed spellings are caught everywhere.
    let normalized = key.to_string_lossy().to_ascii_uppercase();
    SHARED_RUNTIME_ENV.contains(&normalized.as_str())
        || normalized.starts_with("LC_")
        || (runtime_id == "codex-acp"
            && matches!(normalized.as_str(), "CODEX_HOME" | "CODEX_CA_CERTIFICATE"))
}

/// `None` keeps inheritance for unverified executors; an empty `Some` clears everything.
fn sanitized_runtime_environment(
    runtime_id: &str,
    inherited: impl IntoIterator<Item = (OsString, OsString)>,
) -> Option<Vec<(OsString, OsString)>> {
    if !SANITIZED_ENV_RUNTIMES.contains(&runtime_id) {
        return None;
    }

    Some(
        inherited
            .into_iter()
            .filter(|(key, _)| runtime_environment_key_allowed(runtime_id, key))
            .collect(),
    )
}

/// Both adapters start through npx under the snapshot's cutoff.
const NPM_HARDENED_RUNTIMES: &[&str] = &["claude-acp", "codex-acp"];

/// A flag npm does not hand on (measured): what the adapter runs keeps its own npm settings.
pub(super) fn npx_hardening_flags(runtime_id: &str) -> Vec<String> {
    match snapshot().npm_dependency_cutoff.as_deref() {
        Some(cutoff) if NPM_HARDENED_RUNTIMES.contains(&runtime_id) => {
            vec![format!("--before={cutoff}")]
        }
        _ => Vec::new(),
    }
}

/// Session start and the login probe share one environment policy.
pub(crate) fn apply_runtime_environment(
    command: &mut std::process::Command,
    runtime_id: &str,
    child_path: &str,
) {
    if let Some(environment) = sanitized_runtime_environment(runtime_id, std::env::vars_os()) {
        command.env_clear();
        command.envs(environment);
    }
    // PATH is overwritten last with the path used to find the executor and CLI.
    command.env("PATH", child_path);
    if runtime_id == "codex-acp" {
        // codex-acp picks its per-turn sandbox from this, overriding config.toml; set after `env_clear`
        // so neither the parent nor a permissive user config can replace it.
        command.env("INITIAL_AGENT_MODE", "read-only");
    }
}

#[cfg(test)]
mod tests;
