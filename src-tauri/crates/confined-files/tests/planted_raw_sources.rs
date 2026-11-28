//! Planted hostile `sources/` folders for `VaultRoot::read_raw_source`: what a stranger's vault can
//! put at a name an agent asks for, and what the read must answer instead of the file.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests plant the files of a temporary vault, which the read then meets"
)]

use std::fs;
use std::path::PathBuf;

use confined_files::{RawSourcePath, RawSourceReadRefusal, VaultRoot};

const CAP: u64 = 1024;

struct Planted {
    _directory: tempfile::TempDir,
    base: PathBuf,
    root: VaultRoot,
}

fn planted() -> Planted {
    let directory = tempfile::tempdir().expect("temp dir");
    let base = dunce::canonicalize(directory.path()).expect("real");
    let vault = base.join("vault");
    fs::create_dir_all(vault.join("sources")).expect("sources");
    Planted {
        root: VaultRoot::open(&vault).expect("vault"),
        base,
        _directory: directory,
    }
}

fn read(planted: &Planted, name: &str) -> Result<Vec<u8>, RawSourceReadRefusal> {
    let path = RawSourcePath::parse(name).expect("a name below sources/");
    planted.root.read_raw_source(&path, CAP)
}

#[test]
fn a_plain_file_reads_whole_and_a_missing_one_is_not_found() {
    let planted = planted();
    fs::write(planted.root.path().join("sources/plan.md"), "plan").expect("file");
    assert_eq!(read(&planted, "sources/plan.md"), Ok(b"plan".to_vec()));
    assert_eq!(
        read(&planted, "sources/absent.md"),
        Err(RawSourceReadRefusal::NotFound)
    );
}

#[test]
fn a_folder_and_a_file_over_the_cap_are_refused_by_what_they_are() {
    let planted = planted();
    fs::create_dir(planted.root.path().join("sources/folder.md")).expect("folder");
    fs::write(planted.root.path().join("sources/big.md"), vec![b'x'; 2000]).expect("big");
    assert_eq!(
        read(&planted, "sources/folder.md"),
        Err(RawSourceReadRefusal::NotRegular)
    );
    assert_eq!(
        read(&planted, "sources/big.md"),
        Err(RawSourceReadRefusal::TooLarge { max_bytes: CAP })
    );
}

#[cfg(unix)]
mod unix {
    use std::os::unix::fs::symlink;

    use super::*;

    #[test]
    fn a_link_to_a_file_outside_is_a_link_and_hands_over_nothing() {
        let planted = planted();
        let outside = planted.base.join("outside.md");
        fs::write(&outside, "SECRET").expect("outside");
        symlink(&outside, planted.root.path().join("sources/linked.md")).expect("link");
        assert_eq!(
            read(&planted, "sources/linked.md"),
            Err(RawSourceReadRefusal::ThroughLink)
        );
    }

    #[test]
    fn a_link_to_a_file_inside_the_vault_is_refused_too() {
        let planted = planted();
        fs::write(planted.root.path().join("sources/real.md"), "real").expect("file");
        symlink("real.md", planted.root.path().join("sources/alias.md")).expect("link");
        assert_eq!(
            read(&planted, "sources/alias.md"),
            Err(RawSourceReadRefusal::ThroughLink)
        );
    }

    #[test]
    fn a_folder_that_is_a_link_hides_no_file_behind_it() {
        let planted = planted();
        let outside = planted.base.join("elsewhere");
        fs::create_dir(&outside).expect("elsewhere");
        fs::write(outside.join("plan.md"), "SECRET").expect("secret");
        symlink(&outside, planted.root.path().join("sources/folder")).expect("link");
        assert_eq!(
            read(&planted, "sources/folder/plan.md"),
            Err(RawSourceReadRefusal::ThroughLink)
        );
    }

    #[test]
    fn a_link_loop_ends_in_a_refusal_and_a_pipe_never_blocks() {
        let planted = planted();
        let sources = planted.root.path().join("sources");
        symlink("b.md", sources.join("a.md")).expect("a");
        symlink("a.md", sources.join("b.md")).expect("b");
        assert_eq!(
            read(&planted, "sources/a.md"),
            Err(RawSourceReadRefusal::ThroughLink)
        );
        let status = std::process::Command::new("mkfifo")
            .arg(sources.join("pipe.md"))
            .status()
            .expect("run mkfifo");
        assert!(status.success(), "mkfifo failed");
        // A blocking open of a pipe with no writer never returns, so the read runs on a thread the
        // test gives five seconds.
        let (sender, receiver) = std::sync::mpsc::channel();
        let root = planted.root.clone();
        std::thread::spawn(move || {
            let path = RawSourcePath::parse("sources/pipe.md").expect("a name");
            let _ = sender.send(root.read_raw_source(&path, CAP));
        });
        let answer = receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("the read of a pipe returned");
        assert_eq!(answer, Err(RawSourceReadRefusal::NotRegular));
    }

    #[test]
    fn a_name_deeper_than_the_system_allows_is_not_found_not_a_crash() {
        let planted = planted();
        let deep = format!("sources/{}file.md", "d/".repeat(300));
        assert_eq!(read(&planted, &deep), Err(RawSourceReadRefusal::NotFound));
    }
}

/// A Windows name is matched without regard to case, and a reserved device name is no file. Sources:
/// Microsoft, "Naming Files, Paths, and Namespaces"
/// (learn.microsoft.com/windows/win32/fileio/naming-a-file): a path is not case-sensitive, and
/// macOS keeps a file name as it was created and finds it by either normalization form, so a name
/// a decomposing program wrote (NFD) is the file an agent typed in NFC names, not a link.
#[cfg(target_os = "macos")]
#[test]
fn a_decomposed_name_on_disk_is_read_when_it_is_typed_composed() {
    let planted = planted();
    fs::write(planted.root.path().join("sources/cafe\u{301}.md"), "latte").expect("file");
    assert_eq!(
        read(&planted, "sources/caf\u{e9}.md"),
        Ok(b"latte".to_vec())
    );
    fs::write(
        planted.root.path().join("sources/\u{110e}\u{1171}.md"),
        "hangul",
    )
    .expect("file");
    assert_eq!(
        read(&planted, "sources/\u{cde8}.md"),
        Ok(b"hangul".to_vec())
    );
}

#[cfg(windows)]
mod windows {
    use super::*;

    #[test]
    fn another_letter_case_names_the_same_file() {
        let planted = planted();
        fs::write(planted.root.path().join("sources/Plan.md"), "plan").expect("file");
        assert_eq!(read(&planted, "sources/PLAN.MD"), Ok(b"plan".to_vec()));
    }

    #[test]
    fn a_file_symbolic_link_is_refused_when_the_machine_may_make_one() {
        let planted = planted();
        let outside = planted.base.join("outside.md");
        fs::write(&outside, "SECRET").expect("outside");
        let link = planted.root.path().join("sources/linked.md");
        if std::os::windows::fs::symlink_file(&outside, &link).is_err() {
            // Creating a link needs Developer Mode or elevation (Microsoft, "Create symbolic links").
            return;
        }
        assert_eq!(
            read(&planted, "sources/linked.md"),
            Err(RawSourceReadRefusal::ThroughLink)
        );
    }
}

/// A long s (U+017F) is the letter s to a case-insensitive disk's folding and to no rule the name
/// check applies, so `sources/\u{17f}ecret.md` is a document by its name and `secret.md` by the
/// disk. The read asks again of the spelling the disk gives the opened file.
#[test]
fn a_lookalike_name_that_the_disk_opens_as_a_credential_is_not_read() {
    let planted = planted();
    let sources = planted.root.path().join("sources");
    fs::write(sources.join("secret.md"), "TOKEN").expect("credential");
    let disk_folds = sources.join("\u{17f}ecret.md").exists();
    let expected = if disk_folds {
        RawSourceReadRefusal::HiddenOrCredential
    } else {
        RawSourceReadRefusal::NotFound
    };
    assert_eq!(read(&planted, "sources/\u{17f}ecret.md"), Err(expected));
}
