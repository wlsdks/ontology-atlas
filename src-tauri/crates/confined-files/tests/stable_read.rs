//! A vault file read as one snapshot: the bytes and the time belong to the same version, a pipe
//! at the name of a note does not hang the read, and a file that will not hold still is refused.

use std::fs::{self, File, FileTimes};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use confined_files::{ConfinedPath, StableReadError, VaultRoot, MAX_ATTEMPTS};

struct Vault {
    _directory: tempfile::TempDir,
    root: VaultRoot,
}

fn vault() -> Vault {
    let directory = tempfile::tempdir().expect("temp dir");
    let base = dunce::canonicalize(directory.path()).expect("real");
    Vault {
        root: VaultRoot::open(&base).expect("vault"),
        _directory: directory,
    }
}

fn only_file(vault: &Vault) -> (ConfinedPath, PathBuf) {
    let files = vault.root.markdown_files();
    let file = files.first().expect("one file").clone();
    let path = file.as_path().to_path_buf();
    (file, path)
}

fn rewrite_in_place(path: &Path, text: &str, seconds_after_epoch: u64) {
    fs::write(path, text).expect("rewrite");
    let file = File::options().write(true).open(path).expect("open");
    file.set_times(
        FileTimes::new()
            .set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(seconds_after_epoch)),
    )
    .expect("set times");
}

#[test]
fn a_file_is_read_with_the_time_of_those_bytes() {
    let vault = vault();
    fs::write(vault.root.path().join("note.md"), "hello").expect("note");
    let (file, _) = only_file(&vault);
    let snapshot = file.read_snapshot().expect("read").expect("present");
    assert_eq!(snapshot.bytes, b"hello");
    assert_eq!(snapshot.stamp.size(), 5);
    assert_eq!(file.stamp().expect("stamp"), Some(snapshot.stamp));
}

#[test]
fn a_write_between_the_read_and_the_look_is_read_again_and_pairs_bytes_with_time() {
    let vault = vault();
    let path = vault.root.path().join("note.md");
    fs::write(&path, "first").expect("note");
    let (file, _) = only_file(&vault);
    rewrite_in_place(&path, "first", 1_000);
    let snapshot = file
        .read_snapshot_pausing(&|attempt| {
            if attempt == 0 {
                rewrite_in_place(&path, "second, longer", 2_000);
            }
        })
        .expect("read")
        .expect("present");
    assert_eq!(snapshot.bytes, b"second, longer");
    assert_eq!(snapshot.stamp.modified_time().milliseconds(), 2_000_000.0);
}

#[test]
fn a_file_that_changes_every_time_it_is_read_is_refused_after_the_attempts() {
    let vault = vault();
    let path = vault.root.path().join("note.md");
    fs::write(&path, "x").expect("note");
    let (file, _) = only_file(&vault);
    let attempts = std::cell::Cell::new(0);
    let refused = file
        .read_snapshot_pausing(&|attempt| {
            attempts.set(attempts.get() + 1);
            rewrite_in_place(&path, &"x".repeat(attempt + 2), 3_000 + attempt as u64);
        })
        .expect_err("a file that will not hold still");
    assert!(matches!(refused, StableReadError::Unstable), "{refused}");
    assert_eq!(attempts.get(), MAX_ATTEMPTS);
}

#[test]
fn a_file_replaced_by_a_rename_in_the_pause_is_read_again_as_the_new_version() {
    let vault = vault();
    let path = vault.root.path().join("note.md");
    fs::write(&path, "old").expect("note");
    let (file, _) = only_file(&vault);
    let replacement = vault.root.path().join("replacement.tmp");
    let snapshot = file
        .read_snapshot_pausing(&|attempt| {
            if attempt == 0 {
                fs::write(&replacement, "new text").expect("replacement");
                fs::rename(&replacement, &path).expect("rename");
            }
        })
        .expect("read")
        .expect("present");
    // The old file lost its name, which changes its own stamp, so the read is not trusted.
    assert_eq!(snapshot.bytes, b"new text");
    assert_eq!(file.stamp().expect("stamp"), Some(snapshot.stamp));
}

#[test]
fn nothing_there_is_absent() {
    let vault = vault();
    fs::write(vault.root.path().join("note.md"), "x").expect("note");
    let (file, path) = only_file(&vault);
    fs::remove_file(path).expect("removed");
    assert!(file.read_snapshot().expect("read").is_none());
    assert_eq!(file.stamp().expect("stamp"), None);
}

#[cfg(unix)]
mod unix {
    use std::os::unix::fs::symlink;
    use std::sync::mpsc;

    use super::*;

    fn make_pipe(path: &Path) {
        let status = std::process::Command::new("mkfifo")
            .arg(path)
            .status()
            .expect("run mkfifo");
        assert!(status.success(), "mkfifo failed");
    }

    #[test]
    fn a_pipe_named_like_a_note_is_absent_and_does_not_hang() {
        let vault = vault();
        fs::write(vault.root.path().join("note.md"), "x").expect("note");
        let (file, path) = only_file(&vault);
        fs::remove_file(&path).expect("removed");
        make_pipe(&path);
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let read = file.read_snapshot().map(|read| read.is_none());
            let stamp = file.stamp().map(|stamp| stamp.is_none());
            sender.send((read.ok(), stamp.ok())).expect("sent");
        });
        let answered = receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("the read of a pipe returns");
        assert_eq!(answered, (Some(true), Some(true)));
    }

    #[test]
    fn a_link_that_loops_is_the_operating_systems_refusal() {
        let vault = vault();
        let path = vault.root.path().join("loop.md");
        symlink(&path, &path).expect("link");
        let file = vault.root.read_path("loop").expect("the slug of the link");
        let refused = file.read_snapshot().expect_err("a loop");
        let StableReadError::Io(error) = refused else {
            panic!("expected the operating system's error, got {refused}");
        };
        assert_eq!(
            confined_files::OsErrorCode::of(&error),
            confined_files::OsErrorCode::TooManyLinks
        );
    }
}
