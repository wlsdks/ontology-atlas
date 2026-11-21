#[cfg(unix)]
use super::*;
#[cfg(unix)]
use crate::llm_audit::log_file::{canonical_vault_dir, open_audit_file, ABSORBED_INHERITED_BUSY};
use crate::llm_audit::log_file::{AUDIT_LOCK_RETRIES, AUDIT_LOCK_RETRY_PAUSE};
use std::time::Duration;

/// Serializes the two tests that can move the counter.
#[cfg(all(test, unix))]
static CONTENDING_TESTS: Mutex<()> = Mutex::new(());

/// The ceiling is the measured worst hold (12 658 µs) rounded up to whole pauses;
/// it must not grow into waiting for any holder.
#[test]
fn the_inherited_lock_retry_budget_stays_bounded() {
    let ceiling = AUDIT_LOCK_RETRY_PAUSE * AUDIT_LOCK_RETRIES;
    assert_eq!(
        ceiling,
        Duration::from_millis(13),
        "13 ms is the measured 12.658 ms worst hold rounded up to whole \
         {AUDIT_LOCK_RETRY_PAUSE:?} pauses; changing it needs a new measurement"
    );
    assert!(
        AUDIT_LOCK_RETRY_PAUSE <= Duration::from_micros(250),
        "a coarser pause spends the budget on sleeping, not on waiting out an exec"
    );
}

/// A lock this process cannot account for is waited out for the whole budget and
/// then refused; `open_audit_file` is called directly as a second process would.
#[cfg(unix)]
#[test]
fn the_budget_is_spent_and_then_the_lock_still_fails_closed() {
    let _serialized = CONTENDING_TESTS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let vault = temp_vault("budget-spent");
    let canonical = canonical_vault_dir(&vault).unwrap();
    let holder = open_audit_file(&canonical).expect("the first owner takes the lock");

    let started = std::time::Instant::now();
    let refused = open_audit_file(&canonical);
    let waited = started.elapsed();

    drop(holder);
    fs::remove_dir_all(&vault).ok();

    assert_eq!(
        refused.err().as_deref(),
        Some("audit-log-busy"),
        "a lock we cannot account for still fails closed"
    );
    assert!(
        waited >= AUDIT_LOCK_RETRY_PAUSE * AUDIT_LOCK_RETRIES,
        "the whole budget has to be spent before giving up, not short-circuited; \
         waited {waited:?}"
    );
    // Boundedness, not a stopwatch: a tight ceiling would measure runner load.
    assert!(
        waited < Duration::from_secs(1),
        "the wait has to stay bounded; waited {waited:?}"
    );
}

/// Positive control: a second open file description held in process stands in for a mid-spawn child.
#[cfg(unix)]
#[test]
fn a_reserve_right_after_a_finalize_survives_a_foreign_hold_on_the_log() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    /// A healthy round releases in microseconds.
    const WATCH_LIMIT: Duration = Duration::from_secs(5);

    let _serialized = CONTENDING_TESTS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let vault = temp_vault("foreign-hold-busy");
    let canonical = canonical_vault_dir(&vault).unwrap();

    let mut refused = Vec::new();
    let mut absorbed = Vec::new();
    let rounds = 4;
    for round in 0..rounds {
        let reservation = reserve(&vault, verify_draft())
            .unwrap_or_else(|error| panic!("round {round} could not open a reservation: {error}"));
        finalize(
            reservation,
            &AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: round,
                duration_ms: 1,
            },
        )
        .unwrap();

        let holder = open_audit_file(&canonical).expect("the foreign hold takes the lock");

        let before = ABSORBED_INHERITED_BUSY.load(Ordering::Relaxed);
        let asking = Arc::new(AtomicBool::new(false));
        let answered = Arc::new(AtomicBool::new(false));
        let worker = {
            let vault = vault.clone();
            let asking = Arc::clone(&asking);
            let answered = Arc::clone(&answered);
            std::thread::spawn(move || {
                asking.store(true, Ordering::Release);
                let second = reserve(&vault, verify_draft());
                answered.store(true, Ordering::Release);
                second
            })
        };

        // Spinning, not sleeping: a woken thread under load misses the retry budget.
        let watching = std::time::Instant::now();
        while ABSORBED_INHERITED_BUSY.load(Ordering::Relaxed) == before
            && !answered.load(Ordering::Acquire)
            && watching.elapsed() < WATCH_LIMIT
        {
            std::hint::spin_loop();
        }
        drop(holder);

        let second = worker.join().unwrap();
        absorbed.push(ABSORBED_INHERITED_BUSY.load(Ordering::Relaxed) - before);
        match second {
            Ok(second) => finalize(
                second,
                &AuditOutcome {
                    outcome: "ok".into(),
                    http_status: Some(200),
                    response_chars: round,
                    duration_ms: 2,
                },
            )
            .unwrap(),
            Err(error) => refused.push(format!("round {round}: {error}")),
        }
    }

    let written = fs::read_to_string(audit_log_path(&canonical)).unwrap();
    let lines = written.lines().count();
    fs::remove_dir_all(&vault).ok();

    assert!(
        refused.is_empty(),
        "a foreign description that lets go must not manufacture a busy audit log: \
         {} of {rounds} reservations were refused ({})",
        refused.len(),
        refused.join("; ")
    );
    assert_eq!(
        lines,
        rounds * 2,
        "one reserved-then-finalized call is one line"
    );
    // Without this the test could pass without reproducing anything.
    assert!(
        absorbed.iter().all(|count| *count > 0),
        "every round had to actually meet the hold; absorbed per round: {absorbed:?}"
    );
}
