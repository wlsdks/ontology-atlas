//! What the process knows before it reads a request: which tools it exposes, and the vault it was
//! opened for. The environment variables are those of `mcp/src/server/registry.mjs` and
//! `runtime.mjs`; this slice reads the three modes and the vault root.

use std::path::PathBuf;

use confined_files::confined_root::{ensure_vault_root, resolve_path, VaultRootError};
use hardened_git::Repository;

use answer_format::whitespace::trim;

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
                let quoted = answer_format::json::quote(value);
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
            trim(text).to_lowercase().as_str(),
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
    /// The code repository the vault belongs to, which `connection_info` reports.
    pub repo_root: PathBuf,
    /// How each root was found: the variable that named it, `git.rev-parse`, or `process.cwd`.
    pub vault_resolution: &'static str,
    pub repo_resolution: &'static str,
}

/// An environment variable that is set to something: an empty one counts as unset, as it does for
/// the launcher that exports it blank.
fn set_variable(lookup: &impl Fn(&str) -> Option<String>, name: &str) -> Option<PathBuf> {
    lookup(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// The top of the repository `folder` is in, when it is in one.
fn repository_top(folder: &std::path::Path) -> Option<PathBuf> {
    Repository::at(folder).top_level().ok().flatten()
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
        let named_vault = set_variable(&lookup, "OATLAS_VAULT");
        let vault_resolution = if named_vault.is_some() {
            "OATLAS_VAULT"
        } else {
            "process.cwd"
        };
        let vault_root = match &named_vault {
            Some(value) => resolve_path(cwd, value),
            None => resolve_path(cwd, cwd),
        };
        ensure_vault_root(&vault_root).map_err(|reason| StartupError::VaultRoot {
            reason,
            root: vault_root.clone(),
        })?;
        // The repository root is the one the launcher named, else the repository the vault is in,
        // else the one the server was started in, else the folder it was started in. It is found
        // once, here, and never again.
        let named_repository = set_variable(&lookup, "OATLAS_REPO_ROOT");
        let (repo_root, repo_resolution) = match named_repository {
            Some(named) => (named, "OATLAS_REPO_ROOT"),
            None => match repository_top(&vault_root).or_else(|| repository_top(cwd)) {
                Some(found) => (found, "git.rev-parse"),
                None => (cwd.to_path_buf(), "process.cwd"),
            },
        };
        Ok(Self {
            modes,
            repo_root: resolve_path(cwd, &repo_root),
            vault_root,
            vault_resolution,
            repo_resolution,
        })
    }

    /// A configuration for the vault folder alone: the vault is also the repository root, and the
    /// environment is not read. For tests and for a program that embeds the server.
    pub fn at_vault(modes: Modes, vault_root: PathBuf) -> Self {
        Self {
            modes,
            repo_root: vault_root.clone(),
            vault_root,
            vault_resolution: "OATLAS_VAULT",
            repo_resolution: "OATLAS_REPO_ROOT",
        }
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

    #[cfg(unix)]
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

    #[cfg(windows)]
    #[test]
    fn a_vault_named_with_backslashes_forward_slashes_or_a_verbatim_prefix_is_a_folder() {
        let folder = std::env::temp_dir();
        let backslashes = folder.to_string_lossy().into_owned();
        let forward = backslashes.replace('\\', "/");
        let verbatim = format!(r"\\?\{backslashes}");
        for named in [backslashes, forward, verbatim] {
            let config = Config::from_lookup(
                |name| (name == "OATLAS_VAULT").then(|| named.clone()),
                &folder,
            );
            assert!(config.is_ok(), "{named}: {config:?}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn a_missing_vault_on_a_drive_is_reported_with_the_path_as_written() {
        let error = Config::from_lookup(
            |name| (name == "OATLAS_VAULT").then(|| r"C:\definitely\not\here".to_string()),
            &std::env::temp_dir(),
        )
        .expect_err("missing vault");
        let lines = error.lines();
        assert!(lines
            .first()
            .is_some_and(|line| line.contains("vault root validation failed")));
        assert!(lines
            .get(1)
            .is_some_and(|line| line.contains(r"definitely\not\here")));
    }

    #[test]
    fn an_unset_vault_is_the_working_folder() {
        let cwd = std::env::temp_dir();
        let config = Config::from_lookup(|_| None, &cwd).expect("the temp folder exists");
        assert_eq!(config.vault_root, resolve_path(&cwd, &cwd));
    }

    #[test]
    fn a_named_repository_root_wins_and_is_resolved_against_the_working_folder() {
        let cwd = std::env::temp_dir();
        let config = Config::from_lookup(
            |name| (name == "OATLAS_REPO_ROOT").then(|| "elsewhere".to_string()),
            &cwd,
        )
        .expect("the temp folder exists");
        assert_eq!(config.repo_root, cwd.join("elsewhere"));
        assert_eq!(config.repo_resolution, "OATLAS_REPO_ROOT");
        // An empty name is no name.
        let config =
            Config::from_lookup(|name| (name == "OATLAS_REPO_ROOT").then(String::new), &cwd)
                .expect("the temp folder exists");
        assert_ne!(config.repo_resolution, "OATLAS_REPO_ROOT");
    }

    #[test]
    fn a_vault_inside_a_repository_finds_the_top_of_that_repository_once() {
        let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let config = Config::from_lookup(
            |name| (name == "OATLAS_VAULT").then(|| here.to_string_lossy().into_owned()),
            &std::env::temp_dir(),
        )
        .expect("the crate folder exists");
        assert_eq!(config.repo_resolution, "git.rev-parse");
        assert!(here.starts_with(
            config
                .repo_root
                .canonicalize()
                .expect("the top of the repository exists")
        ));
        assert!(config.repo_root.join(".git").exists());
        assert_ne!(config.repo_root, here, "the crate is not the top");
    }

    #[test]
    fn outside_any_repository_the_root_is_the_working_folder() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let cwd = folder.path();
        let config = Config::from_lookup(|_| None, cwd).expect("the folder exists");
        assert_eq!(config.repo_resolution, "process.cwd");
        assert_eq!(config.repo_root, cwd);
    }
}
