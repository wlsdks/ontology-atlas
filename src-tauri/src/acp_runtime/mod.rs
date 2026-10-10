use crate::{acp, acp_doctor, managed_node};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{Emitter, Manager};

/// Reads only. With `probe_login` it briefly launches each CLI and reads the exit code;
/// the screen calls once without it to draw fast, then again to correct.
#[tauri::command(async)]
pub(crate) fn acp_detect_runtimes(
    app: tauri::AppHandle,
    probe_login: Option<bool>,
) -> Vec<acp::AcpRuntimeStatus> {
    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let skip = |_: &str, _: &std::path::Path, _: &[&str], _: &str| None;
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: if probe_login.unwrap_or(false) {
            &login_ok
        } else {
            &skip
        },
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let path = std::env::var_os("PATH");
    // Include app installs, or the screen still says installation is required.
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths.as_deref().map(acp::managed_cli_bin_dir);
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(managed_node::managed_node_bin_dir);
    acp::detect_runtimes(
        home.as_deref(),
        path.as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    )
}

/// Only known values are sent: `received`/`total` for the Node download, npm's last
/// actual line as `note`, never an invented percentage.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpInstallProgress {
    runtime_id: String,
    /// The screen owns the wording.
    job: &'static str,
    stage: &'static str,
    received: Option<u64>,
    total: Option<u64>,
    /// The tool's own line.
    note: Option<String>,
    /// Epoch ms, so an old completion is not shown as fresh.
    at: u64,
}

/// Contract with the TS side: a wrong payload key discards every event silently,
/// so the test pins the serialized keys.
const ACP_INSTALL_PROGRESS_EVENT: &str = "acp-install://progress";

/// The settings sheet unmounts when closed and one-shot `done` would be missed, so the
/// process that owns the install keeps the last state per tool.
#[derive(Default)]
pub(crate) struct AcpInstallProgressState {
    /// Per tool, or one install overwrites another's completion.
    last: Mutex<HashMap<String, AcpInstallProgress>>,
}

fn emit_install_progress(
    app: &tauri::AppHandle,
    runtime_id: &str,
    job: &'static str,
    stage: &'static str,
    received: Option<u64>,
    total: Option<u64>,
    note: Option<String>,
) {
    let payload = AcpInstallProgress {
        runtime_id: runtime_id.to_string(),
        job,
        stage,
        received,
        total,
        note,
        at: std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    };
    // Record first, or a screen asking right after the event reads a stale value.
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.insert(runtime_id.to_string(), payload.clone());
        }
    }
    let _ = app.emit(ACP_INSTALL_PROGRESS_EVENT, payload);
}

/// The screen asks once on remount so a completion is not missed.
#[tauri::command]
pub(crate) fn acp_install_progress(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Option<AcpInstallProgress> {
    let state = app.try_state::<AcpInstallProgressState>()?;
    let last = state.last.lock().ok()?;
    last.get(&runtime_id).cloned()
}

/// Otherwise a stale "installed" resurfaces after a re-check; the screen clears its state too.
fn forget_install_progress(app: &tauri::AppHandle, runtime_id: &str) {
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.remove(runtime_id);
        }
    }
}

/// `None` means an unlisted platform.
#[tauri::command]
pub(crate) fn acp_node_plan() -> Option<String> {
    managed_node::managed_node_plan()
}

/// Only on a click, after showing the source, inside `<app-data>/runtimes/node`, with a
/// pinned version and a verified hash.
#[tauri::command(async)]
pub(crate) fn acp_install_node(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    let reporter = |stage: &'static str, received: Option<u64>, total: Option<u64>| {
        emit_install_progress(&app, &runtime_id, "node", stage, received, total, None);
    };
    managed_node::ensure_managed_node(&app_data, &reporter).inspect_err(|_| {
        emit_install_progress(&app, &runtime_id, "node", "failed", None, None, None);
    })?;
    emit_install_progress(
        &app,
        &runtime_id,
        "node",
        "verifying-install",
        None,
        None,
        None,
    );
    let after = doctor_context(&app, &runtime_id)?;
    emit_install_progress(&app, &runtime_id, "node", "done", None, None, None);
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// The screen shows the raw command before the press; `None` leaves only the guide link.
#[tauri::command]
pub(crate) fn acp_install_plan(app: tauri::AppHandle, runtime_id: String) -> Option<String> {
    let app_data = app.path().app_data_dir().ok()?;
    acp::managed_install_command(&runtime_id, &app_data)
}

/// Only on a user press, after `acp_install_plan` showed the command, under `--prefix
/// <app-data>/managed-node`, pinned by `INSTALLABLE_CLI`; the result is
/// re-verified before claiming success.
#[tauri::command(async)]
pub(crate) fn acp_install_cli(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let package = acp::installable_package(&runtime_id)
        .ok_or_else(|| format!("not-installable:{runtime_id}"))?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    let prefix = acp::managed_cli_prefix(&app_data);
    std::fs::create_dir_all(&prefix).map_err(|err| format!("prefix-failed:{err}"))?;

    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    // The bundled npm is the fallback when the system has none.
    let managed_node_bin = managed_node::managed_node_bin_dir(&app_data);
    let dirs = acp::candidate_bin_dirs(
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        None,
        managed_node_bin.as_deref(),
    );
    // Never by name: a GUI app's PATH differs from the shell's.
    let npm =
        acp::resolve_command("npm", &dirs, &probe).ok_or_else(|| "npm-missing".to_string())?;
    let child_path = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    emit_install_progress(&app, &runtime_id, "cli", "installing", None, None, None);

    let mut command = Command::new(&npm);
    command
        .arg("install")
        .arg("--prefix")
        .arg(&prefix)
        .arg("--global")
        .arg(package)
        .env("PATH", &child_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Stream stderr instead of `.output()`, which returns only at exit; the tool's own
    // lines are pushed, never invented percentages.
    let mut child = command
        .spawn()
        .map_err(|err| format!("install-failed:{err}"))?;
    let stderr_pipe = child.stderr.take();
    let tail = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let pump = stderr_pipe.map(|pipe| {
        let app = app.clone();
        let runtime_id = runtime_id.clone();
        let tail = std::sync::Arc::clone(&tail);
        std::thread::spawn(move || {
            use std::io::BufRead;
            for line in std::io::BufReader::new(pipe).lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(mut slot) = tail.lock() {
                    slot.clear();
                    slot.push_str(trimmed);
                }
                emit_install_progress(
                    &app,
                    &runtime_id,
                    "cli",
                    "installing",
                    None,
                    None,
                    Some(trimmed.to_string()),
                );
            }
        })
    });
    let status = child
        .wait()
        .map_err(|err| format!("install-failed:{err}"))?;
    if let Some(handle) = pump {
        let _ = handle.join();
    }
    if !status.success() {
        // Only the last line; hundreds of npm lines are not guidance.
        let last = tail.lock().map(|slot| slot.clone()).unwrap_or_default();
        emit_install_progress(&app, &runtime_id, "cli", "failed", None, None, None);
        return Err(format!("install-failed:{last}"));
    }

    // Report re-verifying, then the verified value.
    emit_install_progress(
        &app,
        &runtime_id,
        "cli",
        "verifying-install",
        None,
        None,
        None,
    );
    let after = doctor_context(&app, &runtime_id)?;
    emit_install_progress(&app, &runtime_id, "cli", "done", None, None, None);
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Returns facts per step; the screen writes the sentences.
#[tauri::command(async)]
pub(crate) fn acp_diagnose(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    // The screen clears its state at the same moment.
    forget_install_progress(&app, &runtime_id);
    let ctx = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&ctx.borrow()))
}

/// Only `fixable` items arrive.
#[tauri::command(async)]
pub(crate) fn acp_repair(
    app: tauri::AppHandle,
    runtime_id: String,
    check_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let ctx = doctor_context(&app, &runtime_id)?;
    acp_doctor::repair(&ctx.borrow(), &check_id)?;
    // Return the re-verified state, never a bare claim of success.
    let after = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Returns the re-verified value, never a bare claim.
#[tauri::command(async)]
pub(crate) fn acp_reset_connection(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let ctx = doctor_context(&app, &runtime_id)?;
    acp_doctor::reset_connection(&ctx.borrow())?;
    let after = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Owned values; `borrow()` converts them.
struct OwnedDoctorContext {
    runtime_id: String,
    home: Option<PathBuf>,
    app_data_dir: PathBuf,
    cli: Option<PathBuf>,
    launcher: Option<PathBuf>,
    path_env: String,
    isolated_logged_out: Option<bool>,
    shadow_present: Option<bool>,
}

impl OwnedDoctorContext {
    fn borrow(&self) -> acp_doctor::DoctorContext<'_> {
        acp_doctor::DoctorContext {
            runtime_id: &self.runtime_id,
            home: self.home.as_deref(),
            app_data_dir: &self.app_data_dir,
            cli: self.cli.as_deref(),
            launcher: self.launcher.as_deref(),
            path_env: &self.path_env,
            isolated_logged_out: self.isolated_logged_out,
            shadow_present: self.shadow_present,
        }
    }
}

fn doctor_context(app: &tauri::AppHandle, runtime_id: &str) -> Result<OwnedDoctorContext, String> {
    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let path = std::env::var_os("PATH");
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths.as_deref().map(acp::managed_cli_bin_dir);
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(managed_node::managed_node_bin_dir);
    let dirs = acp::candidate_bin_dirs(
        home.as_deref(),
        path.as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    );
    let path_env = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    let agent =
        acp::registry_agent(runtime_id).ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;
    let cli = agent
        .cli
        .as_deref()
        .and_then(|name| acp::resolve_command(name, &dirs, &probe));
    let launcher = acp::resolve_launch(
        runtime_id,
        home.as_deref(),
        path.as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    )
    .ok()
    .map(|launch| launch.program);

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;

    // Ask against the app-owned folder the session actually uses.
    let isolated = app_data_dir.join("agent-config").join(runtime_id);
    let isolated_logged_out = cli
        .as_deref()
        .filter(|_| acp::config_env_for(runtime_id).is_some())
        .and_then(|path| acp::probe_isolated_logged_out(path, &isolated, &path_env));
    let shadow_present = acp::shadow_credentials_present(&isolated);

    Ok(OwnedDoctorContext {
        runtime_id: runtime_id.to_string(),
        home,
        app_data_dir,
        cli,
        launcher,
        path_env,
        isolated_logged_out,
        shadow_present,
    })
}

#[cfg(test)]
mod acp_install_progress_tests {
    use super::*;

    // `rename_all = "camelCase"` is the contract: the screen
    // (`src/features/acp-doctor/model/acp-doctor.ts`) filters by `payload.runtimeId`, and a
    // wrong key discards every event silently.
    #[test]
    fn progress_payload_uses_the_keys_the_screen_reads() {
        let json = serde_json::to_value(AcpInstallProgress {
            runtime_id: "claude-acp".to_string(),
            job: "node",
            stage: "downloading",
            received: Some(26_043_779),
            total: Some(52_087_559),
            note: None,
            at: 1_787_000_000_000,
        })
        .expect("progress payload should serialize");

        let object = json.as_object().expect("payload should be a JSON object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![
                "at",
                "job",
                "note",
                "received",
                "runtimeId",
                "stage",
                "total"
            ],
            "key differs from the one the UI reads, so progress would vanish"
        );
        assert_eq!(object["runtimeId"], "claude-acp");
        assert_eq!(object["received"], 26_043_779u64);
        // Unknown is null, not absent; the screen decides on percentages from it.
        assert!(object["note"].is_null());
    }

    #[test]
    fn progress_event_name_matches_the_listener() {
        assert_eq!(ACP_INSTALL_PROGRESS_EVENT, "acp-install://progress");
    }
}
