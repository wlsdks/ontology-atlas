//! Puts a pinned npx adapter into npx's cache without starting an agent. The download runs on a
//! thread the app owns, so closing the chat panel does not cancel it, and one runtime has at
//! most one fetch: a later request waits on the one in flight instead of starting a second npx.
//! It is the session launch's own npx download moved ahead of the session, so only runtimes a
//! session may start can fetch, and the npx process dies with the app as a session does.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, PoisonError};
use std::time::{Duration, Instant};

use crate::acp::launch::npx_cache::{self, NpxCachePreflight};
use crate::acp::launch::AcpLaunch;
use crate::acp::session::agent_process::{read_bounded_line, terminate_tree};

/// What a request found; the screen needs only whether to go on to the session start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum AdapterReadiness {
    /// Nothing for the app to fetch (a runtime the session start refuses, not an npx launch, or
    /// a cache it cannot see): the session start behaves as it did before this fetch existed.
    NotApplicable,
    Ready,
    Fetched,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CacheCheck {
    NotApplicable,
    Ready,
    Fetch,
}

impl CacheCheck {
    /// A failed heal goes to the session start, which already reports its reason.
    pub(crate) fn from_preflight(preflight: &NpxCachePreflight) -> Self {
        match preflight {
            NpxCachePreflight::CacheReady => Self::Ready,
            NpxCachePreflight::FirstDownload | NpxCachePreflight::HealedBrokenEntry { .. } => {
                Self::Fetch
            }
            NpxCachePreflight::NotNpx
            | NpxCachePreflight::CacheUnknown
            | NpxCachePreflight::HealFailed { .. } => Self::NotApplicable,
        }
    }
}

type FetchOutcome = Result<(), String>;

pub(crate) const APP_CLOSING: &str = "adapter-fetch-failed:app closing";

#[derive(Default)]
struct FetchJob {
    outcome: Mutex<Option<FetchOutcome>>,
    finished: Condvar,
    /// The npx process group, so the app's exit can end it.
    pid: Mutex<Option<u32>>,
}

impl FetchJob {
    fn publish(&self, outcome: FetchOutcome) {
        *self.outcome.lock().unwrap_or_else(PoisonError::into_inner) = Some(outcome);
        self.finished.notify_all();
    }

    fn wait(&self) -> FetchOutcome {
        let mut slot = self.outcome.lock().unwrap_or_else(PoisonError::into_inner);
        loop {
            if let Some(outcome) = slot.as_ref() {
                return outcome.clone();
            }
            slot = self
                .finished
                .wait(slot)
                .unwrap_or_else(PoisonError::into_inner);
        }
    }
}

/// Tauri state: the fetches in flight, per runtime id.
#[derive(Default, Clone)]
pub(crate) struct AdapterFetches {
    in_flight: Arc<Mutex<HashMap<String, Arc<FetchJob>>>>,
    closing: Arc<AtomicBool>,
}

impl AdapterFetches {
    pub(crate) fn is_fetching(&self, runtime_id: &str) -> bool {
        self.in_flight
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains_key(runtime_id)
    }

    /// Called by the running fetch once npx is spawned.
    pub(crate) fn record_pid(&self, runtime_id: &str, pid: u32) {
        if let Some(job) = self
            .in_flight
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(runtime_id)
        {
            *job.pid.lock().unwrap_or_else(PoisonError::into_inner) = Some(pid);
        }
    }

    /// The app is exiting: no new fetch starts, and each running npx tree ends. Left running it
    /// would download with the app closed, and the next launch's heal would delete under it.
    pub(crate) fn terminate_all(&self) {
        self.closing.store(true, Ordering::SeqCst);
        let pids: Vec<u32> = self
            .in_flight
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .values()
            .filter_map(|job| *job.pid.lock().unwrap_or_else(PoisonError::into_inner))
            .collect();
        for pid in pids {
            let _ = terminate_tree(pid);
        }
    }

    /// Joins the fetch in flight, or runs `check` and, if the cache needs it, starts `run` on its
    /// own thread; either way it blocks until that fetch ends. `check` runs under the lock, so
    /// its heal never deletes an entry a fetch is writing. A runtime the session start refuses
    /// (`chat_eligible`) reaches neither `check` nor `run`: this is the native guard, since the
    /// page's own filter cannot be trusted.
    pub(crate) fn ensure<C, R>(
        &self,
        runtime_id: &str,
        check: C,
        run: R,
    ) -> Result<AdapterReadiness, String>
    where
        C: FnOnce() -> CacheCheck,
        R: FnOnce() -> FetchOutcome + Send + 'static,
    {
        if !crate::acp::registry::chat_eligible(runtime_id) {
            return Ok(AdapterReadiness::NotApplicable);
        }
        let job = {
            let mut in_flight = self
                .in_flight
                .lock()
                .unwrap_or_else(PoisonError::into_inner);
            match in_flight.get(runtime_id) {
                Some(job) => Arc::clone(job),
                None => {
                    match check() {
                        CacheCheck::NotApplicable => return Ok(AdapterReadiness::NotApplicable),
                        CacheCheck::Ready => return Ok(AdapterReadiness::Ready),
                        CacheCheck::Fetch => {}
                    }
                    if self.closing.load(Ordering::SeqCst) {
                        return Err(APP_CLOSING.to_string());
                    }
                    let job = Arc::new(FetchJob::default());
                    self.spawn_owner(runtime_id.to_string(), Arc::clone(&job), run)?;
                    in_flight.insert(runtime_id.to_string(), Arc::clone(&job));
                    job
                }
            }
        };
        job.wait().map(|()| AdapterReadiness::Fetched)
    }

    /// The job is registered only once its thread exists, so a refused thread leaves no ownerless
    /// job for later requests to wait on forever. The caller holds the map lock until it has
    /// registered the job, and the thread needs that lock to remove it, so the order holds.
    fn spawn_owner<R>(&self, runtime_id: String, job: Arc<FetchJob>, run: R) -> FetchOutcome
    where
        R: FnOnce() -> FetchOutcome + Send + 'static,
    {
        let in_flight = Arc::clone(&self.in_flight);
        std::thread::Builder::new()
            .name("acp-adapter-fetch".into())
            .spawn(move || {
                // A panic must still wake the waiters, or every later start for this runtime hangs.
                let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run))
                    .unwrap_or_else(|_| Err("adapter-fetch-failed:panicked".to_string()));
                // Removed before publishing, so a request after the wake reads the cache, not this job.
                in_flight
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .remove(&runtime_id);
                job.publish(outcome);
            })
            .map(|_| ())
            .map_err(|err| format!("adapter-fetch-failed:thread {err}"))
    }
}

/// `npx -y [flags] --package=<spec> -- node --version`. npx keys its cache by the spec alone,
/// so this fills the entry `npx -y <spec>` launches from while running only `node --version`.
pub(crate) fn fetch_args(launch: &AcpLaunch) -> Option<Vec<String>> {
    let package = npx_cache::npx_launch_package(launch)?;
    let at = launch.args.iter().position(|arg| arg == package)?;
    let mut args = launch.args.get(..at)?.to_vec();
    args.push(format!("--package={package}"));
    args.extend(["--", "node", "--version"].map(String::from));
    Some(args)
}

/// The fetch needs no package's own bins, and a vault's or repository's `node_modules/.bin` on
/// an inherited PATH could shadow `node` (the session strips such entries too).
pub(crate) fn path_without_package_bins(path_env: &str) -> String {
    let kept = std::env::split_paths(path_env).filter(|dir| {
        let package_bin = dir.file_name().is_some_and(|name| name == ".bin")
            && dir
                .parent()
                .and_then(Path::file_name)
                .is_some_and(|name| name == "node_modules");
        !dir.as_os_str().is_empty() && !package_bin
    });
    std::env::join_paths(kept)
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// npm prints its error code first and a log path last; the first two error lines are the guidance.
pub(crate) fn failure_line(lines: &[String]) -> String {
    let errors: Vec<&str> = lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| line.starts_with("npm error") || line.starts_with("npm ERR!"))
        .take(2)
        .collect();
    if !errors.is_empty() {
        return errors.join(" · ");
    }
    lines
        .iter()
        .rev()
        .map(|line| line.trim())
        .find(|line| !line.is_empty())
        .unwrap_or("exit-without-output")
        .to_string()
}

/// The session's own download used the same bound before this fetch existed.
const FETCH_DEADLINE: Duration = Duration::from_secs(20 * 60);
const PROGRESS_INTERVAL: Duration = Duration::from_secs(1);
const KEPT_STDERR_LINES: usize = 50;
/// npm's lines are short; a longer one is dropped rather than held.
const MAX_STDERR_LINE_BYTES: usize = 4096;

pub(crate) struct FetchPlan {
    pub runtime_id: String,
    pub launch: AcpLaunch,
    /// Where the bytes received so far are measured.
    pub entry: PathBuf,
    /// App data, never the vault, as for the session.
    pub working_dir: PathBuf,
}

/// Runs the fetch in its own process group, hands its pid to `on_spawn`, and reports the bytes
/// in the cache entry about once a second.
pub(crate) fn run_fetch(
    plan: &FetchPlan,
    on_spawn: &dyn Fn(u32),
    report: &dyn Fn(u64),
) -> FetchOutcome {
    let args = fetch_args(&plan.launch).ok_or("adapter-fetch-failed:not-npx")?;
    let mut command = Command::new(&plan.launch.program);
    crate::child_process::no_console::hide_console(&mut command);
    command
        .args(&args)
        .current_dir(&plan.working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    crate::acp::launch::runtime_environment::apply_runtime_environment(
        &mut command,
        &plan.runtime_id,
        &path_without_package_bins(&plan.launch.path_env),
    );
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|err| format!("adapter-fetch-failed:spawn {err}"))?;
    let pid = child.id();
    on_spawn(pid);

    let lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let pump = child.stderr.take().map(|pipe| {
        let lines = Arc::clone(&lines);
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(pipe);
            loop {
                let line = match read_bounded_line(&mut reader, MAX_STDERR_LINE_BYTES) {
                    Ok(Some(bytes)) => String::from_utf8_lossy(&bytes).into_owned(),
                    Ok(None) => break,
                    Err(err) if err.kind() == std::io::ErrorKind::InvalidData => continue,
                    Err(_) => break,
                };
                let mut kept = lines.lock().unwrap_or_else(PoisonError::into_inner);
                if kept.len() == KEPT_STDERR_LINES {
                    kept.remove(0);
                }
                kept.push(line);
            }
        })
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(err) => return Err(format!("adapter-fetch-failed:wait {err}")),
        }
        if started.elapsed() > FETCH_DEADLINE {
            // The whole group: a Volta or asdf shim would leave npm running after its own exit.
            let _ = terminate_tree(pid);
            let _ = child.wait();
            return Err("adapter-fetch-failed:timed out".to_string());
        }
        report(npx_cache::dir_size_bytes(&plan.entry));
        std::thread::sleep(PROGRESS_INTERVAL);
    };
    if let Some(handle) = pump {
        let _ = handle.join();
    }
    if status.success() {
        // Success is npm's word, not the entry's shape: a cache root we guessed wrong
        // (`npx_cache_root`) must not block the session, which runs npx itself.
        return Ok(());
    }
    let kept = lines.lock().unwrap_or_else(PoisonError::into_inner);
    Err(format!("adapter-fetch-failed:{}", failure_line(&kept)))
}

#[cfg(test)]
mod tests;
