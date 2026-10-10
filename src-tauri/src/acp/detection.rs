use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use super::command_lookup::{candidate_bin_dirs, resolve_command, FsProbe};
use super::isolation::isolation_for;
use super::launch::adapter_bin_name;
use super::login_probe::login_probe_args;
use super::registry::{registry, RegistryLaunch};

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

fn to_string_lossy(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests;
