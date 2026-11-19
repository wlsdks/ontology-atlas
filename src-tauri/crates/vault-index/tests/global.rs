//! Sweep and delete-all act on every index under the root, so these run in their own process,
//! one at a time, where no other test's index can be caught by them.

#![allow(clippy::unwrap_used, clippy::indexing_slicing, clippy::panic)]

mod common;

use common::{write_corpus, TempVault};
use std::sync::Mutex;
use vault_index::{delete, index_dir, sync, Check, Progress};

static ALONE: Mutex<()> = Mutex::new(());

fn sync_all(vault: &TempVault, check: Check) -> vault_index::SyncReport {
    sync(&vault.root, &vault.files(), &Progress::default(), check).unwrap()
}

fn last_used_long_ago(vault: &TempVault) {
    let conn = rusqlite::Connection::open(vault.index_file()).unwrap();
    conn.execute("UPDATE meta SET value = '0' WHERE key = 'last_used_ms'", [])
        .unwrap();
}

#[test]
fn indexes_not_opened_for_two_weeks_or_of_vanished_folders_are_swept() {
    let _alone = ALONE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let unused = TempVault::new("sweep-unused");
    write_corpus(&unused.root, 20, 29);
    sync_all(&unused, Check::IfInterrupted);
    let gone = TempVault::new("sweep-gone");
    write_corpus(&gone.root, 20, 30);
    sync_all(&gone, Check::IfInterrupted);
    let kept = TempVault::new("sweep-kept");
    write_corpus(&kept.root, 20, 31);
    sync_all(&kept, Check::IfInterrupted);

    last_used_long_ago(&unused);
    std::fs::rename(&gone.root, gone.root.with_extension("gone")).unwrap();
    vault_index::sweep_orphans().unwrap();

    assert!(
        !index_dir(&unused.root).unwrap().exists(),
        "an index not opened for two weeks is deleted"
    );
    assert!(
        !index_dir(&gone.root).unwrap().exists(),
        "the index of a vanished folder is deleted"
    );
    assert!(
        index_dir(&kept.root).unwrap().exists(),
        "a recent index of a present folder stays"
    );
    std::fs::rename(gone.root.with_extension("gone"), &gone.root).unwrap();
}

#[test]
fn a_folder_holding_only_rows_is_swept_like_one_holding_the_search_file() {
    let _alone = ALONE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let rows_only = |name: &str, seed: u64| {
        let vault = TempVault::new(name);
        let files = write_corpus(&vault.root, 10, seed);
        let then = std::time::SystemTime::now() - std::time::Duration::from_secs(60);
        for path in &files {
            std::fs::File::options()
                .write(true)
                .open(vault.root.join(path))
                .unwrap()
                .set_modified(then)
                .unwrap();
        }
        let (found, _) = vault_index::rows::lookup(&vault.root, "test-entry/1", &files).unwrap();
        let rows: Vec<_> = files
            .iter()
            .zip(found)
            .filter_map(|(path, found)| match found {
                vault_index::rows::Found::Miss(token) => Some(vault_index::rows::NewRow {
                    path: path.clone(),
                    token,
                    last_modified_ms: i64::try_from(
                        then.duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis(),
                    )
                    .unwrap(),
                    value: "{}".to_string(),
                }),
                vault_index::rows::Found::Hit(_) => None,
            })
            .collect();
        let written = vault_index::rows::put(&vault.root, "test-entry/1", &rows, None).unwrap();
        assert_eq!(written.written, files.len());
        assert!(!vault.index_file().exists(), "no search file, only rows");
        vault
    };
    let unused = rows_only("sweep-rows-unused", 41);
    let kept = rows_only("sweep-rows-kept", 42);
    let conn =
        rusqlite::Connection::open(index_dir(&unused.root).unwrap().join("rows.sqlite")).unwrap();
    conn.execute("UPDATE meta SET value = '0' WHERE key = 'last_used_ms'", [])
        .unwrap();
    drop(conn);

    vault_index::sweep_orphans().unwrap();
    assert!(
        !index_dir(&unused.root).unwrap().exists(),
        "rows not used for two weeks are deleted"
    );
    assert!(
        index_dir(&kept.root).unwrap().exists(),
        "recent rows of a present folder stay"
    );
}

#[test]
fn a_folder_holding_only_vectors_is_swept_like_one_holding_the_search_file() {
    let _alone = ALONE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let model = vault_index::vectors::Model {
        name: "test-embedding".into(),
        dimensions: 8,
    };
    let vectors_only = |name: &str, seed: u64| {
        let vault = TempVault::new(name);
        write_corpus(&vault.root, 10, seed);
        let plan = vault_index::vectors::plan(&vault.root, &model, &vault.files()).unwrap();
        vault_index::vectors::prepare(
            plan,
            &vault_index::vectors::PrepareProgress::default(),
            |texts: &[&str]| {
                Ok::<_, std::convert::Infallible>(
                    texts
                        .iter()
                        .map(|text| (0..8).map(|i| (text.len() + i) as f32).collect())
                        .collect(),
                )
            },
        )
        .unwrap();
        assert!(!vault.index_file().exists(), "no search file, only vectors");
        assert!(vault_index::vectors::vectors_bytes(&vault.root).unwrap() > 0);
        vault
    };
    let unused = vectors_only("sweep-vectors-unused", 45);
    let kept = vectors_only("sweep-vectors-kept", 46);
    assert!(vault_index::stored_bytes(None).unwrap() > 0);
    let conn = rusqlite::Connection::open(index_dir(&unused.root).unwrap().join("vectors.sqlite"))
        .unwrap();
    conn.execute("UPDATE meta SET value = '0' WHERE key = 'last_used_ms'", [])
        .unwrap();
    drop(conn);

    vault_index::sweep_orphans().unwrap();
    assert!(
        !index_dir(&unused.root).unwrap().exists(),
        "vectors not used for two weeks are deleted"
    );
    assert!(
        index_dir(&kept.root).unwrap().exists(),
        "recent vectors of a present folder stay"
    );
    delete(None).unwrap();
    assert!(
        !index_dir(&kept.root).unwrap().exists(),
        "delete-all takes vectors too"
    );
}

/// Folders a person or another program put beside the indexes, including one named like a key
/// but without the marker, survive every delete and sweep.
#[test]
fn delete_and_sweep_touch_only_the_indexes_own_folders() {
    let _alone = ALONE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let vault = TempVault::new("scope");
    write_corpus(&vault.root, 10, 43);
    sync_all(&vault, Check::IfInterrupted);
    let indexes = vault_index::indexes_root().unwrap();
    let planted = [
        indexes.join("thesis"),
        indexes.join("photos"),
        indexes.join("0123456789abcdef"),
    ];
    for folder in &planted {
        std::fs::create_dir_all(folder).unwrap();
        std::fs::write(folder.join("search.sqlite"), "a person's file").unwrap();
    }
    let crowded = index_dir(&vault.root).unwrap();
    let extra = TempVault::new("scope-extra");
    write_corpus(&extra.root, 5, 44);
    sync_all(&extra, Check::IfInterrupted);
    let extra_dir = index_dir(&extra.root).unwrap();
    std::fs::write(extra_dir.join("notes.txt"), "not the index's").unwrap();

    vault_index::sweep_orphans().unwrap();
    assert!(
        delete(None).is_err(),
        "a delete that leaves an index in place says so"
    );

    for folder in &planted {
        assert_eq!(
            std::fs::read_to_string(folder.join("search.sqlite")).unwrap(),
            "a person's file",
            "{} survives",
            folder.display()
        );
        std::fs::remove_dir_all(folder).unwrap();
    }
    assert!(!crowded.exists(), "the index folder itself is deleted");
    assert!(
        extra_dir.join("notes.txt").is_file(),
        "a folder holding a file the index never writes is left alone"
    );
    std::fs::remove_dir_all(&extra_dir).unwrap();
}
