//! What the person did holds: a stop, a pause across a restart, a delete, the source a prepare
//! chose.

use super::super::commands;
use super::super::job::{UPDATE_LATEST, UPDATE_QUIET};
use super::super::models::Sources;
use super::*;
use crate::llm::embed::builtin::Stage as ModelStage;
use crate::vault_grants::EnforcedScope;
use std::path::PathBuf;

pub(super) fn shown(root: &Path) -> String {
    root.to_string_lossy().into_owned()
}

pub(super) fn rewrite(root: &Path, file: &str) {
    std::fs::write(
        root.join(file),
        "# Rewritten\n\nRewritten: the sedge meadow floods every spring.\n",
    )
    .unwrap();
}

/// What an index pass that changed files does, then the clock past the quiet wait.
fn index_pass_then_quiet(harness: &Harness, entry: &Arc<Entry>, at: Duration) {
    harness.clock.set(at);
    harness.vectors.note_change(entry);
    harness.clock.set(at + UPDATE_QUIET);
    harness.vectors.tick();
    assert!(entry.wait_idle(WITHIN));
}

pub(super) fn sent_rewritten(model: &fakes::FakeModel) -> bool {
    model.sent().iter().any(|text| text.contains("Rewritten"))
}

#[test]
fn a_stopped_folder_prepares_nothing_after_an_index_pass_or_a_stale_hit() {
    let harness = Harness::new();
    let root = vault("stop-holds", 320);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    harness.vectors.stop(&entry);
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));
    let stopped = harness.model().sent().len();
    assert_eq!(stopped, 32, "one batch of 320 passages, a tenth");

    rewrite(&root, "wiki/note-000.md");
    index_pass_then_quiet(&harness, &entry, Duration::ZERO);
    harness.vectors.request_update(&entry);
    assert!(entry.wait_idle(WITHIN));
    let found = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "Passage number 3", 4, &[]);
    assert_eq!(found.state, FoundState::Ok);
    index_pass_then_quiet(&harness, &entry, UPDATE_LATEST);

    assert_eq!(harness.model().sent().len(), stopped, "nothing embedded");
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Stopped);
    assert!(entry.held());

    // Prepare lets it go.
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Ready);
    assert!(!entry.held());
    cleanup(&root);
}

#[test]
fn a_failed_folder_prepares_nothing_after_an_index_pass() {
    let harness = Harness::new();
    let root = vault("failure-holds", 70);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    *lock(&harness.model().batch_error) = Some(EmbedError::WorkerExited);
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));
    *lock(&harness.model().batch_error) = None;
    let failed = harness.model().sent().len();

    rewrite(&root, "wiki/note-000.md");
    index_pass_then_quiet(&harness, &entry, Duration::ZERO);

    assert_eq!(harness.model().sent().len(), failed, "nothing embedded");
    let held = status(&harness, &entry);
    assert_eq!(
        (held.phase, held.failure),
        (VectorPhase::Stopped, Some(VectorFailure::ModelFailed))
    );
    cleanup(&root);
}

#[test]
fn a_stop_that_lands_between_two_queued_passes_starts_neither_again() {
    let harness = Harness::new();
    let root = vault("stop-between", 3);
    let entry = entry(&harness, &root);
    harness.model().gate.hold();
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    // Read and queued: this edit is for the next pass, which an update asks for now.
    rewrite(&root, "wiki/note-000.md");
    harness.vectors.request_update(&entry);
    // The Stop lands after the first pass ended and before the queued one starts.
    let (vectors, stopping) = (Arc::downgrade(&harness.vectors), entry.clone());
    harness.events.on_event(move |status| {
        if status.phase != VectorPhase::Ready {
            return false;
        }
        if let Some(vectors) = vectors.upgrade() {
            vectors.stop(&stopping);
        }
        true
    });
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));

    assert!(!sent_rewritten(harness.model()), "the queued pass ran");
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Stopped);
    cleanup(&root);
}

/// A folder stopped half way in an earlier launch: its store on disk, nothing in memory.
pub(super) fn stopped_in_an_earlier_launch(label: &str) -> PathBuf {
    let earlier = Harness::new();
    let root = vault(label, 70);
    let entry = entry(&earlier, &root);
    earlier.model().gate.allow(1);
    earlier.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(earlier.model().gate.wait_for_held());
    earlier.vectors.stop(&entry);
    earlier.model().gate.open();
    assert!(entry.wait_idle(WITHIN));
    root
}

#[test]
fn a_pause_the_webview_sends_holds_a_folder_across_a_restart() {
    let root = stopped_in_an_earlier_launch("paused-restart");
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let harness = Harness::new();
    let paused = commands::status(
        &harness.vectors,
        &shown(&root),
        true,
        Some(&VectorSource::Builtin),
        true,
    )
    .unwrap();
    assert_eq!(paused.phase, VectorPhase::Stopped);
    let entry = entry(&harness, &root);
    index_pass_then_quiet(&harness, &entry, Duration::ZERO);
    assert!(
        harness.model().sent().is_empty(),
        "a paused folder continued"
    );
    assert_eq!(status(&harness, &entry).phase, VectorPhase::Stopped);
    cleanup(&root);
}

#[test]
fn a_status_call_never_moves_the_source_a_prepare_chose() {
    let harness = Harness::new();
    let root = vault("source-stays", 3);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, runner());
    let elsewhere = VectorSource::Runner {
        base_url: "http://127.0.0.1:9".into(),
        model: "bge-m3".into(),
    };
    commands::status(
        &harness.vectors,
        &shown(&root),
        true,
        Some(&elsewhere),
        false,
    )
    .unwrap();
    commands::status(
        &harness.vectors,
        &shown(&root),
        true,
        Some(&elsewhere),
        true,
    )
    .unwrap();
    assert_eq!(entry.source(), Some(runner()));
    assert!(
        !entry.held(),
        "a pause arms only a folder this launch has not armed"
    );
    cleanup(&root);
}

#[test]
fn stop_and_delete_answer_what_the_person_did_while_a_batch_is_in_flight() {
    let harness = Harness::new();
    let root = vault("answers", 70);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    // The batch in flight ignores the stop, as a request already sent can.
    harness.model().deaf.store(true, Ordering::SeqCst);
    let from = harness.events.count();
    let answer = commands::stop(&harness.vectors, &shown(&root)).unwrap();
    assert_eq!(answer.phase, VectorPhase::Stopped);
    assert_eq!((answer.passages_done, answer.passages_total), (32, 70));
    harness.model().gate.allow(1);
    assert!(entry.wait_idle(WITHIN));
    let after: Vec<VectorPhase> = harness.events.all()[from..]
        .iter()
        .map(|(_, status)| status.phase)
        .collect();
    assert!(!after.is_empty());
    assert!(
        after.iter().all(|phase| *phase == VectorPhase::Stopped),
        "{after:?}"
    );

    harness.model().deaf.store(false, Ordering::SeqCst);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    harness.model().deaf.store(true, Ordering::SeqCst);
    let from = harness.events.count();
    let answer = commands::delete(&harness.vectors, &shown(&root)).unwrap();
    assert_eq!(answer, VectorStatus::of_phase(VectorPhase::NotSetUp));
    harness.model().gate.open();
    assert!(entry.wait_idle(WITHIN));
    let after = &harness.events.all()[from..];
    assert!(!after.is_empty());
    assert!(after
        .iter()
        .all(|(_, status)| *status == VectorStatus::of_phase(VectorPhase::NotSetUp)));
    assert_eq!(vault_index::vectors::store_model(&root).unwrap(), None);
    cleanup(&root);
}

#[test]
fn deleting_the_model_stops_a_folder_waiting_to_start_before_it_touches_the_model() {
    let harness = Harness::new();
    let (busy_root, queued_root) = (vault("delete-busy", 40), vault("delete-queued", 3));
    let (busy, queued) = (entry(&harness, &busy_root), entry(&harness, &queued_root));
    harness.model().gate.hold();
    harness.vectors.prepare(&busy, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    harness
        .vectors
        .prepare(&queued, VectorSource::Builtin, true);
    assert!(harness
        .events
        .wait_for(|status| status.phase == VectorPhase::WaitingTurn));

    harness.vectors.delete_model().unwrap();
    assert!(busy.wait_idle(WITHIN) && queued.wait_idle(WITHIN));
    assert!(!harness.model().ready.load(Ordering::SeqCst));
    assert_eq!(harness.model().downloads.load(Ordering::SeqCst), 0);
    assert_eq!(
        vault_index::vectors::store_model(&queued_root).unwrap(),
        None
    );
    let gone = status(&harness, &busy);
    assert_eq!(
        (gone.phase, gone.failure),
        (VectorPhase::Failed, Some(VectorFailure::ModelGone))
    );
    harness.model().gate.open();
    cleanup(&busy_root);
    cleanup(&queued_root);
}

#[test]
fn a_folder_waiting_its_turn_says_so_first() {
    let harness = Harness::new();
    harness.model().ready.store(false, Ordering::SeqCst);
    let (busy_root, waiting_root) = (vault("first-busy", 40), vault("first-waiting", 3));
    let (busy, waiting) = (entry(&harness, &busy_root), entry(&harness, &waiting_root));
    harness.sources.runner.gate.hold();
    harness.vectors.prepare(&busy, runner(), true);
    assert!(harness.sources.runner.gate.wait_for_held());
    harness
        .vectors
        .prepare(&waiting, VectorSource::Builtin, true);
    assert_eq!(status(&harness, &waiting).phase, VectorPhase::WaitingTurn);
    harness.sources.runner.gate.open();
    assert!(busy.wait_idle(WITHIN) && waiting.wait_idle(WITHIN));

    let phases: Vec<VectorPhase> = harness
        .events
        .all()
        .into_iter()
        .filter(|(root_path, _)| *root_path == shown(&waiting_root))
        .map(|(_, status)| status.phase)
        .collect();
    assert_eq!(
        phases.first(),
        Some(&VectorPhase::WaitingTurn),
        "{phases:?}"
    );
    assert!(phases.contains(&VectorPhase::ModelDownloading));
    assert_eq!(status(&harness, &waiting).phase, VectorPhase::Ready);
    cleanup(&busy_root);
    cleanup(&waiting_root);
}

#[test]
fn a_model_gone_during_an_update_fails_as_model_gone_with_vectors_kept() {
    let harness = Harness::new();
    let (busy_root, root) = (vault("gone-busy", 40), vault("gone-update", 4));
    let (busy, entry) = (entry(&harness, &busy_root), entry(&harness, &root));
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    harness.sources.runner.gate.hold();
    harness.vectors.prepare(&busy, runner(), true);
    assert!(harness.sources.runner.gate.wait_for_held());
    rewrite(&root, "wiki/note-000.md");
    harness.vectors.request_update(&entry);
    harness.model().ready.store(false, Ordering::SeqCst);
    harness.sources.runner.gate.open();
    assert!(busy.wait_idle(WITHIN) && entry.wait_idle(WITHIN));

    let gone = status(&harness, &entry);
    assert_eq!(
        (gone.phase, gone.failure),
        (VectorPhase::Failed, Some(VectorFailure::ModelGone))
    );
    assert!(gone.passages_done > 0, "the vectors are kept");
    assert_eq!(harness.model().downloads.load(Ordering::SeqCst), 0);
    cleanup(&busy_root);
    cleanup(&root);
}

#[test]
fn a_model_that_fails_after_its_download_names_the_step_and_why() {
    let cases = [
        (
            ModelStage::Download,
            EmbedError::HashMismatch("weights".into()),
            VectorFailure::ModelCheck,
            "embed-download-hash-mismatch",
        ),
        (
            ModelStage::Convert,
            EmbedError::WorkerExited,
            VectorFailure::ModelFailed,
            "worker-exited",
        ),
        (
            ModelStage::Convert,
            EmbedError::TimedOut,
            VectorFailure::ModelFailed,
            "timed-out",
        ),
        (
            ModelStage::Convert,
            EmbedError::Inference("shape".into()),
            VectorFailure::ModelFailed,
            "convert",
        ),
        (
            ModelStage::Check,
            EmbedError::TimedOut,
            VectorFailure::ModelFailed,
            "timed-out",
        ),
        (
            ModelStage::Check,
            EmbedError::ModelLoad("weights".into()),
            VectorFailure::ModelFailed,
            "load",
        ),
        (
            ModelStage::Check,
            EmbedError::ModelLoad("reference 1 cosine 0.2".into()),
            VectorFailure::ModelFailed,
            "check",
        ),
    ];
    for (step, error, failure, detail) in cases {
        let harness = Harness::new();
        harness.model().ready.store(false, Ordering::SeqCst);
        *lock(&harness.model().prepare_fails_at) = Some((step, error));
        let root = vault("model-steps", 2);
        let entry = entry(&harness, &root);
        prepare_and_wait(&harness, &entry, VectorSource::Builtin);
        let failed = status(&harness, &entry);
        assert_eq!(
            (
                failed.phase,
                failed.failure,
                failed.failure_detail.as_deref()
            ),
            (VectorPhase::Failed, Some(failure), Some(detail)),
            "{step:?}"
        );
        cleanup(&root);
    }
}

#[test]
fn events_keep_the_spelling_a_folder_was_first_opened_with() {
    let harness = Harness::new();
    let root = vault("spelling", 3);
    let first = harness.vectors.entry(&root, "first-spelling");
    let again = harness.vectors.entry(&root, "second-spelling");
    assert!(Arc::ptr_eq(&first, &again));
    prepare_and_wait(&harness, &again, VectorSource::Builtin);
    let events = harness.events.all();
    assert!(!events.is_empty());
    assert!(events
        .iter()
        .all(|(root_path, _)| root_path == "first-spelling"));
    cleanup(&root);
}

#[test]
fn prepare_with_the_index_off_answers_off_and_starts_nothing() {
    let harness = Harness::new();
    let root = vault("prepare-off", 3);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let off = commands::prepare(
        &harness.vectors,
        &shown(&root),
        false,
        VectorSource::Builtin,
        true,
    )
    .unwrap();
    assert_eq!(off.phase, VectorPhase::Off);
    let entry = entry(&harness, &root);
    assert!(entry.wait_idle(Duration::ZERO));
    assert_eq!(entry.source(), None);
    assert_eq!(vault_index::vectors::store_model(&root).unwrap(), None);
    assert!(harness.model().sent().is_empty());
    cleanup(&root);
}

#[test]
fn a_runner_search_starts_the_housekeeping_that_drops_its_copy() {
    let root = vault("runner-copy", 3);
    let earlier = Harness::new();
    prepare_and_wait(&earlier, &entry(&earlier, &root), runner());
    // A later launch that only searches: no job ever starts the housekeeping.
    let harness = Harness::with_background(true);
    let entry = entry(&harness, &root);
    assert!(harness.vectors.housekeeping.get().is_none());
    let found = harness
        .vectors
        .search(&entry, &runner(), "Passage number 1", 3, &[]);
    assert_eq!(found.state, FoundState::Ok);
    assert!(harness.vectors.housekeeping.get().is_some());
    assert!(lock(&entry.searcher).is_some());
    harness.clock.set(SEARCHER_IDLE);
    harness.vectors.tick();
    assert!(lock(&entry.searcher).is_none());
    cleanup(&root);
}

#[test]
fn the_app_keeps_at_most_eight_runners_and_drops_the_least_recently_used() {
    let sources = super::super::models::AppSources::default();
    let address = |port: u16| format!("http://127.0.0.1:{port}");
    for port in 1..=8 {
        sources.runner(&address(port), "bge-m3").unwrap();
    }
    sources.runner(&address(1), "bge-m3").unwrap();
    sources.runner(&address(9), "bge-m3").unwrap();
    let kept = sources.runner_addresses();
    assert_eq!(kept.len(), 8);
    assert!(!kept.contains(&address(2)), "{kept:?}");
    assert_eq!(kept.last(), Some(&address(9)));
    assert!(kept.contains(&address(1)));
}
