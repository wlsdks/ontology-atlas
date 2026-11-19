//! The launch sweep and Delete against live builds, litter and unreadable indexes. They act on
//! every index under the root, so they run in their own process, one at a time.

#![allow(clippy::unwrap_used, clippy::indexing_slicing, clippy::panic)]

mod common;

use common::{write_corpus, TempVault};
use std::fs::File;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use vault_index::{
    delete, index_dir, stored_bytes, sweep_orphans, sync, Check, Progress, Searcher,
};

static ALONE: Mutex<()> = Mutex::new(());

fn alone() -> std::sync::MutexGuard<'static, ()> {
    ALONE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn build(vault: &TempVault) {
    sync(
        &vault.root,
        &vault.files(),
        &Progress::default(),
        Check::IfInterrupted,
    )
    .unwrap();
}

fn mark_unused(vault: &TempVault) {
    let conn = rusqlite::Connection::open(vault.index_file()).unwrap();
    conn.execute("UPDATE meta SET value = '0' WHERE key = 'last_used_ms'", [])
        .unwrap();
}

fn drop_litter(dir: &Path) {
    for name in [".DS_Store", "Thumbs.db", "desktop.ini"] {
        std::fs::write(dir.join(name), "litter").unwrap();
    }
}

#[test]
fn delete_off_and_sweep_remove_an_index_beside_os_litter() {
    let _alone = alone();
    let one = TempVault::new("litter-one");
    write_corpus(&one.root, 10, 51);
    build(&one);
    let dir = index_dir(&one.root).unwrap();
    drop_litter(&dir);
    delete(Some(&one.root)).unwrap();
    assert!(!dir.exists(), "Delete removes the index and the litter");
    assert_eq!(stored_bytes(Some(&one.root)).unwrap(), 0);

    build(&one);
    drop_litter(&dir);
    delete(None).unwrap();
    assert!(!dir.exists(), "turning search off removes it too");

    build(&one);
    drop_litter(&dir);
    mark_unused(&one);
    assert_eq!(sweep_orphans().unwrap(), 1);
    assert!(
        !dir.exists(),
        "the sweep removes an unused index beside litter"
    );
}

#[test]
fn delete_never_reports_success_while_the_index_still_answers() {
    let _alone = alone();
    let vault = TempVault::new("foreign");
    write_corpus(&vault.root, 10, 52);
    build(&vault);
    let dir = index_dir(&vault.root).unwrap();
    std::fs::write(dir.join("notes.txt"), "not the index's").unwrap();
    assert!(delete(Some(&vault.root)).is_err());
    assert!(delete(None).is_err());
    assert!(Searcher::open(&vault.root).unwrap().is_some());
    assert!(stored_bytes(Some(&vault.root)).unwrap() > 0);
    std::fs::remove_file(dir.join("notes.txt")).unwrap();
}

#[test]
fn the_sweep_keeps_what_it_cannot_read_or_cannot_lock() {
    let _alone = alone();
    let vault = TempVault::new("unreadable");
    write_corpus(&vault.root, 10, 53);
    build(&vault);
    let dir = index_dir(&vault.root).unwrap();
    let away = vault.root.with_extension("away");

    // Locked by a build in another process, and the folder looks gone: kept.
    std::fs::rename(&vault.root, &away).unwrap();
    let held = File::options()
        .read(true)
        .write(true)
        .open(dir.join("index.lock"))
        .unwrap();
    held.lock().unwrap();
    assert_eq!(sweep_orphans().unwrap(), 0);
    assert!(
        dir.join("search.sqlite").is_file(),
        "a locked index is kept"
    );
    drop(held);

    // Busy: another connection holds the database exclusively.
    let holder = rusqlite::Connection::open(dir.join("search.sqlite")).unwrap();
    holder
        .execute_batch("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;")
        .unwrap();
    assert_eq!(sweep_orphans().unwrap(), 0);
    assert!(dir.join("search.sqlite").is_file(), "a busy index is kept");
    drop(holder);

    // Not created yet, or not a database: kept.
    for file in ["search.sqlite-wal", "search.sqlite-shm"] {
        let _ = std::fs::remove_file(dir.join(file));
    }
    std::fs::write(dir.join("search.sqlite"), "not a database").unwrap();
    assert_eq!(sweep_orphans().unwrap(), 0);
    assert!(dir.exists(), "an unreadable index is kept");
    std::fs::remove_file(dir.join("search.sqlite")).unwrap();
    assert_eq!(sweep_orphans().unwrap(), 0);
    assert!(
        dir.exists(),
        "a folder whose database is not made yet is kept"
    );

    std::fs::rename(&away, &vault.root).unwrap();
}

#[test]
fn first_builds_survive_a_sweep_running_beside_them() {
    let _alone = alone();
    let vault = TempVault::new("race-thread");
    write_corpus(&vault.root, 300, 54);
    let files = vault.files();
    let stop = AtomicBool::new(false);
    let mut lost = Vec::new();
    let swept = std::thread::scope(|scope| {
        let sweeper = scope.spawn(|| {
            let mut removed = 0;
            while !stop.load(Ordering::Relaxed) {
                removed += sweep_orphans().unwrap();
            }
            removed
        });
        for round in 0..40 {
            delete(Some(&vault.root)).unwrap();
            match sync(
                &vault.root,
                &files,
                &Progress::default(),
                Check::IfInterrupted,
            ) {
                Ok(_) if vault.index_file().is_file() => {}
                Ok(_) => lost.push(format!("round {round}: built, then missing")),
                Err(error) => lost.push(format!("round {round}: {error}")),
            }
        }
        stop.store(true, Ordering::Relaxed);
        sweeper.join().unwrap()
    });
    assert_eq!(lost, Vec::<String>::new());
    assert_eq!(swept, 0, "a vault in use is never swept");
}

#[test]
fn first_builds_in_another_process_survive_the_sweep() {
    let _alone = alone();
    let vault = TempVault::new("race-process");
    write_corpus(&vault.root, 1500, 55);
    let indexes = vault_index::indexes_root().unwrap();
    let stop = AtomicBool::new(false);
    let mut lost = Vec::new();
    let swept = std::thread::scope(|scope| {
        let sweeper = scope.spawn(|| {
            let mut removed = 0;
            while !stop.load(Ordering::Relaxed) {
                removed += sweep_orphans().unwrap();
            }
            removed
        });
        for round in 0..12 {
            delete(Some(&vault.root)).unwrap();
            let status = Command::new(env!("CARGO_BIN_EXE_vault-index-bench"))
                .args(["build", vault.root.to_str().unwrap()])
                .env(vault_index::INDEX_DIR_OVERRIDE_ENV, &indexes)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .unwrap();
            if !status.success() {
                lost.push(format!("round {round}: build exited {status}"));
            } else if !vault.index_file().is_file() {
                lost.push(format!("round {round}: built, then missing"));
            }
        }
        stop.store(true, Ordering::Relaxed);
        sweeper.join().unwrap()
    });
    assert_eq!(lost, Vec::<String>::new());
    assert_eq!(swept, 0, "a vault in use is never swept");
}
