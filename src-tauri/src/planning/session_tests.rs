use super::super::confined::{open_root, Phase};
use super::PlanningSession;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture {
    base: PathBuf,
    first: PathBuf,
    second: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = PathBuf::from(if cfg!(target_os = "macos") {
            "/private/tmp"
        } else {
            "/tmp"
        })
        .join(format!(
            "atlas-planning-session-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let first = base.join("first");
        let second = base.join("second");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("plan.md"), b"FIRST").unwrap();
        fs::write(second.join("plan.md"), b"SECOND").unwrap();
        Self {
            base,
            first,
            second,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

#[test]
fn revocation_and_reselection_retire_old_handles_and_generations() {
    let f = Fixture::new();
    let session = PlanningSession::default();
    let first = session
        .activate(
            session.begin_selection().unwrap(),
            f.first.clone(),
            open_root(&f.first).unwrap(),
        )
        .unwrap();
    assert_eq!(
        session
            .read_with_hook(first, Path::new("plan.md"), |_| {})
            .unwrap(),
        b"FIRST"
    );
    let second = session
        .activate(
            session.begin_selection().unwrap(),
            f.second.clone(),
            open_root(&f.second).unwrap(),
        )
        .unwrap();
    assert_ne!(first, second);
    assert!(session
        .read_with_hook(first, Path::new("plan.md"), |_| {})
        .is_err());
    assert_eq!(
        session
            .read_with_hook(second, Path::new("plan.md"), |_| {})
            .unwrap(),
        b"SECOND"
    );
    session.revoke().unwrap();
    assert!(session
        .read_with_hook(second, Path::new("plan.md"), |_| {})
        .is_err());
}

#[test]
fn a_late_read_is_discarded_when_selection_changes_mid_read() {
    let f = Fixture::new();
    let session = PlanningSession::default();
    let first = session
        .activate(
            session.begin_selection().unwrap(),
            f.first.clone(),
            open_root(&f.first).unwrap(),
        )
        .unwrap();
    assert!(session
        .read_with_hook(first, Path::new("plan.md"), |phase| {
            if phase == Phase::BytesRead {
                session
                    .activate(
                        session.begin_selection().unwrap(),
                        f.second.clone(),
                        open_root(&f.second).unwrap(),
                    )
                    .unwrap();
            }
        })
        .is_err());
}

#[test]
fn cancelled_picker_keeps_selection_and_late_picker_cannot_replace_newer_selection() {
    let f = Fixture::new();
    let session = PlanningSession::default();
    let first = session
        .activate(
            session.begin_selection().unwrap(),
            f.first.clone(),
            open_root(&f.first).unwrap(),
        )
        .unwrap();
    let cancelled = session.begin_selection().unwrap();
    session.cancel_selection(cancelled).unwrap();
    assert_eq!(
        session
            .read_with_hook(first, Path::new("plan.md"), |_| {})
            .unwrap(),
        b"FIRST"
    );
    let late = session.begin_selection().unwrap();
    let newer = session.begin_selection().unwrap();
    let second = session
        .activate(newer, f.second.clone(), open_root(&f.second).unwrap())
        .unwrap();
    assert!(session
        .activate(late, f.first.clone(), open_root(&f.first).unwrap())
        .is_err());
    assert_eq!(
        session
            .read_with_hook(second, Path::new("plan.md"), |_| {})
            .unwrap(),
        b"SECOND"
    );
}

#[test]
fn a_late_inventory_is_discarded_when_selection_changes_mid_scan() {
    use super::super::scan::ScanPhase;
    let f = Fixture::new();
    let session = PlanningSession::default();
    fs::create_dir(f.first.join("docs")).unwrap();
    fs::write(f.first.join("docs/page.md"), b"FIRST DOC").unwrap();
    let first = session
        .activate(
            session.begin_selection().unwrap(),
            f.first.clone(),
            open_root(&f.first).unwrap(),
        )
        .unwrap();
    assert!(!session
        .scan_with_hook(first, 100, |_| {})
        .unwrap()
        .files
        .is_empty());
    assert!(session
        .scan_with_hook(first, 100, |phase| match phase {
            ScanPhase::DirectoryOpened(path) if path == PathBuf::from("docs") => {
                session
                    .activate(
                        session.begin_selection().unwrap(),
                        f.second.clone(),
                        open_root(&f.second).unwrap(),
                    )
                    .unwrap();
            }
            _ => (),
        })
        .is_err());
}

#[test]
fn replacement_after_validation_before_session_grant_is_rejected() {
    use std::os::unix::fs::symlink;
    let f = Fixture::new();
    let session = PlanningSession::default();
    let ticket = session.begin_selection().unwrap();
    let opened = open_root(&f.first).unwrap();
    let result = session.activate_with_hook(ticket, f.first.clone(), opened, || {
        fs::rename(&f.first, f.base.join("first-old")).unwrap();
        symlink(&f.second, &f.first).unwrap();
    });
    assert!(result.is_err());
    assert!(session
        .read_with_hook(ticket, Path::new("plan.md"), |_| {})
        .is_err());
}

#[cfg(target_os = "macos")]
#[test]
fn picker_remains_exclusive_until_its_native_operation_finishes() {
    let session = PlanningSession::default();
    let permit = session.picker_permit().unwrap();
    assert!(session.picker_permit().is_err());
    drop(permit);
    assert!(session.picker_permit().is_ok());
}

#[test]
fn late_document_request_cannot_replace_the_newer_witness() {
    let f = Fixture::new();
    fs::write(f.first.join("second.md"), b"SECOND").unwrap();
    let session = PlanningSession::default();
    let generation = session
        .activate(
            session.begin_selection().unwrap(),
            f.first.clone(),
            open_root(&f.first).unwrap(),
        )
        .unwrap();
    let mut newer = None;
    let old = session.open_document_with_hook(generation, Path::new("plan.md"), None, 1, || {
        newer = Some(
            session
                .open_document(generation, Path::new("second.md"), None, 2)
                .unwrap(),
        );
    });
    let newer = newer.unwrap();
    let token = std::str::from_utf8(&newer[..32]).unwrap();
    assert!(
        old.is_err(),
        "older request must not commit after a newer selection"
    );
    assert!(session
        .open_document(generation, Path::new("second.md"), Some(token), 3)
        .is_ok());
}
