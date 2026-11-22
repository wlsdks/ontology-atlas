//! Questions: answered by the folder's copy between batches, `modelGone` once the model is
//! deleted, and the worker and the copy leaving memory by the clock.

use super::*;

#[test]
fn a_question_during_a_job_is_answered_between_batches_by_the_same_copy() {
    let harness = Harness::new();
    let root = vault("question", 100);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());

    let found = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "Passage number 3", 8, &[]);
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
        .search(&entry, &VectorSource::Builtin, "anything", 8, &[]);
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
        .search(&entry, &VectorSource::Builtin, text, 3, &[]);
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
        .search(&entry, &VectorSource::Builtin, text, 3, &[]);
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
        .search(&entry, &VectorSource::Builtin, "quillwort", 8, &[]);
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
fn a_model_gone_says_what_a_cut_off_download_kept() {
    let harness = Harness::new();
    let root = vault("model-gone-kept", 3);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    harness.vectors.delete_model().unwrap();
    assert_eq!(status(&harness, &entry).model, None);

    // A quit in the middle of the download leaves its part on disk; a half-made converted
    // file beside it is not part of what the download kept.
    harness.model().on_disk.store(900_000, Ordering::SeqCst);
    harness.model().downloaded.store(60_000, Ordering::SeqCst);
    let gone = status(&harness, &entry);
    assert_eq!(gone.failure, Some(VectorFailure::ModelGone));
    let kept = gone.model.expect("the kept part of the download");
    assert_eq!(kept.done_bytes, 60_000);
    assert!(kept.total_bytes >= kept.done_bytes);
    cleanup(&root);
}

#[test]
fn the_job_releases_the_worker_by_the_clock() {
    let harness = Harness::new();
    let root = vault("release", 40);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    harness
        .vectors
        .search(&entry, &VectorSource::Builtin, "quillwort", 4, &[]);
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
        .search(&entry, &VectorSource::Builtin, "sedges", 4, &[]);
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
