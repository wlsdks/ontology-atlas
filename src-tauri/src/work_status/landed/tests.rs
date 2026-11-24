use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{parse_landed, parse_numstat, parse_shortstat, read_detail, read_landed};

fn git(cwd: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn commit(cwd: &Path, file: &str, body: &str, message: &str) {
    fs::write(cwd.join(file), body).unwrap();
    git(cwd, &["add", file]);
    git(cwd, &["commit", "-qm", message]);
}

struct Fixture {
    dir: PathBuf,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn a_stat_line_reads_files_insertions_and_deletions_and_a_missing_part_is_zero() {
    assert_eq!(
        parse_shortstat(" 3 files changed, 10 insertions(+), 2 deletions(-)"),
        (Some(3), Some(10), Some(2))
    );
    assert_eq!(
        parse_shortstat(" 1 file changed, 4 deletions(-)"),
        (Some(1), Some(0), Some(4))
    );
    assert_eq!(
        parse_shortstat(" 1 file changed, 1 insertion(+)"),
        (Some(1), Some(1), Some(0))
    );
    assert_eq!(parse_shortstat("nothing here"), (None, None, None));
}

#[test]
fn a_record_with_a_separator_in_its_subject_keeps_it_whole_and_a_bad_hash_is_dropped() {
    let hash = "a".repeat(40);
    let text = format!(
        "\u{1e}{hash}\u{1f}{p1} {p2}\u{1f}1700000000\u{1f}feat: one\u{1f}two\u{202e}\n\n 2 files changed, 5 insertions(+)\n\u{1e}nothex\u{1f}\u{1f}1\u{1f}x\n",
        p1 = "b".repeat(40),
        p2 = "c".repeat(40),
    );
    let read = parse_landed(&text);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].subject, "feat: one\u{1f}two".replace('\u{1f}', " "));
    assert!(read[0].merge);
    assert_eq!(
        (read[0].files, read[0].insertions, read[0].deletions),
        (Some(2), Some(5), Some(0))
    );
    assert_eq!(read[0].at, Some(1_700_000_000));
}

#[test]
fn a_separator_inside_a_subject_cannot_start_a_forged_record() {
    let hash = "a".repeat(40);
    let forged = "f".repeat(40);
    let text = format!(
        "\u{1e}{hash}\u{1f}\u{1f}1700000000\u{1f}fix: real \u{1e}{forged}\u{1f}\u{1f}1\u{1f}feat: FORGED (#999)\n\n 1 file changed, 1 insertion(+)\n"
    );
    let read = parse_landed(&text);
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].hash, hash);
}

#[test]
fn numstat_reads_binary_files_without_counts_and_paths_with_tabs() {
    let files = parse_numstat("3\t1\tsrc/a.ts\0-\t-\timg.png\0\n2\t0\tdir/with\ttab.md\0");
    assert_eq!(files.len(), 3);
    assert_eq!(
        (files[0].insertions, files[0].deletions),
        (Some(3), Some(1))
    );
    assert_eq!((files[1].insertions, files[1].deletions), (None, None));
    assert_eq!(files[2].path, "dir/with tab.md");
}

#[test]
fn the_base_line_lists_merges_and_squashes_and_a_merge_opens_to_its_own_commits() {
    let dir = std::env::temp_dir().join(format!("atlas-landed-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let fixture = Fixture {
        dir: fs::canonicalize(&dir).unwrap(),
    };
    let repo = &fixture.dir;
    git(repo, &["init", "-q", "-b", "main"]);
    git(repo, &["config", "user.email", "test@example.invalid"]);
    git(repo, &["config", "user.name", "atlas test"]);
    git(repo, &["config", "commit.gpgsign", "false"]);
    commit(repo, "base.md", "base\n", "chore: start");
    git(repo, &["switch", "-q", "-c", "feat/lines"]);
    commit(repo, "a.md", "one\ntwo\n", "feat: first line");
    commit(repo, "b.md", "three\n", "feat: second line");
    git(repo, &["switch", "-q", "main"]);
    git(
        repo,
        &[
            "merge",
            "-q",
            "--no-ff",
            "-m",
            "feat: lines (#1)",
            "feat/lines",
        ],
    );
    commit(repo, "c.md", "squashed\n", "fix: squashed (#2)");

    let read = read_landed(repo, "main").expect("the base line reads");
    assert_eq!(read.week_count, Some(3));
    let landed = read.changes;
    let subjects: Vec<&str> = landed
        .iter()
        .map(|change| change.subject.as_str())
        .collect();
    assert_eq!(
        subjects,
        ["fix: squashed (#2)", "feat: lines (#1)", "chore: start"]
    );
    assert!(!landed[0].merge && landed[1].merge);
    assert_eq!((landed[1].files, landed[1].insertions), (Some(2), Some(3)));

    let merge = read_detail(repo, &landed[1].hash).expect("the merge opens");
    assert_eq!(merge.commit_count, 2);
    assert_eq!(merge.commits[0].subject, "feat: second line");
    assert_eq!(merge.file_count, 2);
    assert_eq!(merge.files[0].path, "a.md");
    let squash = read_detail(repo, &landed[0].hash).expect("the squash opens");
    assert_eq!((squash.commit_count, squash.file_count), (0, 1));

    assert!(read_landed(repo, "--output=/tmp/x").is_none());
    assert!(read_landed(repo, "main..evil").is_none());
    for revision in [
        "main^",
        "main~1",
        "main@{0}",
        "feat/lines...main",
        "main:base.md",
    ] {
        assert!(read_landed(repo, revision).is_none(), "{revision}");
    }
    let blob = git(repo, &["rev-parse", "HEAD:base.md"]);
    assert!(read_detail(repo, &blob).is_none());

    // A plain folder inside the repository is not the repository: nothing is read upward.
    fs::create_dir_all(repo.join("notes")).unwrap();
    assert!(read_landed(&repo.join("notes"), "main").is_none());
    assert!(read_detail(&repo.join("notes"), &landed[0].hash).is_none());

    // A signature program the repository names never runs, the first commit included.
    let ran = repo.join("signature-program-ran");
    let program = repo.join("sign.sh");
    fs::write(&program, format!("#!/bin/sh\ntouch '{}'\n", ran.display())).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).unwrap();
    }
    git(repo, &["config", "log.showSignature", "true"]);
    git(repo, &["config", "gpg.program", program.to_str().unwrap()]);
    let first = landed.last().unwrap().hash.clone();
    let body = git(repo, &["cat-file", "commit", &first]);
    let (head, message) = body.split_once("\n\n").unwrap();
    let signed = format!(
        "{head}\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n AAAA\n -----END PGP SIGNATURE-----\n\n{message}\n"
    );
    let signed_path = repo.join("signed-commit");
    fs::write(&signed_path, signed).unwrap();
    // Relative to the repository Git runs in: Windows Git cannot open a `\\?\` path.
    let signed_id = git(
        repo,
        &["hash-object", "-t", "commit", "-w", "signed-commit"],
    );
    git(repo, &["branch", "signed", &signed_id]);
    let _ = read_landed(repo, "signed");
    let _ = read_detail(repo, &signed_id);
    assert!(!ran.exists(), "the repository's signature program ran");
    assert!(read_detail(repo, "HEAD").is_none());
    assert!(read_detail(repo, "--all").is_none());
}
