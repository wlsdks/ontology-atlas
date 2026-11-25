use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::counts::{is_skipped, Pulse, VerdictBatch, GIT_CALL_GAP, STEP_COUNT_CAP, STEP_MS};
use super::is_counted_kind;

const PLANTED: &str = "ATLAS_PLANTED_7f3c";
/// A time on a step boundary, so a test's writes share one step.
const NOW_MS: i64 = 1_700_000_000_000;

/// The main checkout and 40 linked worktrees under it, all drawn.
fn forty_worktrees() -> (Pulse, Vec<String>) {
    let mut listed = vec![(PathBuf::from("/repo"), "main".to_string())];
    for index in 0..40 {
        listed.push((
            PathBuf::from(format!("/repo/.worktrees/w{index}")),
            format!("w{index}"),
        ));
    }
    let drawn: Vec<String> = listed.iter().map(|(_, id)| id.clone()).collect();
    let mut pulse = Pulse::default();
    pulse.set_rooms(listed, &drawn);
    (pulse, drawn)
}

/// Asks Git through a stand-in that ignores `ignored` and counts its calls.
fn judge(pulse: &mut Pulse, now: Instant, ignored: &[&str], calls: &mut usize) {
    let batches: Vec<VerdictBatch> = pulse.take_due_batches(now);
    for batch in batches {
        *calls += 1;
        let verdict: HashSet<String> = batch
            .relative_paths()
            .filter(|path| ignored.iter().any(|prefix| path.starts_with(prefix)))
            .map(str::to_string)
            .collect();
        pulse.apply_verdicts(batch, Some(&verdict), NOW_MS);
    }
}

fn counts(pulse: &mut Pulse) -> Vec<(String, u32)> {
    pulse
        .read(NOW_MS)
        .into_iter()
        .map(|(id, room)| {
            (
                id,
                room.steps.iter().map(|step| u32::from(step.count)).sum(),
            )
        })
        .filter(|(_, total)| *total > 0)
        .collect()
}

#[test]
fn a_saved_file_counts_once_in_its_own_worktree_and_nowhere_else() {
    let (mut pulse, _) = forty_worktrees();
    let start = Instant::now();
    let mut calls = 0;
    pulse.notice(Path::new("/repo/.worktrees/w7/src/lib.rs"), NOW_MS);
    // The same file saved again in the step, as a write and a rename notice: still one change.
    pulse.notice(Path::new("/repo/.worktrees/w7/src/lib.rs"), NOW_MS + 5);
    judge(&mut pulse, start, &[], &mut calls);
    pulse.notice(Path::new("/repo/.worktrees/w7/src/lib.rs"), NOW_MS + 9);
    assert_eq!(counts(&mut pulse), [("w7".to_string(), 1)]);
    assert_eq!(calls, 1);
    let read = pulse.read(NOW_MS);
    assert_eq!(
        read.get("w7").and_then(|room| room.last_change_at_ms),
        Some(NOW_MS + 9)
    );
    assert_eq!(read.get("w7").map(|room| room.steps.len()), Some(1));
    assert_eq!(
        read.get("w7")
            .and_then(|room| room.steps.first())
            .map(|step| step.at_ms),
        Some(NOW_MS)
    );
}

#[test]
fn git_build_folders_and_ignored_paths_add_nothing() {
    let (mut pulse, _) = forty_worktrees();
    let mut calls = 0;
    for path in [
        "/repo/.git/index",
        "/repo/.worktrees/w1/.git",
        "/repo/node_modules/a/index.js",
        "/repo/.worktrees/w1/target/debug/app",
        "/repo/.worktrees/w1/app/.next/cache/x",
        "/repo/.worktrees/w1/logs/run.log",
        "/repo",
    ] {
        pulse.notice(Path::new(path), NOW_MS);
    }
    assert_eq!(
        pulse.waiting_paths(),
        1,
        "only the ignored log waits for Git"
    );
    judge(&mut pulse, Instant::now(), &["logs/"], &mut calls);
    assert_eq!(counts(&mut pulse), []);
    assert!(is_skipped(Path::new("a/DerivedData/b")) && !is_skipped(Path::new("src/build.rs")));
}

#[test]
fn ten_thousand_writes_to_a_build_folder_make_no_git_call() {
    let (mut pulse, _) = forty_worktrees();
    let mut calls = 0;
    for index in 0..10_000 {
        pulse.notice(
            Path::new(&format!(
                "/repo/.worktrees/w2/node_modules/pkg/file{index}.js"
            )),
            NOW_MS,
        );
    }
    judge(&mut pulse, Instant::now(), &[], &mut calls);
    assert_eq!(calls, 0);
    assert_eq!(counts(&mut pulse), []);
}

#[test]
fn five_hundred_tracked_writes_in_one_step_read_ninety_nine_with_one_git_call_in_ten_seconds() {
    let (mut pulse, _) = forty_worktrees();
    let start = Instant::now();
    let mut calls = 0;
    for index in 0..500 {
        pulse.notice(
            Path::new(&format!("/repo/.worktrees/w3/src/f{index}.rs")),
            NOW_MS + index,
        );
        // The page asks every 2 s; within 10 s of the first call no second one starts.
        if index % 100 == 99 {
            judge(
                &mut pulse,
                start + Duration::from_secs(index as u64 / 100 * 2),
                &[],
                &mut calls,
            );
        }
    }
    assert_eq!(calls, 1);
    assert!(pulse.waiting_paths() > 0);
    judge(&mut pulse, start + GIT_CALL_GAP, &[], &mut calls);
    assert_eq!(calls, 2);
    assert_eq!(
        counts(&mut pulse),
        [("w3".to_string(), u32::from(STEP_COUNT_CAP))]
    );
}

#[test]
fn a_judged_path_is_never_asked_again_until_its_worktree_gitignore_changes() {
    let (mut pulse, _) = forty_worktrees();
    let start = Instant::now();
    let mut calls = 0;
    pulse.notice(Path::new("/repo/.worktrees/w4/notes.tmp"), NOW_MS);
    judge(&mut pulse, start, &["notes.tmp"], &mut calls);
    pulse.notice(Path::new("/repo/.worktrees/w4/notes.tmp"), NOW_MS + STEP_MS);
    judge(&mut pulse, start + GIT_CALL_GAP, &["notes.tmp"], &mut calls);
    assert_eq!(calls, 1);

    pulse.notice(
        Path::new("/repo/.worktrees/w4/.gitignore"),
        NOW_MS + STEP_MS,
    );
    pulse.notice(Path::new("/repo/.worktrees/w4/notes.tmp"), NOW_MS + STEP_MS);
    judge(&mut pulse, start + GIT_CALL_GAP * 2, &[], &mut calls);
    assert_eq!(calls, 2);
    // Now tracked: `.gitignore` and the file each count once in their step.
    assert_eq!(counts(&mut pulse), [("w4".to_string(), 2)]);
}

#[test]
fn a_verdict_git_cannot_give_counts_nothing() {
    let (mut pulse, _) = forty_worktrees();
    pulse.notice(Path::new("/repo/.worktrees/w5/a.rs"), NOW_MS);
    for batch in pulse.take_due_batches(Instant::now()) {
        pulse.apply_verdicts(batch, None, NOW_MS);
    }
    assert_eq!(counts(&mut pulse), []);
}

#[test]
fn dropped_notices_count_one_change_and_rescan_nothing() {
    let (mut pulse, _) = forty_worktrees();
    pulse.dropped_notices(Some(Path::new("/repo/.worktrees/w6/src")), NOW_MS);
    pulse.dropped_notices(Some(Path::new("/repo/.worktrees/w6")), NOW_MS + 1);
    assert_eq!(counts(&mut pulse), [("w6".to_string(), 1)]);
    assert_eq!(pulse.waiting_paths(), 0);
}

#[test]
fn a_room_no_longer_drawn_loses_its_counts_and_an_hour_old_step_is_dropped() {
    let (mut pulse, drawn) = forty_worktrees();
    pulse.dropped_notices(Some(Path::new("/repo/.worktrees/w8")), NOW_MS - 3_600_000);
    pulse.dropped_notices(Some(Path::new("/repo/.worktrees/w9")), NOW_MS);
    assert_eq!(counts(&mut pulse), [("w9".to_string(), 1)]);

    let fewer: Vec<String> = drawn.into_iter().filter(|id| id != "w9").collect();
    let mut rebuilt = vec![(PathBuf::from("/repo"), "main".to_string())];
    rebuilt.extend((0..40).map(|index| {
        (
            PathBuf::from(format!("/repo/.worktrees/w{index}")),
            format!("w{index}"),
        )
    }));
    pulse.set_rooms(rebuilt.clone(), &fewer);
    assert_eq!(counts(&mut pulse), []);
    // Drawn again, it starts from nothing.
    let all: Vec<String> = rebuilt.iter().map(|(_, id)| id.clone()).collect();
    pulse.set_rooms(rebuilt, &all);
    assert_eq!(counts(&mut pulse), []);
}

#[test]
fn a_shelf_worktree_and_a_folder_git_does_not_list_are_not_counted() {
    let mut pulse = Pulse::default();
    pulse.set_rooms(
        vec![
            (PathBuf::from("/repo"), "main".to_string()),
            (PathBuf::from("/repo/.worktrees/shelf"), "shelf".to_string()),
        ],
        &["main".to_string(), "elsewhere".to_string()],
    );
    pulse.notice(Path::new("/repo/.worktrees/shelf/a.rs"), NOW_MS);
    pulse.notice(Path::new("/elsewhere/a.rs"), NOW_MS);
    assert_eq!(pulse.waiting_paths(), 0);
    assert_eq!(pulse.read(NOW_MS).keys().collect::<Vec<_>>(), ["main"]);
}

#[test]
fn only_a_file_made_written_renamed_or_removed_counts() {
    use notify_debouncer_full::notify::event::{
        AccessKind, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind, RenameMode,
    };
    use notify_debouncer_full::notify::EventKind;
    for kind in [
        EventKind::Create(CreateKind::File),
        EventKind::Create(CreateKind::Any),
        EventKind::Modify(ModifyKind::Data(DataChange::Content)),
        EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
        EventKind::Remove(RemoveKind::Any),
    ] {
        assert!(is_counted_kind(&kind), "{kind:?}");
    }
    for kind in [
        EventKind::Create(CreateKind::Folder),
        EventKind::Remove(RemoveKind::Folder),
        EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)),
        EventKind::Access(AccessKind::Any),
        EventKind::Any,
    ] {
        assert!(!is_counted_kind(&kind), "{kind:?}");
    }
}

#[test]
fn no_path_reaches_the_payload() {
    let (mut pulse, _) = forty_worktrees();
    let mut calls = 0;
    pulse.notice(
        Path::new(&format!("/repo/.worktrees/w1/{PLANTED}.txt")),
        NOW_MS,
    );
    judge(&mut pulse, Instant::now(), &[], &mut calls);
    let read = pulse.read(NOW_MS);
    assert_eq!(read.get("w1").map(|room| room.steps.len()), Some(1));
    let sent = serde_json::to_string(&read).expect("serializes");
    assert!(!sent.contains(PLANTED) && !sent.contains("/repo"));
    assert!(!format!("{read:?}").contains(PLANTED));
}

/// The watcher on a real repository with 40 linked worktrees, through the command's own path.
#[cfg(target_os = "macos")]
mod with_the_watcher {
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, Instant};

    use super::super::{git_check, pulse_read, set_watching, stop_watching, watcher_is_alive};
    use super::PLANTED;
    use crate::work_status::agent_sessions::worktree_folders;

    fn git(folder: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(["-c", "user.email=t@example.invalid", "-c", "user.name=t"])
            .args(args)
            .current_dir(folder)
            .output()
            .expect("git runs");
        assert!(status.status.success(), "git {args:?}");
    }

    static GIT_CALLS: AtomicUsize = AtomicUsize::new(0);

    fn total(read: &super::super::PulseRead, id: &str) -> u32 {
        read.worktrees.get(id).map_or(0, |room| {
            room.steps.iter().map(|step| u32::from(step.count)).sum()
        })
    }

    fn ask(repo: &Path, drawn: &[String]) -> Option<super::super::PulseRead> {
        pulse_read(worktree_folders(repo), drawn, |batch| {
            GIT_CALLS.fetch_add(1, Ordering::SeqCst);
            git_check(batch)
        })
    }

    /// The hardened runner reads pathspecs literally, which `check-ignore` refuses outright.
    #[test]
    fn git_names_the_ignored_paths_and_never_a_tracked_one() {
        let base = std::env::temp_dir().join(format!("atlas-ignore-check-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("repo folder");
        git(&base, &["init", "-q", "-b", "main"]);
        std::fs::write(base.join(".gitignore"), "logs/\n*.tmp\n").expect("gitignore");
        std::fs::write(base.join("kept.tmp"), "a").expect("tracked despite the pattern");
        git(&base, &["add", ".gitignore"]);
        git(&base, &["add", "-f", "kept.tmp"]);
        git(&base, &["commit", "-qm", "init"]);
        let paths = [
            "src/a.rs",
            "logs/run.log",
            "kept.tmp",
            "new.tmp",
            "name with space.md",
        ];
        let ignored = super::super::ignore_check::ignored_paths(&base, paths.into_iter())
            .expect("Git gives a verdict");
        let mut ignored: Vec<String> = ignored.into_iter().collect();
        ignored.sort();
        assert_eq!(ignored, ["logs/run.log", "new.tmp"]);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn a_save_in_one_of_forty_worktrees_counts_there_and_the_switches_end_the_watcher() {
        let base = std::env::temp_dir().join(format!("atlas-file-pulse-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).expect("repo folder");
        let repo = std::fs::canonicalize(&repo).expect("canonical repo");
        git(&repo, &["init", "-q", "-b", "main"]);
        std::fs::write(repo.join(".gitignore"), "logs/\n.worktrees/\n").expect("gitignore");
        std::fs::write(repo.join("tracked.txt"), "a").expect("tracked");
        git(&repo, &["add", "."]);
        git(&repo, &["commit", "-qm", "init"]);
        for index in 0..40 {
            git(
                &repo,
                &[
                    "worktree",
                    "add",
                    "-q",
                    &format!(".worktrees/w{index}"),
                    "-b",
                    &format!("b{index}"),
                ],
            );
        }
        let listed = worktree_folders(&repo);
        assert_eq!(listed.len(), 41);
        let drawn: Vec<String> = listed.iter().map(|(_, id)| id.clone()).collect();
        let a = repo.join(".worktrees/w7");
        let a_id = listed
            .iter()
            .find(|(folder, _)| *folder == a)
            .map(|(_, id)| id.clone())
            .expect("w7 is listed");

        set_watching(true);
        assert!(ask(&repo, &drawn).is_some());
        assert!(watcher_is_alive());
        // Notices the setup left in flight settle before the baseline.
        std::thread::sleep(Duration::from_millis(1500));
        let before = ask(&repo, &drawn).expect("a read");
        let calls_before = GIT_CALLS.load(Ordering::SeqCst);

        let planted = a.join(format!("{PLANTED}.txt"));
        std::fs::write(&planted, "x").expect("planted file");
        // Unreadable to anyone: counting needs no open.
        std::fs::set_permissions(
            &planted,
            std::os::unix::fs::PermissionsExt::from_mode(0o000),
        )
        .expect("chmod");
        for (folder, file) in [
            (repo.join(".git"), "scratch"),
            (a.join("node_modules/pkg"), "index.js"),
            (a.join("target/debug"), "app"),
            (a.join("logs"), "run.log"),
        ] {
            std::fs::create_dir_all(&folder).expect("folder");
            std::fs::write(folder.join(file), "x").expect("file");
        }

        let deadline = Instant::now() + Duration::from_secs(30);
        let mut after = ask(&repo, &drawn).expect("a read");
        while total(&after, &a_id) == total(&before, &a_id) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(200));
            after = ask(&repo, &drawn).expect("a read");
        }
        // Late notices would land within this.
        std::thread::sleep(Duration::from_millis(1500));
        let after = ask(&repo, &drawn).expect("a read");
        for id in &drawn {
            let added = total(&after, id) - total(&before, id);
            assert_eq!(added, u32::from(*id == a_id), "worktree {id}");
        }
        assert!(after.worktrees.values().all(|room| room.watched));
        assert!(GIT_CALLS.load(Ordering::SeqCst) - calls_before <= 2);
        let sent = serde_json::to_string(&after).expect("serializes");
        assert!(!sent.contains(PLANTED) && !sent.contains(&*repo.to_string_lossy()));

        // Hidden: no watcher, counts kept for when the screen returns.
        stop_watching();
        assert!(!watcher_is_alive());
        let shown = ask(&repo, &drawn).expect("a read");
        assert_eq!(total(&shown, &a_id), total(&after, &a_id));
        stop_watching();

        // Off: no watcher, nothing held, and an ask starts nothing.
        set_watching(false);
        assert!(!watcher_is_alive());
        assert!(ask(&repo, &drawn).is_none());
        assert!(!watcher_is_alive());
        set_watching(true);
        let fresh = ask(&repo, &drawn).expect("a read");
        assert_eq!(total(&fresh, &a_id), 0);
        set_watching(false);

        let _ = std::fs::set_permissions(
            &planted,
            std::os::unix::fs::PermissionsExt::from_mode(0o600),
        );
        let _ = std::fs::remove_dir_all(PathBuf::from(&base));
    }
}
