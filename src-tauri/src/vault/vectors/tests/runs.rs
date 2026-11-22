//! A folder's job: one per folder, one model turn for the app, a stop that keeps what was stored,
//! updates of changed files, a Delete that ends it, and the failure a pass ends with.

use super::*;

#[test]
fn concurrent_prepare_calls_run_one_job_per_folder() {
    let harness = Harness::new();
    let root = vault("one-job", 70);
    let entry = entry(&harness, &root);
    harness.model().gate.hold();
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    let callers: Vec<_> = (0..8)
        .map(|_| {
            let (vectors, entry) = (harness.vectors.clone(), entry.clone());
            std::thread::spawn(move || vectors.prepare(&entry, VectorSource::Builtin, true))
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
    harness.vectors.prepare(&first, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    harness
        .vectors
        .prepare(&second, VectorSource::Builtin, true);
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
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
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
fn delete_during_a_job_ends_it_and_leaves_nothing() {
    let harness = Harness::new();
    let root = vault("delete", 70);
    let entry = entry(&harness, &root);
    harness.model().gate.allow(1);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
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
    harness.vectors.prepare(&busy, VectorSource::Builtin, true);
    assert!(harness.model().gate.wait_for_held());
    harness
        .vectors
        .prepare(&waiting, VectorSource::Builtin, true);
    assert!(harness
        .events
        .wait_for(|status| status.phase == VectorPhase::WaitingTurn));

    harness
        .vectors
        .forget(None, || {
            vault_index::delete(Some(&busy_root))?;
            vault_index::delete(Some(&waiting_root))
        })
        .unwrap();
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
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
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
