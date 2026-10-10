use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use super::command_lookup::{candidate_bin_dirs, resolve_command, FsProbe};
use super::registry::{registry_agent, RegistryLaunch};
use super::runtime_environment::npx_hardening_flags;

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

pub(super) fn adapter_bin_name(package: &str) -> Option<String> {
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

#[cfg(test)]
mod tests;
