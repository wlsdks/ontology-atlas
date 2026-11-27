//! What the process knows before it reads a request: which tools it exposes, and the vault it was
//! opened for. The environment variables are those of `mcp/src/server/registry.mjs` and
//! `runtime.mjs`; this slice reads the three modes and the vault root.

use std::path::PathBuf;

use confined_files::confined_root::{ensure_vault_root, resolve_path, VaultRootError};

use crate::js_text::js_trim;

/// Which tools `tools/list` shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolProfile {
    Full,
    /// Only the tools a first build of a vault needs.
    Construction,
}

/// The three switches that change what the server answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Modes {
    /// Write tools leave `tools/list` and are refused when called from a cached list.
    pub read_only: bool,
    pub profile: ToolProfile,
    /// Every write asks a person first (`elicitation/create`); off unless the launcher asks.
    pub write_consent: bool,
}

impl Modes {
    pub const FULL: Modes = Modes {
        read_only: false,
        profile: ToolProfile::Full,
        write_consent: false,
    };
}

/// Why the process cannot start. The text is what it prints before it exits with status 1.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartupError {
    InvalidProfile(String),
    VaultRoot {
        reason: VaultRootError,
        root: PathBuf,
    },
}

impl StartupError {
    /// The stderr lines, each without its newline.
    pub fn lines(&self) -> Vec<String> {
        match self {
            Self::InvalidProfile(value) => {
                let quoted = crate::json::to_json(&crate::json::Value::string(value.clone()));
                vec![format!(
                    "Error: Invalid OATLAS_TOOL_PROFILE {quoted}; use full or construction, or unset it, then restart the server."
                )]
            }
            Self::VaultRoot { reason, root } => vec![
                format!("[ontology-atlas-mcp] vault root validation failed: {reason}"),
                format!(
                    "[ontology-atlas-mcp] Point the OATLAS_VAULT environment variable at a markdown vault directory. (currently: {})",
                    root.display()
                ),
            ],
        }
    }
}

/// The same vocabulary for both switches, so they read alike.
fn is_on(value: Option<&str>) -> bool {
    value.is_some_and(|text| {
        matches!(
            js_trim(text).to_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}

impl Modes {
    /// Reads the modes from `lookup`, a view of the environment.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, StartupError> {
        let profile = match lookup("OATLAS_TOOL_PROFILE").as_deref() {
            None | Some("full") => ToolProfile::Full,
            Some("construction") => ToolProfile::Construction,
            Some(other) => return Err(StartupError::InvalidProfile(other.to_string())),
        };
        Ok(Self {
            read_only: is_on(lookup("OATLAS_READ_ONLY").as_deref()),
            profile,
            write_consent: is_on(lookup("OATLAS_WRITE_CONSENT").as_deref()),
        })
    }
}

/// Everything the process resolves once, at start.
#[derive(Debug, Clone)]
pub struct Config {
    pub modes: Modes,
    pub vault_root: PathBuf,
}

impl Config {
    /// Reads the modes and the vault root from `lookup`, resolving a relative root against `cwd`,
    /// and checks that the root is a folder. The tool profile is checked first, as the JavaScript
    /// server fails on it before it looks at the vault.
    pub fn from_lookup(
        lookup: impl Fn(&str) -> Option<String>,
        cwd: &std::path::Path,
    ) -> Result<Self, StartupError> {
        let modes = Modes::from_lookup(&lookup)?;
        let vault_root = match lookup("OATLAS_VAULT").filter(|value| !value.is_empty()) {
            Some(value) => resolve_path(cwd, std::path::Path::new(&value)),
            None => resolve_path(cwd, cwd),
        };
        ensure_vault_root(&vault_root).map_err(|reason| StartupError::VaultRoot {
            reason,
            root: vault_root.clone(),
        })?;
        Ok(Self { modes, vault_root })
    }

    pub fn from_environment() -> Result<Self, StartupError> {
        let cwd = std::env::current_dir().unwrap_or_default();
        Self::from_lookup(|name| std::env::var(name).ok(), &cwd)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn modes(pairs: &[(&str, &str)]) -> Result<Modes, StartupError> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        Modes::from_lookup(|name| map.get(name).cloned())
    }

    #[test]
    fn the_switches_accept_the_words_the_javascript_server_accepts() {
        for on in ["1", "true", "TRUE", " yes ", "On", "\u{a0}on\u{a0}"] {
            assert!(
                modes(&[("OATLAS_READ_ONLY", on)]).expect("valid").read_only,
                "{on:?}"
            );
            assert!(
                modes(&[("OATLAS_WRITE_CONSENT", on)])
                    .expect("valid")
                    .write_consent,
                "{on:?}"
            );
        }
        for off in ["", "0", "false", "no", "off", "2", "enabled"] {
            assert!(
                !modes(&[("OATLAS_READ_ONLY", off)])
                    .expect("valid")
                    .read_only,
                "{off:?}"
            );
        }
    }

    #[test]
    fn an_unknown_profile_stops_the_start_and_an_empty_one_is_unknown() {
        assert_eq!(
            modes(&[("OATLAS_TOOL_PROFILE", "construction")])
                .expect("valid")
                .profile,
            ToolProfile::Construction
        );
        assert_eq!(
            modes(&[("OATLAS_TOOL_PROFILE", "full")])
                .expect("valid")
                .profile,
            ToolProfile::Full
        );
        for bad in ["bogus", "", "Full"] {
            assert_eq!(
                modes(&[("OATLAS_TOOL_PROFILE", bad)]),
                Err(StartupError::InvalidProfile(bad.to_string()))
            );
        }
        assert_eq!(
            StartupError::InvalidProfile("a\"b".to_string()).lines(),
            ["Error: Invalid OATLAS_TOOL_PROFILE \"a\\\"b\"; use full or construction, or unset it, then restart the server."]
        );
    }

    #[test]
    fn a_missing_vault_prints_the_two_lines_the_javascript_server_prints() {
        let cwd = std::env::temp_dir();
        let error = Config::from_lookup(
            |name| (name == "OATLAS_VAULT").then(|| "/definitely/not/here/".to_string()),
            &cwd,
        )
        .expect_err("missing vault");
        assert_eq!(
            error.lines(),
            [
                "[ontology-atlas-mcp] vault root validation failed: Vault root not found: /definitely/not/here",
                "[ontology-atlas-mcp] Point the OATLAS_VAULT environment variable at a markdown vault directory. (currently: /definitely/not/here)",
            ]
        );
    }

    #[test]
    fn the_profile_is_judged_before_the_vault() {
        let cwd = std::env::temp_dir();
        let error = Config::from_lookup(
            |name| match name {
                "OATLAS_VAULT" => Some("/definitely/not/here".to_string()),
                "OATLAS_TOOL_PROFILE" => Some("bogus".to_string()),
                _ => None,
            },
            &cwd,
        )
        .expect_err("invalid profile");
        assert!(matches!(error, StartupError::InvalidProfile(_)));
    }

    #[test]
    fn an_unset_vault_is_the_working_folder() {
        let cwd = std::env::temp_dir();
        let config = Config::from_lookup(|_| None, &cwd).expect("the temp folder exists");
        assert_eq!(config.vault_root, resolve_path(&cwd, &cwd));
    }
}
