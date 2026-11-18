//! A command without `async` runs on the main thread, so a slow disk sync or a Keychain
//! prompt freezes the window. Commands await their blocking work here instead: it runs
//! on the blocking pool, off both the main thread and the async workers, and a panic in
//! it fails that one command rather than the app.
//!
//! Off the main thread, quitting no longer waits for that work, so the exit handler
//! calls [`drain`]: new work is refused and work already running gets a bounded time to
//! finish its rename before the process ends.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Long enough for an fsync on a slow disk, short enough that quitting still feels immediate.
pub(crate) const EXIT_DRAIN_LIMIT: Duration = Duration::from_secs(3);

/// The app is quitting; new work would be cut off part-way, so it is refused.
pub(crate) const CLOSING: &str = "app-closing";

struct InFlight {
    closing: AtomicBool,
    running: AtomicUsize,
    lock: Mutex<()>,
    finished: Condvar,
}

fn in_flight() -> &'static InFlight {
    static STATE: OnceLock<InFlight> = OnceLock::new();
    STATE.get_or_init(|| InFlight {
        closing: AtomicBool::new(false),
        running: AtomicUsize::new(0),
        lock: Mutex::new(()),
        finished: Condvar::new(),
    })
}

/// Counted before the closing check, so [`drain`] either sees this work or this work
/// sees the closing flag; dropping it, on success or panic, releases the count.
struct Ticket(&'static InFlight);

impl Ticket {
    fn take(state: &'static InFlight) -> Result<Self, String> {
        state.running.fetch_add(1, Ordering::SeqCst);
        let ticket = Ticket(state);
        if state.closing.load(Ordering::SeqCst) {
            return Err(CLOSING.into());
        }
        Ok(ticket)
    }
}

impl Drop for Ticket {
    fn drop(&mut self) {
        if self.0.running.fetch_sub(1, Ordering::SeqCst) == 1 {
            let _guard = self.0.lock.lock().unwrap_or_else(|e| e.into_inner());
            self.0.finished.notify_all();
        }
    }
}

pub(crate) async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let ticket = Ticket::take(in_flight())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _ticket = ticket;
        work()
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Refuses new work, then waits up to `limit` for running work. Returns how many were still
/// running when the wait ended, so the caller can log an exit that cut work short.
pub(crate) fn drain(limit: Duration) -> usize {
    drain_state(in_flight(), limit)
}

fn drain_state(state: &InFlight, limit: Duration) -> usize {
    state.closing.store(true, Ordering::SeqCst);
    let deadline = Instant::now() + limit;
    let mut guard = state.lock.lock().unwrap_or_else(|e| e.into_inner());
    loop {
        let running = state.running.load(Ordering::SeqCst);
        let now = Instant::now();
        if running == 0 || now >= deadline {
            return running;
        }
        guard = state
            .finished
            .wait_timeout(guard, deadline - now)
            .unwrap_or_else(|e| e.into_inner())
            .0;
    }
}

#[cfg(test)]
mod tests {
    use super::{drain_state, run_blocking, InFlight, Ticket, CLOSING};
    use std::sync::atomic::{AtomicBool, AtomicUsize};
    use std::sync::{Condvar, Mutex};
    use std::time::{Duration, Instant};

    fn fresh() -> &'static InFlight {
        Box::leak(Box::new(InFlight {
            closing: AtomicBool::new(false),
            running: AtomicUsize::new(0),
            lock: Mutex::new(()),
            finished: Condvar::new(),
        }))
    }

    #[test]
    fn returns_the_work_result_and_its_error_unchanged() {
        assert_eq!(
            tauri::async_runtime::block_on(run_blocking(|| Ok::<_, String>(7))),
            Ok(7)
        );
        assert_eq!(
            tauri::async_runtime::block_on(run_blocking(|| Err::<(), _>("vault-gone".into()))),
            Err("vault-gone".to_string())
        );
    }

    #[test]
    fn runs_off_the_calling_thread() {
        let caller = std::thread::current().id();
        let worker =
            tauri::async_runtime::block_on(run_blocking(move || Ok(std::thread::current().id())))
                .unwrap();
        assert_ne!(worker, caller);
    }

    #[test]
    fn a_panic_fails_the_command_instead_of_the_process() {
        let result = tauri::async_runtime::block_on(run_blocking(|| -> Result<(), String> {
            panic!("simulated failure inside a command")
        }));
        assert!(result.is_err());
    }

    /// Quitting mid-write must let the write reach its rename, not cut it off.
    #[test]
    fn exit_waits_for_running_work_then_refuses_new_work() {
        let state = fresh();
        let ticket = Ticket::take(state).unwrap();
        let worker = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            drop(ticket);
        });
        let started = Instant::now();
        assert_eq!(drain_state(state, Duration::from_secs(3)), 0);
        let waited = started.elapsed();
        assert!(
            waited >= Duration::from_millis(150),
            "exit did not wait: {waited:?}"
        );
        assert!(
            waited < Duration::from_secs(2),
            "exit waited past the work: {waited:?}"
        );
        worker.join().unwrap();
        assert_eq!(Ticket::take(state).err().as_deref(), Some(CLOSING));
    }

    #[test]
    fn exit_gives_up_at_the_limit() {
        let state = fresh();
        let stuck = Ticket::take(state).unwrap();
        let started = Instant::now();
        assert_eq!(drain_state(state, Duration::from_millis(100)), 1);
        assert!(started.elapsed() < Duration::from_secs(1));
        drop(stuck);
    }

    #[test]
    fn a_panicking_job_still_releases_its_count() {
        let state = fresh();
        let ticket = Ticket::take(state).unwrap();
        let _ = std::thread::spawn(move || {
            let _ticket = ticket;
            panic!("simulated failure inside a command");
        })
        .join();
        assert_eq!(drain_state(state, Duration::from_millis(50)), 0);
    }
}
