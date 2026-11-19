//! `rows.sqlite`: a row is used only while its file still has the stamp it was computed from, a
//! process killed mid-write leaves nothing that disagrees with the files, and a producer never
//! reads another version's rows.

#![allow(clippy::unwrap_used, clippy::indexing_slicing, clippy::panic)]

mod common;

use common::{write_corpus, Lcg, TempVault};
use rusqlite::{params, Connection, OpenFlags};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime};
use vault_index::rows::{self, Found, NewRow};
use vault_index::{index_dir, Stamp};

const BRIDGE: &str = env!("CARGO_BIN_EXE_vault-rows-bridge");
const NS: &str = "test-entry/1";

/// The test's producer: what a program would compute from a file, here its hash and length.
fn produce(root: &Path, path: &str) -> String {
    let bytes = std::fs::read(root.join(path)).unwrap();
    let digest: String = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("{{\"sha\":\"{digest}\",\"bytes\":{}}}", bytes.len())
}

fn millis(path: &Path) -> i64 {
    let modified = std::fs::metadata(path).unwrap().modified().unwrap();
    i64::try_from(
        modified
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis(),
    )
    .unwrap()
}

/// Files a test writes are dated `age` back, so a row for them is not refused as too new.
fn backdate(root: &Path, path: &str, age: Duration) {
    let file = std::fs::File::options()
        .write(true)
        .open(root.join(path))
        .unwrap();
    file.set_modified(SystemTime::now() - age).unwrap();
}

fn backdate_all(root: &Path, files: &[String]) {
    for (at, file) in files.iter().enumerate() {
        backdate(
            root,
            file,
            Duration::from_secs(60) + Duration::from_millis(at as u64),
        );
    }
}

/// What the app does on open: take every row that still matches, compute the rest from the files.
struct Opened {
    values: BTreeMap<String, String>,
    from_rows: usize,
    misses: Vec<NewRow>,
}

fn open(root: &Path, namespace: &str, files: &[String]) -> Opened {
    let (found, _) = rows::lookup(root, namespace, files).unwrap();
    let mut opened = Opened {
        values: BTreeMap::new(),
        from_rows: 0,
        misses: Vec::new(),
    };
    for (path, found) in files.iter().zip(found) {
        match found {
            Found::Hit(value) => {
                opened.from_rows += 1;
                opened.values.insert(path.clone(), value);
            }
            Found::Miss(token) => {
                if !root.join(path).exists() {
                    assert!(token.is_empty(), "a gone file has no token: {path}");
                    continue;
                }
                let value = produce(root, path);
                opened.values.insert(path.clone(), value.clone());
                opened.misses.push(NewRow {
                    path: path.clone(),
                    token,
                    last_modified_ms: millis(&root.join(path)),
                    value,
                });
            }
        }
    }
    opened
}

fn from_files(root: &Path, files: &[String]) -> BTreeMap<String, String> {
    files
        .iter()
        .filter(|path| root.join(path).exists())
        .map(|path| (path.clone(), produce(root, path)))
        .collect()
}

/// Opens, writes back what it computed, and returns how many values came from rows.
fn open_and_keep(root: &Path, namespace: &str, files: &[String]) -> usize {
    let opened = open(root, namespace, files);
    assert_eq!(opened.values, from_files(root, files));
    rows::put(root, namespace, &opened.misses, Some(files)).unwrap();
    opened.from_rows
}

/// The body `vault_index_rows_put` receives, as `PutRequest::decode` reads it.
fn put_body(root: &Path, namespace: &str, rows: &[NewRow]) -> Vec<u8> {
    let mut lines = vec![
        root.to_string_lossy().into_owned(),
        namespace.into(),
        "-".into(),
    ];
    for row in rows {
        lines.push(row.path.clone());
        lines.push(row.token.clone());
        lines.push(row.last_modified_ms.to_string());
        lines.push(row.value.clone());
    }
    lines.join("\n").into_bytes()
}

/// Sends one `put` frame to a bridge process and returns it without waiting for the answer.
fn spawn_put(body: &[u8]) -> std::process::Child {
    let mut child = Command::new(BRIDGE)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    stdin
        .write_all(format!("put {}\n", body.len()).as_bytes())
        .unwrap();
    stdin.write_all(body).unwrap();
    drop(stdin);
    child
}

fn rows_file(root: &Path) -> std::path::PathBuf {
    index_dir(root).unwrap().join("rows.sqlite")
}

#[test]
fn a_child_killed_during_a_row_batch_leaves_the_next_open_equal_to_a_build_from_files() {
    let vault = TempVault::new("rows-kill");
    let files = write_corpus(&vault.root, 4000, 11);
    backdate_all(&vault.root, &files);
    let mut rng = Lcg::new(23);

    let first = open(&vault.root, NS, &files);
    let filled = spawn_put(&put_body(&vault.root, NS, &first.misses))
        .wait()
        .unwrap();
    assert!(filled.success());
    assert_eq!(open(&vault.root, NS, &files).from_rows, files.len());

    // Half the files change between opens, so each batch rewrites rows that would otherwise be
    // stale and is long enough for a kill to land inside it.
    let edit_half = |round: u64, rng: &mut Lcg| {
        let start = (round as usize * 997) % files.len();
        for step in 0..files.len() / 2 {
            let path = &files[(start + step) % files.len()];
            let mut text = std::fs::read_to_string(vault.root.join(path)).unwrap();
            text.push_str(&format!("\nround {round} edit {}\n", rng.next()));
            std::fs::write(vault.root.join(path), text).unwrap();
            backdate(&vault.root, path, Duration::from_secs(30 + round));
        }
    };
    // One batch runs to its end first, timed from the moment the killed ones start their clock.
    edit_half(100, &mut rng);
    let calibration = open(&vault.root, NS, &files).misses;
    let mut child = spawn_put(&put_body(&vault.root, NS, &calibration));
    let started = Instant::now();
    assert!(child.wait().unwrap().success());
    let batch = started.elapsed();

    let mut interrupted = 0;
    for round in 0..20u64 {
        edit_half(round, &mut rng);
        let opened = open(&vault.root, NS, &files);
        assert_eq!(
            opened.values,
            from_files(&vault.root, &files),
            "round {round}"
        );
        let mut child = spawn_put(&put_body(&vault.root, NS, &opened.misses));
        let kill_after = batch.mul_f64((rng.next() % 1000) as f64 / 1000.0);
        std::thread::sleep(kill_after);
        if child.try_wait().unwrap().is_none() {
            interrupted += 1;
        }
        let _ = child.kill();
        let _ = child.wait();

        let after = open(&vault.root, NS, &files);
        assert_eq!(
            after.values,
            from_files(&vault.root, &files),
            "round {round}, killed after {kill_after:?}"
        );
        let check =
            Connection::open_with_flags(rows_file(&vault.root), OpenFlags::SQLITE_OPEN_READ_ONLY)
                .unwrap();
        let verdict: String = check
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(verdict, "ok", "round {round}");
    }
    eprintln!("20 kills over a {batch:?} batch; {interrupted} landed before it finished");
    // Kill points are spread over the batch's own measured length, so most must land inside it.
    assert!(
        interrupted >= 10,
        "only {interrupted} of 20 kills interrupted a batch"
    );
}

#[test]
fn a_namespace_version_bump_ignores_every_old_row() {
    let vault = TempVault::new("rows-version");
    let files = write_corpus(&vault.root, 50, 3);
    backdate_all(&vault.root, &files);
    open_and_keep(&vault.root, "test-entry/1", &files);
    assert_eq!(open_and_keep(&vault.root, "test-entry/1", &files), 50);

    let (found, counts) = rows::lookup(&vault.root, "test-entry/2", &files).unwrap();
    assert!(found.iter().all(|found| matches!(found, Found::Miss(_))));
    assert_eq!((counts.stored, counts.other_versions), (0, 50));
    // Another producer's rows are neither read nor removed.
    open_and_keep(&vault.root, "other-entry/1", &files);

    assert_eq!(open_and_keep(&vault.root, "test-entry/2", &files), 0);
    let (_, counts) = rows::lookup(&vault.root, "test-entry/2", &files).unwrap();
    assert_eq!((counts.stored, counts.other_versions), (50, 0));
    let (found, _) = rows::lookup(&vault.root, "test-entry/1", &files).unwrap();
    assert!(found.iter().all(|found| matches!(found, Found::Miss(_))));
    assert_eq!(open_and_keep(&vault.root, "other-entry/1", &files), 50);
}

#[test]
fn an_older_or_newer_rows_file_is_discarded_and_a_damaged_one_set_aside() {
    let vault = TempVault::new("rows-files");
    let files = write_corpus(&vault.root, 20, 5);
    backdate_all(&vault.root, &files);
    open_and_keep(&vault.root, NS, &files);
    let path = rows_file(&vault.root);
    for version in [0, 999] {
        Connection::open(&path)
            .unwrap()
            .pragma_update(None, "user_version", version)
            .unwrap();
        assert_eq!(
            open_and_keep(&vault.root, NS, &files),
            0,
            "version {version}"
        );
        assert_eq!(open_and_keep(&vault.root, NS, &files), 20);
    }
    let _ = std::fs::remove_file(path.with_extension("sqlite-wal"));
    let _ = std::fs::remove_file(path.with_extension("sqlite-shm"));
    std::fs::write(&path, b"not a database at all, just bytes").unwrap();
    assert_eq!(open_and_keep(&vault.root, NS, &files), 0);
    assert!(path.with_extension("sqlite.damaged").exists());
    assert_eq!(open_and_keep(&vault.root, NS, &files), 20);
}

fn hits(root: &Path, files: &[String]) -> Vec<String> {
    let (found, _) = rows::lookup(root, NS, files).unwrap();
    files
        .iter()
        .zip(found)
        .filter(|(_, found)| matches!(found, Found::Hit(_)))
        .map(|(path, _)| path.clone())
        .collect()
}

#[test]
fn an_external_edit_delete_or_rename_while_open_is_seen_on_the_next_open() {
    let vault = TempVault::new("rows-external");
    let root = vault.root.clone();
    let mut files = write_corpus(&root, 6000, 7);
    backdate_all(&root, &files);
    open_and_keep(&root, NS, &files);
    assert_eq!(hits(&root, &files).len(), files.len());
    let mut changed = Vec::new();

    // An in-place save that keeps the size and restores the modified time: only the change
    // time moves (Unix ctime, NTFS ChangeTime).
    let same = &files[0];
    let text = std::fs::read_to_string(root.join(same)).unwrap();
    let before = std::fs::metadata(root.join(same))
        .unwrap()
        .modified()
        .unwrap();
    std::fs::write(root.join(same), text.replacen("Page", "PAGE", 1)).unwrap();
    std::fs::File::options()
        .write(true)
        .open(root.join(same))
        .unwrap()
        .set_modified(before)
        .unwrap();
    changed.push(same.clone());

    // An in-place save, and a save by writing a new file and renaming it over the old one.
    let edited = &files[1];
    std::fs::write(root.join(edited), "---\ntitle: edited\n---\nnew words\n").unwrap();
    changed.push(edited.clone());
    let renamed_over = &files[2];
    std::fs::write(root.join("swap.tmp"), "---\ntitle: swapped\n---\n").unwrap();
    std::fs::rename(root.join("swap.tmp"), root.join(renamed_over)).unwrap();
    changed.push(renamed_over.clone());

    // A delete: the file is gone and its row is never handed back.
    std::fs::remove_file(root.join(&files[3])).unwrap();
    changed.push(files[3].clone());

    // A folder rename: every page under `notes/` now lives under `archive/`.
    std::fs::rename(root.join("notes"), root.join("archive")).unwrap();
    let moved: Vec<String> = files
        .iter()
        .filter(|path| path.starts_with("notes/"))
        .map(|path| path.replacen("notes/", "archive/", 1))
        .collect();
    let still_listed: Vec<String> = files
        .iter()
        .filter(|path| !path.starts_with("notes/"))
        .cloned()
        .collect();

    // A checkout rewriting 5,000 files, half of them to the same length.
    let rewritten: Vec<String> = still_listed.iter().skip(4).take(5000).cloned().collect();
    for (at, path) in rewritten.iter().enumerate() {
        let text = std::fs::read_to_string(root.join(path)).unwrap();
        let next = if at % 2 == 0 {
            text.replacen("Page", "Leaf", 1)
        } else {
            format!("{text}\ncheckout\n")
        };
        std::fs::write(root.join(path), next).unwrap();
    }
    changed.extend(rewritten.iter().cloned());

    files = still_listed
        .into_iter()
        .chain(moved.iter().cloned())
        .collect();
    let served = hits(&root, &files);
    for path in &served {
        assert!(
            !changed.contains(path),
            "a changed file was served from its row: {path}"
        );
        assert!(
            !moved.contains(path),
            "a renamed file was served from its old row: {path}"
        );
    }
    let opened = open(&root, NS, &files);
    assert_eq!(opened.values, from_files(&root, &files));
}

#[test]
fn a_file_written_within_two_seconds_of_being_seen_is_never_kept() {
    let vault = TempVault::new("rows-racy");
    let root = vault.root.clone();
    std::fs::write(root.join("fresh.md"), "---\ntitle: one\n---\n").unwrap();
    let files = vec!["fresh.md".to_string()];
    let opened = open(&root, NS, &files);
    let report = rows::put(&root, NS, &opened.misses, None).unwrap();
    assert_eq!((report.written, report.skipped), (0, 1));

    // A same-size rewrite inside one timestamp tick, as a 2-second FAT clock would record it.
    let stamp_before = std::fs::metadata(root.join("fresh.md"))
        .unwrap()
        .modified()
        .unwrap();
    std::fs::write(root.join("fresh.md"), "---\ntitle: two\n---\n").unwrap();
    std::fs::File::options()
        .write(true)
        .open(root.join("fresh.md"))
        .unwrap()
        .set_modified(stamp_before)
        .unwrap();
    assert_eq!(open(&root, NS, &files).from_rows, 0);
    assert_eq!(open(&root, NS, &files).values, from_files(&root, &files));

    // A row read within two seconds of its file's edit, however it got there, is not used.
    backdate(&root, "fresh.md", Duration::from_secs(60));
    let opened = open(&root, NS, &files);
    assert_eq!(
        rows::put(&root, NS, &opened.misses, None).unwrap().written,
        1
    );
    assert_eq!(open(&root, NS, &files).from_rows, 1);
    let stamp = Stamp::of_regular_file(&root.join("fresh.md")).unwrap();
    Connection::open(rows_file(&root))
        .unwrap()
        .execute(
            "UPDATE rows SET read_at_ns = ?1 WHERE path = 'fresh.md'",
            params![stamp.mtime_ns + 1_000_000_000],
        )
        .unwrap();
    assert_eq!(open(&root, NS, &files).from_rows, 0);
}

#[test]
fn a_row_for_a_version_that_changed_after_it_was_seen_is_refused() {
    let vault = TempVault::new("rows-moved-on");
    let root = vault.root.clone();
    let files = write_corpus(&root, 3, 9);
    backdate_all(&root, &files);
    let opened = open(&root, NS, &files);
    // The file changes between the lookup and the write: the producer's value is for the old one.
    std::fs::write(root.join(&files[0]), "---\ntitle: later\n---\n").unwrap();
    backdate(&root, &files[0], Duration::from_secs(10));
    let mut late = opened.misses.clone();
    late[1].last_modified_ms += 1;
    let report = rows::put(&root, NS, &late, None).unwrap();
    assert_eq!((report.written, report.skipped), (1, 2));
    assert_eq!(hits(&root, &files), vec![files[2].clone()]);
}

#[test]
fn a_lookup_never_creates_the_rows_file_and_delete_removes_it() {
    let vault = TempVault::new("rows-delete");
    let files = write_corpus(&vault.root, 10, 13);
    backdate_all(&vault.root, &files);
    rows::lookup(&vault.root, NS, &files).unwrap();
    assert!(!rows_file(&vault.root).exists());
    open_and_keep(&vault.root, NS, &files);
    assert!(rows_file(&vault.root).exists());
    assert!(vault_index::stored_bytes(Some(&vault.root)).unwrap() > 0);
    vault_index::delete(Some(&vault.root)).unwrap();
    assert!(!index_dir(&vault.root).unwrap().exists());
    assert_eq!(open_and_keep(&vault.root, NS, &files), 0);
}

#[test]
fn a_delete_during_a_row_batch_leaves_no_rows_behind() {
    let vault = TempVault::new("rows-delete-race");
    let root = vault.root.clone();
    let files = write_corpus(&root, 3000, 17);
    backdate_all(&root, &files);

    // A batch whose lookup came before a Delete writes nothing and makes no folder.
    let seen = open(&root, NS, &files);
    vault_index::delete(Some(&root)).unwrap();
    let report = rows::put(&root, NS, &seen.misses, None).unwrap();
    assert_eq!(report.written, 0);
    assert!(!index_dir(&root).unwrap().exists(), "the delete stays done");

    // A batch and a Delete racing: whichever takes the writer lock first, nothing is left.
    for round in 0..6u64 {
        let seen = open(&root, NS, &files);
        let batch = {
            let root = root.clone();
            std::thread::spawn(move || rows::put(&root, NS, &seen.misses, None).unwrap())
        };
        std::thread::sleep(Duration::from_millis(round * 15));
        vault_index::delete(Some(&root)).unwrap();
        batch.join().unwrap();
        assert!(
            !index_dir(&root).unwrap().exists(),
            "round {round}: a batch never outlives the Delete"
        );
        assert_eq!(open(&root, NS, &files).from_rows, 0, "round {round}");
    }

    // A lookup after the Delete starts over normally.
    let fresh = open(&root, NS, &files);
    assert_eq!(
        rows::put(&root, NS, &fresh.misses, None).unwrap().written,
        files.len()
    );
    assert_eq!(open(&root, NS, &files).from_rows, files.len());
}
