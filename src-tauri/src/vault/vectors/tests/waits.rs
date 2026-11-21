//! What the job does by itself waits: quiet updates, a quit, a pass that fails inside.

use super::super::commands;
use super::super::job::{UPDATE_LATEST, UPDATE_QUIET};
use super::held::{rewrite, sent_rewritten, shown, stopped_in_an_earlier_launch};
use super::*;
use crate::vault::grants::EnforcedScope;

#[test]
fn a_folder_quit_mid_job_continues_by_itself_after_the_quiet_wait() {
    let root = stopped_in_an_earlier_launch("quit-continues");
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let harness = Harness::new();
    let arm = || {
        commands::status(
            &harness.vectors,
            &shown(&root),
            true,
            Some(&VectorSource::Builtin),
            false,
        )
        .unwrap()
    };
    // Only the launch's status calls: no index pass, no change noted, no prepare.
    arm();
    let entry = entry(&harness, &root);
    harness.clock.set(UPDATE_QUIET - Duration::from_millis(1));
    arm();
    harness.vectors.tick();
    assert!(entry.wait_idle(Duration::ZERO));
    assert!(
        harness.model().sent().is_empty(),
        "not before the quiet wait"
    );
    harness.clock.set(UPDATE_QUIET);
    harness.vectors.tick();
    assert!(entry.wait_idle(WITHIN));

    assert_eq!(harness.model().sent().len(), 70 - 32, "only the rest");
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Ready);
    let events = harness.events.all();
    assert!(events.iter().all(|(_, status)| !status.updating));
    assert!(events
        .iter()
        .any(|(_, status)| { status.phase == VectorPhase::Preparing && status.files_total == 70 }));
    cleanup(&root);
}

#[test]
fn a_quiet_update_waits_thirty_quiet_seconds() {
    let harness = Harness::new();
    let root = vault("quiet", 4);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    rewrite(&root, "wiki/note-000.md");
    harness.vectors.note_change(&entry);
    harness.clock.set(Duration::from_secs(20));
    harness.vectors.note_change(&entry);

    harness
        .clock
        .set(Duration::from_secs(20) + UPDATE_QUIET - Duration::from_millis(1));
    harness.vectors.tick();
    assert!(entry.running_run().is_none() && entry.wait_idle(Duration::ZERO));
    assert!(!sent_rewritten(harness.model()));

    harness.clock.set(Duration::from_secs(20) + UPDATE_QUIET);
    harness.vectors.tick();
    assert!(entry.wait_idle(WITHIN));
    assert!(sent_rewritten(harness.model()));
    cleanup(&root);
}

#[test]
fn a_question_that_drops_a_changed_passage_updates_its_file_without_the_quiet_wait() {
    let harness = Harness::new();
    let root = vault("asked-after-change", 4);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    rewrite(&root, "wiki/note-000.md");
    harness.vectors.note_change(&entry);
    let asked = |harness: &Harness| {
        harness
            .vectors
            .search(&entry, &VectorSource::Builtin, "Passage number 0", 8, &[])
    };

    // The clock never moves, so no quiet wait ends: only the question can start the update.
    harness.model().gate.hold();
    let dropped = asked(&harness);
    assert!(dropped.stale_dropped > 0);
    assert!(dropped.busy, "the answer says the update runs");
    assert!(status(&harness, &entry).busy);
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));
    assert!(sent_rewritten(harness.model()));
    assert!(!status(&harness, &entry).busy);
    let again = asked(&harness);
    assert_eq!((again.stale_dropped, again.busy), (0, false));

    // The question's update covered the wait the index pass began.
    harness.clock.set(UPDATE_QUIET);
    harness.vectors.tick();
    assert!(entry.running_run().is_none() && entry.wait_idle(Duration::ZERO));
    cleanup(&root);
}

#[test]
fn a_quiet_update_starts_ten_minutes_after_the_first_change_however_busy_the_folder() {
    let harness = Harness::new();
    let root = vault("latest", 4);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    rewrite(&root, "wiki/note-000.md");
    let step = Duration::from_secs(5);
    let mut at = Duration::ZERO;
    while at < UPDATE_LATEST {
        harness.clock.set(at);
        harness.vectors.note_change(&entry);
        harness.vectors.tick();
        assert!(entry.wait_idle(Duration::ZERO), "started at {at:?}");
        at += step;
    }
    assert!(!sent_rewritten(harness.model()));
    harness.clock.set(UPDATE_LATEST);
    harness.vectors.tick();
    assert!(entry.wait_idle(WITHIN));
    assert!(sent_rewritten(harness.model()));
    cleanup(&root);
}

/// The worker's life for a folder written to every five seconds for three minutes, on the job's
/// clock: the writes make one update after they go quiet, not one per index pass.
#[test]
fn a_folder_written_every_five_seconds_for_three_minutes_starts_the_worker_once() {
    let harness = Harness::new();
    let root = vault("busy-agent", 20);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let before = harness.model().loads.load(Ordering::SeqCst);
    let step = Duration::from_secs(5);
    let (mut at, mut loaded_ticks, mut first_update) = (Duration::ZERO, 0u32, None);
    while at <= Duration::from_secs(4 * 60) {
        harness.clock.set(at);
        if at <= Duration::from_secs(3 * 60) {
            std::fs::write(
                root.join("wiki/note-000.md"),
                format!(
                    "# Note 0\n\nThe agent wrote this at second {}.\n",
                    at.as_secs()
                ),
            )
            .unwrap();
            harness.vectors.note_change(&entry);
        }
        let loads = harness.model().loads.load(Ordering::SeqCst);
        harness.vectors.tick();
        assert!(entry.wait_idle(WITHIN));
        if first_update.is_none() && harness.model().loads.load(Ordering::SeqCst) > loads {
            first_update = Some(at);
        }
        if harness.model().loaded.load(Ordering::SeqCst) {
            loaded_ticks += 1;
        }
        at += step;
    }
    let starts = harness.model().loads.load(Ordering::SeqCst) - before;
    eprintln!(
        "worker starts {starts}, first update at {first_update:?}, loaded after {loaded_ticks} ticks"
    );
    assert_eq!(starts, 1);
    assert_eq!(
        first_update,
        Some(Duration::from_secs(3 * 60) + UPDATE_QUIET)
    );
    assert_eq!(loaded_ticks, 0, "released as the update ended");
    let last = harness.model().sent();
    assert!(last.last().is_some_and(|text| text.contains("second 180")));
    cleanup(&root);
}

#[test]
fn quitting_waits_for_a_job_to_close_its_line_and_not_past_its_bound() {
    let harness = Harness::new();
    let root = vault("quit", 40);
    let entry = entry(&harness, &root);
    let model = &harness.sources.runner;
    model.gate.allow(1);
    harness.vectors.prepare(&entry, runner(), true);
    assert!(model.gate.wait_for_held());
    assert!(harness.vectors.stop_all(WITHIN));
    assert_eq!(
        *lock(&model.ends),
        vec![RunEnd::Stopped],
        "closed before quitting"
    );

    model.gate.hold();
    model.deaf.store(true, Ordering::SeqCst);
    harness.vectors.prepare(&entry, runner(), true);
    assert!(model.gate.wait_for_held());
    assert!(!harness.vectors.stop_all(Duration::from_millis(50)));
    assert_eq!(
        lock(&model.ends).len(),
        1,
        "a step that outlasts the bound is not awaited"
    );
    model.gate.open();
    assert!(entry.wait_idle(WITHIN));
    cleanup(&root);
}

#[test]
fn a_pass_that_panics_fails_and_can_be_prepared_again() {
    let harness = Harness::new();
    let root = vault("panics", 4);
    let entry = entry(&harness, &root);
    harness.model().panic_batch.store(true, Ordering::SeqCst);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let failed = status(&harness, &entry);
    assert_eq!(
        (
            failed.phase,
            failed.failure,
            failed.failure_detail.as_deref()
        ),
        (
            VectorPhase::Failed,
            Some(VectorFailure::ModelFailed),
            Some("internal")
        )
    );
    assert!(entry.running_run().is_none());

    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Ready);
    cleanup(&root);
}
