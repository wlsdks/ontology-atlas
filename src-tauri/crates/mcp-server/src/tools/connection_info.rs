//! `connection_info`: which vault and repository this server answers for, how each was found, which
//! tools it offers, and the construction guides a truncating host never delivers whole.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use confined_files::resolve_path;
use hardened_git::Repository;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::argument_checks::optional_one_of;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::surface::Surface;

/// The construction card and the long-form guides, as the surface generator wrote them.
#[derive(Deserialize)]
struct Guides {
    card: String,
    topics: Vec<String>,
    texts: IndexMap<String, String>,
}

#[allow(
    clippy::expect_used,
    reason = "the embedded file is fixed at build time and read by the tests"
)]
fn guides() -> &'static Guides {
    static GUIDES: OnceLock<Guides> = OnceLock::new();
    GUIDES.get_or_init(|| {
        serde_json::from_str(include_str!("../../surface/guides.json"))
            .expect("the embedded guides are valid")
    })
}

#[derive(Serialize)]
struct ServerFacts<'a> {
    name: &'a str,
    version: &'a str,
    #[serde(rename = "readOnly")]
    read_only: bool,
    #[serde(rename = "toolCount")]
    tool_count: usize,
    #[serde(rename = "toolNames")]
    tool_names: Vec<&'a str>,
    #[serde(rename = "toolsetHash")]
    toolset_hash: String,
}

#[derive(Serialize)]
struct GuideFacts<'a> {
    card: &'a str,
    topics: &'a [String],
}

#[derive(Serialize)]
struct Connection<'a> {
    #[serde(rename = "vaultRoot")]
    vault_root: String,
    #[serde(rename = "repoRoot")]
    repo_root: String,
    #[serde(rename = "vaultResolution")]
    vault_resolution: &'static str,
    #[serde(rename = "repoResolution")]
    repo_resolution: &'static str,
    #[serde(rename = "sameRoot")]
    same_root: bool,
    #[serde(rename = "restartRequiredForRootChange")]
    restart_required_for_root_change: bool,
    server: ServerFacts<'a>,
    guide: GuideFacts<'a>,
    #[serde(rename = "guideText", skip_serializing_if = "Option::is_none")]
    guide_text: Option<&'a str>,
}

/// An environment variable that is set to something: an empty one counts as unset, as it does for
/// the launcher that exports it blank.
fn set_variable(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// The top of the repository `folder` is in, when it is in one.
fn repository_top(folder: &Path) -> Option<PathBuf> {
    Repository::at(folder).top_level().ok().flatten()
}

struct Roots {
    repo_root: PathBuf,
    repo_resolution: &'static str,
    vault_resolution: &'static str,
}

/// The repository root: the one the launcher named, else the repository the vault is in, else the
/// one the server was started in, else the folder it was started in.
fn roots(vault_root: &Path) -> Roots {
    let cwd = std::env::current_dir().unwrap_or_else(|_| vault_root.to_path_buf());
    let named = set_variable("OATLAS_REPO_ROOT");
    let discovered = repository_top(vault_root).or_else(|| repository_top(&cwd));
    let repo_resolution = if named.is_some() {
        "OATLAS_REPO_ROOT"
    } else if discovered.is_some() {
        "git.rev-parse"
    } else {
        "process.cwd"
    };
    let chosen = named.or(discovered).unwrap_or_else(|| cwd.clone());
    Roots {
        repo_root: resolve_path(&cwd, &chosen),
        repo_resolution,
        vault_resolution: if set_variable("OATLAS_VAULT").is_some() {
            "OATLAS_VAULT"
        } else {
            "process.cwd"
        },
    }
}

/// The hash of the tool list as `tools/list` shows it, so a client can tell the set changed.
fn toolset_hash(listed: &[&crate::surface::ToolDef]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"[");
    for (position, tool) in listed.iter().enumerate() {
        if position > 0 {
            hasher.update(b",");
        }
        hasher.update(tool.advertised_text().as_bytes());
    }
    hasher.update(b"]");
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let guides = guides();
    let topics: Vec<&str> = guides.topics.iter().map(String::as_str).collect();
    let topic = optional_one_of(arguments, "guide", &topics)?;
    let config = context.config();
    let surface = Surface::embedded();
    let listed = surface.tools_for_list(&config.modes);
    let roots = roots(&config.vault_root);
    let vault_root = config.vault_root.to_string_lossy().into_owned();
    let repo_root = roots.repo_root.to_string_lossy().into_owned();
    ToolOutput::json(&Connection {
        same_root: vault_root == repo_root,
        vault_root,
        repo_root,
        vault_resolution: roots.vault_resolution,
        repo_resolution: roots.repo_resolution,
        restart_required_for_root_change: true,
        server: ServerFacts {
            name: &surface.server_name,
            version: &surface.server_version,
            read_only: config.modes.read_only,
            tool_count: listed.len(),
            tool_names: listed.iter().map(|tool| tool.name.as_str()).collect(),
            toolset_hash: toolset_hash(&listed),
        },
        guide: GuideFacts {
            card: &guides.card,
            topics: &guides.topics,
        },
        guide_text: topic
            .and_then(|name| guides.texts.get(name))
            .map(String::as_str),
    })
}
