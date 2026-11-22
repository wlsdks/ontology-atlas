//! What the status and its events say: the model's steps in order, no vault text, progress at
//! most four times a second, a rate over the folder pass alone, and the contract's shapes.

use super::*;

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
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
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
fn the_job_sends_progress_at_most_four_times_a_second() {
    let harness = Harness::new();
    let root = vault("throttle", 200);
    let entry = entry(&harness, &root);
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
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
fn the_rate_counts_only_the_folder_pass_not_the_download_before_it() {
    let harness = Harness::new();
    harness.model().ready.store(false, Ordering::SeqCst);
    let root = vault("rate-after-download", 3);
    let entry = entry(&harness, &root);
    let clock = harness.clock.clone();
    // The download takes 40 s; the folder pass that follows has run for no time at all.
    harness.events.on_event(move |status| {
        let converting = status.phase == VectorPhase::ModelConverting;
        if converting {
            clock.set(Duration::from_secs(40));
        }
        converting
    });
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);

    for (_, event) in harness.events.all() {
        if event.phase == VectorPhase::Preparing {
            assert_eq!(
                event.passages_per_second, None,
                "a rate measured over the download"
            );
        }
    }
    cleanup(&root);
}

#[test]
fn a_download_says_when_it_checks_what_it_kept_before_the_network() {
    let harness = Harness::new();
    harness.model().ready.store(false, Ordering::SeqCst);
    let root = vault("download-checking", 3);
    let entry = entry(&harness, &root);
    // A second passes after each event, so no progress event waits behind the throttle.
    let clock = harness.clock.clone();
    let mut seconds = 0;
    harness.events.on_event(move |_| {
        seconds += 1;
        clock.set(Duration::from_secs(seconds));
        false
    });
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);

    let bytes: Vec<(u64, bool)> = harness
        .events
        .all()
        .into_iter()
        .filter_map(|(_, event)| event.model.map(|model| (model.done_bytes, model.checking)))
        .filter(|(done, _)| *done > 0)
        .collect();
    assert_eq!(bytes, [(10, true), (60, false), (100, false)]);
    cleanup(&root);
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
        "busy",
    ] {
        assert!(shown.get(key).is_some(), "{key}");
    }
}
