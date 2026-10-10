use crate::vault::scope::{canonical_root, vault_root_rejection};
use crate::{acp, connector_secrets, git, managed_node};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

/// Every remaining session ends at app shutdown.
#[derive(Default)]
pub(crate) struct AcpSessions(Mutex<std::collections::HashMap<String, Arc<AcpSessionHandle>>>);

struct AcpSessionHandle {
    pid: u32,
    /// Normalized by `acp_start`; the screen cannot reselect it.
    vault_root: PathBuf,
    stdin: Mutex<Box<dyn Write + Send>>,
}

impl AcpSessions {
    fn insert<W: Write + Send + 'static>(
        &self,
        session_id: String,
        pid: u32,
        vault_root: PathBuf,
        stdin: W,
    ) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .insert(
                session_id,
                Arc::new(AcpSessionHandle {
                    pid,
                    vault_root,
                    stdin: Mutex::new(Box::new(stdin)),
                }),
            );
        Ok(())
    }

    fn vault_root(&self, session_id: &str) -> Result<PathBuf, String> {
        let map = self
            .0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?;
        map.get(session_id)
            .map(|handle| handle.vault_root.clone())
            .ok_or_else(|| "session-not-found".to_string())
    }

    fn send_line(&self, session_id: &str, line: &str) -> Result<(), String> {
        // Never hold the registry and writer locks together, so a blocked stdin cannot stop
        // other sessions, exit cleanup or the shutdown drain.
        let handle = {
            let map = self
                .0
                .lock()
                .map_err(|_| "session-registry-poisoned".to_string())?;
            Arc::clone(map.get(session_id).ok_or("session-not-found")?)
        };
        let mut stdin = handle
            .stdin
            .lock()
            .map_err(|_| "session-stdin-poisoned".to_string())?;
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|err| format!("write-failed:{err}"))
    }

    /// Tells the progress thread when to stop.
    fn contains(&self, session_id: &str) -> bool {
        self.0
            .lock()
            .map(|map| map.contains_key(session_id))
            .unwrap_or(false)
    }

    fn take_pid(&self, session_id: &str) -> Result<Option<u32>, String> {
        Ok(self
            .0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .remove(session_id)
            .map(|handle| handle.pid))
    }

    fn remove(&self, session_id: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .remove(session_id);
        Ok(())
    }

    fn drain_pids(&self) -> Result<Vec<u32>, String> {
        Ok(self
            .0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .drain()
            .map(|(_, handle)| handle.pid)
            .collect())
    }
}

/// A counter, not the pid, which the OS reuses.
static ACP_SESSION_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// A channel fetches payloads of 8 KB or more; `app.emit` evaluates them as script.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum AcpStreamEvent {
    Message { line: String },
    Stderr { line: String },
    Notice { message: String },
    Exit { code: Option<i32> },
}

type AcpStream = tauri::ipc::Channel<AcpStreamEvent>;

fn adapter_command(
    program: &Path,
    args: &[String],
    launch_dir: &Path,
    vault_root: &Path,
) -> Command {
    debug_assert!(!launch_dir.starts_with(vault_root));
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(launch_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

#[tauri::command(async)]
pub(crate) fn acp_start(
    app: AppHandle,
    sessions: State<'_, AcpSessions>,
    runtime_id: String,
    cwd: String,
    on_event: AcpStream,
) -> Result<String, String> {
    let root = canonical_root(&cwd).map_err(|err| format!("cwd-unreadable:{err}"))?;
    if let Some(reason) = vault_root_rejection(&root) {
        return Err(format!("vault-root-rejected:{reason}"));
    }

    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    // Include app installs, or the screen keeps asking for installation.
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths.as_deref().map(acp::managed_cli_bin_dir);
    // Include the app's Node for the same reason.
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(managed_node::managed_node_bin_dir);
    let mut launch = acp::resolve_launch(
        &runtime_id,
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    )?;
    let repo_root = git::find_repo_root(&root).ok().flatten();
    launch.path_env =
        acp::path_without_vault_node_modules_bin(&launch.path_env, &root, repo_root.as_deref());

    // Heal a half-downloaded npx entry just before launch (see the npx cache block in `acp.rs`).
    let npx_preflight = acp::preflight_npx_cache(&launch, home.as_deref());

    // Never inherit the user's global settings: pre-allowed entries bypass the gate.
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    // No start without a verified app-owned boundary. Shadow checks need the CLI's
    // absolute path because a GUI app's PATH differs from the shell's.
    let isolation_cli = acp::registry_agent(&runtime_id)
        .and_then(|agent| agent.cli.as_deref())
        .and_then(|name| {
            let dirs = acp::candidate_bin_dirs(
                home.as_deref(),
                std::env::var_os("PATH").as_deref(),
                &probe,
                managed_bin.as_deref(),
                managed_node_bin.as_deref(),
            );
            acp::resolve_command(name, &dirs, &probe)
        });
    let (isolation_env, isolation_dir) = acp::prepare_runtime_isolation(
        &runtime_id,
        &app_data,
        home.as_deref(),
        isolation_cli.as_deref(),
        &launch.path_env,
    )?;

    let spawned = matches!(npx_preflight, acp::NpxCachePreflight::CacheReady)
        .then(|| acp::launch_from_npx_cache(&launch, home.as_deref(), &is_executable))
        .flatten();
    log::info!(
        "acp start {runtime_id}: {}",
        if spawned.is_some() {
            "cached adapter bin"
        } else {
            "resolved launcher"
        }
    );
    let spawned = spawned.unwrap_or_else(|| launch.clone());
    let mut command = adapter_command(&spawned.program, &spawned.args, &app_data, &root);
    acp::apply_runtime_environment(&mut command, &runtime_id, &spawned.path_env);
    command.env(isolation_env, isolation_dir);

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        // The child does not inherit `windows_subsystem`, so suppress its console window.
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|err| format!("spawn-failed:{err}"))?;
    let pid = child.id();
    let seq = ACP_SESSION_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let session_id = format!("acp-{seq}-{pid}");

    let stdin = child.stdin.take().ok_or("stdin-unavailable")?;
    let stdout = child.stdout.take().ok_or("stdout-unavailable")?;
    let stderr = child.stderr.take().ok_or("stderr-unavailable")?;

    // The first stderr lines go to the exit log; silence is itself the clue.
    let early_stderr: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let started_at = Instant::now();
    spawn_acp_line_pump(
        on_event.clone(),
        stdout,
        |line| AcpStreamEvent::Message { line },
        None,
    );
    spawn_acp_line_pump(
        on_event.clone(),
        stderr,
        |line| AcpStreamEvent::Stderr { line },
        Some(early_stderr.clone()),
    );

    // Register before the exit thread starts, or a child that dies at once is removed
    // first and its reused pid could be killed at shutdown.
    sessions.insert(session_id.clone(), pid, root, stdin)?;

    // The exit thread announces termination and unregisters, or sends go to a dead session.
    {
        let app = app.clone();
        let session_id = session_id.clone();
        let on_event = on_event.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|status| status.code());
            log::info!("acp session {session_id} exited with code {code:?}");
            let said = early_stderr
                .lock()
                .map(|held| held.clone())
                .unwrap_or_default();
            for (index, line) in said.iter().enumerate() {
                log::info!("acp session {session_id} said [{index}]: {line}");
            }
            if said.is_empty() && started_at.elapsed() < DEAD_SESSION_WINDOW {
                log::info!(
                    "acp session {session_id} ended within {}s and printed nothing",
                    DEAD_SESSION_WINDOW.as_secs()
                );
            }
            if let Some(state) = app.try_state::<AcpSessions>() {
                let _ = state.remove(&session_id);
            }
            let _ = on_event.send(AcpStreamEvent::Exit { code });
        });
    }

    let first_run_message = match &npx_preflight {
        // Mention the healing for diagnostics.
        acp::NpxCachePreflight::HealedBrokenEntry { reason } => {
            Some(format!("npx-first-run-download:healed:{reason}"))
        }
        acp::NpxCachePreflight::FirstDownload => Some("npx-first-run-download".to_string()),
        // Report the reason so the screen can explain the repeat failure.
        acp::NpxCachePreflight::HealFailed { reason, error } => {
            Some(format!("npx-cache-heal-failed:{reason}:{error}"))
        }
        acp::NpxCachePreflight::NotNpx
        | acp::NpxCachePreflight::CacheUnknown
        | acp::NpxCachePreflight::CacheReady => None,
    };
    let downloading = matches!(
        npx_preflight,
        acp::NpxCachePreflight::FirstDownload | acp::NpxCachePreflight::HealedBrokenEntry { .. }
    );
    if let Some(message) = first_run_message {
        let entry = downloading
            .then(|| acp::npx_cache_entry_for_launch(&launch, home.as_deref()))
            .flatten();
        let package = acp::npx_launch_package(&launch).map(str::to_string);
        let app = app.clone();
        let session_id = session_id.clone();
        std::thread::spawn(move || {
            let _ = on_event.send(AcpStreamEvent::Notice { message });
            let (Some(entry), Some(package)) = (entry, package) else {
                return; // Only the healing failure; nothing to measure.
            };
            let started = std::time::Instant::now();
            loop {
                std::thread::sleep(std::time::Duration::from_millis(1000));
                // Do not leave the thread forever.
                if started.elapsed() > std::time::Duration::from_secs(20 * 60) {
                    break;
                }
                let alive = app
                    .try_state::<AcpSessions>()
                    .map(|sessions| sessions.contains(&session_id))
                    .unwrap_or(false);
                if !alive {
                    break;
                }
                if acp::npx_entry_health(&entry, &package) == acp::NpxEntryHealth::Usable {
                    let _ = on_event.send(AcpStreamEvent::Notice {
                        message: "npx-download-done".to_string(),
                    });
                    break;
                }
                let mb = acp::dir_size_bytes(&entry) / (1024 * 1024);
                let _ = on_event.send(AcpStreamEvent::Notice {
                    message: format!("npx-download-progress:{mb}"),
                });
            }
        });
    }

    Ok(session_id)
}

const DEAD_SESSION_WINDOW: Duration = Duration::from_secs(10);
const DEAD_SESSION_LOG_LINES: usize = 3;
const DEAD_SESSION_LOG_CHARS: usize = 200;

/// Bounds a child's stderr in a log people paste into issues (three lines, 200 chars); it does not redact.
fn clip_for_log(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.chars().count() <= DEAD_SESSION_LOG_CHARS {
        return trimmed.to_string();
    }
    let kept: String = trimmed.chars().take(DEAD_SESSION_LOG_CHARS).collect();
    format!("{kept}…")
}

fn spawn_acp_line_pump<R: std::io::Read + Send + 'static>(
    on_event: AcpStream,
    stream: R,
    event: fn(String) -> AcpStreamEvent,
    // A child that dies at once leaves nothing else to quote.
    early_lines: Option<Arc<Mutex<Vec<String>>>>,
) {
    std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stream);
        loop {
            match acp::read_bounded_line(&mut reader, acp::MAX_LINE_BYTES) {
                Ok(Some(bytes)) => {
                    let line = acp_line_text(bytes);
                    if let Some(sink) = early_lines.as_ref() {
                        if let Ok(mut held) = sink.lock() {
                            if held.len() < DEAD_SESSION_LOG_LINES {
                                held.push(clip_for_log(&line));
                            }
                        }
                    }
                    let _ = on_event.send(event(line));
                }
                Ok(None) => break,
                Err(err) => {
                    let _ = on_event.send(AcpStreamEvent::Notice {
                        message: format!("dropped-line:{err}"),
                    });
                    if err.kind() != std::io::ErrorKind::InvalidData {
                        break;
                    }
                }
            }
        }
    });
}

fn acp_line_text(bytes: Vec<u8>) -> String {
    String::from_utf8(bytes)
        .unwrap_or_else(|invalid| String::from_utf8_lossy(invalid.as_bytes()).into_owned())
}

/// Never reimplemented on the screen: the looser copy would win, and only Rust can
/// resolve links. The root is the one bound to the session at `acp_start`.
fn permission_verdict_for_session(
    sessions: &AcpSessions,
    session_id: &str,
    file_path: Option<&str>,
) -> acp::PermissionVerdict {
    sessions
        .vault_root(session_id)
        .map(|root| acp::permission_verdict(&root, file_path))
        .unwrap_or(acp::PermissionVerdict::Ask)
}

#[tauri::command]
pub(crate) fn acp_permission_verdict(
    sessions: State<'_, AcpSessions>,
    session_id: String,
    file_path: Option<String>,
) -> String {
    let verdict = permission_verdict_for_session(&sessions, &session_id, file_path.as_deref());
    match verdict {
        acp::PermissionVerdict::AllowInsideVault => "allow-inside-vault".to_string(),
        acp::PermissionVerdict::Ask => "ask".to_string(),
    }
}

/// The newline is appended here, or the peer waits forever.
#[tauri::command]
pub(crate) fn acp_send(
    sessions: State<'_, AcpSessions>,
    session_id: String,
    line: String,
) -> Result<(), String> {
    // Connector tokens become values only here, one line before leaving the process;
    // ordinary lines pass after one substring check.
    let line = connector_secrets::resolve_secret_refs(&line)?;
    sessions.send_line(&session_id, &line)
}

#[tauri::command(async)]
pub(crate) fn acp_stop(sessions: State<'_, AcpSessions>, session_id: String) -> Result<(), String> {
    // Distinguishes a stop the screen asked for from the child exiting on its own after stdin closes.
    log::info!("acp session {session_id} stop requested by the screen");
    let pid = sessions.take_pid(&session_id)?;
    match pid {
        Some(pid) => acp::terminate_tree(pid),
        None => Ok(()),
    }
}

/// Otherwise closing the window leaves adapters and grandchildren running.
pub(crate) fn terminate_all_acp_sessions(app: &AppHandle) {
    log::info!("acp sessions ending because the app is shutting down");
    let Some(state) = app.try_state::<AcpSessions>() else {
        return;
    };
    let handles = match state.drain_pids() {
        Ok(handles) => handles,
        Err(_) => return,
    };
    for pid in handles {
        let _ = acp::terminate_tree(pid);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_adapter_launches_from_app_data_not_the_vault() {
        use std::path::{Path, PathBuf};
        let app_data = PathBuf::from("/private/tmp/atlas-app-support");
        let vault = PathBuf::from("/private/tmp/atlas-vault");
        let command = super::adapter_command(Path::new("/bin/echo"), &[], &app_data, &vault);
        assert_eq!(command.get_current_dir(), Some(app_data.as_path()));
        assert!(!command.get_current_dir().unwrap().starts_with(&vault));
    }

    #[test]
    fn an_agent_line_keeps_its_buffer_and_repairs_only_broken_utf8() {
        let bytes = b"{\"jsonrpc\":\"2.0\"}".to_vec();
        let buffer = bytes.as_ptr();
        let line = super::acp_line_text(bytes);
        assert_eq!(line, "{\"jsonrpc\":\"2.0\"}");
        assert_eq!(line.as_ptr(), buffer, "a valid line must not be copied");
        assert_eq!(super::acp_line_text(vec![b'a', 0xff, b'b']), "a\u{fffd}b");
    }

    #[test]
    fn an_agent_event_names_its_kind_for_the_screen() {
        let json = |event: &super::AcpStreamEvent| serde_json::to_value(event).unwrap();
        assert_eq!(
            json(&super::AcpStreamEvent::Message { line: "{}".into() }),
            serde_json::json!({ "kind": "message", "line": "{}" })
        );
        assert_eq!(
            json(&super::AcpStreamEvent::Exit { code: Some(1) }),
            serde_json::json!({ "kind": "exit", "code": 1 })
        );
        assert_eq!(
            json(&super::AcpStreamEvent::Notice {
                message: "npx-download-done".into()
            }),
            serde_json::json!({ "kind": "notice", "message": "npx-download-done" })
        );
    }

    #[test]
    fn a_logged_line_is_trimmed_and_capped() {
        assert_eq!(
            super::clip_for_log("  npx: command not found  "),
            "npx: command not found"
        );
        let long = "x".repeat(super::DEAD_SESSION_LOG_CHARS + 50);
        let clipped = super::clip_for_log(&long);
        assert_eq!(clipped.chars().count(), super::DEAD_SESSION_LOG_CHARS + 1);
        assert!(clipped.ends_with('…'));
    }

    use super::*;

    struct ControlledWriter {
        gate: Option<(
            std::sync::mpsc::SyncSender<()>,
            std::sync::mpsc::Receiver<()>,
        )>,
        bytes: Arc<Mutex<Vec<u8>>>,
    }

    impl ControlledWriter {
        fn blocked(
            entered: std::sync::mpsc::SyncSender<()>,
            release: std::sync::mpsc::Receiver<()>,
        ) -> Self {
            Self {
                gate: Some((entered, release)),
                bytes: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn recording() -> Self {
            Self {
                gate: None,
                bytes: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    impl Write for ControlledWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            if let Some((entered, release)) = self.gate.take() {
                entered
                    .send(())
                    .map_err(|_| std::io::Error::other("test-entered-channel-closed"))?;
                release
                    .recv()
                    .map_err(|_| std::io::Error::other("test-release-channel-closed"))?;
            }
            self.bytes
                .lock()
                .map_err(|_| std::io::Error::other("test-writer-poisoned"))?
                .extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn while_one_session_write_is_blocked<T, F>(action: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(Arc<AcpSessions>) -> T + Send + 'static,
    {
        let sessions = Arc::new(AcpSessions::default());
        let (entered_tx, entered_rx) = std::sync::mpsc::sync_channel(1);
        let (release_tx, release_rx) = std::sync::mpsc::sync_channel(1);
        sessions
            .insert(
                "blocked".to_string(),
                11,
                PathBuf::from("/vault-blocked"),
                ControlledWriter::blocked(entered_tx, release_rx),
            )
            .unwrap();
        sessions
            .insert(
                "other".to_string(),
                22,
                PathBuf::from("/vault-other"),
                ControlledWriter::recording(),
            )
            .unwrap();

        let blocked_sessions = Arc::clone(&sessions);
        let blocked = std::thread::spawn(move || blocked_sessions.send_line("blocked", "wait"));
        entered_rx
            .recv_timeout(Duration::from_secs(1))
            .map_err(|err| format!("blocked writer did not start: {err}"))?;

        let (started_tx, started_rx) = std::sync::mpsc::sync_channel(1);
        let (done_tx, done_rx) = std::sync::mpsc::sync_channel(1);
        let action_thread = std::thread::spawn(move || {
            let _ = started_tx.send(());
            let result = action(sessions);
            let _ = done_tx.send(result);
        });
        started_rx
            .recv_timeout(Duration::from_secs(1))
            .map_err(|err| format!("registry action did not start: {err}"))?;
        let outcome = done_rx
            .recv_timeout(Duration::from_millis(250))
            .map_err(|err| format!("registry action waited for blocked stdin: {err}"));

        let _ = release_tx.send(());
        blocked
            .join()
            .map_err(|_| "blocked send thread panicked".to_string())?
            .map_err(|err| format!("blocked send failed: {err}"))?;
        action_thread
            .join()
            .map_err(|_| "registry action thread panicked".to_string())?;
        outcome
    }

    #[test]
    fn blocked_send_in_one_session_does_not_block_another_session() {
        let result = while_one_session_write_is_blocked(|sessions| {
            sessions.send_line("other", "still-live")
        })
        .expect("another session must not share the blocked stdin lock");
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn blocked_send_does_not_block_stop_take() {
        let result = while_one_session_write_is_blocked(|sessions| sessions.take_pid("blocked"))
            .expect("stop must be able to take the pid and break the blocked pipe");
        assert_eq!(result, Ok(Some(11)));
    }

    #[test]
    fn blocked_send_does_not_delay_child_exit_cleanup() {
        let result = while_one_session_write_is_blocked(|sessions| sessions.remove("blocked"))
            .expect("child exit cleanup must not wait for stdin");
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn blocked_send_does_not_delay_shutdown_drain() {
        let result = while_one_session_write_is_blocked(|sessions| sessions.drain_pids())
            .expect("shutdown must collect pids without waiting for stdin");
        let mut pids = result.unwrap();
        pids.sort_unstable();
        assert_eq!(pids, vec![11, 22]);
    }

    #[test]
    fn permission_verdict_uses_the_registered_session_root_and_unknown_sessions_ask() {
        let base =
            std::env::temp_dir().join(format!("atlas-acp-session-root-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside.md");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(&outside, "outside").unwrap();

        let sessions = AcpSessions::default();
        sessions
            .insert(
                "bound-session".to_string(),
                33,
                std::fs::canonicalize(&vault).unwrap(),
                ControlledWriter::recording(),
            )
            .unwrap();

        assert_eq!(
            permission_verdict_for_session(
                &sessions,
                "bound-session",
                vault.join("inside.md").to_str()
            ),
            acp::PermissionVerdict::AllowInsideVault
        );
        assert_eq!(
            permission_verdict_for_session(&sessions, "bound-session", outside.to_str()),
            acp::PermissionVerdict::Ask
        );
        assert_eq!(
            permission_verdict_for_session(&sessions, "caller-invented-session", outside.to_str()),
            acp::PermissionVerdict::Ask,
            "an unregistered session must not auto-allow any path"
        );

        let _ = std::fs::remove_dir_all(&base);
    }
}
