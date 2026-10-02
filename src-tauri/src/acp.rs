//! Finds which ACP agents exist on this machine and how to launch them. GUI apps
//! skip shell init files, so PATH is rebuilt from known locations, never by running
//! a login shell (it would execute the user's whole config). npx adapters are pinned.

use std::ffi::{OsStr, OsString};
use std::path::{Component, Path, PathBuf};


/// Generated into `src-tauri/src/acp-registry.json` by `scripts/build-acp-registry.mjs`
/// and never fetched at runtime: no unrequested network traffic, and it works offline.
#[derive(Debug, Clone, serde::Deserialize)]
pub(crate) struct RegistryAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub website: Option<String>,
    pub license: Option<String>,
    /// Guards against the UI claiming work it has not done.
    pub verified: bool,
    /// `None` when unknown; a guess would fabricate a reason for absence.
    pub cli: Option<String>,
    /// Bundled at build time so the app fetches no images.
    pub icon: Option<String>,
    /// Human-verified pairs only; a missing value draws grayscale, which beats a wrong brand.
    #[serde(default, rename = "brandInk")]
    pub brand_ink: Option<String>,
    pub launch: RegistryLaunch,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum RegistryLaunch {
    Npx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
    Uvx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// Launches what is already on PATH. App-managed installs follow the rules in the
    /// agent-install section of `.claude/rules/surfaces.md`.
    Binary {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
struct RegistrySnapshot {
    agents: Vec<RegistryAgent>,
    #[serde(default, rename = "npmDependencyCutoff")]
    npm_dependency_cutoff: Option<String>,
}

/// Parsed once; a corrupt snapshot yields an empty list, so the UI says "nothing
/// found" rather than launching something invalid.
fn snapshot() -> &'static RegistrySnapshot {
    static SNAPSHOT: std::sync::OnceLock<RegistrySnapshot> = std::sync::OnceLock::new();
    SNAPSHOT
        .get_or_init(|| serde_json::from_str(include_str!("acp-registry.json")).unwrap_or_default())
}

fn registry() -> &'static [RegistryAgent] {
    &snapshot().agents
}

pub(crate) fn registry_agent(id: &str) -> Option<&'static RegistryAgent> {
    registry().iter().find(|a| a.id == id)
}

/// Only measured executors: guessed env vars or credential files silently break login.
#[derive(Debug, Clone, Copy)]
pub(crate) struct IsolationSpec {
    pub id: &'static str,
    pub config_env: &'static str,
    /// Linked, not copied, so isolation keeps the login working.
    pub credentials_file: &'static str,
    pub user_config_dir: &'static str,
}

pub(crate) const ISOLATION: &[IsolationSpec] = &[
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

// Config-directory isolation alone proves neither filesystem nor MCP permission control.
// runtime-gate.ts owns chat eligibility and the required session mode.

/// Runtimes whose permission gate was measured; not the same as `ISOLATION`
/// (decision (111)). Joining requires an installed-app run showing reject-without-write,
/// allow-with-write and a fresh question after `allow_once` for every write path.
pub(crate) const CHAT_ELIGIBLE: &[&str] = &["claude-acp", "codex-acp"];

pub(crate) fn chat_eligible(id: &str) -> bool {
    CHAT_ELIGIBLE.contains(&id)
}

fn isolation_for(id: &str) -> Option<&'static IsolationSpec> {
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

pub(crate) type LoginProbe<'a> = dyn Fn(&str, &Path, &[&str], &str) -> Option<bool> + 'a;

/// Injected so tests judge without a real disk.
pub(crate) struct FsProbe<'a> {
    pub is_executable: &'a dyn Fn(&Path) -> bool,
    /// Empty when absent.
    pub list_dir: &'a dyn Fn(&Path) -> Vec<String>,
    /// Used only for nvm's default-version file.
    pub read_text: &'a dyn Fn(&Path) -> Option<String>,
    /// `None` means not asked (unknown). Production reads the exit code only.
    pub login_ok: &'a LoginProbe<'a>,
}

// Only measured login-status commands. Exit code only: `claude auth status` prints
// the email and organization ID, which must never enter process memory.
pub(crate) const LOGIN_PROBE: &[(&str, &[&str])] = &[
    ("claude-acp", &["auth", "status"]),
    ("codex-acp", &["login", "status"]),
];

// Measured with a throwaway config home; no vendor documents exit codes. Any other
// non-zero code (127, a kill, a changed argument) is not "signed out".
pub(crate) const LOGIN_LOGGED_OUT_EXIT: i32 = 1;

// The only place non-zero is interpreted. Transient failures and signals are
// unknown, or a working tool vanishes from the list.
pub(crate) fn classify_login_exit(code: Option<i32>) -> Option<bool> {
    match code {
        Some(0) => Some(true),
        Some(LOGIN_LOGGED_OUT_EXIT) => Some(false),
        _ => None,
    }
}

fn login_probe_args(runtime_id: &str) -> Option<&'static [&'static str]> {
    LOGIN_PROBE
        .iter()
        .find(|(id, _)| *id == runtime_id)
        .map(|(_, args)| *args)
}

/// The user's default version first, then numeric descending: version directories
/// hold stale global CLIs the user's shell would never run.
fn nvm_bin_dirs(home: &Path, probe: &FsProbe<'_>) -> Vec<PathBuf> {
    let root = home.join(".nvm");
    let versions = root.join("versions").join("node");
    let mut found: Vec<(Vec<u64>, String, PathBuf)> = (probe.list_dir)(&versions)
        .into_iter()
        .filter_map(|name| {
            let parts = parse_version(&name)?;
            let dir = versions.join(&name).join("bin");
            Some((parts, name, dir))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));

    // An exact version or a prefix (`lts/*`, `24`) both match.
    let default = (probe.read_text)(&root.join("alias").join("default"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(default) = default {
        let wanted = parse_version(&default);
        if let Some(at) = found.iter().position(|(parts, name, _)| {
            name == &default
                || name.trim_start_matches('v') == default.trim_start_matches('v')
                || wanted
                    .as_ref()
                    .is_some_and(|w| parts.len() >= w.len() && parts[..w.len()] == w[..])
        }) {
            let chosen = found.remove(at);
            found.insert(0, chosen);
        }
    }

    found.into_iter().map(|(_, _, dir)| dir).collect()
}

fn parse_version(name: &str) -> Option<Vec<u64>> {
    let trimmed = name.strip_prefix('v').unwrap_or(name);
    let parts: Vec<u64> = trimmed
        .split('.')
        .map(|p| p.parse::<u64>().ok())
        .collect::<Option<Vec<u64>>>()?;
    if parts.is_empty() {
        None
    } else {
        Some(parts)
    }
}

/// Order is a contract: the inherited `PATH` first; well-known locations only fill gaps.
pub(crate) fn candidate_bin_dirs(
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
    // App-installed tools come last so the user's own installs win.
    managed_bin: Option<&Path>,
    // Last for the same reason.
    managed_node_bin: Option<&Path>,
) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let push = |dir: PathBuf, dirs: &mut Vec<PathBuf>| {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    };

    if let Some(path) = path_env {
        for entry in std::env::split_paths(path) {
            if !entry.as_os_str().is_empty() && entry.has_root() {
                push(entry, &mut dirs);
            }
        }
    }

    #[cfg(windows)]
    {
        // Windows: the npm global shim and standard install path only.
        if let Some(appdata) = std::env::var_os("APPDATA") {
            push(PathBuf::from(appdata).join("npm"), &mut dirs);
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            push(
                PathBuf::from(local).join("Programs").join("nodejs"),
                &mut dirs,
            );
        }
    }

    #[cfg(not(windows))]
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        push(PathBuf::from(dir), &mut dirs);
    }

    if let Some(home) = home {
        // Single-purpose directories first.
        for rel in [
            ".local/bin", // the default location of the official claude install script
            ".bun/bin",
            ".volta/bin",
            ".asdf/shims",
            ".local/share/mise/shims",
            ".npm-global/bin",
            ".yarn/bin",
        ] {
            push(home.join(rel), &mut dirs);
        }
        // nvm version directories last: they hold stale global CLIs.
        for dir in nvm_bin_dirs(home, probe) {
            push(dir, &mut dirs);
        }
    }

    // App installs last, or the app would behave differently from the terminal.
    if let Some(bin) = managed_bin {
        push(bin.to_path_buf(), &mut dirs);
    }
    if let Some(bin) = managed_node_bin {
        push(bin.to_path_buf(), &mut dirs);
    }

    dirs
}

/// `None` when not found; a guessed path fails later with an unreadable error.
pub(crate) fn resolve_command(
    name: &str,
    dirs: &[PathBuf],
    probe: &FsProbe<'_>,
) -> Option<PathBuf> {
    #[cfg(windows)]
    let names: Vec<String> = ["", ".cmd", ".exe", ".bat"]
        .iter()
        .map(|ext| format!("{name}{ext}"))
        .collect();
    #[cfg(not(windows))]
    let names: Vec<String> = vec![name.to_string()];

    for dir in dirs {
        for candidate in &names {
            let path = dir.join(candidate);
            if (probe.is_executable)(&path) {
                return Some(path);
            }
        }
    }
    None
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpRuntimeStatus {
    pub id: String,
    pub label: String,
    pub description: String,
    pub website: Option<String>,
    pub license: Option<String>,
    pub verified: bool,
    pub icon: Option<String>,
    /// Grayscale when absent.
    pub brand_ink: Option<String>,
    /// `npx` · `uvx` · `binary`
    pub launch_kind: String,
    /// `ready` · `login-needed` · `login-unknown` · `cli-unknown` · `cli-missing` · `node-missing`
    /// · `uvx-missing` · `binary-missing`: each needs a different action.
    /// For `cli-unknown` the work is ours: add the executable to `UNDERLYING_CLI`.
    pub state: String,
    pub cli_path: Option<String>,
    /// Present means npx is skipped.
    pub adapter_path: Option<String>,
    /// npx branch only.
    pub adapter_package: Option<String>,
    /// Without isolation the user's global settings apply and there is no permission
    /// gate; the UI must say so.
    pub isolated: bool,
}

/// One answer for display and launch, or the UI names one program and runs another.
/// A global adapter beats npx, which is slow on first run.
fn resolve_program(
    launch: &RegistryLaunch,
    dirs: &[PathBuf],
    probe: &FsProbe<'_>,
) -> Option<PathBuf> {
    match launch {
        RegistryLaunch::Npx { package, .. } => adapter_bin_name(package)
            .and_then(|bin| resolve_command(&bin, dirs, probe))
            .or_else(|| resolve_command("npx", dirs, probe)),
        RegistryLaunch::Uvx { .. } => resolve_command("uvx", dirs, probe),
        RegistryLaunch::Binary { command, .. } => resolve_command(command, dirs, probe),
    }
}

fn launcher_missing_state(launch: &RegistryLaunch) -> &'static str {
    match launch {
        RegistryLaunch::Npx { .. } => "node-missing",
        RegistryLaunch::Uvx { .. } => "uvx-missing",
        RegistryLaunch::Binary { .. } => "binary-missing",
    }
}

/// A missing CLI is reported before a missing launcher: its action is clearer.
pub(crate) fn detect_runtimes(
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
    managed_bin: Option<&Path>,
    managed_node_bin: Option<&Path>,
) -> Vec<AcpRuntimeStatus> {
    let dirs = candidate_bin_dirs(home, path_env, probe, managed_bin, managed_node_bin);
    // The login probe gets the launch PATH, or the wrapper misses node and reads as signed out.
    let child_path = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    registry()
        .iter()
        .map(|agent| {
            let cli = agent
                .cli
                .as_deref()
                .and_then(|name| resolve_command(name, &dirs, probe));
            let program = resolve_program(&agent.launch, &dirs, probe);

            // Only measured executors are asked; not asked means unknown, not signed out.
            let login_question = cli.as_deref().zip(login_probe_args(&agent.id));
            let login_ok = login_question
                .and_then(|(path, args)| (probe.login_ok)(&agent.id, path, args, &child_path));

            let state = if agent.cli.is_some() && cli.is_none() {
                "cli-missing"
            } else if program.is_none() {
                launcher_missing_state(&agent.launch)
            } else if login_ok == Some(false) {
                // Say it before the user opens a conversation and hits `Authentication required`.
                "login-needed"
            } else if login_question.is_some() && login_ok.is_none() {
                // Asked but no answer: unknown, not signed out. The tool stays launchable.
                "login-unknown"
            } else if agent.cli.is_none() {
                // We have not recorded which CLI this adapter wraps, so it cannot be verified;
                // it still launches but must not claim ready.
                "cli-unknown"
            } else {
                "ready"
            };

            AcpRuntimeStatus {
                id: agent.id.clone(),
                label: agent.name.clone(),
                description: agent.description.clone(),
                website: agent.website.clone(),
                license: agent.license.clone(),
                verified: agent.verified,
                icon: agent.icon.clone(),
                brand_ink: agent.brand_ink.clone(),
                launch_kind: match agent.launch {
                    RegistryLaunch::Npx { .. } => "npx",
                    RegistryLaunch::Uvx { .. } => "uvx",
                    RegistryLaunch::Binary { .. } => "binary",
                }
                .to_string(),
                state: state.to_string(),
                cli_path: cli.map(to_string_lossy),
                adapter_path: program.map(to_string_lossy),
                adapter_package: match &agent.launch {
                    RegistryLaunch::Npx { package, .. } | RegistryLaunch::Uvx { package, .. } => {
                        Some(package.clone())
                    }
                    RegistryLaunch::Binary { .. } => None,
                },
                isolated: isolation_for(&agent.id).is_some(),
            }
        })
        .collect()
}

/// Returns a reason code when it cannot launch.
pub(crate) fn resolve_launch(
    runtime_id: &str,
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
    managed_bin: Option<&Path>,
    managed_node_bin: Option<&Path>,
) -> Result<AcpLaunch, String> {
    let agent =
        registry_agent(runtime_id).ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;
    let dirs = candidate_bin_dirs(home, path_env, probe, managed_bin, managed_node_bin);
    let joined = std::env::join_paths(dirs.iter())
        .map_err(|err| format!("path-join-failed:{err}"))?
        .to_string_lossy()
        .to_string();

    if let Some(cli) = agent.cli.as_deref() {
        if resolve_command(cli, &dirs, probe).is_none() {
            return Err(format!("cli-missing:{cli}"));
        }
    }

    match &agent.launch {
        RegistryLaunch::Binary { command, args } => {
            let program = resolve_command(command, &dirs, probe)
                .ok_or_else(|| format!("binary-missing:{command}"))?;
            Ok(AcpLaunch {
                program,
                args: args.clone(),
                path_env: joined,
            })
        }
        RegistryLaunch::Npx { package, args } => {
            // A global install is used as is; the executable is usually the package's last segment.
            if let Some(installed) =
                adapter_bin_name(package).and_then(|bin| resolve_command(&bin, &dirs, probe))
            {
                return Ok(AcpLaunch {
                    program: installed,
                    args: args.clone(),
                    path_env: joined,
                });
            }
            let npx = resolve_command("npx", &dirs, probe).ok_or("node-missing")?;
            // `-y` skips the install prompt nobody can answer, which would hang the process.
            let mut full = vec!["-y".to_string()];
            full.extend(npx_hardening_flags(runtime_id));
            full.push(package.clone());
            full.extend(args.iter().cloned());
            Ok(AcpLaunch {
                program: npx,
                args: full,
                path_env: joined,
            })
        }
        RegistryLaunch::Uvx { package, args } => {
            let uvx = resolve_command("uvx", &dirs, probe).ok_or("uvx-missing")?;
            let mut full = vec![package.clone()];
            full.extend(args.iter().cloned());
            Ok(AcpLaunch {
                program: uvx,
                args: full,
                path_env: joined,
            })
        }
    }
}

fn to_string_lossy(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

pub(crate) fn adapter_bin_name(package: &str) -> Option<String> {
    let without_scope = package.rsplit('/').next()?;
    let name = without_scope.split('@').next().filter(|s| !s.is_empty())?;
    Some(name.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AcpLaunch {
    /// Absolute, because a name resolves differently under the child's PATH.
    pub program: PathBuf,
    pub args: Vec<String>,
    /// The adapter finds the real CLI by name, so it needs the reconstructed PATH too.
    pub path_env: String,
}

fn is_node_modules_bin(entry: &Path) -> bool {
    let mut tail = entry.components().rev();
    matches!(tail.next(), Some(Component::Normal(last)) if last == ".bin")
        && matches!(tail.next(), Some(Component::Normal(parent)) if parent == "node_modules")
}

fn path_spellings(path: &Path) -> Vec<PathBuf> {
    let mut forms = vec![path.to_path_buf()];
    if let Ok(canonical) = std::fs::canonicalize(path) {
        if !forms.contains(&canonical) {
            forms.push(canonical);
        }
    }
    forms
}

fn under_untrusted_root(entry: &Path, roots: &[PathBuf]) -> bool {
    path_spellings(entry)
        .iter()
        .any(|form| roots.iter().any(|root| form.starts_with(root)))
}

pub(crate) fn path_without_vault_node_modules_bin(
    path_env: &str,
    vault_root: &Path,
    repo_root: Option<&Path>,
) -> String {
    let mut roots: Vec<PathBuf> = Vec::new();
    for root in std::iter::once(vault_root).chain(repo_root) {
        for form in path_spellings(root) {
            if !roots.contains(&form) {
                roots.push(form);
            }
        }
    }
    let kept: Vec<PathBuf> = std::env::split_paths(&OsString::from(path_env))
        .filter(|entry| !entry.as_os_str().is_empty() && entry.has_root())
        .filter(|entry| !is_node_modules_bin(entry) || !under_untrusted_root(entry, &roots))
        .collect();
    std::env::join_paths(kept)
        .map(|joined| joined.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path_env.to_string())
}

pub(crate) fn sanitized_process_path(path_env: &OsStr) -> OsString {
    let kept: Vec<PathBuf> = std::env::split_paths(path_env)
        .filter(|entry| !entry.as_os_str().is_empty() && entry.has_root())
        .collect();
    std::env::join_paths(kept).unwrap_or_else(|_| path_env.to_os_string())
}

// An interrupted first npx download leaves a half-made `~/.npm/_npx/<hash>/` that
// npx never repairs, so the entry is checked and deleted before launch. The hash is
// npm's first 16 hex of `sha512(<spec>)`; a formula change only makes the check fail open.

/// `npm_config_*` is stripped, so only `$HOME/.npmrc` `cache=` and the platform
/// default remain; a global npmrc is invisible and fails open.
pub(crate) fn npx_cache_root(home: Option<&Path>) -> Option<PathBuf> {
    let home = home?;
    if let Ok(text) = std::fs::read_to_string(home.join(".npmrc")) {
        for line in text.lines() {
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            // Exact key match, or `cache-min=` would redirect the search.
            if key.trim() != "cache" {
                continue;
            }
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            let base = match value.strip_prefix("~/") {
                Some(rest) => home.join(rest),
                None => PathBuf::from(value),
            };
            return Some(base.join("_npx"));
        }
    }
    let default_cache = if cfg!(windows) {
        home.join("AppData").join("Local").join("npm-cache")
    } else {
        home.join(".npm")
    };
    Some(default_cache.join("_npx"))
}

pub(crate) fn npx_cache_entry_dir(npx_cache_root: &Path, package: &str) -> PathBuf {
    use sha2::{Digest, Sha512};
    let digest = Sha512::digest(package.as_bytes());
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    npx_cache_root.join(&hex[..16])
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NpxEntryHealth {
    /// npx downloads it on first run.
    Missing,
    /// npx can reuse or recover it; leave it alone.
    Usable,
    /// npx cannot recover it.
    Broken(&'static str),
}

/// No marker means ours, since the path is our spec's hash; a marker for another
/// spec may be someone else's, so it is never touched.
fn npx_entry_owned(manifest: &serde_json::Value, package: &str) -> bool {
    match manifest
        .get("_npx")
        .and_then(|npx| npx.get("packages"))
        .and_then(|packages| packages.as_array())
    {
        Some(packages) => packages.iter().any(|entry| entry.as_str() == Some(package)),
        None => true,
    }
}

/// Broken when `package.json` fails to parse, or `node_modules` exists with an empty `.bin`.
/// Bin names are not checked: guessing them would delete healthy entries.
pub(crate) fn npx_entry_health(entry: &Path, package: &str) -> NpxEntryHealth {
    if !entry.exists() {
        return NpxEntryHealth::Missing;
    }
    let text = match std::fs::read_to_string(entry.join("package.json")) {
        Ok(text) => text,
        Err(_) => return NpxEntryHealth::Broken("package-json-missing"),
    };
    let manifest: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => return NpxEntryHealth::Broken("package-json-unparseable"),
    };
    if !npx_entry_owned(&manifest, package) {
        return NpxEntryHealth::Usable;
    }
    let node_modules = entry.join("node_modules");
    if !node_modules.exists() {
        return NpxEntryHealth::Usable;
    }
    let has_bin = std::fs::read_dir(node_modules.join(".bin"))
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);
    if !has_bin {
        return NpxEntryHealth::Broken("bin-links-missing");
    }
    NpxEntryHealth::Usable
}

/// Matches exactly the `npx -y [flags] <spec> …` shape `resolve_launch` builds.
pub(crate) fn npx_launch_package(launch: &AcpLaunch) -> Option<&str> {
    let stem = launch.program.file_stem()?.to_str()?;
    if !stem.eq_ignore_ascii_case("npx") {
        return None;
    }
    match launch.args.as_slice() {
        [flag, rest @ ..] if flag == "-y" => rest
            .iter()
            .find(|arg| !arg.starts_with('-'))
            .map(String::as_str),
        _ => None,
    }
}

/// Where the progress display measures size.
pub(crate) fn npx_cache_entry_for_launch(
    launch: &AcpLaunch,
    home: Option<&Path>,
) -> Option<PathBuf> {
    let package = npx_launch_package(launch)?;
    Some(npx_cache_entry_dir(&npx_cache_root(home)?, package))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NpxCachePreflight {
    NotNpx,
    /// Fails open: launch as before.
    CacheUnknown,
    CacheReady,
    /// Tens of MB on first download.
    FirstDownload,
    HealedBrokenEntry {
        reason: &'static str,
    },
    /// Leaving it fails as before; the reason lets the UI diagnose it.
    HealFailed {
        reason: &'static str,
        error: String,
    },
}

/// Deletes only that one entry, never all of `_npx`, so other npx tools keep their cache.
pub(crate) fn preflight_npx_cache(launch: &AcpLaunch, home: Option<&Path>) -> NpxCachePreflight {
    let Some(package) = npx_launch_package(launch) else {
        return NpxCachePreflight::NotNpx;
    };
    let Some(root) = npx_cache_root(home) else {
        return NpxCachePreflight::CacheUnknown;
    };
    let entry = npx_cache_entry_dir(&root, package);
    match npx_entry_health(&entry, package) {
        NpxEntryHealth::Missing => NpxCachePreflight::FirstDownload,
        NpxEntryHealth::Usable => NpxCachePreflight::CacheReady,
        NpxEntryHealth::Broken(reason) => match std::fs::remove_dir_all(&entry) {
            Ok(()) => NpxCachePreflight::HealedBrokenEntry { reason },
            Err(err) => NpxCachePreflight::HealFailed {
                reason,
                error: err.to_string(),
            },
        },
    }
}

/// A ready entry's pinned bin, run without the idle `npm exec` parent.
pub(crate) fn launch_from_npx_cache(
    launch: &AcpLaunch,
    home: Option<&Path>,
    is_executable: &dyn Fn(&Path) -> bool,
) -> Option<AcpLaunch> {
    if !cfg!(unix) {
        return None;
    }
    let package = npx_launch_package(launch)?;
    let adapter_args = launch.args.iter().position(|arg| arg.as_str() == package)? + 1;
    let (name, pinned) = package
        .rsplit_once('@')
        .filter(|(name, _)| !name.is_empty())?;
    let modules = npx_cache_entry_dir(&npx_cache_root(home)?, package).join("node_modules");
    let package_dir = std::fs::canonicalize(modules.join(name)).ok()?;
    let manifest = std::fs::read_to_string(package_dir.join("package.json")).ok()?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest).ok()?;
    if manifest.get("version")?.as_str()? != pinned {
        return None;
    }
    let bin_name = adapter_bin_name(package)?;
    let declared = match manifest.get("bin")? {
        serde_json::Value::String(path) => path,
        bins => bins.get(&bin_name)?.as_str()?,
    };
    let target = std::fs::canonicalize(package_dir.join(declared)).ok()?;
    let bin_dir = modules.join(".bin");
    let program = bin_dir.join(&bin_name);
    if !target.starts_with(&package_dir)
        || std::fs::canonicalize(&program).ok()? != target
        || !is_executable(&program)
    {
        return None;
    }
    let inherited =
        std::env::split_paths(&launch.path_env).filter(|dir| !dir.as_os_str().is_empty());
    let path_env = std::env::join_paths(std::iter::once(bin_dir).chain(inherited))
        .ok()?
        .to_string_lossy()
        .to_string();
    Some(AcpLaunch {
        program,
        args: launch.args[adapter_args..].to_vec(),
        path_env,
    })
}

/// Only bytes received so far: the total is pinned nowhere. Symlinks are not followed.
pub(crate) fn dir_size_bytes(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let Ok(metadata) = entry.path().symlink_metadata() else {
            continue;
        };
        if metadata.is_dir() {
            total += dir_size_bytes(&entry.path());
        } else if metadata.is_file() {
            total += metadata.len();
        }
    }
    total
}

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
pub(crate) fn sanitized_runtime_environment(
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

/// Measured 2026-09-27: both adapters start through npx under the snapshot's cutoff.
const NPM_HARDENED_RUNTIMES: &[&str] = &["claude-acp", "codex-acp"];

/// A flag npm does not hand on (measured): what the adapter runs keeps its own npm settings.
pub(crate) fn npx_hardening_flags(runtime_id: &str) -> Vec<String> {
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

/// `Claude Code-credentials-<first 8 hex of sha256(config dir)>`; tests pin two measured values.
pub(crate) fn claude_credentials_service(config_dir: &Path) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(config_dir.to_string_lossy().as_bytes());
    format!("Claude Code-credentials-{}", &hex_lower(&digest)[..8])
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
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

const MAX_PROBE_OUTPUT_BYTES: u64 = 1024 * 1024;

/// `Command::output()` waits forever, and a locked keychain or a networked wrapper
/// can hang session start. `None` means unknown, not failed.
pub(crate) fn bounded_output(
    command: std::process::Command,
    limit: std::time::Duration,
) -> Option<String> {
    crate::command_output::run(command, limit, MAX_PROBE_OUTPUT_BYTES).ok().map(|(_, stdout)| stdout)
}

/// `security add-generic-password` prints nothing either way, so only the exit status
/// proves a write; a false yes would delete the working credential links.
pub(crate) fn bounded_success(command: std::process::Command, limit: std::time::Duration) -> bool {
    crate::command_output::run(command, limit, MAX_PROBE_OUTPUT_BYTES)
        .map(|(success, _)| success)
        .unwrap_or(false)
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
pub(crate) fn claude_status_is_logged_out(stdout: &str) -> bool {
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

/// The terminal's login item when no `CLAUDE_CONFIG_DIR` is set.
const DEFAULT_CLAUDE_CREDENTIALS_SERVICE: &str = "Claude Code-credentials";

/// Not a precedence list; `choose_terminal_credential` decides.
pub(crate) fn terminal_login_services(home: &Path) -> Vec<String> {
    vec![
        DEFAULT_CLAUDE_CREDENTIALS_SERVICE.to_string(),
        claude_credentials_service(&home.join(".claude")),
    ]
}

/// Compared by digest and write time, never by handling the secret again.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CredentialCarrier {
    /// Never the secret.
    pub(crate) label: String,
    pub(crate) digest: String,
    /// Sortable UTC `YYYYMMDDhhmmss`; `None` when unknown.
    pub(crate) written: Option<String>,
    /// The account half of the item name decides whether Claude Code reads it; `None` for a file.
    pub(crate) account: Option<String>,
}

/// Agreeing carriers name the login; disagreeing ones are decided by the newest
/// write (the terminal rewrites the one it uses); anything else is `None` and nothing
/// is installed. Stamps must share one clock (UTC), and `claude auth status` cannot arbitrate.
pub(crate) fn choose_terminal_credential(carriers: &[CredentialCarrier]) -> Option<usize> {
    let first = carriers.first()?;
    if carriers
        .iter()
        .all(|carrier| carrier.digest == first.digest)
    {
        return Some(0);
    }
    if carriers.iter().any(|carrier| carrier.written.is_none()) {
        return None;
    }
    let newest = carriers
        .iter()
        .filter_map(|carrier| carrier.written.as_deref())
        .max()?;
    let mut latest = carriers
        .iter()
        .enumerate()
        .filter(|(_, carrier)| carrier.written.as_deref() == Some(newest));
    let (index, winner) = latest.next()?;
    if latest.any(|(_, carrier)| carrier.digest != winner.digest) {
        return None;
    }
    Some(index)
}

/// The digest is the only form of the secret compared, logged or kept.
pub(crate) fn credential_digest(secret: &str) -> String {
    use sha2::{Digest, Sha256};
    hex_lower(&Sha256::digest(secret.as_bytes()))
}

/// The sortable part is the leading digit run in the last quoted field.
pub(crate) fn parse_keychain_written(attributes: &str) -> Option<String> {
    let line = attributes.lines().find(|line| line.contains("\"mdat\""))?;
    let quoted = line.rsplit('"').nth(1)?;
    let stamp: String = quoted.chars().take_while(char::is_ascii_digit).collect();
    (stamp.len() == 14).then_some(stamp)
}

/// The account decides which of several same-service items Claude Code reads.
pub(crate) fn parse_keychain_account(attributes: &str) -> Option<String> {
    let line = attributes.lines().find(|line| line.contains("\"acct\""))?;
    let account = line.rsplit('"').nth(1)?.trim();
    (!account.is_empty()).then(|| account.to_string())
}

fn file_written(path: &Path) -> Option<String> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let stamp: chrono::DateTime<chrono::Utc> = modified.into();
    Some(stamp.format("%Y%m%d%H%M%S").to_string())
}

fn profile_fetched_at(account: Option<&serde_json::Value>) -> Option<i64> {
    account?.get("profileFetchedAt")?.as_i64()
}

/// The account name is a cache refreshed separately on each side, so the terminal's
/// copy travels only when it is not the staler (`profileFetchedAt`).
pub(crate) fn merge_oauth_account(
    app_document: Option<serde_json::Value>,
    terminal_document: &serde_json::Value,
) -> Option<serde_json::Value> {
    let account = terminal_document.get("oauthAccount")?.clone();
    let mut document = match app_document {
        Some(serde_json::Value::Object(map)) => serde_json::Value::Object(map),
        _ => serde_json::Value::Object(serde_json::Map::new()),
    };
    let installed = profile_fetched_at(document.get("oauthAccount"));
    if let (Some(installed), Some(arriving)) = (installed, profile_fetched_at(Some(&account))) {
        if installed > arriving {
            return None;
        }
    }
    document
        .as_object_mut()?
        .insert("oauthAccount".to_string(), account);
    Some(document)
}

/// Mirrors the terminal's login into the app-scoped keychain item before every
/// session, because that item shadows the linked file. Failure is silent.
/// The secret rides one `security` argv, as when Claude Code writes the item itself; only its digest is logged.
fn mirror_terminal_login(config_dir: &Path, home: &Path) -> bool {
    #[allow(unused_mut)]
    let mut mirrored = false;
    #[cfg(target_os = "macos")]
    {
        // Only the real home has a terminal login; tests would leave keychain litter.
        if std::env::var_os("HOME").map(PathBuf::from).as_deref() != Some(home) {
            return false;
        }

        let app_service = claude_credentials_service(config_dir);

        // The file counts as a carrier beside the keychain items.
        let mut secrets: Vec<String> = Vec::new();
        let mut carriers: Vec<CredentialCarrier> = Vec::new();
        for service in terminal_login_services(home) {
            let mut read = std::process::Command::new("security");
            read.args(["find-generic-password", "-s", &service, "-w"]);
            let Some(secret) = bounded_output(read, KEYCHAIN_PROBE_TIMEOUT) else {
                continue;
            };
            let secret = secret.trim_end_matches(['\n', '\r']).to_string();
            if secret.is_empty() {
                continue;
            }
            let mut show = std::process::Command::new("security");
            show.args(["find-generic-password", "-s", &service]);
            let attributes = bounded_output(show, KEYCHAIN_PROBE_TIMEOUT);
            let written = attributes.as_deref().and_then(parse_keychain_written);
            let account = attributes.as_deref().and_then(parse_keychain_account);
            carriers.push(CredentialCarrier {
                label: service,
                digest: credential_digest(&secret),
                written,
                account,
            });
            secrets.push(secret);
        }
        let terminal_file = home.join(".claude").join(".credentials.json");
        if let Ok(secret) = std::fs::read_to_string(&terminal_file) {
            let secret = secret.trim_end_matches(['\n', '\r']).to_string();
            if !secret.is_empty() {
                carriers.push(CredentialCarrier {
                    label: terminal_file.to_string_lossy().to_string(),
                    digest: credential_digest(&secret),
                    written: file_written(&terminal_file),
                    account: None,
                });
                secrets.push(secret);
            }
        }

        if let Some(chosen) = choose_terminal_credential(&carriers) {
            let carrier = &carriers[chosen];
            let account = mirror_account(&carriers, home);
            // Skip when identical so a locked keychain is not prompted. Reads are
            // account-qualified, or `security` answers with whichever item it reaches first.
            let mut read_app = std::process::Command::new("security");
            read_app.args([
                "find-generic-password",
                "-s",
                &app_service,
                "-a",
                &account,
                "-w",
            ]);
            let installed = bounded_output(read_app, KEYCHAIN_PROBE_TIMEOUT)
                .map(|secret| credential_digest(secret.trim_end_matches(['\n', '\r'])));
            if installed.as_deref() == Some(carrier.digest.as_str()) {
                log::info!("acp login already matches {}", carrier.label);
                mirrored = true;
            } else {
                let mut write = std::process::Command::new("security");
                write.args([
                    "add-generic-password",
                    "-U",
                    "-s",
                    &app_service,
                    "-a",
                    &account,
                    "-w",
                    &secrets[chosen],
                ]);
                // Only the exit status proves the write; a false yes would take down the symlink below.
                if bounded_success(write, KEYCHAIN_PROBE_TIMEOUT) {
                    log::info!(
                        "acp login mirrored from {} into the app-scoped keychain item for {account}",
                        carrier.label
                    );
                    mirrored = true;
                } else {
                    log::warn!(
                        "acp login not mirrored: writing the app-scoped keychain item for {account} failed"
                    );
                }
            }
            if mirrored && account != LEGACY_MIRROR_ACCOUNT {
                // The old-account copy is never read and makes unqualified reads ambiguous.
                let _ = std::process::Command::new("security")
                    .args([
                        "delete-generic-password",
                        "-s",
                        &app_service,
                        "-a",
                        LEGACY_MIRROR_ACCOUNT,
                    ])
                    .output();
            }
        } else if !carriers.is_empty() {
            // Never install a guess.
            log::info!(
                "acp login left alone: {} terminal carriers disagree and none is newest",
                carriers.len()
            );
        }

        let terminal_document = std::fs::read_to_string(home.join(".claude.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
        if let Some(terminal_document) = terminal_document {
            let app_path = config_dir.join(".claude.json");
            let app_document = std::fs::read_to_string(&app_path)
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
            if let Some(merged) = merge_oauth_account(app_document, &terminal_document) {
                if let Ok(text) = serde_json::to_string_pretty(&merged) {
                    let _ = std::fs::write(&app_path, text);
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (config_dir, home);
    }
    mirrored
}

/// Kept only to clear the unread legacy copy.
const LEGACY_MIRROR_ACCOUNT: &str = "claude";

/// Claude Code reads the account it writes, the login name; copy it from the
/// carriers, falling back to the home folder name.
fn mirror_account(carriers: &[CredentialCarrier], home: &Path) -> String {
    carriers
        .iter()
        .find_map(|carrier| carrier.account.clone())
        .or_else(|| {
            home.file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| LEGACY_MIRROR_ACCOUNT.to_string())
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

/// Judged by the absolute `toolCall.rawInput.file_path`, not the title, whose
/// wording varies. No path means ask.
pub(crate) fn permission_verdict(vault_root: &Path, file_path: Option<&str>) -> PermissionVerdict {
    let Some(raw) = file_path else {
        return PermissionVerdict::Ask;
    };
    let raw = Path::new(raw);
    // The root must be the absolute directory `acp_start` verified; empty or `/` would
    // open the whole gate.
    if !vault_root.is_absolute() || !raw.is_absolute() {
        return PermissionVerdict::Ask;
    }
    let Ok(root) = std::fs::canonicalize(vault_root) else {
        return PermissionVerdict::Ask;
    };
    // A root replaced by a link after start is refused: the boundary never moves mid-session.
    if root != vault_root || !root.is_dir() || root.parent().is_none() {
        return PermissionVerdict::Ask;
    }
    let resolved = resolve_for_comparison(raw);
    if resolved.starts_with(&root) {
        PermissionVerdict::AllowInsideVault
    } else {
        PermissionVerdict::Ask
    }
}

/// Canonicalizes the deepest existing ancestor and re-appends the rest: a new file
/// cannot be canonicalized (`/var` vs `/private/var`), yet an inside link pointing
/// outside must resolve.
fn resolve_for_comparison(path: &Path) -> PathBuf {
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return canonical;
    }
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor = path;
    loop {
        if let Ok(canonical) = std::fs::canonicalize(cursor) {
            let mut out = canonical;
            for part in rest.iter().rev() {
                out.push(part);
            }
            return out;
        }
        match (cursor.file_name(), cursor.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name.to_os_string());
                cursor = parent;
            }
            // No canonicalizable ancestor: compare as is.
            _ => return path.to_path_buf(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PermissionVerdict {
    AllowInsideVault,
    Ask,
}

/// Bounded so an adapter that never writes a newline cannot grow the buffer until the
/// app dies; an oversized line is dropped and reported, never truncated into bad JSON.
pub(crate) fn read_bounded_line<R: std::io::BufRead>(
    reader: &mut R,
    max_bytes: usize,
) -> std::io::Result<Option<Vec<u8>>> {
    let mut out: Vec<u8> = Vec::new();
    let mut oversized = false;
    loop {
        let available = match reader.fill_buf() {
            Ok(buf) => buf,
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        if available.is_empty() {
            if oversized {
                return Err(line_too_long(max_bytes));
            }
            return Ok(if out.is_empty() { None } else { Some(out) });
        }
        let newline = available.iter().position(|b| *b == b'\n');
        let content = &available[..newline.unwrap_or(available.len())];
        if !oversized && out.len() + content.len() > max_bytes {
            oversized = true;
            out = Vec::new();
        }
        if !oversized {
            out.extend_from_slice(content);
        }
        let consumed = content.len() + usize::from(newline.is_some());
        reader.consume(consumed);
        if newline.is_none() {
            continue;
        }
        if oversized {
            return Err(line_too_long(max_bytes));
        }
        // Lines ending in `\r\n` are accepted too.
        if out.last() == Some(&b'\r') {
            out.pop();
        }
        return Ok(Some(out));
    }
}

fn line_too_long(max_bytes: usize) -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!("acp line exceeded {max_bytes} bytes"),
    )
}

/// Generous because adapters may send a whole file in one line.
pub(crate) const MAX_LINE_BYTES: usize = 16 * 1024 * 1024;

const GRACEFUL_EXIT_WAIT: std::time::Duration = std::time::Duration::from_millis(1_000);

#[cfg(unix)]
fn process_is_running(pid: u32) -> bool {
    // Signal 0 only checks deliverability.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// A negative PID covers the whole group, so a TERM-ignoring grandchild is seen.
#[cfg(unix)]
fn process_group_is_running(pgid: u32) -> Result<bool, String> {
    if unsafe { libc::kill(-(pgid as i32), 0) } == 0 {
        return Ok(true);
    }
    let err = std::io::Error::last_os_error();
    match err.raw_os_error() {
        Some(libc::ESRCH) => Ok(false),
        // EPERM can appear while a TERMed group is reaped, so it counts as alive until the final signal.
        Some(libc::EPERM) => Ok(true),
        _ => Err(format!("failed to inspect process group {pgid}: {err}")),
    }
}

/// Group first: the adapter spawns CLIs, MCP servers and subagents that would outlive
/// the app. EPERM is not hidden as success, since the leader alone is not the tree.
#[cfg(unix)]
fn signal_group_or_leader(pid: u32, signal: i32) -> Result<(), String> {
    let group = -(pid as i32);
    if unsafe { libc::kill(group, signal) } == 0 {
        return Ok(());
    }
    let group_err = std::io::Error::last_os_error();
    match group_err.raw_os_error() {
        Some(libc::ESRCH) if !process_is_running(pid) => Ok(()),
        Some(libc::ESRCH) => {
            if unsafe { libc::kill(pid as i32, signal) } == 0 {
                return Ok(());
            }
            let leader_err = std::io::Error::last_os_error();
            if leader_err.raw_os_error() == Some(libc::ESRCH) || !process_is_running(pid) {
                return Ok(());
            }
            Err(format!("failed to signal {pid}: {leader_err}"))
        }
        Some(libc::EPERM) => {
            // Keep the error: nothing proves the grandchildren ended.
            if process_is_running(pid) {
                unsafe {
                    libc::kill(pid as i32, signal);
                }
            }
            Err(format!("failed to signal process group {pid}: {group_err}"))
        }
        _ => Err(format!("failed to signal group {pid}: {group_err}")),
    }
}

/// SIGTERM, up to one second, then SIGKILL. Windows uses `taskkill /T` without a
/// Job Object, so a grandchild may remain there.
pub(crate) fn terminate_tree(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        signal_group_or_leader(pid, libc::SIGTERM)?;
        let deadline = std::time::Instant::now() + GRACEFUL_EXIT_WAIT;
        while std::time::Instant::now() < deadline {
            if !process_group_is_running(pid)? {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        signal_group_or_leader(pid, libc::SIGKILL)
    }
    #[cfg(windows)]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|err| format!("taskkill failed: {err}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill exited with {status}"))
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        Err("terminate_tree is unsupported on this platform".into())
    }
}

pub(crate) type RealProbe = (
    fn(&Path) -> bool,
    fn(&Path) -> Vec<String>,
    fn(&Path) -> Option<String>,
    fn(&str, &Path, &[&str], &str) -> Option<bool>,
);

// Output goes to null: `claude auth status` prints the email and organization ID.
// One log line per probe keeps the id, exit code and duration, never output.
fn run_login_probe(runtime_id: &str, path: &Path, args: &[&str], child_path: &str) -> Option<bool> {
    use std::process::{Command, Stdio};
    let started = std::time::Instant::now();
    let mut command = Command::new(path);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // The rebuilt PATH, or the `claude` wrapper cannot find node and reads as signed out.
    apply_runtime_environment(&mut command, runtime_id, child_path);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            log::info!(
                "acp login probe: runtime={runtime_id} exit=spawn-failed({}) duration_ms={}",
                err.kind(),
                started.elapsed().as_millis()
            );
            return None;
        }
    };

    // A multiple of the measured times; past it, kill and answer unknown.
    let deadline = started + LOGIN_PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let verdict = classify_login_exit(status.code());
                log::info!(
                    "acp login probe: runtime={runtime_id} exit={:?} verdict={} duration_ms={}",
                    status.code(),
                    match verdict {
                        Some(true) => "signed-in",
                        Some(false) => "signed-out",
                        None => "unknown",
                    },
                    started.elapsed().as_millis()
                );
                return verdict;
            }
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    log::info!(
                        "acp login probe: runtime={runtime_id} exit=timeout verdict=unknown duration_ms={}",
                        started.elapsed().as_millis()
                    );
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(err) => {
                log::info!(
                    "acp login probe: runtime={runtime_id} exit=wait-failed({}) verdict=unknown duration_ms={}",
                    err.kind(),
                    started.elapsed().as_millis()
                );
                return None;
            }
        }
    }
}

pub(crate) fn real_probe() -> RealProbe {
    let is_executable = |path: &Path| -> bool {
        let Ok(meta) = std::fs::metadata(path) else {
            return false;
        };
        if !meta.is_file() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            meta.permissions().mode() & 0o111 != 0
        }
        #[cfg(not(unix))]
        {
            true
        }
    };
    let list_dir = |path: &Path| -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(path) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect()
    };
    // Reads only nvm's one-line `alias/default`, not arbitrary files.
    let read_text = |path: &Path| -> Option<String> {
        let meta = std::fs::metadata(path).ok()?;
        if !meta.is_file() || meta.len() > 4096 {
            return None;
        }
        std::fs::read_to_string(path).ok()
    };
    // Login is asked of the CLI, never read from credential files. Exit code only;
    // output is discarded. Failure or timeout is unknown, not signed out.
    let login_ok =
        |runtime_id: &str, path: &Path, args: &[&str], child_path: &str| -> Option<bool> {
            let first = run_login_probe(runtime_id, path, args, child_path);
            if first != Some(false) {
                return first;
            }
            // A signed-out answer is asked twice before it is shown: a load spike rarely
            // repeats, so disagreement reads as unknown rather than erasing a working tool.
            let second = run_login_probe(runtime_id, path, args, child_path);
            if second == Some(false) {
                Some(false)
            } else {
                None
            }
        };

    (is_executable, list_dir, read_text, login_ok)
}

/// A multiple of the measured times (claude 300ms, codex 45ms).
const LOGIN_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// A locked keychain waits on an unlock dialog, which must not eat session start.
const KEYCHAIN_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Only CLIs meeting all four conditions of `.claude/rules/surfaces.md`
/// ("Installing an agent tool for the user"): version pinned and installed under the
/// app's own prefix, never global npm or the system PATH.
pub(crate) const INSTALLABLE_CLI: &[(&str, &str)] = &[
    ("claude-acp", "@anthropic-ai/claude-code@2.1.237"),
    ("codex-acp", "@openai/codex@0.148.0"),
];

pub(crate) fn installable_package(runtime_id: &str) -> Option<&'static str> {
    INSTALLABLE_CLI
        .iter()
        .find(|(id, _)| *id == runtime_id)
        .map(|(_, pkg)| *pkg)
}

/// Nothing is written outside it.
pub(crate) fn managed_cli_prefix(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("managed-node")
}

/// Added to PATH candidates.
pub(crate) fn managed_cli_bin_dir(app_data_dir: &Path) -> PathBuf {
    managed_cli_prefix(app_data_dir).join("bin")
}

/// The literal command the screen shows before the press.
pub(crate) fn managed_install_command(runtime_id: &str, app_data_dir: &Path) -> Option<String> {
    let package = installable_package(runtime_id)?;
    Some(format!(
        "npm install --prefix {} --global {package}",
        managed_cli_prefix(app_data_dir).display()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::ffi::OsString;

    fn npx_package(runtime_id: &str) -> &'static str {
        match &registry_agent(runtime_id)
            .unwrap_or_else(|| panic!("missing registry agent: {runtime_id}"))
            .launch
        {
            RegistryLaunch::Npx { package, .. } => package,
            _ => panic!("runtime is not backed by npx: {runtime_id}"),
        }
    }

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
                "acp::tests::runtime_environment_probe_child",
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
                "acp::tests::runtime_environment_probe_child",
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
                    "acp::tests::runtime_environment_probe_child",
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

    pub(super) type ProbeClosures<'a> = (
        Box<dyn Fn(&Path) -> bool + 'a>,
        Box<dyn Fn(&Path) -> Vec<String> + 'a>,
        Box<dyn Fn(&Path) -> Option<String> + 'a>,
    );

    pub(super) fn probe_with<'a>(
        files: &'a HashSet<PathBuf>,
        dirs: &'a std::collections::HashMap<PathBuf, Vec<String>>,
    ) -> ProbeClosures<'a> {
        (
            Box::new(move |p: &Path| files.contains(p)),
            Box::new(move |p: &Path| dirs.get(p).cloned().unwrap_or_default()),
            Box::new(move |_: &Path| None),
        )
    }

    pub(super) fn empty_dirs() -> std::collections::HashMap<PathBuf, Vec<String>> {
        std::collections::HashMap::new()
    }

    fn test_bin_dir() -> PathBuf {
        PathBuf::from("/atlas-test-bin")
    }

    fn test_bin(name: &str) -> PathBuf {
        test_bin_dir().join(name)
    }

    fn test_path_env() -> OsString {
        std::env::join_paths([test_bin_dir()]).unwrap()
    }

    #[test]
    fn path_entries_come_before_our_guesses() {
        // The user's shell choice beats our guesses.
        let files = HashSet::new();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let path = std::env::join_paths([PathBuf::from("/from/path")]).unwrap();
        let out = candidate_bin_dirs(Some(Path::new("/home/me")), Some(&path), &probe, None, None);
        assert_eq!(out.first(), Some(&PathBuf::from("/from/path")));
        assert!(out.len() > 1, "well-known locations must be appended");
    }

    #[test]
    fn nvm_versions_are_offered_newest_first() {
        // String sorting would put v9 after v24.
        let files = HashSet::new();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec![
                "v9.11.2".into(),
                "v24.16.0".into(),
                "v20.11.1".into(),
                "not-a-version".into(),
            ],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = nvm_bin_dirs(Path::new("/home/me"), &probe);
        assert_eq!(
            out,
            vec![
                PathBuf::from("/home/me/.nvm/versions/node/v24.16.0/bin"),
                PathBuf::from("/home/me/.nvm/versions/node/v20.11.1/bin"),
                PathBuf::from("/home/me/.nvm/versions/node/v9.11.2/bin"),
            ],
            "versions sort numerically descending and non-version names are dropped"
        );
    }

    /// nvm directories hold stale global CLIs the user's shell never runs.
    #[cfg(not(windows))]
    #[test]
    fn a_stale_copy_in_an_old_nvm_version_does_not_beat_the_real_one() {
        let files: HashSet<PathBuf> = [
            "/home/me/.local/bin/claude",                      // the real one
            "/home/me/.nvm/versions/node/v22.15.0/bin/claude", // the stale copy
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v22.15.0".into(), "v24.16.0".into()],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(Some(Path::new("/home/me")), None, &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(
            claude.cli_path.as_deref(),
            Some("/home/me/.local/bin/claude"),
            "picked a stale nvm copy, not the binary the user shell runs"
        );
    }

    /// The nvm default beats the newest, or the adapter runs on a different Node.
    #[test]
    fn the_nvm_default_alias_wins_over_the_newest_version() {
        let files: HashSet<PathBuf> = [
            "/home/me/.nvm/versions/node/v20.11.1/bin/npx",
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v20.11.1".into(), "v24.16.0".into()],
        );
        let alias = PathBuf::from("/home/me/.nvm/alias/default");
        let is_exec = |p: &Path| files.contains(p);
        let list = |p: &Path| dirs.get(p).cloned().unwrap_or_default();
        let read = |p: &Path| {
            if p == alias.as_path() {
                Some("v20.11.1\n".to_string())
            } else {
                None
            }
        };
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = nvm_bin_dirs(Path::new("/home/me"), &probe);
        assert_eq!(
            out.first(),
            Some(&PathBuf::from("/home/me/.nvm/versions/node/v20.11.1/bin")),
            "the default version must come first"
        );
    }

    #[test]
    fn resolve_command_returns_none_instead_of_a_guessed_path() {
        let files = HashSet::new();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        assert_eq!(
            resolve_command("claude", &[PathBuf::from("/usr/bin")], &probe),
            None
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn detects_a_runtime_that_lives_only_under_nvm() {
        // codex and npx under nvm, claude in ~/.local/bin: both outside a GUI app's PATH.
        let files: HashSet<PathBuf> = [
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
            "/home/me/.nvm/versions/node/v24.16.0/bin/codex",
            "/home/me/.local/bin/claude",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v24.16.0".into()],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| Some(true),
        };

        let path =
            std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
        let out = detect_runtimes(Some(Path::new("/home/me")), Some(&path), &probe, None, None);

        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "ready", "must be found outside PATH");
        assert_eq!(
            claude.cli_path.as_deref(),
            Some("/home/me/.local/bin/claude")
        );
        assert_eq!(
            claude.adapter_path.as_deref(),
            Some("/home/me/.nvm/versions/node/v24.16.0/bin/npx"),
            "without an installed adapter, launch through npx"
        );
        assert_eq!(
            claude.adapter_package.as_deref(),
            Some(npx_package("claude-acp")),
            "detection must return the package pinned in the registry"
        );

        let codex = out.iter().find(|r| r.id == "codex-acp").unwrap();
        assert_eq!(codex.state, "ready");
    }

    #[test]
    fn missing_cli_and_missing_node_are_different_answers() {
        let mut files: HashSet<PathBuf> = HashSet::new();
        let dirs = empty_dirs();

        {
            let (is_exec, list, read) = probe_with(&files, &dirs);
            let probe = FsProbe {
                is_executable: &is_exec,
                list_dir: &list,
                read_text: &read,
                login_ok: &|_, _, _, _| None,
            };
            let out = detect_runtimes(None, None, &probe, None, None);
            let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
            assert_eq!(
                claude.state, "cli-missing",
                "a missing CLI wins because its next step is clearer"
            );
        }

        files.insert(test_bin("claude"));
        let path_env = test_path_env();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "node-missing");
        assert_eq!(
            claude.cli_path,
            Some(test_bin("claude").to_string_lossy().to_string())
        );
    }

    /// Installed is not signed in; `ready` must wait for the login probe.
    #[test]
    fn installed_but_not_logged_in_is_not_ready() {
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("claude"));
        files.insert(test_bin("npx"));
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);

        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| Some(true),
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "ready");

        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| Some(false),
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(
            claude.state, "login-needed",
            "an installed but signed-out CLI must not report ready",
        );

        // Unknown is neither signed out nor ready.
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(
            claude.state, "login-unknown",
            "an unanswered probe is neither signed out nor ready",
        );
    }

    // Only the measured exit code 1 means signed out; everything else is unknown.
    #[test]
    fn only_the_measured_logged_out_code_means_signed_out() {
        assert_eq!(
            classify_login_exit(Some(0)),
            Some(true),
            "exit 0 means signed in"
        );
        assert_eq!(
            classify_login_exit(Some(LOGIN_LOGGED_OUT_EXIT)),
            Some(false),
            "a measured signed-out code must report signed out, not unknown",
        );
        for code in [2, 3, 126, 127, 130, 255] {
            assert_eq!(
                classify_login_exit(Some(code)),
                None,
                "{code} means the run failed, not the sign-in state",
            );
        }
        assert_eq!(
            classify_login_exit(None),
            None,
            "a process killed by a signal says nothing about credentials",
        );
    }

    /// `login-unknown` still carries CLI and adapter paths.
    #[test]
    fn an_unknown_login_still_leaves_the_tool_launchable() {
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("npx"));
        files.insert(test_bin("claude"));
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "login-unknown");
        assert!(
            claude.cli_path.is_some(),
            "the detected CLI path must be kept"
        );
        assert!(
            claude.adapter_path.is_some(),
            "the adapter path must be kept"
        );
    }

    /// Never-measured runtimes stay `cli-unknown`; only asked ones can be `login-unknown`.
    #[test]
    fn we_never_asked_is_not_we_could_not_tell() {
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("npx"));
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
        assert!(
            out.iter().all(|s| s.state != "login-unknown"),
            "marked sign-in unknown on a runner that was never probed",
        );
    }

    #[test]
    fn we_only_ask_about_runtimes_we_measured() {
        use std::cell::RefCell;
        let asked: RefCell<Vec<String>> = RefCell::new(Vec::new());
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("npx"));
        for (id, _) in LOGIN_PROBE {
            let cli = registry()
                .iter()
                .find(|a| &a.id == id)
                .and_then(|a| a.cli.clone())
                .unwrap();
            files.insert(test_bin(&cli));
        }
        files.insert(test_bin("gemini"));
        let path_env = test_path_env();

        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, path: &Path, _, _| {
                asked.borrow_mut().push(path.to_string_lossy().to_string());
                Some(true)
            },
        };
        detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);

        let asked = asked.borrow();
        assert_eq!(
            asked.len(),
            LOGIN_PROBE.len(),
            "probe count differs from the table: {asked:?}"
        );
        assert!(
            !asked.iter().any(|p| Path::new(p)
                .file_name()
                .is_some_and(|name| name == "gemini")),
            "probed a tool whose status argument was never measured",
        );
    }

    /// The probe gets the launch PATH, or the `claude` wrapper misses node and reads as signed out.
    #[test]
    fn login_probe_gets_the_same_path_we_launch_with() {
        use std::cell::RefCell;

        let seen: RefCell<Vec<String>> = RefCell::new(Vec::new());
        let mut files: HashSet<PathBuf> = HashSet::new();
        for (id, _) in LOGIN_PROBE {
            let cli = registry()
                .iter()
                .find(|a| &a.id == id)
                .and_then(|a| a.cli.clone())
                .unwrap();
            files.insert(PathBuf::from(format!("/nvm/bin/{cli}")));
        }

        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let path_env = std::env::join_paths([PathBuf::from("/nvm/bin")]).unwrap();
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, child_path: &str| {
                seen.borrow_mut().push(child_path.to_string());
                Some(true)
            },
        };
        detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);

        let seen = seen.borrow();
        assert!(!seen.is_empty(), "no tool was probed");
        assert!(
            seen.iter().all(|p| p.contains("/nvm/bin")),
            "the detected location was not passed to the child: {seen:?}",
        );
    }

    /// Without a known CLI name, never "ready". No count is pinned; the registry grows.
    #[test]
    fn we_do_not_call_a_runtime_ready_when_we_never_checked_for_it() {
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("npx"));
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);

        for status in &out {
            let agent = registry().iter().find(|a| a.id == status.id).unwrap();
            if agent.cli.is_none() {
                // A launch reason such as `binary-missing` is fine; only "ready" is wrong.
                assert_ne!(
                    status.state, "ready",
                    "{}: reports ready without knowing its wrapped CLI",
                    status.id,
                );
            } else {
                assert_eq!(status.state, "cli-missing", "{}", status.id);
            }
        }

        assert_eq!(
            out.iter().filter(|s| s.state == "ready").count(),
            0,
            "a machine with no known CLI reports ready",
        );
        // Guards against running over an empty set.
        assert!(
            out.iter().filter(|s| s.state == "cli-unknown").count() > 0,
            "cli-unknown must be non-zero for this check to guard anything",
        );
    }

    #[test]
    fn an_installed_adapter_wins_over_npx() {
        let files: HashSet<PathBuf> = ["claude", "claude-agent-acp", "npx"]
            .iter()
            .map(|name| test_bin(name))
            .collect();
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| Some(true),
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "ready");
        assert_eq!(
            claude.adapter_path,
            Some(test_bin("claude-agent-acp").to_string_lossy().to_string()),
            "the installed adapter must be found"
        );
    }

    #[test]
    fn launch_prefers_an_installed_adapter_and_falls_back_to_pinned_npx() {
        let mut files: HashSet<PathBuf> = ["claude", "npx"]
            .iter()
            .map(|name| test_bin(name))
            .collect();
        let dirs = empty_dirs();
        let path_env = test_path_env();

        {
            let (is_exec, list, read) = probe_with(&files, &dirs);
            let probe = FsProbe {
                is_executable: &is_exec,
                list_dir: &list,
                read_text: &read,
                login_ok: &|_, _, _, _| None,
            };
            let launch = resolve_launch(
                "claude-acp",
                None,
                Some(path_env.as_os_str()),
                &probe,
                None,
                None,
            )
            .unwrap();
            assert_eq!(launch.program, test_bin("npx"));
            let cutoff = snapshot().npm_dependency_cutoff.as_deref().unwrap();
            assert_eq!(
                launch.args,
                vec![
                    "-y".to_string(),
                    format!("--before={cutoff}"),
                    npx_package("claude-acp").to_string()
                ],
                "without an install, launch through version-pinned npx under the dependency cutoff"
            );
            assert_eq!(npx_launch_package(&launch), Some(npx_package("claude-acp")));
        }

        files.insert(test_bin("claude-agent-acp"));
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let launch = resolve_launch(
            "claude-acp",
            None,
            Some(path_env.as_os_str()),
            &probe,
            None,
            None,
        )
        .unwrap();
        assert_eq!(launch.program, test_bin("claude-agent-acp"));
        assert!(launch.args.is_empty(), "an installed adapter skips npx");
    }

    #[cfg(not(windows))]
    #[test]
    fn launch_hands_the_child_a_path_that_can_find_the_real_cli() {
        // The adapter finds `claude` by name, so it needs the rebuilt PATH.
        let files: HashSet<PathBuf> = [
            "/home/me/.local/bin/claude",
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v24.16.0".into()],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let launch = resolve_launch(
            "claude-acp",
            Some(Path::new("/home/me")),
            None,
            &probe,
            None,
            None,
        )
        .unwrap();
        assert!(
            launch.path_env.contains("/home/me/.local/bin"),
            "child PATH lacks the CLI directory: {}",
            launch.path_env
        );
        assert!(
            launch
                .path_env
                .contains("/home/me/.nvm/versions/node/v24.16.0/bin"),
            "child PATH lacks the node directory: {}",
            launch.path_env
        );
    }

    #[test]
    fn launch_reports_which_half_is_missing() {
        let dirs = empty_dirs();
        let path_env = test_path_env();

        let none: HashSet<PathBuf> = HashSet::new();
        let (is_exec, list, read) = probe_with(&none, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        assert!(resolve_launch(
            "claude-acp",
            None,
            Some(path_env.as_os_str()),
            &probe,
            None,
            None
        )
        .unwrap_err()
        .starts_with("cli-missing:"));

        let cli_only: HashSet<PathBuf> = [test_bin("claude")].into_iter().collect();
        let (is_exec, list, read) = probe_with(&cli_only, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        assert_eq!(
            resolve_launch(
                "claude-acp",
                None,
                Some(path_env.as_os_str()),
                &probe,
                None,
                None
            )
            .unwrap_err(),
            "node-missing"
        );

        assert!(
            resolve_launch("nope", None, Some(path_env.as_os_str()), &probe, None, None)
                .unwrap_err()
                .starts_with("unknown-runtime:")
        );
    }

    #[test]
    fn bounded_line_reader_splits_lines_and_tolerates_crlf() {
        let mut input = std::io::BufReader::new(&b"{\"a\":1}\n{\"b\":2}\r\n"[..]);
        assert_eq!(
            read_bounded_line(&mut input, 1024).unwrap().as_deref(),
            Some(&b"{\"a\":1}"[..])
        );
        assert_eq!(
            read_bounded_line(&mut input, 1024).unwrap().as_deref(),
            Some(&b"{\"b\":2}"[..])
        );
        assert_eq!(read_bounded_line(&mut input, 1024).unwrap(), None);
    }

    #[test]
    fn bounded_line_reader_refuses_an_endless_line_instead_of_eating_memory() {
        let flood = vec![b'x'; 4096];
        let mut input = std::io::BufReader::new(&flood[..]);
        let err = read_bounded_line(&mut input, 64).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn bounded_line_reader_drops_the_oversized_line_and_keeps_reading() {
        // A truncated line would feed half a JSON to the parser; drop only that line.
        let mut data = vec![b'x'; 200];
        data.push(b'\n');
        data.extend_from_slice(b"{\"ok\":true}\n");
        let mut input = std::io::BufReader::new(&data[..]);
        assert!(read_bounded_line(&mut input, 64).is_err());
        assert_eq!(
            read_bounded_line(&mut input, 64).unwrap().as_deref(),
            Some(&b"{\"ok\":true}"[..]),
            "one oversized line must not kill the session"
        );
    }

    #[test]
    fn bounded_line_reader_drops_the_whole_oversized_line_across_buffer_refills() {
        let data = b"{\"a\":\"0123456789\"}\n{\"ok\":1}\n";
        let mut input = std::io::BufReader::with_capacity(8, &data[..]);
        assert!(read_bounded_line(&mut input, 10).is_err());
        assert_eq!(
            read_bounded_line(&mut input, 10).unwrap().as_deref(),
            Some(&b"{\"ok\":1}"[..]),
            "the tail of the dropped line must not come back as a line of its own"
        );
        assert_eq!(read_bounded_line(&mut input, 10).unwrap(), None);
    }

    /// Reaping is asynchronous.
    #[cfg(unix)]
    fn wait_until_gone(pid: u32, within: std::time::Duration) -> bool {
        let deadline = std::time::Instant::now() + within;
        while std::time::Instant::now() < deadline {
            if !process_is_running(pid) {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        !process_is_running(pid)
    }

    #[cfg(unix)]
    #[test]
    fn terminate_tree_reaps_grandchildren_that_a_naive_kill_would_orphan() {
        use std::io::{BufRead, BufReader};
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};

        // sh backgrounds a sleep, reports its pid, then sleeps itself.
        let spawn_tree = || {
            let mut child = Command::new("/bin/sh")
                .arg("-c")
                .arg("sleep 30 & echo $!; sleep 30")
                .stdout(Stdio::piped())
                .process_group(0)
                .spawn()
                .expect("failed to spawn sh");
            let mut out = BufReader::new(child.stdout.take().unwrap());
            let mut line = String::new();
            out.read_line(&mut line).unwrap();
            let grandchild: u32 = line
                .trim()
                .parse()
                .expect("failed to read the grandchild pid");
            (child, grandchild)
        };

        {
            let (mut child, grandchild) = spawn_tree();
            assert!(process_is_running(grandchild));
            child.kill().unwrap();
            let _ = child.wait();
            assert!(
                process_is_running(grandchild),
                "precondition broken: a plain kill also killed the grandchild, \
                 so this platform needs no tree cleanup"
            );
            let _ = terminate_tree(grandchild);
        }

        let (mut child, grandchild) = spawn_tree();
        assert!(process_is_running(grandchild));
        let leader_pid = child.id();
        // A separate thread reaps the leader as in the app; reaping afterwards tests an
        // EPERM state the app never has.
        let reaper = std::thread::spawn(move || child.wait());
        terminate_tree(leader_pid).expect("failed to terminate the tree");
        let _ = reaper.join();
        assert!(
            wait_until_gone(grandchild, std::time::Duration::from_secs(3)),
            "grandchild {grandchild} survived and would outlive the app"
        );
    }

    /// The app's wait thread can reap the leader right after SIGTERM, so a
    /// TERM-ignoring grandchild must still escalate to a kill.
    #[cfg(unix)]
    #[test]
    fn terminate_tree_escalates_after_the_group_leader_is_reaped() {
        use std::io::{BufRead, BufReader};
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};

        let mut leader = Command::new("/bin/sh")
            .arg("-c")
            // The outer sh keeps default TERM, so a group TERM ends only the leader first.
            .arg("/bin/sh -c 'trap \"\" TERM; echo $$; while :; do sleep 1; done' & wait")
            .stdout(Stdio::piped())
            .process_group(0)
            .spawn()
            .expect("failed to spawn the test process group");
        let leader_pid = leader.id();
        let mut out = BufReader::new(leader.stdout.take().unwrap());
        let mut line = String::new();
        out.read_line(&mut line).unwrap();
        let grandchild: u32 = line
            .trim()
            .parse()
            .expect("failed to read the TERM-ignoring grandchild pid");
        assert_eq!(
            unsafe { libc::getpgid(grandchild as i32) },
            leader_pid as i32,
            "the grandchild must stay in the leader process group"
        );

        assert_eq!(
            unsafe { libc::kill(-(leader_pid as i32), libc::SIGTERM) },
            0
        );
        let _ = leader.wait();
        assert!(
            process_is_running(grandchild),
            "the grandchild did not ignore TERM, so the early-return case was not set up"
        );

        let result = terminate_tree(leader_pid);
        let gone_before_cleanup =
            wait_until_gone(grandchild, std::time::Duration::from_millis(250));
        // Clean up the whole group before failing, so a red run leaves no processes.
        if !gone_before_cleanup {
            unsafe {
                libc::kill(-(leader_pid as i32), libc::SIGKILL);
            }
            let _ = wait_until_gone(grandchild, std::time::Duration::from_secs(3));
        }

        result.expect("failed to terminate the remaining process group");
        assert!(
            gone_before_cleanup,
            "returned when the leader exited and left TERM-ignoring grandchild {grandchild}"
        );
    }

    /// Otherwise app shutdown would show errors for nothing the user did.
    #[cfg(unix)]
    #[test]
    fn terminating_an_already_dead_process_is_not_an_error() {
        use std::process::{Command, Stdio};
        let mut child = Command::new("/bin/sh")
            .arg("-c")
            .arg("exit 0")
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id();
        let _ = child.wait();
        assert!(terminate_tree(pid).is_ok());
    }

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

    /// Uses `node`, which every platform building this repo has; missing `/bin/echo`
    /// on Windows made a spawn failure look like a working timeout.
    fn node_command(script: &str) -> std::process::Command {
        let mut cmd = std::process::Command::new("node");
        cmd.args(["-e", script]);
        cmd
    }

    #[test]
    fn bounded_output_returns_stdout_when_the_command_finishes() {
        let out = bounded_output(
            node_command("process.stdout.write('hello')"),
            std::time::Duration::from_secs(20),
        );
        assert_eq!(out.as_deref().map(str::trim), Some("hello"));
    }

    #[test]
    fn bounded_output_returns_none_when_the_program_does_not_exist() {
        // A spawn failure and a timeout both yield `None`, so this must not pass by accident.
        let cmd = std::process::Command::new("oatlas-no-such-program-anywhere");
        assert!(bounded_output(cmd, std::time::Duration::from_secs(5)).is_none());
    }

    #[test]
    fn bounded_success_separates_a_failed_command_from_a_silent_one() {
        // The keychain write prints nothing on success; a non-zero exit with empty output is not done.
        assert!(bounded_success(
            node_command("process.exit(0)"),
            std::time::Duration::from_secs(20),
        ));
        assert!(!bounded_success(
            node_command("process.exit(1)"),
            std::time::Duration::from_secs(20),
        ));
        assert_eq!(
            bounded_output(
                node_command("process.exit(1)"),
                std::time::Duration::from_secs(20),
            )
            .as_deref(),
            Some(""),
            "stdout alone cannot tell the two apart — which is why the status is read"
        );
    }

    #[test]
    fn bounded_success_is_false_when_the_program_does_not_exist() {
        let cmd = std::process::Command::new("oatlas-no-such-program-anywhere");
        assert!(!bounded_success(cmd, std::time::Duration::from_secs(5)));
    }

    #[test]
    fn bounded_output_kills_a_command_that_never_finishes() {
        // A broken bound costs 30 seconds and fails on wall-clock time too.
        let started = std::time::Instant::now();
        let out = bounded_output(
            node_command("setTimeout(() => {}, 30000)"),
            std::time::Duration::from_millis(400),
        );
        assert!(out.is_none(), "a command that never ends returned a value");
        assert!(
            started.elapsed() < std::time::Duration::from_secs(15),
            "the timeout did not apply: {:?}",
            started.elapsed()
        );
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

    /// The shown and executed string must carry `--prefix` and a pinned version.
    #[test]
    fn install_command_is_pinned_and_confined_to_our_own_prefix() {
        let app_data = Path::new("/tmp/atlas-app-data");
        let cmd = managed_install_command("claude-acp", app_data).unwrap();

        // Built with the same API so Windows separators compare correctly.
        let expected_prefix = managed_cli_prefix(app_data);
        assert!(
            cmd.contains(&format!("--prefix {}", expected_prefix.display())),
            "{cmd}"
        );
        assert!(cmd.contains("managed-node"), "{cmd}");
        assert!(cmd.contains("@anthropic-ai/claude-code@"), "{cmd}");
        assert!(!cmd.contains("@latest"), "{cmd}");
        let package = installable_package("claude-acp").unwrap();
        assert!(
            package
                .rsplit('@')
                .next()
                .is_some_and(|v| v.chars().next().is_some_and(|c| c.is_ascii_digit())),
            "version is not pinned: {package}"
        );
    }

    #[test]
    fn only_measured_runtimes_can_be_installed_for_the_user() {
        // Never propose installing an unverified package.
        assert!(managed_install_command("gemini-acp", Path::new("/tmp/x")).is_none());
        assert!(installable_package("gemini-acp").is_none());
        for (id, _) in INSTALLABLE_CLI {
            assert!(
                registry_agent(id).is_some(),
                "{id} is missing from the registry"
            );
        }
    }

    #[test]
    fn managed_bin_dir_is_last_so_the_users_own_tool_wins() {
        let probe = FsProbe {
            is_executable: &|_: &Path| true,
            list_dir: &|_: &Path| Vec::new(),
            read_text: &|_: &Path| None,
            login_ok: &|_: &str, _: &Path, _: &[&str], _: &str| None,
        };
        let managed = PathBuf::from("/app-data/managed-node/bin");
        let path = std::env::join_paths([Path::new("/usr/local/bin")]).unwrap();
        let dirs = candidate_bin_dirs(None, Some(&path), &probe, Some(&managed), None);

        assert_eq!(
            dirs.last(),
            Some(&managed),
            "the app-managed directory is not last"
        );
        assert!(dirs.len() > 1);
    }

    #[test]
    fn claude_keychain_service_matches_the_two_measured_items() {
        // Measured values; a drift would target, and could delete, someone else's item.
        assert_eq!(
            claude_credentials_service(Path::new("/Users/stark/.claude")),
            "Claude Code-credentials-ce4c8c26"
        );
        assert_eq!(
            claude_credentials_service(Path::new(
                "/Users/stark/Library/Application Support/dev.jinan.ontology-atlas/agent-config/claude-acp"
            )),
            "Claude Code-credentials-85f2eaa5"
        );
    }

    #[test]
    fn both_keychain_items_the_terminal_could_use_are_gathered_not_ranked() {
        let services = terminal_login_services(Path::new("/Users/probe"));
        // Listing order is not a ranking; `choose_terminal_credential` decides.
        assert!(services.contains(&"Claude Code-credentials".to_string()));
        assert!(services.contains(&claude_credentials_service(
            &Path::new("/Users/probe").join(".claude")
        )));
        assert_eq!(services.len(), 2);
    }

    fn carrier(label: &str, digest: &str, written: Option<&str>) -> CredentialCarrier {
        CredentialCarrier {
            label: label.to_string(),
            digest: digest.to_string(),
            written: written.map(str::to_string),
            account: None,
        }
    }

    #[test]
    fn the_newest_carrier_wins_when_the_terminals_carriers_disagree() {
        // Disagreeing carriers: recency decides (all stamps on the keychain's UTC clock).
        let chosen = choose_terminal_credential(&[
            carrier("Claude Code-credentials", "369750", Some("20260907231347")),
            carrier(
                "/Users/probe/.claude/.credentials.json",
                "811a39",
                Some("20260907222150"),
            ),
        ])
        .expect("the newest carrier to be named");
        assert_eq!(
            chosen, 0,
            "the keychain was written last, so the keychain is it"
        );

        // A local-clock file stamp would flip the answer; `file_written` normalizes to UTC.
        let mixed_clock = choose_terminal_credential(&[
            carrier("Claude Code-credentials", "369750", Some("20260907231347")),
            carrier(
                "/Users/probe/.claude/.credentials.json",
                "811a39",
                Some("20260908072150"),
            ),
        ])
        .expect("a winner to be named");
        assert_eq!(
            mixed_clock, 1,
            "a local-time stamp inverts the answer — the comparison only means something \
             when every carrier is dated on one clock"
        );
    }

    #[test]
    fn agreeing_carriers_need_no_tiebreak_at_all() {
        // Identical bytes need no stamps.
        let chosen = choose_terminal_credential(&[
            carrier("Claude Code-credentials", "811a39", None),
            carrier("/Users/probe/.claude/.credentials.json", "811a39", None),
        ]);
        assert_eq!(chosen, Some(0));
    }

    #[test]
    fn an_undecidable_set_of_carriers_installs_nothing() {
        assert_eq!(choose_terminal_credential(&[]), None);
        // A carrier without a stamp leaves us guessing, so nothing is chosen.
        assert_eq!(
            choose_terminal_credential(&[
                carrier("Claude Code-credentials", "369750", Some("20260907223551")),
                carrier("/Users/probe/.claude/.credentials.json", "811a39", None),
            ]),
            None
        );
        assert_eq!(
            choose_terminal_credential(&[
                carrier("Claude Code-credentials", "369750", Some("20260908072150")),
                carrier(
                    "/Users/probe/.claude/.credentials.json",
                    "811a39",
                    Some("20260908072150")
                ),
            ]),
            None
        );
        assert_eq!(
            choose_terminal_credential(&[carrier(
                "Claude Code-credentials",
                "369750",
                Some("20260907223551")
            )]),
            Some(0)
        );
    }

    #[test]
    fn the_keychains_last_written_stamp_is_read_off_its_attributes() {
        // Verbatim `security find-generic-password` output.
        let attributes = concat!(
            "keychain: \"/Users/probe/Library/Keychains/login.keychain-db\"\n",
            "    \"cdat\"<timedate>=0x32303236303632393139313831305A00  \"20260629191810Z\\000\"\n",
            "    \"mdat\"<timedate>=0x32303236303930373232333535315A00  \"20260907223551Z\\000\"\n",
            "    \"svce\"<blob>=\"Claude Code-credentials\"\n",
        );
        assert_eq!(
            parse_keychain_written(attributes).as_deref(),
            Some("20260907223551")
        );
        // No such attribute: the chooser refuses to guess.
        assert_eq!(parse_keychain_written("keychain: \"login\"\n"), None);
    }

    #[test]
    fn the_mirror_is_filed_under_the_account_claude_code_itself_reads() {
        // Verbatim output; the account is the macOS login name Claude Code reads.
        let attributes = concat!(
            "keychain: \"/Users/probe/Library/Keychains/login.keychain-db\"\n",
            "    \"acct\"<blob>=\"probe\"\n",
            "    \"mdat\"<timedate>=0x32303236303931393136353335395A00  \"20260919165359Z\\000\"\n",
            "    \"svce\"<blob>=\"Claude Code-credentials\"\n",
        );
        assert_eq!(parse_keychain_account(attributes).as_deref(), Some("probe"));
        assert_eq!(parse_keychain_account("keychain: \"login\"\n"), None);

        // The legacy literal `claude` account was never read by Claude Code.
        let keychain = CredentialCarrier {
            label: "Claude Code-credentials".to_string(),
            digest: "369750".to_string(),
            written: Some("20260919165359".to_string()),
            account: Some("probe".to_string()),
        };
        let file = CredentialCarrier {
            label: "/Users/probe/.claude/.credentials.json".to_string(),
            digest: "811a39".to_string(),
            written: Some("20260919091918".to_string()),
            account: None,
        };
        let home = Path::new("/Users/probe");
        assert_eq!(
            mirror_account(&[keychain.clone(), file.clone()], home),
            "probe",
            "the account comes from the evidence, not from a literal"
        );
        assert_eq!(
            mirror_account(&[file], home),
            "probe",
            "a file carrier has no account, so the home folder's own name stands in"
        );
        assert_ne!(mirror_account(&[keychain], home), LEGACY_MIRROR_ACCOUNT);
    }

    #[test]
    fn a_credential_is_only_ever_compared_as_a_digest() {
        let digest = credential_digest("a-token-shaped-string");
        assert_eq!(digest.len(), 64, "sha256 in lowercase hex");
        assert!(!digest.contains("a-token-shaped-string"));
        assert_eq!(digest, credential_digest("a-token-shaped-string"));
        assert_ne!(digest, credential_digest("a-different-token"));
    }

    #[test]
    fn the_terminal_account_is_carried_into_the_app_folder_without_losing_its_other_keys() {
        let terminal = serde_json::json!({ "oauthAccount": { "emailAddress": "new@example.com" }, "other": 1 });
        let app = serde_json::json!({ "oauthAccount": { "emailAddress": "old@example.com" }, "projects": {} });
        let merged = merge_oauth_account(Some(app), &terminal).expect("an account to carry");
        assert_eq!(merged["oauthAccount"]["emailAddress"], "new@example.com");
        assert!(merged.get("projects").is_some(), "the app's own keys stay");
        assert!(merged.get("other").is_none(), "only the account travels");
        let fresh = merge_oauth_account(None, &terminal).expect("an account to carry");
        assert_eq!(fresh["oauthAccount"]["emailAddress"], "new@example.com");
        assert!(merge_oauth_account(None, &serde_json::json!({})).is_none());
    }

    #[test]
    fn a_staler_terminal_account_does_not_overwrite_a_fresher_app_one() {
        // The staler terminal name must not overwrite the fresher app copy.
        let terminal = serde_json::json!({
            "oauthAccount": { "emailAddress": "old@example.com", "profileFetchedAt": 1785310202478i64 }
        });
        let app = serde_json::json!({
            "oauthAccount": { "emailAddress": "current@example.com", "profileFetchedAt": 1788821746365i64 }
        });
        assert!(
            merge_oauth_account(Some(app), &terminal).is_none(),
            "the fresher name stays and nothing is written"
        );

        let terminal = serde_json::json!({
            "oauthAccount": { "emailAddress": "switched@example.com", "profileFetchedAt": 1788821746365i64 }
        });
        let app = serde_json::json!({
            "oauthAccount": { "emailAddress": "left@example.com", "profileFetchedAt": 1785310202478i64 }
        });
        let merged = merge_oauth_account(Some(app), &terminal).expect("an account to carry");
        assert_eq!(
            merged["oauthAccount"]["emailAddress"],
            "switched@example.com"
        );

        let terminal = serde_json::json!({
            "oauthAccount": { "emailAddress": "same@example.com", "profileFetchedAt": 1788821746365i64 }
        });
        let app = serde_json::json!({
            "oauthAccount": { "emailAddress": "other@example.com", "profileFetchedAt": 1788821746365i64 }
        });
        let merged = merge_oauth_account(Some(app), &terminal).expect("an account to carry");
        assert_eq!(merged["oauthAccount"]["emailAddress"], "same@example.com");
    }

    #[test]
    fn claude_keychain_service_is_stable_and_path_sensitive() {
        let a = claude_credentials_service(Path::new("/tmp/a"));
        let b = claude_credentials_service(Path::new("/tmp/b"));
        assert_ne!(a, b, "different paths must yield different entry names");
        assert_eq!(a, claude_credentials_service(Path::new("/tmp/a")));
        assert!(a.starts_with("Claude Code-credentials-"));
        assert_eq!(a.len(), "Claude Code-credentials-".len() + 8);
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
    fn permission_policy_reads_the_path_not_the_title() {
        // Judged by path, not title text, which varies.
        let base = std::env::temp_dir().join(format!("atlas-acp-perm-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let session_root = std::fs::canonicalize(&vault).unwrap();

        assert_eq!(
            permission_verdict(
                &session_root,
                Some(vault.join("notes.md").to_str().unwrap())
            ),
            PermissionVerdict::AllowInsideVault
        );
        assert_eq!(
            permission_verdict(
                &session_root,
                Some(outside.join("notes.md").to_str().unwrap())
            ),
            PermissionVerdict::Ask,
            "a path outside the vault must ask"
        );
        assert_eq!(
            permission_verdict(&session_root, Some("../escape.md")),
            PermissionVerdict::Ask,
            "a relative path climbing out is outside"
        );
        assert_eq!(
            permission_verdict(&session_root, None),
            PermissionVerdict::Ask,
            "an unknown path must ask"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn permission_policy_rejects_invalid_vault_roots_instead_of_allowing_everything() {
        let base =
            std::env::temp_dir().join(format!("atlas-acp-invalid-root-{}", std::process::id()));
        let outside = base.join("outside.md");
        let not_a_directory = base.join("not-a-directory");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&outside, "outside").unwrap();
        std::fs::write(&not_a_directory, "file").unwrap();

        for invalid_root in [
            Path::new(""),
            Path::new("relative-vault"),
            Path::new("/"),
            base.join("missing").as_path(),
            not_a_directory.as_path(),
        ] {
            assert_eq!(
                permission_verdict(invalid_root, Some(outside.to_str().unwrap())),
                PermissionVerdict::Ask,
                "invalid vault root {invalid_root:?} must not auto-allow any path"
            );
        }

        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn permission_policy_rejects_a_session_root_replaced_by_an_outside_symlink() {
        let base =
            std::env::temp_dir().join(format!("atlas-acp-replaced-root-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let session_root = std::fs::canonicalize(&vault).unwrap();
        let secret = outside.join("secret.md");
        std::fs::write(&secret, "outside").unwrap();

        std::fs::remove_dir(&vault).unwrap();
        std::os::unix::fs::symlink(&outside, &vault).unwrap();

        assert_eq!(
            permission_verdict(&session_root, Some(secret.to_str().unwrap())),
            PermissionVerdict::Ask,
            "a root replaced by an outside link after session start must not be accepted"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_inside_the_vault_pointing_out_is_not_inside() {
        let base = std::env::temp_dir().join(format!("atlas-acp-link-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let session_root = std::fs::canonicalize(&vault).unwrap();
        let real = outside.join("secret.md");
        std::fs::write(&real, "x").unwrap();
        let trap = vault.join("looks-inside.md");
        std::os::unix::fs::symlink(&real, &trap).unwrap();

        assert_eq!(
            permission_verdict(&session_root, Some(trap.to_str().unwrap())),
            PermissionVerdict::Ask,
            "a link inside the vault that points outside is outside"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn the_registry_snapshot_is_loaded_and_every_entry_can_be_launched() {
        // An unreadable snapshot would make these checks pass on an empty set.
        let agents = registry();
        assert!(
            agents.len() >= 20,
            "registry snapshot is empty or too small: {}",
            agents.len()
        );

        for agent in agents {
            assert!(!agent.id.is_empty() && !agent.name.is_empty());
            match &agent.launch {
                RegistryLaunch::Npx { package, .. } => {
                    // An unpinned adapter could silently speak a different protocol.
                    assert!(
                        package.contains('@')
                            && package.rsplit('@').next().is_some_and(|v| v
                                .chars()
                                .next()
                                .is_some_and(|c| c.is_ascii_digit())),
                        "{} npx package has no version: {package}",
                        agent.id
                    );
                    assert!(
                        adapter_bin_name(package).is_some(),
                        "{}: cannot derive the executable name",
                        agent.id
                    );
                }
                RegistryLaunch::Uvx { package, .. } => assert!(!package.is_empty()),
                RegistryLaunch::Binary { command, .. } => {
                    assert!(!command.is_empty());
                    assert!(
                        !command.starts_with("./"),
                        "{}: `./` was not stripped",
                        agent.id
                    );
                }
            }
        }
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

    #[test]
    fn adapter_bin_name_strips_scope_and_version() {
        assert_eq!(
            adapter_bin_name("@agentclientprotocol/claude-agent-acp@0.68.0").as_deref(),
            Some("claude-agent-acp")
        );
        assert_eq!(
            adapter_bin_name("codex-acp@1.3.0").as_deref(),
            Some("codex-acp")
        );
        assert_eq!(adapter_bin_name("plain").as_deref(), Some("plain"));
    }
}

#[cfg(test)]
mod real_machine_probe {
    use super::*;

    /// Diagnostic against the real disk: `cargo test -- --ignored --nocapture`. Prints, never asserts.
    #[test]
    #[ignore]
    fn show_what_this_machine_has() {
        let (is_executable, list_dir, read_text, login_ok) = real_probe();
        let probe = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &login_ok,
        };
        let home = std::env::var_os("HOME").map(PathBuf::from);
        // A GUI app's minimal PATH, not the terminal's.
        let gui_path =
            std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
        for r in detect_runtimes(home.as_deref(), Some(&gui_path), &probe, None, None) {
            println!(
                "{:>8} · {:<14} cli={:?} adapter={:?} verified={:?}",
                r.state, r.id, r.cli_path, r.adapter_path, r.verified
            );
        }
        println!("--- launch ---");
        for id in ["claude-acp", "codex-acp"] {
            match resolve_launch(id, home.as_deref(), Some(&gui_path), &probe, None, None) {
                Ok(l) => println!("{id}: {:?} {:?}", l.program, l.args),
                Err(e) => println!("{id}: failed {e}"),
            }
        }
    }
}

#[cfg(test)]
mod timing_probe {
    use super::*;

    /// Timing diagnostic; `--ignored` only.
    #[test]
    #[ignore]
    fn how_slow_is_detect() {
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let path = std::env::var_os("PATH");
        let (is_executable, list_dir, read_text, login_ok) = real_probe();

        let skip = |_: &str, _: &Path, _: &[&str], _: &str| None;
        let fast = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &skip,
        };
        let t = std::time::Instant::now();
        let out = detect_runtimes(home.as_deref(), path.as_deref(), &fast, None, None);
        println!("without probe: {:?} · {}", t.elapsed(), out.len());

        let full = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &login_ok,
        };
        let t = std::time::Instant::now();
        let out = detect_runtimes(home.as_deref(), path.as_deref(), &full, None, None);
        println!("with probe: {:?} · {}", t.elapsed(), out.len());
    }
}

#[cfg(test)]
mod newcomer_view {
    use super::tests::{empty_dirs, probe_with};
    use super::*;
    use std::collections::HashSet;

    /// What the screen shows a machine with nothing installed; diagnostic.
    #[test]
    #[ignore]
    fn what_a_newcomer_sees() {
        let files: HashSet<PathBuf> = HashSet::new(); // Nothing exists
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, None, &probe, None, None);
        let mut by_state: std::collections::BTreeMap<&str, Vec<&str>> = Default::default();
        for s in &out {
            by_state.entry(s.state.as_str()).or_default().push(&s.id);
        }
        println!("-- machine with nothing installed --");
        for (state, ids) in &by_state {
            println!(
                "  {state:16} {}  e.g. {}",
                ids.len(),
                ids.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
            );
        }
        println!(
            "  verified on this computer = {}",
            out.iter().filter(|s| s.state == "ready").count()
        );

        // Only node, common among developers.
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(PathBuf::from("/usr/local/bin/npx"));
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, None, &probe, None, None);
        println!("-- machine with only npx --");
        let mut by_state: std::collections::BTreeMap<&str, usize> = Default::default();
        for s in &out {
            *by_state.entry(s.state.as_str()).or_default() += 1;
        }
        for (state, n) in &by_state {
            println!("  {state:16} {n}");
        }
        println!(
            "  verified = {}",
            out.iter().filter(|s| s.state == "ready").count()
        );
    }
}

// These checks reproduce the observed broken cache (node_modules present, `.bin`
// empty, no package.json) so disabling the healing turns them red.
#[cfg(test)]
mod npx_cache_tests {
    use super::*;

    struct EntryShape {
        package_json: Option<&'static str>,
        node_modules: bool,
        bin_entries: &'static [&'static str],
    }

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "atlas-acp-npx-{tag}-{}-{}",
            std::process::id(),
            ACP_SESSION_TEST_NONCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    static ACP_SESSION_TEST_NONCE: std::sync::atomic::AtomicU64 =
        std::sync::atomic::AtomicU64::new(0);

    fn build_entry(entry: &Path, shape: &EntryShape) {
        std::fs::create_dir_all(entry).unwrap();
        if let Some(text) = shape.package_json {
            std::fs::write(entry.join("package.json"), text).unwrap();
        }
        if shape.node_modules {
            let bin = entry.join("node_modules").join(".bin");
            std::fs::create_dir_all(&bin).unwrap();
            std::fs::create_dir_all(
                entry
                    .join("node_modules")
                    .join("@agentclientprotocol")
                    .join("claude-agent-acp"),
            )
            .unwrap();
            for name in shape.bin_entries {
                std::fs::write(bin.join(name), "#!/bin/sh\n").unwrap();
            }
        }
    }

    const CLAUDE_SPEC: &str = "@agentclientprotocol/claude-agent-acp@0.69.0";
    const HEALTHY_MANIFEST: &str = r#"{
  "dependencies": { "@agentclientprotocol/claude-agent-acp": "^0.69.0" },
  "_npx": { "packages": ["@agentclientprotocol/claude-agent-acp@0.69.0"] }
}"#;

    fn npx_launch(package: &str) -> AcpLaunch {
        AcpLaunch {
            program: PathBuf::from("/home/me/.nvm/versions/node/v24.16.0/bin/npx"),
            args: vec!["-y".to_string(), package.to_string()],
            path_env: String::new(),
        }
    }

    #[test]
    fn entry_dir_matches_npms_observed_hashes() {
        // Pinned to two measured directory names; a formula drift would make healing do nothing.
        let root = PathBuf::from("/Users/me/.npm/_npx");
        assert_eq!(
            npx_cache_entry_dir(&root, CLAUDE_SPEC),
            root.join("8757e2301903ae53"),
        );
        assert_eq!(
            npx_cache_entry_dir(&root, "@agentclientprotocol/codex-acp@1.4.0"),
            root.join("8adbf6f1a7dec4e5"),
        );
    }

    #[test]
    fn spots_the_owners_broken_cache_shape() {
        let dir = scratch("broken");
        let entry = dir.join("8757e2301903ae53");
        build_entry(
            &entry,
            &EntryShape {
                package_json: None,
                node_modules: true,
                bin_entries: &[],
            },
        );
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Broken("package-json-missing"),
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_a_completed_install() {
        let dir = scratch("healthy");
        let entry = dir.join("entry");
        build_entry(
            &entry,
            &EntryShape {
                package_json: Some(HEALTHY_MANIFEST),
                node_modules: true,
                bin_entries: &["claude-agent-acp"],
            },
        );
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Usable
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn spots_unlinked_bins_and_unparseable_manifests() {
        // Download finished but linking was cut off; npx never heals this.
        let dir = scratch("nobin");
        let entry = dir.join("entry");
        build_entry(
            &entry,
            &EntryShape {
                package_json: Some(HEALTHY_MANIFEST),
                node_modules: true,
                bin_entries: &[],
            },
        );
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Broken("bin-links-missing"),
        );
        std::fs::write(entry.join("package.json"), "{\"dependencies\": {").unwrap();
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Broken("package-json-unparseable"),
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn leaves_a_foreign_entry_alone() {
        // Another spec's marker means someone else's entry: never delete it.
        let dir = scratch("foreign");
        let entry = dir.join("entry");
        build_entry(
            &entry,
            &EntryShape {
                package_json: Some(r#"{ "_npx": { "packages": ["somebody-else@9.9.9"] } }"#),
                node_modules: true,
                bin_entries: &[],
            },
        );
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Usable
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn preflight_removes_only_the_broken_entry() {
        let home = scratch("home");
        let root = npx_cache_root(Some(&home)).unwrap();
        let ours = npx_cache_entry_dir(&root, CLAUDE_SPEC);
        build_entry(
            &ours,
            &EntryShape {
                package_json: None,
                node_modules: true,
                bin_entries: &[],
            },
        );
        let neighbor = root.join("deadbeefdeadbeef");
        build_entry(
            &neighbor,
            &EntryShape {
                package_json: Some(r#"{ "_npx": { "packages": ["other@1.0.0"] } }"#),
                node_modules: true,
                bin_entries: &["other"],
            },
        );

        let verdict = preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home));
        assert_eq!(
            verdict,
            NpxCachePreflight::HealedBrokenEntry {
                reason: "package-json-missing"
            },
        );
        assert!(!ours.exists(), "the broken entry must be removed");
        assert!(
            neighbor
                .join("node_modules")
                .join(".bin")
                .join("other")
                .exists(),
            "a neighbouring foreign entry must stay"
        );

        assert_eq!(
            preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home)),
            NpxCachePreflight::FirstDownload,
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn preflight_reports_a_ready_cache_and_ignores_non_npx_launches() {
        let home = scratch("ready");
        let root = npx_cache_root(Some(&home)).unwrap();
        build_entry(
            &npx_cache_entry_dir(&root, CLAUDE_SPEC),
            &EntryShape {
                package_json: Some(HEALTHY_MANIFEST),
                node_modules: true,
                bin_entries: &["claude-agent-acp"],
            },
        );
        assert_eq!(
            preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home)),
            NpxCachePreflight::CacheReady,
        );

        let installed = AcpLaunch {
            program: PathBuf::from("/usr/local/bin/claude-agent-acp"),
            args: vec![],
            path_env: String::new(),
        };
        assert_eq!(
            preflight_npx_cache(&installed, Some(&home)),
            NpxCachePreflight::NotNpx,
        );
        assert_eq!(
            preflight_npx_cache(&npx_launch(CLAUDE_SPEC), None),
            NpxCachePreflight::CacheUnknown,
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    fn plant_adapter(home: &Path, installed_version: &str) -> PathBuf {
        let entry = npx_cache_entry_dir(&npx_cache_root(Some(home)).unwrap(), CLAUDE_SPEC);
        build_entry(
            &entry,
            &EntryShape {
                package_json: Some(HEALTHY_MANIFEST),
                node_modules: true,
                bin_entries: &[],
            },
        );
        let package = adapter_package(&entry);
        let manifest = serde_json::json!({
            "version": installed_version,
            "bin": { "claude-agent-acp": "dist/index.js" },
        });
        std::fs::write(package.join("package.json"), manifest.to_string()).unwrap();
        std::fs::create_dir_all(package.join("dist")).unwrap();
        std::fs::write(
            package.join("dist").join("index.js"),
            "#!/usr/bin/env node\n",
        )
        .unwrap();
        link_bin(
            &entry,
            Path::new("../@agentclientprotocol/claude-agent-acp/dist/index.js"),
        );
        entry
    }

    #[cfg(unix)]
    fn adapter_package(entry: &Path) -> PathBuf {
        entry
            .join("node_modules")
            .join("@agentclientprotocol")
            .join("claude-agent-acp")
    }

    #[cfg(unix)]
    fn link_bin(entry: &Path, target: &Path) {
        let link = entry
            .join("node_modules")
            .join(".bin")
            .join("claude-agent-acp");
        let _ = std::fs::remove_file(&link);
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_ready_entry_launches_its_pinned_bin_without_npm_exec() {
        let home = scratch("direct");
        let entry = plant_adapter(&home, "0.69.0");
        let mut launch = npx_launch(CLAUDE_SPEC);
        launch
            .args
            .insert(1, "--before=2026-01-01T00:00:00.000Z".to_string());
        launch.args.push("--acp".to_string());
        launch.path_env = "/opt/node/bin".to_string();

        let direct = launch_from_npx_cache(&launch, Some(&home), &|_| true).expect("direct launch");

        let bin = entry.join("node_modules").join(".bin");
        assert_eq!(direct.program, bin.join("claude-agent-acp"));
        assert_eq!(direct.args, vec!["--acp".to_string()]);
        let path_env = std::env::join_paths([bin, PathBuf::from("/opt/node/bin")]).unwrap();
        assert_eq!(direct.path_env, path_env.to_string_lossy());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn a_bin_link_that_is_not_the_checked_packages_bin_is_not_run() {
        let home = scratch("direct-planted");
        let launch = npx_launch(CLAUDE_SPEC);
        let entry = plant_adapter(&home, "0.69.0");
        let planted = home.join("planted.sh");
        std::fs::write(&planted, "#!/bin/sh\n").unwrap();

        link_bin(&entry, &planted);
        assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);

        let bin = entry
            .join("node_modules")
            .join(".bin")
            .join("claude-agent-acp");
        std::fs::remove_file(&bin).unwrap();
        std::fs::write(&bin, "#!/bin/sh\n").unwrap();
        assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);

        let leaving = serde_json::json!({
            "version": "0.69.0",
            "bin": { "claude-agent-acp": planted },
        });
        std::fs::write(
            adapter_package(&entry).join("package.json"),
            leaving.to_string(),
        )
        .unwrap();
        link_bin(&entry, &planted);
        assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn a_direct_launch_needs_the_exact_pinned_version_and_a_runnable_bin() {
        let home = scratch("direct-refused");
        let launch = npx_launch(CLAUDE_SPEC);
        plant_adapter(&home, "0.70.0");
        assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);

        plant_adapter(&home, "0.69.0");
        assert_eq!(
            launch_from_npx_cache(&launch, Some(&home), &|_| false),
            None
        );

        let unpinned = npx_launch("@agentclientprotocol/claude-agent-acp");
        assert_eq!(
            launch_from_npx_cache(&unpinned, Some(&home), &|_| true),
            None
        );
        let installed = AcpLaunch {
            program: PathBuf::from("/usr/local/bin/claude-agent-acp"),
            args: vec![],
            path_env: String::new(),
        };
        assert_eq!(
            launch_from_npx_cache(&installed, Some(&home), &|_| true),
            None
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn cache_root_honors_the_users_npmrc_override() {
        let home = scratch("npmrc");
        std::fs::write(
            home.join(".npmrc"),
            "cache-min=999\ncache = ~/custom-cache\n",
        )
        .unwrap();
        assert_eq!(
            npx_cache_root(Some(&home)),
            Some(home.join("custom-cache").join("_npx")),
        );

        let plain = scratch("plainhome");
        let expected = if cfg!(windows) {
            plain
                .join("AppData")
                .join("Local")
                .join("npm-cache")
                .join("_npx")
        } else {
            plain.join(".npm").join("_npx")
        };
        assert_eq!(npx_cache_root(Some(&plain)), Some(expected));
        let _ = std::fs::remove_dir_all(&home);
        let _ = std::fs::remove_dir_all(&plain);
    }

    #[test]
    fn dir_size_counts_files_under_the_entry() {
        let dir = scratch("size");
        std::fs::create_dir_all(dir.join("a").join("b")).unwrap();
        std::fs::write(dir.join("a").join("one"), vec![0u8; 1000]).unwrap();
        std::fs::write(dir.join("a").join("b").join("two"), vec![0u8; 500]).unwrap();
        assert_eq!(dir_size_bytes(&dir), 1500);
        assert_eq!(dir_size_bytes(&dir.join("missing")), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_vault_or_repo_bin_never_reaches_the_adapter_path() {
        let base = scratch("adapter-path");
        let repo = base.join("repo");
        let vault = repo.join("atlas");
        std::fs::create_dir_all(vault.join("node_modules/.bin")).unwrap();
        std::fs::create_dir_all(repo.join("node_modules/.bin")).unwrap();
        let repo = std::fs::canonicalize(&repo).unwrap();
        let vault = std::fs::canonicalize(&vault).unwrap();

        let path_env = std::env::join_paths([
            vault.join("node_modules/.bin"),
            repo.join("node_modules/.bin"),
            PathBuf::from("node_modules/.bin"),
            PathBuf::from("relative/tool/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/opt/other/node_modules/.bin"),
        ])
        .unwrap()
        .to_string_lossy()
        .into_owned();

        let cleaned = path_without_vault_node_modules_bin(&path_env, &vault, Some(&repo));
        let entries: Vec<PathBuf> = std::env::split_paths(&OsString::from(cleaned)).collect();

        assert!(!entries.iter().any(|entry| entry.starts_with(&vault)));
        assert!(!entries.iter().any(|entry| entry.starts_with(&repo)));
        assert!(!entries.iter().any(|entry| entry.is_relative()));
        assert!(entries.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(entries.contains(&PathBuf::from("/usr/bin")));
        assert!(entries.contains(&PathBuf::from("/opt/other/node_modules/.bin")));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn the_process_path_sanitizer_drops_empty_and_relative_entries() {
        let cleaned = sanitized_process_path(OsStr::new(
            "/usr/bin::relative/bin:node_modules/.bin:/opt/homebrew/bin",
        ));
        let entries: Vec<PathBuf> = std::env::split_paths(&cleaned).collect();
        assert_eq!(
            entries,
            vec![
                PathBuf::from("/usr/bin"),
                PathBuf::from("/opt/homebrew/bin")
            ]
        );
    }
}
