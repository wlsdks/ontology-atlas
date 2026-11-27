//! The declarative file at the top of a vault (`.ontology-atlasignore`) is read as a plain file,
//! bounded, and refused when a stranger planted something else at its name.

use std::fs;
use std::path::PathBuf;

use confined_files::{VaultRoot, TOP_FILE_MAX_BYTES};

const NAME: &str = ".ontology-atlasignore";

struct Planted {
    _directory: tempfile::TempDir,
    base: PathBuf,
    root: VaultRoot,
}

fn planted() -> Planted {
    let directory = tempfile::tempdir().expect("temp dir");
    let base = dunce::canonicalize(directory.path()).expect("real");
    let vault = base.join("vault");
    fs::create_dir_all(&vault).expect("vault");
    Planted {
        root: VaultRoot::open(&vault).expect("vault"),
        base,
        _directory: directory,
    }
}

#[test]
fn a_plain_file_is_read_and_a_missing_one_is_none() {
    let planted = planted();
    assert_eq!(planted.root.read_top_file(NAME).expect("absent"), None);
    fs::write(planted.root.path().join(NAME), "src/generated/**\n").expect("file");
    assert_eq!(
        planted.root.read_top_file(NAME).expect("read").as_deref(),
        Some("src/generated/**\n")
    );
}

#[test]
fn a_file_over_the_cap_is_refused_and_one_at_the_cap_is_read() {
    let planted = planted();
    let path = planted.root.path().join(NAME);
    fs::write(&path, "a".repeat(TOP_FILE_MAX_BYTES as usize)).expect("at the cap");
    assert!(planted.root.read_top_file(NAME).expect("read").is_some());
    fs::write(&path, "a".repeat(TOP_FILE_MAX_BYTES as usize + 1)).expect("over the cap");
    let refused = planted.root.read_top_file(NAME).expect_err("too large");
    assert!(refused.to_string().contains("over"), "{refused}");
}

#[test]
fn a_name_with_a_separator_is_refused() {
    let planted = planted();
    assert!(planted.root.read_top_file("../outside").is_err());
    assert!(planted.root.read_top_file("sub/file").is_err());
}

#[cfg(unix)]
mod unix {
    use std::os::unix::fs::symlink;
    use std::sync::mpsc;
    use std::time::Duration;

    use super::*;

    #[test]
    fn a_link_to_a_file_outside_the_vault_is_refused_and_not_read() {
        let planted = planted();
        let outside = planted.base.join("outside.txt");
        fs::write(&outside, "secret patterns\n").expect("outside");
        symlink(&outside, planted.root.path().join(NAME)).expect("link");
        let refused = planted.root.read_top_file(NAME).expect_err("a link out");
        assert!(refused.to_string().contains("link"), "{refused}");
    }

    #[test]
    fn a_pipe_at_the_name_is_refused_and_does_not_hang() {
        let planted = planted();
        let status = std::process::Command::new("mkfifo")
            .arg(planted.root.path().join(NAME))
            .status()
            .expect("run mkfifo");
        assert!(status.success(), "mkfifo failed");
        let (sender, receiver) = mpsc::channel();
        let root = planted.root.clone();
        std::thread::spawn(move || {
            let _ = sender.send(root.read_top_file(NAME).is_err());
        });
        let answered = receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("the read of a pipe came back");
        assert!(answered, "a pipe is refused");
    }
}

/// Windows opens a link as the link itself (`FILE_FLAG_OPEN_REPARSE_POINT`), and a reparse point
/// whose tag names another file system object (a symbolic link or a junction) is not a plain file
/// (Microsoft, "Reparse Point Tags", `IsReparseTagNameSurrogate`). Creating a symbolic link needs a
/// privilege a test machine may not have; then the case has nothing to look at and is skipped.
#[cfg(windows)]
#[test]
fn a_symbolic_link_is_refused_on_windows() {
    let planted = planted();
    let outside = planted.base.join("outside.txt");
    fs::write(&outside, "secret patterns\n").expect("outside");
    if std::os::windows::fs::symlink_file(&outside, planted.root.path().join(NAME)).is_err() {
        eprintln!("skipped: this account may not create symbolic links");
        return;
    }
    assert!(planted.root.read_top_file(NAME).is_err());
}
