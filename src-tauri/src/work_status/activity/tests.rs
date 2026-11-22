use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{
    activity_stamps, clean_subject, join_git_path, parse_log, parse_status, read_activity,
    SUBJECT_MAX_CHARS,
};

const SEP: char = '\u{1f}';

#[test]
fn a_subject_holding_the_separators_stays_one_whole_plain_line() {
    let text = format!(
        "a1b2c3d{SEP}1700000000{SEP}fix: keep a{SEP}b and tab\there\0\
         0f0f0f0{SEP}1699999000{SEP}한국어 제목 🚀 e\u{301}mojis\0\
         ffff000{SEP}1699990000{SEP}\u{202e}txt.exe\u{202c} spoof\0\
         notahash{SEP}1{SEP}dropped\0\
         abcdef0{SEP}1{SEP}fourth is past the three read\0"
    );
    let lines = parse_log(&text);
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[0].hash, "a1b2c3d");
    assert_eq!(lines[0].at, Some(1_700_000_000));
    assert_eq!(lines[0].subject, "fix: keep a b and tab here");
    assert_eq!(lines[1].subject, "한국어 제목 🚀 e\u{301}mojis");
    assert_eq!(lines[2].subject, "txt.exe spoof");
}

#[test]
fn a_subject_keeps_at_most_two_hundred_characters_and_no_control_character() {
    let long = "가".repeat(SUBJECT_MAX_CHARS + 50);
    assert_eq!(clean_subject(&long).chars().count(), SUBJECT_MAX_CHARS);
    let cleaned = clean_subject("\u{1b}[31mred\u{7}\r\nnext\u{0}  \u{85}end ");
    assert_eq!(cleaned, "[31mred next end");
    assert!(cleaned.chars().all(|c| !c.is_control()));
    assert_eq!(clean_subject("   "), "");
}

#[test]
fn status_lists_changed_untracked_and_unmerged_paths_with_spaces_and_unicode() {
    let text = "1 .M N... 100644 100644 100644 abc abc src/a file.ts\0\
                2 R. N... 100644 100644 100644 abc abc R100 new name.ts\0old name.ts\0\
                u UU N... 100644 100644 100644 100644 a b c 충돌.md\0\
                ? 새 폴더/\0\
                ! ignored.log\0\
                # branch.oid abc\0";
    assert_eq!(
        parse_status(text),
        vec!["src/a file.ts", "new name.ts", "충돌.md", "새 폴더/"]
    );
    assert!(parse_status("").is_empty());
}

#[test]
fn a_git_path_joins_by_component_and_never_climbs_out() {
    let folder = Path::new("worktree");
    let joined = join_git_path(folder, "src/../../etc/passwd");
    assert!(joined.starts_with(folder));
    assert_eq!(joined.components().count(), 4);
    assert_eq!(
        join_git_path(folder, "src/ui/a.ts").file_name().unwrap(),
        "a.ts"
    );
}

/// Git cannot take a Windows verbatim path (`\\?\C:\...`) as an argument.
fn git_arg(path: &Path) -> String {
    let text = path.to_string_lossy().into_owned();
    text.strip_prefix(r"\\?\")
        .map(str::to_owned)
        .unwrap_or(text)
}

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

fn commit(cwd: &Path, file: &str, message: &str) {
    fs::write(cwd.join(file), file).unwrap();
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
fn a_worktree_reads_its_subjects_beyond_the_base_and_its_newest_uncommitted_file() {
    let dir = std::env::temp_dir().join(format!("atlas-activity-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let main = dir.join("main");
    fs::create_dir_all(&main).unwrap();
    let fixture = Fixture {
        dir: fs::canonicalize(&dir).unwrap(),
    };
    let main = fixture.dir.join("main");
    git(&main, &["init", "-q", "-b", "main"]);
    git(&main, &["config", "user.email", "test@example.invalid"]);
    git(&main, &["config", "user.name", "atlas test"]);
    git(&main, &["config", "commit.gpgsign", "false"]);
    commit(&main, "base.md", "base");
    let folder = fixture.dir.join("feat-lines");
    git(
        &main,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "feat/lines",
            &git_arg(&folder),
        ],
    );

    let fresh = read_activity(&main, "feat-lines", Some("main")).expect("the worktree reads");
    assert_eq!(fresh.commits, Some(vec![]));
    assert_eq!(fresh.uncommitted, Some(0));
    assert_eq!(fresh.latest_file, None);

    commit(&folder, "one.md", "feat: first");
    commit(&folder, "two.md", "fix: 두 번째 \u{1f} 줄");
    fs::create_dir_all(folder.join("src")).unwrap();
    fs::write(folder.join("older.md"), "x").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    fs::write(folder.join("src").join("newest.ts"), "x").unwrap();
    git(&folder, &["add", "src/newest.ts"]);

    let read = read_activity(&main, "feat-lines", Some("main")).expect("the worktree reads");
    let subjects: Vec<_> = read
        .commits
        .expect("commits read")
        .into_iter()
        .map(|line| line.subject)
        .collect();
    assert_eq!(subjects, vec!["fix: 두 번째 줄", "feat: first"]);
    assert_eq!(read.uncommitted, Some(2));
    assert_eq!(read.latest_file.as_deref(), Some("src/newest.ts"));
    assert_ne!(
        read.stamp, fresh.stamp,
        "staging and committing move the stamp"
    );

    let stamps = activity_stamps(&main).expect("stamps read");
    assert_eq!(stamps.get("feat-lines"), Some(&read.stamp));
    assert!(stamps.contains_key("main"));

    let main_read = read_activity(&main, "main", Some("main")).expect("the main checkout reads");
    assert_eq!(main_read.commits, Some(vec![]));
    assert_eq!(read_activity(&main, "../main", Some("main")), None);
    assert_eq!(read_activity(&main, "absent", Some("main")), None);
    let refused = read_activity(&main, "feat-lines", Some("--output=/tmp/x")).expect("reads");
    assert_eq!(refused.commits, None, "an option is never a base branch");
}

/// Prints the CPU one read costs on a real repository, in this process and its `git` children:
/// `ATLAS_ACTIVITY_REPO=/path cargo test activity_cpu -- --ignored --nocapture`.
#[cfg(unix)]
#[test]
#[ignore]
fn activity_cpu() {
    let Ok(repo) = std::env::var("ATLAS_ACTIVITY_REPO") else {
        return;
    };
    let root = fs::canonicalize(repo).unwrap();
    let usage = |who| unsafe {
        let mut usage: libc::rusage = std::mem::zeroed();
        libc::getrusage(who, &mut usage);
        let time = |t: libc::timeval| t.tv_sec as f64 * 1000.0 + t.tv_usec as f64 / 1000.0;
        time(usage.ru_utime) + time(usage.ru_stime)
    };
    let before = (usage(libc::RUSAGE_SELF), usage(libc::RUSAGE_CHILDREN));
    let wall = std::time::Instant::now();
    let stamps = activity_stamps(&root).expect("stamps read");
    let stamp_ms = wall.elapsed().as_secs_f64() * 1000.0;
    for id in stamps.keys() {
        let started = std::time::Instant::now();
        let read = read_activity(&root, id, Some("main"));
        println!(
            "{id}: {:.1} ms wall, {} commits, {:?} uncommitted",
            started.elapsed().as_secs_f64() * 1000.0,
            read.as_ref()
                .and_then(|read| read.commits.as_ref())
                .map_or(0, Vec::len),
            read.as_ref().and_then(|read| read.uncommitted)
        );
    }
    let after = (usage(libc::RUSAGE_SELF), usage(libc::RUSAGE_CHILDREN));
    println!(
        "{} worktrees: stamps {stamp_ms:.2} ms wall; reads {:.1} ms CPU in Atlas, {:.1} ms CPU in git",
        stamps.len(),
        after.0 - before.0,
        after.1 - before.1
    );
}
