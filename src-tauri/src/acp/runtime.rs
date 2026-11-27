use crate::acp::install::adapter::{self, AdapterFetches, AdapterReadiness};
use crate::acp::{self, doctor};
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
) -> Vec<acp::detection::AcpRuntimeStatus> {
    let (is_executable, list_dir, read_text, login_ok) = acp::detection::login_probe::real_probe();
    let skip = |_: &str, _: &std::path::Path, _: &[&str], _: &str| None;
    let probe = acp::detection::command_lookup::FsProbe {
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
    let managed_bin = app_data_for_paths
        .as_deref()
        .map(acp::install::cli::managed_cli_bin_dir);
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(acp::install::node::managed_node_bin_dir);
    acp::detection::detect_runtimes(
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
    acp::install::node::managed_node_plan()
}

/// Only on a click, after showing the source, inside `<app-data>/runtimes/node`, with a
/// pinned version and a verified hash.
#[tauri::command(async)]
pub(crate) fn acp_install_node(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<doctor::AcpCheck>, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    let reporter = |stage: &'static str, received: Option<u64>, total: Option<u64>| {
        emit_install_progress(&app, &runtime_id, "node", stage, received, total, None);
    };
    acp::install::node::ensure_managed_node(&app_data, &reporter).inspect_err(|_| {
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
    Ok(doctor::diagnose(&after.borrow()))
}

/// The screen shows the raw command before the press; `None` leaves only the guide link.
#[tauri::command]
pub(crate) fn acp_install_plan(app: tauri::AppHandle, runtime_id: String) -> Option<String> {
    let app_data = app.path().app_data_dir().ok()?;
    acp::install::cli::managed_install_command(&runtime_id, &app_data)
}

/// Only on a user press, after `acp_install_plan` showed the command, under `--prefix
/// <app-data>/managed-node`, pinned by `INSTALLABLE_CLI`; the result is
/// re-verified before claiming success.
#[tauri::command(async)]
pub(crate) fn acp_install_cli(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<doctor::AcpCheck>, String> {
    let package = acp::install::cli::installable_package(&runtime_id)
        .ok_or_else(|| format!("not-installable:{runtime_id}"))?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    let prefix = acp::install::cli::managed_cli_prefix(&app_data);
    std::fs::create_dir_all(&prefix).map_err(|err| format!("prefix-failed:{err}"))?;

    let (is_executable, list_dir, read_text, login_ok) = acp::detection::login_probe::real_probe();
    let probe = acp::detection::command_lookup::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    // The bundled npm is the fallback when the system has none.
    let managed_node_bin = acp::install::node::managed_node_bin_dir(&app_data);
    let dirs = acp::detection::command_lookup::candidate_bin_dirs(
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        None,
        managed_node_bin.as_deref(),
    );
    // Never by name: a GUI app's PATH differs from the shell's.
    let npm = acp::detection::command_lookup::resolve_command("npm", &dirs, &probe)
        .ok_or_else(|| "npm-missing".to_string())?;
    let child_path = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    emit_install_progress(&app, &runtime_id, "cli", "installing", None, None, None);

    let mut command = Command::new(&npm);
    crate::child_process::no_console::hide_console(&mut command);
    crate::child_process::working_dir::run_from_temp_dir(&mut command);
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
    Ok(doctor::diagnose(&after.borrow()))
}

/// Fetches the pinned npx adapter into npx's cache before a session starts, so the session
/// launches from the cache. Asked only by the chat panel's session start, the moment that
/// downloaded before; never at app launch. The download runs on a thread the app owns: a panel
/// closed mid-download does not cancel it, and the next request joins it. Progress goes out
/// as `job: "adapter"` on the install progress event.
#[tauri::command]
pub(crate) async fn acp_prepare_adapter(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<AdapterReadiness, String> {
    // A waiter blocks until the download ends; on the blocking pool it cannot occupy the async
    // workers every other command runs on. Not `blocking::run_blocking`: the exit drain would
    // wait on a download that `terminate_all` is about to end anyway.
    tauri::async_runtime::spawn_blocking(move || prepare_adapter(&app, &runtime_id))
        .await
        .map_err(|err| format!("adapter-fetch-failed:{err}"))?
}

fn prepare_adapter(app: &tauri::AppHandle, runtime_id: &str) -> Result<AdapterReadiness, String> {
    let Some(fetches) = app.try_state::<AdapterFetches>() else {
        return Ok(AdapterReadiness::NotApplicable);
    };
    let (is_executable, list_dir, read_text, _) = acp::detection::login_probe::real_probe();
    let skip_login = |_: &str, _: &std::path::Path, _: &[&str], _: &str| None;
    let probe = acp::detection::command_lookup::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &skip_login,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    // A launch that cannot resolve is the session start's to report, with the words it has.
    let Ok(launch) = acp::launch::resolve_launch(
        runtime_id,
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        Some(&acp::install::cli::managed_cli_bin_dir(&app_data)),
        acp::install::node::managed_node_bin_dir(&app_data).as_deref(),
    ) else {
        return Ok(AdapterReadiness::NotApplicable);
    };
    let Some(entry) = acp::launch::npx_cache::npx_cache_entry_for_launch(&launch, home.as_deref())
    else {
        return Ok(AdapterReadiness::NotApplicable);
    };
    let plan = adapter::FetchPlan {
        runtime_id: runtime_id.to_string(),
        launch: launch.clone(),
        entry,
        working_dir: app_data,
    };
    let reporter = app.clone();
    let recorder = fetches.inner().clone();
    fetches.ensure(
        runtime_id,
        || {
            adapter::CacheCheck::from_preflight(&acp::launch::npx_cache::preflight_npx_cache(
                &launch,
                home.as_deref(),
            ))
        },
        move || {
            let id = plan.runtime_id.as_str();
            emit_install_progress(&reporter, id, "adapter", "downloading", None, None, None);
            let on_spawn = |pid| recorder.record_pid(id, pid);
            let outcome = adapter::run_fetch(&plan, &on_spawn, &|bytes| {
                emit_install_progress(
                    &reporter,
                    id,
                    "adapter",
                    "downloading",
                    Some(bytes),
                    None,
                    None,
                );
            });
            let stage = if outcome.is_ok() { "done" } else { "failed" };
            emit_install_progress(&reporter, id, "adapter", stage, None, None, None);
            outcome
        },
    )
}

/// Returns facts per step; the screen writes the sentences.
#[tauri::command(async)]
pub(crate) fn acp_diagnose(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<doctor::AcpCheck>, String> {
    // The screen clears its state at the same moment.
    forget_install_progress(&app, &runtime_id);
    let ctx = doctor_context(&app, &runtime_id)?;
    Ok(doctor::diagnose(&ctx.borrow()))
}

/// Only `fixable` items arrive.
#[tauri::command(async)]
pub(crate) fn acp_repair(
    app: tauri::AppHandle,
    runtime_id: String,
    check_id: String,
) -> Result<Vec<doctor::AcpCheck>, String> {
    let ctx = doctor_context(&app, &runtime_id)?;
    // A download in flight looks broken on disk; deleting it would pull the files from under npm.
    if check_id == "npx-cache" && ctx.adapter_fetching {
        return Err("repair-failed:downloading".to_string());
    }
    doctor::repair(&ctx.borrow(), &check_id)?;
    // Return the re-verified state, never a bare claim of success.
    let after = doctor_context(&app, &runtime_id)?;
    Ok(doctor::diagnose(&after.borrow()))
}

/// Returns the re-verified value, never a bare claim.
#[tauri::command(async)]
pub(crate) fn acp_reset_connection(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<doctor::AcpCheck>, String> {
    let ctx = doctor_context(&app, &runtime_id)?;
    doctor::reset_connection(&ctx.borrow())?;
    let after = doctor_context(&app, &runtime_id)?;
    Ok(doctor::diagnose(&after.borrow()))
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
    terminal_logged_in: Option<bool>,
    shadow_present: Option<bool>,
    adapter_fetching: bool,
}

impl OwnedDoctorContext {
    fn borrow(&self) -> doctor::DoctorContext<'_> {
        doctor::DoctorContext {
            runtime_id: &self.runtime_id,
            home: self.home.as_deref(),
            app_data_dir: &self.app_data_dir,
            cli: self.cli.as_deref(),
            launcher: self.launcher.as_deref(),
            path_env: &self.path_env,
            isolated_logged_out: self.isolated_logged_out,
            terminal_logged_in: self.terminal_logged_in,
            shadow_present: self.shadow_present,
            adapter_fetching: self.adapter_fetching,
        }
    }
}

fn doctor_context(app: &tauri::AppHandle, runtime_id: &str) -> Result<OwnedDoctorContext, String> {
    let (is_executable, list_dir, read_text, login_ok) = acp::detection::login_probe::real_probe();
    let probe = acp::detection::command_lookup::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let path = std::env::var_os("PATH");
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths
        .as_deref()
        .map(acp::install::cli::managed_cli_bin_dir);
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(acp::install::node::managed_node_bin_dir);
    let dirs = acp::detection::command_lookup::candidate_bin_dirs(
        home.as_deref(),
        path.as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    );
    let path_env = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    let agent = acp::registry::registry_agent(runtime_id)
        .ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;
    let cli = agent
        .cli
        .as_deref()
        .and_then(|name| acp::detection::command_lookup::resolve_command(name, &dirs, &probe));
    let launcher = acp::launch::resolve_launch(
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

    let terminal_logged_in = cli.as_deref().and_then(|path| {
        let args = acp::detection::login_probe::LOGIN_PROBE
            .iter()
            .find(|(id, _)| *id == runtime_id)?
            .1;
        login_ok(runtime_id, path, args, &path_env)
    });
    // Ask against the app-owned folder the session actually uses. Only Claude Code answers
    // for a folder; Codex's folder links the terminal's login file, so it signs in as the terminal does.
    let isolated = app_data_dir.join("agent-config").join(runtime_id);
    let isolated_logged_out = match runtime_id {
        "claude-acp" => cli
            .as_deref()
            .and_then(|path| acp::isolation::probe_isolated_logged_out(path, &isolated, &path_env)),
        _ if acp::isolation::config_env_for(runtime_id).is_some() => {
            terminal_logged_in.map(|signed_in| !signed_in)
        }
        _ => None,
    };
    let shadow_present = acp::isolation::shadow_credentials_present(&isolated);

    Ok(OwnedDoctorContext {
        runtime_id: runtime_id.to_string(),
        home,
        app_data_dir,
        cli,
        launcher,
        path_env,
        isolated_logged_out,
        terminal_logged_in,
        shadow_present,
        adapter_fetching: app
            .try_state::<AdapterFetches>()
            .is_some_and(|fetches| fetches.is_fetching(runtime_id)),
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
