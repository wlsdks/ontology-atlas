use super::job::{Entry, UPDATE_LATEST};
use super::memory::{Keeper, RELEASE_AFTER, SEARCHER_IDLE};
use super::models::{builtin_model, readable_model};
use super::report::{Rate, Throttle, MAX_GAP};
use super::types::{
    failure_of, During, FoundState, VectorFailure, VectorPhase, VectorSource, VectorStatus,
};
use crate::llm::embed::{EmbedError, RunEnd};
use fakes::{cleanup, lock, vault, Harness, WITHIN};
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

mod fakes;
mod measure;

fn entry(harness: &Harness, root: &Path) -> Arc<Entry> {
    harness.vectors.entry(root, &root.to_string_lossy())
}

fn status(harness: &Harness, entry: &Entry) -> VectorStatus {
    harness.vectors.status(entry, true, None)
}

fn runner() -> VectorSource {
    VectorSource::Runner {
        base_url: "http://localhost:11434".into(),
        model: "bge-m3".into(),
    }
}

/// Prepares with the built-in model and waits for the job to end.
fn prepare_and_wait(harness: &Harness, entry: &Arc<Entry>, source: VectorSource) {
    harness.vectors.prepare(entry, source);
    assert!(entry.wait_idle(WITHIN), "the job did not end");
}

#[test]
fn concurrent_prepare_calls_run_one_job_per_folder() {
    let harness = Harness::new();
    let root = vault("one-job", 70);
    let entry = entry(&harness, &root);
    harness.model().gate.hold();
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    let callers: Vec<_> = (0..8)
        .map(|_| {
            let (vectors, entry) = (harness.vectors.clone(), entry.clone());
            std::thread::spawn(move || vectors.prepare(&entry, VectorSource::Builtin))
        })
        .collect();
    for caller in callers {
        caller.join().unwrap();
    }
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));

    assert_eq!(harness.model().most_sessions.load(Ordering::SeqCst), 1);
    let sent = harness.model().sent();
    let mut distinct = sent.clone();
    distinct.sort();
    distinct.dedup();
    assert_eq!(sent.len(), 70, "every passage once");
    assert_eq!(distinct.len(), 70);
    // The extra pass found nothing left and opened no second build.
    assert_eq!(*lock(&harness.model().ends), vec![RunEnd::Complete]);
    let done = status(&harness, &entry);
    assert_eq!(done.phase, VectorPhase::Ready);
    assert_eq!((done.files_done, done.files_total), (70, 70));
    cleanup(&root);
}

#[test]
fn a_second_folder_waits_its_turn_and_then_runs() {
    let harness = Harness::new();
    let (first_root, second_root) = (vault("turn-a", 40), vault("turn-b", 3));
    let (first, second) = (entry(&harness, &first_root), entry(&harness, &second_root));
    harness.model().gate.hold();
    harness.vectors.prepare(&first, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    harness.vectors.prepare(&second, VectorSource::Builtin);
    assert!(harness
        .events
        .wait_for(|status| status.phase == VectorPhase::WaitingTurn));
    assert_eq!(status(&harness, &second).phase, VectorPhase::WaitingTurn);

    harness.model().gate.open();
    assert!(first.wait_idle(WITHIN) && second.wait_idle(WITHIN));
    assert_eq!(status(&harness, &first).phase, VectorPhase::Ready);
    assert_eq!(status(&harness, &second).phase, VectorPhase::Ready);
    assert_eq!(harness.model().most_sessions.load(Ordering::SeqCst), 1);
    cleanup(&first_root);
    cleanup(&second_root);
}

#[test]
fn stop_keeps_finished_passages_and_resume_sends_only_the_rest() {
    let harness = Harness::new();
    let root = vault("resume", 70);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    harness.vectors.stop(&entry);
    assert!(entry.wait_idle(WITHIN));

    let first_run = harness.model().sent();
    assert_eq!(first_run.len(), 32, "one batch was stored before the stop");
    let stopped = status(&harness, &entry);
    assert_eq!(stopped.phase, VectorPhase::Stopped);
    assert_eq!(stopped.failure, None);
    assert_eq!((stopped.passages_done, stopped.passages_total), (32, 70));
    assert_eq!(*lock(&harness.model().ends), vec![RunEnd::Stopped]);

    harness.model().gate.open();
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let sent = harness.model().sent();
    let resumed = &sent[first_run.len()..];
    assert_eq!(resumed.len(), 38, "only the passages not yet stored");
    assert!(resumed.iter().all(|text| !first_run.contains(text)));
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Ready);
    cleanup(&root);
}

#[test]
fn an_update_after_an_edit_sends_only_the_changed_passage() {
    let harness = Harness::new();
    let root = vault("update", 6);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let before = harness.model().sent().len();

    std::fs::write(
        root.join("wiki/note-002.md"),
        "# Note 2\n\nRewritten: the sedge meadow floods every spring.\n",
    )
    .unwrap();
    harness.vectors.request_update(&entry);
    assert!(entry.wait_idle(WITHIN));

    let sent = harness.model().sent();
    let changed = &sent[before..];
    assert_eq!(changed.len(), 1, "{changed:?}");
    assert!(changed[0].contains("Rewritten"));
    let updating: Vec<VectorStatus> = harness
        .events
        .all()
        .into_iter()
        .map(|(_, status)| status)
        .filter(|status| status.updating)
        .collect();
    assert!(!updating.is_empty());
    for status in &updating {
        assert_eq!(status.phase, VectorPhase::Preparing);
        // The changed file alone, not the folder's six.
        assert_eq!(status.files_total, 1, "{status:?}");
        assert_eq!(status.passages_total, 1, "{status:?}");
    }
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Ready);
    cleanup(&root);
}

#[test]
fn an_update_makes_nothing_for_a_folder_never_set_up() {
    let harness = Harness::new();
    let root = vault("never-set-up", 4);
    let entry = entry(&harness, &root);
    // Even an armed choice makes no store: only existing vectors are updated.
    entry.arm(&VectorSource::Builtin, false);
    harness.vectors.request_update(&entry);
    assert!(entry.wait_idle(WITHIN));
    harness.vectors.note_change(&entry);
    harness.clock.set(UPDATE_LATEST);
    harness.vectors.tick();
    assert!(entry.wait_idle(WITHIN));

    assert_eq!(vault_index::vectors::store_model(&root).unwrap(), None);
    assert_eq!(vault_index::vectors::vectors_bytes(&root).unwrap(), 0);
    assert!(harness.model().sent().is_empty());
    assert_eq!(status(&harness, &entry).phase, VectorPhase::NotSetUp);
    cleanup(&root);
}

#[test]
fn a_question_during_a_job_is_answered_between_batches_by_the_same_copy() {
    let harness = Harness::new();
    let root = vault("question", 100);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());

    let found = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "Passage number 3", 8);
    assert_eq!(found.state, FoundState::Ok);
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Preparing);
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));

    let log = lock(&harness.model().log).clone();
    let question = log.iter().position(|turn| *turn == "question").unwrap();
    assert!(question > 0 && question < log.len() - 1, "{log:?}");
    assert_eq!(
        harness.model().loads.load(Ordering::SeqCst),
        1,
        "one loaded copy"
    );
    cleanup(&root);
}

#[test]
fn search_finds_prepared_passages_and_reports_coverage() {
    let harness = Harness::new();
    let root = vault("search", 5);
    let entry = entry(&harness, &root);
    let before = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "anything", 8);
    assert_eq!(before.state, FoundState::NotReady);

    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let text = harness
        .model()
        .sent()
        .into_iter()
        .find(|text| text.contains("Passage number 1 "))
        .unwrap();
    let text = text.as_str();
    let found = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, text, 3);
    assert_eq!(found.state, FoundState::Ok);
    assert_eq!(
        found.hits.first().map(|hit| hit.path.as_str()),
        Some("sources/note-001.md")
    );
    assert_eq!(
        found.hits.first().map(|hit| hit.heading.as_str()),
        Some("Note 1")
    );
    assert_eq!((found.files_ready, found.files_total), (5, 5));
    assert!(found.hits.len() <= 3);

    // A file that no longer holds its passage is dropped and counted.
    std::fs::write(root.join("sources/note-001.md"), "# Note 1\n\nGone.\n").unwrap();
    let stale = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, text, 3);
    assert!(stale
        .hits
        .iter()
        .all(|hit| hit.path != "sources/note-001.md"));
    assert_eq!(stale.stale_dropped, 1);
    assert!(entry.wait_idle(WITHIN));
    cleanup(&root);
}

#[test]
fn a_deleted_model_turns_search_and_status_into_model_gone() {
    let harness = Harness::new();
    let root = vault("model-gone", 3);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    harness.vectors.delete_model().unwrap();

    assert!(!harness.model().ready.load(Ordering::SeqCst));
    assert!(harness.model().releases.load(Ordering::SeqCst) >= 1);
    let found = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "quillwort", 8);
    assert_eq!(
        (found.state, found.failure),
        (FoundState::Failed, Some(VectorFailure::ModelGone))
    );
    let gone = status(&harness, &entry);
    assert_eq!(
        (gone.phase, gone.failure),
        (VectorPhase::Failed, Some(VectorFailure::ModelGone))
    );
    // An update never downloads it again.
    harness.vectors.request_update(&entry);
    assert!(entry.wait_idle(WITHIN));
    assert_eq!(harness.model().downloads.load(Ordering::SeqCst), 0);
    cleanup(&root);
}

#[test]
fn the_model_is_made_ready_first_and_its_progress_is_reported() {
    let harness = Harness::new();
    harness.model().ready.store(false, Ordering::SeqCst);
    let root = vault("download", 3);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);

    let phases: Vec<VectorPhase> = harness.events.all().iter().map(|(_, s)| s.phase).collect();
    let at = |phase| phases.iter().position(|p| *p == phase).unwrap();
    assert!(at(VectorPhase::ModelDownloading) < at(VectorPhase::ModelConverting));
    assert!(at(VectorPhase::ModelConverting) < at(VectorPhase::Preparing));
    for (_, event) in harness.events.all() {
        assert_eq!(
            event.model.is_some(),
            event.phase == VectorPhase::ModelDownloading
        );
    }
    assert!(
        harness.model().releases.load(Ordering::SeqCst) >= 1,
        "released before the files change"
    );
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Ready);
    cleanup(&root);
}

#[test]
fn delete_during_a_job_ends_it_and_leaves_nothing() {
    let harness = Harness::new();
    let root = vault("delete", 70);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    assert!(vault_index::vectors::vectors_bytes(&root).unwrap() > 0);

    harness
        .vectors
        .forget(Some(&root), || vault_index::vectors::delete_vectors(&root))
        .unwrap();
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));

    assert_eq!(vault_index::vectors::store_model(&root).unwrap(), None);
    assert_eq!(status(&harness, &entry).phase, VectorPhase::NotSetUp);
    assert!(lock(&entry.searcher).is_none());
    // Nothing the folder had remembered asks for vectors again.
    harness.vectors.request_update(&entry);
    assert!(entry.wait_idle(WITHIN));
    assert_eq!(vault_index::vectors::store_model(&root).unwrap(), None);
    cleanup(&root);
}

#[test]
fn switching_the_index_off_while_a_folder_waits_its_turn_leaves_no_vectors() {
    let harness = Harness::new();
    let (busy_root, waiting_root) = (vault("off-busy", 40), vault("off-waiting", 3));
    let (busy, waiting) = (entry(&harness, &busy_root), entry(&harness, &waiting_root));
    harness.model().gate.hold();
    harness.vectors.prepare(&busy, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    harness.vectors.prepare(&waiting, VectorSource::Builtin);
    assert!(harness
        .events
        .wait_for(|status| status.phase == VectorPhase::WaitingTurn));

    harness.vectors.forget(None, || {
        vault_index::delete(Some(&busy_root)).unwrap();
        vault_index::delete(Some(&waiting_root)).unwrap();
    });
    harness.model().gate.open();
    assert!(busy.wait_idle(WITHIN) && waiting.wait_idle(WITHIN));
    for root in [&busy_root, &waiting_root] {
        assert_eq!(vault_index::vectors::store_model(root).unwrap(), None);
        assert_eq!(vault_index::vectors::vectors_bytes(root).unwrap(), 0);
    }
    cleanup(&busy_root);
    cleanup(&waiting_root);
}

#[test]
fn every_failure_reaches_the_screen_as_its_code() {
    use EmbedError as E;
    let prepare = During::ModelPrepare;
    let convert = During::ModelConvert;
    let builtin = During::Embedding { runner: false };
    let runner = During::Embedding { runner: true };
    let cases = [
        (E::NoDirectConnection, prepare, VectorFailure::NeedsDirect),
        (
            E::DiskSpace { needed: 2, free: 1 },
            prepare,
            VectorFailure::DiskShort,
        ),
        (
            E::HashMismatch("x".into()),
            prepare,
            VectorFailure::ModelCheck,
        ),
        (
            E::SizeMismatch("x".into()),
            prepare,
            VectorFailure::ModelCheck,
        ),
        (E::Store("full".into()), prepare, VectorFailure::Write),
        (E::Request("reset".into()), prepare, VectorFailure::Download),
        (E::HostRefused("x".into()), prepare, VectorFailure::Download),
        (
            E::ModelLoad("reference 0".into()),
            convert,
            VectorFailure::ModelFailed,
        ),
        (
            E::ModelLoad("weights".into()),
            convert,
            VectorFailure::ModelFailed,
        ),
        (E::WorkerExited, convert, VectorFailure::ModelFailed),
        (E::TimedOut, convert, VectorFailure::ModelFailed),
        (
            E::WorkerStart("spawn".into()),
            convert,
            VectorFailure::ModelFailed,
        ),
        (E::Store("full".into()), convert, VectorFailure::Write),
        (
            E::AuditBlocked("x".into()),
            prepare,
            VectorFailure::AuditBlocked,
        ),
        (
            E::AuditBlocked("x".into()),
            runner,
            VectorFailure::AuditBlocked,
        ),
        (E::ModelNotReady, builtin, VectorFailure::ModelGone),
        (E::WorkerExited, builtin, VectorFailure::ModelFailed),
        (E::TimedOut, builtin, VectorFailure::ModelFailed),
        (E::TimedOut, runner, VectorFailure::RunnerDown),
        (
            E::Request("refused".into()),
            runner,
            VectorFailure::RunnerDown,
        ),
        (E::NotLocal, runner, VectorFailure::RunnerDown),
        (E::ModelMissing, runner, VectorFailure::ModelMissing),
        (
            E::ResponseInvalid("count"),
            runner,
            VectorFailure::ModelFailed,
        ),
    ];
    for (error, during, expected) in cases {
        assert_eq!(failure_of(&error, during), expected, "{error}");
    }
}

#[test]
fn a_failed_pass_names_its_failure_and_keeps_what_was_stored() {
    let harness = Harness::new();
    let root = vault("failures", 40);
    let entry = entry(&harness, &root);

    *lock(&harness.model().prepare_error) = Some(EmbedError::DiskSpace { needed: 9, free: 1 });
    harness.model().ready.store(false, Ordering::SeqCst);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let short = status(&harness, &entry);
    assert_eq!(
        (short.phase, short.failure),
        (VectorPhase::Failed, Some(VectorFailure::DiskShort))
    );
    assert_eq!(
        short.failure_detail.as_deref(),
        Some("embed-model-disk-space")
    );
    *lock(&harness.model().prepare_error) = None;

    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    *lock(&harness.model().batch_error) = Some(EmbedError::WorkerExited);
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));
    let kept = status(&harness, &entry);
    assert_eq!(
        (kept.phase, kept.failure),
        (VectorPhase::Stopped, Some(VectorFailure::ModelFailed))
    );
    assert_eq!(kept.passages_done, 32);
    assert_eq!(lock(&harness.model().ends).last(), Some(&RunEnd::Failed));
    *lock(&harness.model().batch_error) = None;

    harness.sources.walk_fails.store(true, Ordering::SeqCst);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    assert_eq!(
        status(&harness, &entry).failure,
        Some(VectorFailure::Unreadable)
    );
    harness.sources.walk_fails.store(false, Ordering::SeqCst);

    *lock(&harness.sources.runner_error) = Some(EmbedError::Request("refused".into()));
    prepare_and_wait(&harness, &entry, runner());
    assert_eq!(
        status(&harness, &entry).failure,
        Some(VectorFailure::RunnerDown)
    );
    *lock(&harness.sources.runner_error) = None;

    *lock(&harness.sources.runner.reported_dimensions) = Err(EmbedError::ModelMissing);
    prepare_and_wait(&harness, &entry, runner());
    assert_eq!(
        status(&harness, &entry).failure,
        Some(VectorFailure::ModelMissing)
    );
    *lock(&harness.sources.runner.reported_dimensions) = Ok(Some(8));

    // Only a runner writes audit lines, so only a runner is blocked by an unwritable log.
    *lock(&harness.sources.runner.start_error) = Some(EmbedError::AuditBlocked("locked".into()));
    prepare_and_wait(&harness, &entry, runner());
    assert_eq!(
        status(&harness, &entry).failure,
        Some(VectorFailure::AuditBlocked)
    );
    *lock(&harness.sources.runner.start_error) = None;

    // The next pass that does not fail clears it.
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let ready = status(&harness, &entry);
    assert_eq!((ready.phase, ready.failure), (VectorPhase::Ready, None));
    cleanup(&root);
}

#[test]
fn a_runner_prepares_its_own_store_beside_no_other() {
    let harness = Harness::new();
    let root = vault("runner", 4);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, runner());
    let stored = vault_index::vectors::store_model(&root).unwrap().unwrap();
    assert_eq!(
        (stored.name.as_str(), stored.dimensions),
        ("runner/bge-m3", 8)
    );
    assert_eq!(readable_model(&root, &runner()), Some(stored));
    assert_eq!(readable_model(&root, &VectorSource::Builtin), None);
    assert_eq!(harness.sources.runner.sent().len(), 4);
    assert!(harness.model().sent().is_empty());
    assert_eq!(builtin_model().name, "builtin/bge-m3");
    cleanup(&root);
}

#[test]
fn no_status_event_carries_vault_text_other_than_a_relative_path() {
    let harness = Harness::new();
    let root = vault("private", 0);
    let secret = "SECRET-BODY-7f3a";
    for at in 0..40 {
        std::fs::write(
            root.join(format!("wiki/page-{at}.md")),
            format!("# {secret} heading {at}\n\n{secret} body {at}\n"),
        )
        .unwrap();
    }
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    // Time passes, so the next batch's progress is due.
    harness.clock.set(Duration::from_secs(10));
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));

    let events = harness.events.all();
    let shown = serde_json::to_string(&events.iter().map(|(_, s)| s).collect::<Vec<_>>()).unwrap();
    assert!(!shown.contains(secret), "{shown}");
    let paths: Vec<String> = events
        .iter()
        .filter_map(|(_, status)| status.current_path.clone())
        .collect();
    assert!(!paths.is_empty());
    assert!(paths
        .iter()
        .all(|path| path.starts_with("wiki/page-") && path.ends_with(".md")));
    assert!(events
        .iter()
        .all(|(root_path, _)| root_path == &root.to_string_lossy()));
    cleanup(&root);
}

#[test]
fn progress_events_are_throttled_by_count_on_the_clock() {
    let mut throttle = Throttle::default();
    let mut sent = 0;
    // A batch every 10 ms for one second: the first, then at most one per 250 ms.
    for step in 0..100u64 {
        if throttle.due(Duration::from_millis(step * 10), true) {
            sent += 1;
        }
    }
    assert_eq!(sent, 4);
    // Nothing moves for ten seconds: still one every two seconds.
    let mut quiet = Throttle::default();
    let mut alive = 0;
    for step in 0..=100u64 {
        if quiet.due(Duration::from_millis(step * 100), false) {
            alive += 1;
        }
    }
    assert_eq!(alive, 1 + (10_000 / MAX_GAP.as_millis() as u64));
}

#[test]
fn the_job_sends_progress_at_most_four_times_a_second() {
    let harness = Harness::new();
    let root = vault("throttle", 200);
    let entry = entry(&harness, &root);
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(entry.wait_idle(WITHIN));
    // The clock never moved: only phase changes and the first progress event went out.
    let preparing = harness
        .events
        .all()
        .iter()
        .filter(|(_, status)| {
            status.phase == VectorPhase::Preparing && status.current_path.is_some()
        })
        .count();
    assert!(preparing <= 2, "{preparing} progress events in no time");
    cleanup(&root);
}

#[test]
fn the_rate_is_measured_over_at_least_thirty_seconds() {
    let mut rate = Rate::default();
    let at = Duration::from_secs;
    rate.record(at(0), 0);
    rate.record(at(10), 100);
    assert_eq!(rate.per_second(at(10)), None);
    rate.record(at(30), 300);
    assert_eq!(rate.per_second(at(30)), Some(10.0));
    for second in 31..=90 {
        rate.record(at(second), 300 + (second - 30) * 20);
    }
    // The last 30 s ran at 20 passages a second; the slow start no longer counts.
    assert_eq!(rate.per_second(at(90)), Some(20.0));
}

#[test]
fn the_worker_leaves_two_minutes_after_the_last_question_and_never_mid_job() {
    let at = Duration::from_secs;
    let mut keeper = Keeper::default();
    keeper.job_started();
    keeper.question(at(0));
    assert!(!keeper.due(at(600)), "a running job keeps it");
    keeper.job_ended(at(600));
    assert!(
        keeper.due(at(600)),
        "no question in the last two minutes: at once"
    );

    keeper.job_started();
    keeper.question(at(1000));
    keeper.job_ended(at(1060));
    assert!(!keeper.due(at(1060)));
    assert!(!keeper.due(at(1000) + RELEASE_AFTER - Duration::from_millis(1)));
    assert!(keeper.due(at(1000) + RELEASE_AFTER));
    assert!(!keeper.due(at(5000)), "released once");

    keeper.question(at(6000));
    assert!(keeper.due(at(6000) + RELEASE_AFTER));
}

#[test]
fn the_job_releases_the_worker_by_the_clock() {
    let harness = Harness::new();
    let root = vault("release", 40);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin);
    assert!(harness.model().gate.wait_for_held());
    harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "quillwort", 4);
    harness.clock.set(Duration::from_secs(300));
    harness.vectors.tick();
    assert_eq!(
        harness.model().releases.load(Ordering::SeqCst),
        0,
        "not while the job runs"
    );

    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));
    assert_eq!(
        harness.model().releases.load(Ordering::SeqCst),
        1,
        "the job ended long after the question"
    );

    harness.clock.set(Duration::from_secs(400));
    harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "sedges", 4);
    harness
        .clock
        .set(Duration::from_secs(400) + RELEASE_AFTER - Duration::from_secs(1));
    harness.vectors.tick();
    assert_eq!(harness.model().releases.load(Ordering::SeqCst), 1);
    harness.clock.set(Duration::from_secs(400) + RELEASE_AFTER);
    harness.vectors.tick();
    assert_eq!(harness.model().releases.load(Ordering::SeqCst), 2);

    // The folder's search copy goes after ten minutes without a search.
    assert!(lock(&entry.searcher).is_some());
    harness
        .clock
        .set(Duration::from_secs(400) + SEARCHER_IDLE - Duration::from_secs(1));
    harness.vectors.tick();
    assert!(lock(&entry.searcher).is_some());
    harness.clock.set(Duration::from_secs(400) + SEARCHER_IDLE);
    harness.vectors.tick();
    assert!(lock(&entry.searcher).is_none());
    cleanup(&root);
}

#[test]
fn warming_loads_a_ready_model_and_never_downloads() {
    let harness = Harness::new();
    harness.vectors.warm(&VectorSource::Builtin);
    assert_eq!(harness.model().loads.load(Ordering::SeqCst), 1);
    harness.model().ready.store(false, Ordering::SeqCst);
    harness.vectors.warm(&VectorSource::Builtin);
    harness.vectors.warm(&runner());
    assert_eq!(harness.model().downloads.load(Ordering::SeqCst), 0);
}

#[test]
fn status_off_and_not_set_up_create_nothing() {
    let harness = Harness::new();
    let root = vault("status", 2);
    let entry = entry(&harness, &root);
    assert_eq!(
        harness
            .vectors
            .status(&entry, false, Some(&VectorSource::Builtin))
            .phase,
        VectorPhase::Off
    );
    assert_eq!(
        harness.vectors.status(&entry, true, Some(&runner())).phase,
        VectorPhase::NotSetUp
    );
    assert_eq!(vault_index::vectors::vectors_bytes(&root).unwrap(), 0);
    cleanup(&root);
}

#[test]
fn the_contract_shapes_cross_as_camel_case() {
    let source: VectorSource = serde_json::from_str(
        r#"{"kind":"runner","baseUrl":"http://localhost:11434","model":"bge-m3"}"#,
    )
    .unwrap();
    assert_eq!(source, runner());
    let builtin: VectorSource = serde_json::from_str(r#"{"kind":"builtin"}"#).unwrap();
    assert_eq!(builtin, VectorSource::Builtin);

    let mut status = VectorStatus::of_phase(VectorPhase::WaitingTurn);
    status.failure = Some(VectorFailure::ModelFailed);
    let shown = serde_json::to_value(&status).unwrap();
    assert_eq!(shown["phase"], "waitingTurn");
    assert_eq!(shown["failure"], "modelFailed");
    for key in [
        "failureDetail",
        "filesDone",
        "filesTotal",
        "passagesDone",
        "passagesTotal",
        "updating",
        "currentPath",
        "passagesPerSecond",
        "model",
        "vectorsBytes",
    ] {
        assert!(shown.get(key).is_some(), "{key}");
    }
}

mod held;
mod refused;
