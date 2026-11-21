use std::path::PathBuf;

use serde::Serialize;

/// Resolves a fixed allow-list of runtimes to paths because the agent's spawned
/// connector gets no `PATH`. It enumerates nothing and executes nothing: starting a
/// program unasked differs from the person pressing a button.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRuntime {
    pub name: String,
    /// `None` when not installed.
    pub path: Option<String>,
}

/// A sixth name is a deliberate edit; taking names from the caller would make this
/// "resolve anything", a different capability.
pub(crate) const CONNECTOR_RUNTIMES: &[&str] = &["npx", "node", "uvx", "python3", "docker"];

/// Reads only, executes nothing.
#[tauri::command]
pub fn resolve_connector_runtimes() -> Result<Vec<ResolvedRuntime>, String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let (is_executable, list_dir, read_text, login_ok) = crate::acp::login_probe::real_probe();
    let probe = crate::acp::command_lookup::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    // No managed directories: those hold the agent's runtime, and a connector path
    // only this app can reach would break the person's config.
    let dirs = crate::acp::command_lookup::candidate_bin_dirs(
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        None,
        None,
    );
    Ok(CONNECTOR_RUNTIMES
        .iter()
        .map(|name| ResolvedRuntime {
            name: (*name).to_string(),
            path: crate::acp::command_lookup::resolve_command(name, &dirs, &probe)
                .map(|path| path.to_string_lossy().into_owned()),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_runtime_allow_list_is_fixed_and_small() {
        assert_eq!(
            CONNECTOR_RUNTIMES,
            &["npx", "node", "uvx", "python3", "docker"]
        );
        let source = include_str!("runtimes.rs");
        let body = source.split("#[cfg(test)]").next().unwrap();
        assert!(
            body.contains(
                "pub fn resolve_connector_runtimes() -> Result<Vec<ResolvedRuntime>, String>"
            ),
            "resolve_connector_runtimes must take no caller-supplied name"
        );
    }
}
