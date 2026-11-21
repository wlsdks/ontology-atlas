//! The app contract the screens build to: only the dialog's press fetches the built-in model, and
//! a folder without it says `modelGone`; a search keeps to its prefixes; the probe reads nothing
//! in the person's folder; a Delete that fails is no delete; a `modelFailed` detail is one of six.

use super::super::commands;
use super::super::failure::{failure_detail, During, ModelFailedDetail, ModelStep};
use super::super::job::UPDATE_QUIET;
use super::held::{shown, stopped_in_an_earlier_launch};
use super::*;
use crate::vault_grants::EnforcedScope;

/// How the built-in model is missing: never fetched, or a download cut off at 40 %.
#[derive(Clone, Copy, Debug)]
enum Absent {
    Never,
    Partial,
}

const PARTIAL_BYTES: u64 = 40_000;

fn without_model(harness: &Harness, absent: Absent) {
    let model = harness.model();
    model.ready.store(false, Ordering::SeqCst);
    let on_disk = match absent {
        Absent::Never => 0,
        Absent::Partial => PARTIAL_BYTES,
    };
    model.on_disk.store(on_disk, Ordering::SeqCst);
}

fn downloads(harness: &Harness) -> usize {
    harness.model().downloads.load(Ordering::SeqCst)
}

fn model_gone(status: &VectorStatus) -> bool {
    status.phase == VectorPhase::Failed && status.failure == Some(VectorFailure::ModelGone)
}

#[test]
fn nothing_but_the_dialogs_press_fetches_the_model() {
    for absent in [Absent::Never, Absent::Partial] {
        let harness = Harness::new();
        let root = vault("consent", 3);
        let fresh = vault("consent-fresh", 3);
        let _scope = EnforcedScope::granting(&[root.clone(), fresh.clone()]);
        let (path, fresh_path) = (shown(&root), shown(&fresh));
        let builtin = VectorSource::Builtin;
        let fresh_entry = entry(&harness, &fresh);
        let entry = entry(&harness, &root);
        prepare_and_wait(&harness, &entry, builtin.clone());
        harness.model().downloads.store(0, Ordering::SeqCst);
        without_model(&harness, absent);
        let on_disk = harness.model().on_disk.load(Ordering::SeqCst);

        let vectors = &harness.vectors;
        let status = commands::status(vectors, &path, true, Some(&builtin), false).unwrap();
        assert!(model_gone(&status), "status {absent:?}: {status:?}");
        let found = commands::search(vectors, &path, &builtin, "sedges", 4, &[]).unwrap();
        assert_eq!(found.failure, Some(VectorFailure::ModelGone), "{absent:?}");
        vectors.warm(&builtin);
        harness.clock.set(Duration::ZERO);
        vectors.note_change(&entry);
        harness.clock.set(UPDATE_QUIET);
        vectors.tick();
        vectors.request_update(&entry);
        assert!(entry.wait_idle(WITHIN));
        let resumed = commands::prepare(vectors, &path, true, builtin.clone(), false).unwrap();
        assert!(model_gone(&resumed), "prepare {absent:?}: {resumed:?}");
        assert!(entry.wait_idle(WITHIN));
        let fresh_status = commands::status(vectors, &fresh_path, true, Some(&builtin), false);
        assert!(model_gone(&fresh_status.unwrap()), "{absent:?}");
        let fresh_prepare = commands::prepare(vectors, &fresh_path, true, builtin.clone(), false);
        assert!(model_gone(&fresh_prepare.unwrap()), "{absent:?}");
        assert!(fresh_entry.wait_idle(WITHIN));

        assert_eq!(downloads(&harness), 0, "{absent:?}");
        assert_eq!(harness.model().on_disk.load(Ordering::SeqCst), on_disk);
        assert_eq!(vault_index::vectors::store_model(&fresh).unwrap(), None);
        assert!(model_gone(&status_of(&harness, &entry)), "{absent:?}");

        // The answer is not a hold: the press downloads and the folder becomes ready.
        commands::prepare(vectors, &path, true, builtin.clone(), true).unwrap();
        assert!(entry.wait_idle(WITHIN));
        assert_eq!(downloads(&harness), 1, "{absent:?}");
        assert_eq!(status_of(&harness, &entry).phase, VectorPhase::Ready);
        cleanup(&root);
        cleanup(&fresh);
    }
}

fn status_of(harness: &Harness, entry: &Entry) -> VectorStatus {
    harness
        .vectors
        .status(entry, true, Some(&VectorSource::Builtin))
}

#[test]
fn a_job_cut_off_by_a_quit_continues_without_its_model_only_by_the_press() {
    for absent in [Absent::Never, Absent::Partial] {
        let root = stopped_in_an_earlier_launch("quit-no-model");
        let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
        let harness = Harness::new();
        without_model(&harness, absent);
        let builtin = VectorSource::Builtin;
        let armed =
            commands::status(&harness.vectors, &shown(&root), true, Some(&builtin), false).unwrap();
        assert!(model_gone(&armed), "{absent:?}: {armed:?}");
        let entry = entry(&harness, &root);
        harness.clock.set(UPDATE_QUIET);
        harness.vectors.tick();
        assert!(entry.wait_idle(WITHIN));
        assert_eq!(downloads(&harness), 0, "{absent:?}");
        assert!(harness.model().sent().is_empty());
        assert!(model_gone(&status_of(&harness, &entry)), "{absent:?}");
        cleanup(&root);
    }
}

#[test]
fn a_stop_during_the_download_reads_model_gone_and_resume_asks_for_the_press_again() {
    let harness = Harness::new();
    without_model(&harness, Absent::Never);
    let root = vault("stop-download", 3);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let entry = entry(&harness, &root);
    let (vectors, stopping) = (harness.vectors.clone(), entry.clone());
    harness.events.on_event(move |status| {
        let downloading = status.phase == VectorPhase::ModelDownloading;
        if downloading {
            vectors.stop(&stopping);
        }
        downloading
    });
    harness.vectors.prepare(&entry, VectorSource::Builtin, true);
    assert!(entry.wait_idle(WITHIN));
    assert_eq!(downloads(&harness), 1);
    let stopped = status_of(&harness, &entry);
    assert!(model_gone(&stopped), "{stopped:?}");

    let resumed = commands::prepare(
        &harness.vectors,
        &shown(&root),
        true,
        VectorSource::Builtin,
        false,
    )
    .unwrap();
    assert!(model_gone(&resumed), "{resumed:?}");
    assert!(entry.wait_idle(WITHIN));
    assert_eq!(downloads(&harness), 1);
    cleanup(&root);
}

#[test]
fn a_failed_download_says_why_until_the_next_prepare() {
    let harness = Harness::new();
    without_model(&harness, Absent::Never);
    let root = vault("download-fails", 3);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let entry = entry(&harness, &root);
    *lock(&harness.model().prepare_error) = Some(EmbedError::Request("connect-failed".into()));
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let failed = status_of(&harness, &entry);
    assert_eq!(
        (failed.phase, failed.failure),
        (VectorPhase::Failed, Some(VectorFailure::Download))
    );
    let resumed = commands::prepare(
        &harness.vectors,
        &shown(&root),
        true,
        VectorSource::Builtin,
        false,
    )
    .unwrap();
    assert!(model_gone(&resumed), "{resumed:?}");
    cleanup(&root);
}

#[test]
fn a_search_refuses_prefixes_the_contract_does_not_allow() {
    let harness = Harness::new();
    let root = vault("prefixes", 3);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let search = |prefixes: &[String]| {
        commands::search(
            &harness.vectors,
            &shown(&root),
            &VectorSource::Builtin,
            "quillwort",
            8,
            prefixes,
        )
    };
    let many: Vec<String> = (0..17).map(|at| format!("folder-{at}/")).collect();
    let refused = [
        (many, "vectors-prefixes-too-many"),
        (vec!["a".repeat(513)], "vectors-prefix-too-long"),
        (vec!["/wiki/".into()], "vectors-prefix-not-relative"),
        (vec!["\\wiki\\".into()], "vectors-prefix-not-relative"),
        (vec!["wiki/../..".into()], "vectors-prefix-not-relative"),
        (vec!["..".into()], "vectors-prefix-not-relative"),
        (vec!["wiki\\..\\x".into()], "vectors-prefix-not-relative"),
    ];
    for (prefixes, code) in refused {
        let answer = search(&prefixes).map(|found| found.hits.len());
        assert_eq!(answer, Err(code.to_string()), "{prefixes:?}");
    }

    let largest: Vec<String> = (0..16).map(|at| format!("{at:0>512}")).collect();
    assert!(search(&largest).unwrap().hits.is_empty());
    let everything = search(&[]).unwrap();
    assert_eq!(everything.hits.len(), 3);
    let wiki = search(&["wiki/".into()]).unwrap();
    assert_eq!(wiki.hits.len(), 2);
    assert!(wiki.hits.iter().all(|hit| hit.path.starts_with("wiki/")));
    // A prefix is bytes: `wiki..md/` style names are allowed, only a `..` segment is not.
    assert!(search(&["wiki..notes/".into()]).unwrap().hits.is_empty());
    cleanup(&root);
}

#[cfg(unix)]
#[test]
fn the_probe_reads_no_file_in_the_persons_folder() {
    use std::os::unix::fs::PermissionsExt;
    let harness = Harness::new();
    let root = vault("probe-locked", 5);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    indexed(&root);
    without_model(&harness, Absent::Partial);
    let set_mode = |mode: u32| {
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(mode)).unwrap();
    };
    set_mode(0o000);
    let locked = commands::probe(&harness.vectors, &shown(&root), None);
    set_mode(0o755);
    let locked = locked.unwrap();
    assert_eq!(locked.files, 5);
    assert_eq!(
        (locked.builtin.on_disk, locked.builtin.model_bytes),
        (false, PARTIAL_BYTES)
    );

    harness.vectors.delete_model().unwrap();
    let deleted = commands::probe(&harness.vectors, &shown(&root), None).unwrap();
    assert_eq!(
        (deleted.builtin.on_disk, deleted.builtin.model_bytes),
        (false, 0)
    );
    cleanup(&root);
}

#[cfg(unix)]
#[test]
fn a_delete_that_cannot_remove_the_store_is_no_delete() {
    use std::os::unix::fs::PermissionsExt;
    let harness = Harness::new();
    let root = vault("delete-fails", 3);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let dir = vault_index::index_dir(&root).unwrap();
    let store = dir.join("vectors.sqlite");
    let set_modes = |file: u32, folder: u32| {
        std::fs::set_permissions(&store, std::fs::Permissions::from_mode(file)).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(folder)).unwrap();
    };
    set_modes(0o444, 0o555);
    let answer = commands::delete(&harness.vectors, &shown(&root));
    set_modes(0o644, 0o755);

    assert_eq!(
        answer.map(|status| status.phase),
        Err("vectors-delete-failed".to_string())
    );
    let after = status_of(&harness, &entry);
    assert_eq!(after.phase, VectorPhase::Ready, "{after:?}");
    assert!(after.vectors_bytes > 0);
    assert!(vault_index::vectors::store_model(&root).unwrap().is_some());
    cleanup(&root);
}

/// Every error, so a new variant must be placed here before this compiles.
fn every_error() -> Vec<EmbedError> {
    use EmbedError as E;
    let all = vec![
        E::Endpoint("x".into()),
        E::NotLocal,
        E::ResolvesElsewhere,
        E::AuditBlocked("x".into()),
        E::ModelInvalid,
        E::ModelRemote,
        E::ModelNotAllowed("x".into()),
        E::BatchEmpty,
        E::BatchTooLarge,
        E::PassageTooLong(1),
        E::OverPlan,
        E::Request("x".into()),
        E::TimedOut,
        E::Redirected(302),
        E::ModelMissing,
        E::Http(500),
        E::ResponseTooLarge,
        E::ResponseInvalid("x"),
        E::Cancelled,
        E::PullFailed("x".into()),
        E::HostRefused("x".into()),
        E::SizeMismatch("x".into()),
        E::HashMismatch("x".into()),
        E::ModelNotReady,
        E::ModelBusy,
        E::ModelLoad("x".into()),
        E::ModelLoad("reference 0".into()),
        E::Convert("x".into()),
        E::Inference("x".into()),
        E::Store("x".into()),
        E::DiskSpace { needed: 2, free: 1 },
        E::NoDirectConnection,
        E::WorkerStart("x".into()),
        E::WorkerExited,
        E::WorkerFailed("x".into()),
    ];
    for error in &all {
        match error {
            E::Endpoint(_)
            | E::NotLocal
            | E::ResolvesElsewhere
            | E::AuditBlocked(_)
            | E::ModelInvalid
            | E::ModelRemote
            | E::ModelNotAllowed(_)
            | E::BatchEmpty
            | E::BatchTooLarge
            | E::PassageTooLong(_)
            | E::OverPlan
            | E::Request(_)
            | E::TimedOut
            | E::Redirected(_)
            | E::ModelMissing
            | E::Http(_)
            | E::ResponseTooLarge
            | E::ResponseInvalid(_)
            | E::Cancelled
            | E::PullFailed(_)
            | E::HostRefused(_)
            | E::SizeMismatch(_)
            | E::HashMismatch(_)
            | E::ModelNotReady
            | E::ModelBusy
            | E::ModelLoad(_)
            | E::Convert(_)
            | E::Inference(_)
            | E::Store(_)
            | E::DiskSpace { .. }
            | E::NoDirectConnection
            | E::WorkerStart(_)
            | E::WorkerExited
            | E::WorkerFailed(_) => {}
        }
    }
    all
}

#[test]
fn every_model_failure_the_job_can_produce_carries_a_detail_from_the_closed_list() {
    let list: Vec<&str> = ModelFailedDetail::ALL
        .iter()
        .map(|detail| detail.as_str())
        .collect();
    assert_eq!(
        list,
        [
            "load",
            "convert",
            "check",
            "worker-exited",
            "timed-out",
            "internal"
        ]
    );
    let places = [
        (During::ModelPrepare, ModelStep::Convert),
        (During::ModelConvert, ModelStep::Convert),
        (During::ModelConvert, ModelStep::Check),
        (During::Embedding { runner: false }, ModelStep::Answer),
        (During::Embedding { runner: true }, ModelStep::Answer),
    ];
    let mut seen = std::collections::BTreeSet::new();
    for error in every_error() {
        for (during, step) in places {
            let (failure, detail) = failure_detail(&error, during, step);
            if failure == VectorFailure::ModelFailed {
                assert!(
                    list.contains(&detail.as_str()),
                    "{error:?} {step:?}: {detail}"
                );
                seen.insert(detail);
            }
        }
    }
    // Every entry but `internal`, which only a pass that panics produces, is reachable.
    assert_eq!(seen.len(), 5, "{seen:?}");
}
