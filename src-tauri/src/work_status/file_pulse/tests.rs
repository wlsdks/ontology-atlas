use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::counts::{
    is_skipped, Pulse, Verdict, VerdictBatch, GIT_CALL_GAP, STEP_COUNT_CAP, STEP_MS,
};
use super::{affordable_roots, is_counted_kind, watch_cost};

/// The watcher and its state are one per app: tests that use them take turns.
static ONE_WATCHER_AT_A_TIME: Mutex<()> = Mutex::new(());

const PLANTED: &str = "ATLAS_PLANTED_7f3c";
/// A time on a step boundary, so a test's writes share one step.
const NOW_MS: i64 = 1_700_000_000_000;

/// The main checkout and 40 linked worktrees under it.
fn forty_listed() -> Vec<(PathBuf, String)> {
    let mut listed = vec![(PathBuf::from("/repo"), "main".to_string())];
    for index in 0..40 {
        listed.push((
            PathBuf::from(format!("/repo/.worktrees/w{index}")),
            format!("w{index}"),
        ));
    }
    listed
}

/// The 40 worktrees and the main checkout, all drawn.
fn forty_worktrees() -> (Pulse, Vec<String>) {
    let listed = forty_listed();
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
        let ignored: HashSet<String> = batch
            .relative_paths()
            .filter(|path| ignored.iter().any(|prefix| path.starts_with(prefix)))
            .map(str::to_string)
            .collect();
        let verdict = Verdict {
            ignored,
            refused: None,
        };
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
    // Dropped notices under a build folder or `.git` are no sign of a change worth counting.
    pulse.dropped_notices(
        Some(Path::new("/repo/.worktrees/w5/node_modules/pkg")),
        NOW_MS,
    );
    pulse.dropped_notices(Some(Path::new("/repo/.git/objects")), NOW_MS);
    assert_eq!(counts(&mut pulse), [("w6".to_string(), 1)]);
    assert_eq!(pulse.waiting_paths(), 0);
}

/// macOS names a folder above the watched ones when it dropped notices it cannot place (notify
/// passes `/` or the roots' parent through), and coalesces a folder's change with its subfolders'.
/// The change can be in any room under that folder, so each counts one; a drop under a build
/// folder of the room holding it still counts none.
#[test]
fn a_dropped_notice_at_a_folder_above_the_rooms_counts_in_every_room_under_it() {
    let all_rooms = |pulse: &mut Pulse| counts(pulse).len();
    let (mut pulse, _) = forty_worktrees();
    pulse.dropped_notices(Some(Path::new("/")), NOW_MS);
    assert_eq!(all_rooms(&mut pulse), 41);

    let (mut pulse, _) = forty_worktrees();
    pulse.dropped_notices(Some(Path::new("/repo/.worktrees")), NOW_MS);
    // The main checkout holds `.worktrees` itself; each linked worktree lies under it.
    assert_eq!(all_rooms(&mut pulse), 41);

    let (mut pulse, _) = forty_worktrees();
    pulse.dropped_notices(Some(Path::new("/repo/node_modules")), NOW_MS);
    pulse.dropped_notices(Some(Path::new("/elsewhere")), NOW_MS);
    assert_eq!(counts(&mut pulse), []);
}

#[test]
fn a_path_git_refuses_costs_only_itself_and_the_rest_wait_for_the_next_call() {
    let (mut pulse, _) = forty_worktrees();
    let start = Instant::now();
    for name in ["a.rs", "logs/x.log", "sub/inner.rs", "z.rs"] {
        pulse.notice(Path::new(&format!("/repo/.worktrees/w1/{name}")), NOW_MS);
    }
    let mut batches = pulse.take_due_batches(start);
    let batch = batches.pop().expect("one batch");
    let asked: Vec<&str> = batch.relative_paths().collect();
    assert_eq!(asked, ["a.rs", "logs/x.log", "sub/inner.rs", "z.rs"]);
    // Git judged the first two, refused the submodule path and stopped there.
    let verdict = Verdict {
        ignored: HashSet::from(["logs/x.log".to_string()]),
        refused: Some("sub/inner.rs".to_string()),
    };
    pulse.apply_verdicts(batch, Some(&verdict), NOW_MS);
    assert_eq!(counts(&mut pulse), [("w1".to_string(), 1)]);
    assert_eq!(pulse.waiting_paths(), 1, "only z.rs waits");

    // The refused path is never asked about again; z.rs is judged on the next call.
    pulse.notice(Path::new("/repo/.worktrees/w1/sub/inner.rs"), NOW_MS);
    assert!(pulse.take_due_batches(start + GIT_CALL_GAP / 2).is_empty());
    let mut calls = 0;
    judge(&mut pulse, start + GIT_CALL_GAP, &[], &mut calls);
    assert_eq!(calls, 1);
    assert_eq!(counts(&mut pulse), [("w1".to_string(), 2)]);
}

#[test]
fn hiding_drops_every_path_waiting_for_git() {
    let (mut pulse, _) = forty_worktrees();
    pulse.notice(Path::new("/repo/.worktrees/w1/a.rs"), NOW_MS);
    assert_eq!(pulse.waiting_paths(), 1);
    pulse.forget_waiting();
    assert_eq!(pulse.waiting_paths(), 0);
}

#[test]
fn a_room_that_leaves_and_returns_or_a_switch_toggled_makes_no_second_git_call_in_ten_seconds() {
    let (mut pulse, drawn) = forty_worktrees();
    let start = Instant::now();
    let mut calls = 0;
    pulse.notice(Path::new("/repo/.worktrees/w2/a.rs"), NOW_MS);
    judge(&mut pulse, start, &[], &mut calls);

    let without_w2: Vec<String> = drawn.iter().filter(|id| *id != "w2").cloned().collect();
    pulse.set_rooms(forty_listed(), &without_w2);
    pulse.set_rooms(forty_listed(), &drawn);
    pulse.notice(Path::new("/repo/.worktrees/w2/b.rs"), NOW_MS);
    judge(&mut pulse, start + Duration::from_secs(2), &[], &mut calls);
    assert_eq!(calls, 1, "the room returned within the gap");

    pulse.forget_counts();
    pulse.set_rooms(forty_listed(), &drawn);
    pulse.notice(Path::new("/repo/.worktrees/w2/c.rs"), NOW_MS);
    judge(&mut pulse, start + Duration::from_secs(4), &[], &mut calls);
    assert_eq!(calls, 1, "the switch was turned off and on within the gap");

    judge(&mut pulse, start + GIT_CALL_GAP, &[], &mut calls);
    assert_eq!(calls, 2);
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

#[test]
fn a_root_costs_one_open_file_per_folder_on_its_path_and_four_more() {
    assert_eq!(watch_cost(Path::new("/Users/someone/repo")), 8);
    assert_eq!(watch_cost(Path::new("/r/a")), 7);
}

#[test]
fn roots_are_watched_until_the_next_would_pass_half_the_open_file_limit() {
    let roots = ["/r/a", "/r/deep/deeper/deepest", "/r/b"].map(PathBuf::from);
    let affordable = |soft_open_file_limit| -> Vec<&PathBuf> {
        affordable_roots(&roots, soft_open_file_limit).collect()
    };
    // Costs 7, 9 and 7.
    assert_eq!(affordable(46), roots.iter().collect::<Vec<_>>());
    assert_eq!(affordable(45), vec![&roots[0], &roots[1]]);
    // `/r/b` alone would still fit, but the roots stop at the first that does not.
    assert_eq!(affordable(31), vec![&roots[0]]);
    assert!(affordable(13).is_empty());
}

/// The watcher on a real repository with 40 linked worktrees, through the command's own path.
#[cfg(target_os = "macos")]
mod with_the_watcher {
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::sync::{Mutex, PoisonError};
    use std::time::{Duration, Instant};

    use notify_debouncer_full::notify::event::{CreateKind, DataChange, MetadataKind, ModifyKind};
    use notify_debouncer_full::notify::{Event, EventKind};

    use super::super::{
        git_check, pulse_read, set_ask_lapse, set_watching, state, stop_watching, take_notice,
        waiting_paths, watcher_is_alive, PulseRead,
    };
    use super::PLANTED;
    use crate::app_shell::open_file_limit::soft_open_file_limit;
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

    /// The worktree of each Git call, in the order they were made.
    static GIT_CALLS: Mutex<Vec<String>> = Mutex::new(Vec::new());

    fn git_calls() -> Vec<String> {
        GIT_CALLS
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// What notify gave the watcher, flag by flag, for a file this test wrote on macOS 27.
    fn file_notices(path: &Path) -> Vec<Event> {
        [
            EventKind::Create(CreateKind::File),
            EventKind::Modify(ModifyKind::Metadata(MetadataKind::Extended)),
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
        ]
        .map(|kind| Event::new(kind).add_path(path.to_path_buf()))
        .to_vec()
    }

    /// The same for a folder it made.
    fn folder_notices(path: &Path) -> Vec<Event> {
        [
            EventKind::Create(CreateKind::Folder),
            EventKind::Modify(ModifyKind::Metadata(MetadataKind::Extended)),
        ]
        .map(|kind| Event::new(kind).add_path(path.to_path_buf()))
        .to_vec()
    }

    fn total(read: &PulseRead, id: &str) -> u32 {
        read.worktrees.get(id).map_or(0, |room| {
            room.steps.iter().map(|step| u32::from(step.count)).sum()
        })
    }

    fn ask(repo: &Path, drawn: &[String]) -> Option<PulseRead> {
        pulse_read(
            worktree_folders(repo),
            drawn,
            soft_open_file_limit(),
            |batch| {
                GIT_CALLS
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(batch.worktree_id.clone());
                git_check(batch)
            },
        )
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
        let verdict = super::super::ignore_check::ignored_paths(&base, paths.into_iter())
            .expect("Git gives a verdict");
        assert_eq!(verdict.refused, None);
        let mut ignored: Vec<String> = verdict.ignored.into_iter().collect();
        ignored.sort();
        assert_eq!(ignored, ["logs/run.log", "new.tmp"]);
        let _ = std::fs::remove_dir_all(&base);
    }

    /// File names that read as pathspec magic (`:!x`, `:(glob)x`, `:#x`, `:/x`) are plain names.
    #[test]
    fn a_file_name_that_looks_like_pathspec_magic_is_judged_as_a_plain_name() {
        let base = std::env::temp_dir().join(format!("atlas-ignore-magic-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("repo folder");
        git(&base, &["init", "-q", "-b", "main"]);
        std::fs::write(base.join(".gitignore"), "/:cache/\nnew.tmp\n/logs/\n").expect("gitignore");
        let paths = [
            ":!x",
            ":#x",
            ":(glob)x",
            ":/logs/x",
            ":cache/x.bin",
            ":new.tmp",
            "logs/y",
        ];
        let verdict = super::super::ignore_check::ignored_paths(&base, paths.into_iter())
            .expect("no name fails the batch");
        assert_eq!(verdict.refused, None);
        let mut ignored: Vec<String> = verdict.ignored.into_iter().collect();
        ignored.sort();
        assert_eq!(ignored, [":cache/x.bin", "logs/y"]);
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Git refuses a path inside a submodule or beyond a link: it names that one, and the paths
    /// it judged before it keep their verdicts.
    #[test]
    fn a_path_git_refuses_is_named_and_the_ones_before_it_are_judged() {
        let base =
            std::env::temp_dir().join(format!("atlas-ignore-refused-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).expect("repo folder");
        git(&repo, &["init", "-q", "-b", "main"]);
        std::fs::write(repo.join(".gitignore"), "logs/\n").expect("gitignore");
        std::os::unix::fs::symlink(&base, repo.join("linked")).expect("a link");
        let verdict = super::super::ignore_check::ignored_paths(
            &repo,
            ["a.rs", "logs/x", "linked/y.rs", "z.rs"].into_iter(),
        )
        .expect("Git names what it refused");
        assert_eq!(verdict.refused.as_deref(), Some("linked/y.rs"));
        assert_eq!(
            verdict.ignored,
            std::collections::HashSet::from(["logs/x".to_string()])
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    /// A `.gitignore` that is a named pipe holds Git forever; the call ends at its time limit.
    #[test]
    fn a_git_call_that_hangs_gives_no_verdict() {
        let base = std::env::temp_dir().join(format!("atlas-ignore-hang-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("repo folder");
        git(&base, &["init", "-q", "-b", "main"]);
        let pipe = std::ffi::CString::new(base.join(".gitignore").to_string_lossy().as_bytes())
            .expect("a path without NUL");
        // SAFETY: a NUL-terminated path; mkfifo only creates the pipe.
        assert_eq!(unsafe { libc::mkfifo(pipe.as_ptr(), 0o600) }, 0);
        let verdict = super::super::ignore_check::ignored_paths(&base, ["a.rs"].into_iter());
        let _ = std::fs::remove_dir_all(&base);
        assert_eq!(verdict, None);
    }

    /// A page that stops asking without a pause leaves no watcher once the lapse has passed.
    #[test]
    fn a_watcher_nobody_asks_for_ends_after_the_lapse() {
        let _turn = super::ONE_WATCHER_AT_A_TIME
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let folder = std::env::temp_dir().join(format!("atlas-pulse-lapse-{}", std::process::id()));
        std::fs::create_dir_all(&folder).expect("folder");
        let folder = std::fs::canonicalize(&folder).expect("canonical");
        set_watching(true);
        set_ask_lapse(Duration::from_millis(300));
        let drawn = ["lapse".to_string()];
        let listed = vec![(folder.clone(), "lapse".to_string())];
        assert!(pulse_read(listed, &drawn, soft_open_file_limit(), |_| None).is_some());
        assert!(watcher_is_alive());
        let deadline = Instant::now() + Duration::from_secs(10);
        while watcher_is_alive() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        let ended = !watcher_is_alive();
        set_ask_lapse(Duration::from_secs(10));
        set_watching(false);
        let _ = std::fs::remove_dir_all(&folder);
        assert!(ended, "the watcher outlived the lapse");
    }

    /// A room past half the soft limit on open files is not watched, so FSEvents never runs out of
    /// them: notify 9 answers that by freeing the stream's context twice.
    #[test]
    fn a_room_past_half_the_open_file_limit_is_not_watched() {
        let _turn = super::ONE_WATCHER_AT_A_TIME
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let base = std::env::temp_dir().join(format!("atlas-pulse-budget-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let [first, second] = ["first", "second"].map(|name| {
            std::fs::create_dir_all(base.join(name)).expect("folder");
            std::fs::canonicalize(base.join(name)).expect("canonical")
        });
        let listed = vec![
            (first.clone(), "first".to_string()),
            (second.clone(), "second".to_string()),
        ];
        let drawn = ["first".to_string(), "second".to_string()];
        // Half of this is one open file short of both rooms.
        let soft_open_file_limit = 2 * (super::watch_cost(&first) + super::watch_cost(&second)) - 1;
        set_watching(true);
        let read = pulse_read(listed, &drawn, soft_open_file_limit, |_| None);
        set_watching(false);
        let _ = std::fs::remove_dir_all(&base);
        let watched = |id: &str| {
            read.as_ref()
                .and_then(|read| read.worktrees.get(id))
                .map(|room| room.watched)
        };
        assert_eq!(watched("first"), Some(true));
        assert_eq!(watched("second"), Some(false));
    }

    /// A pause that arrives while an ask is between its start and its watcher waits for the ask,
    /// so the ask cannot start a watcher after the screen was hidden.
    #[test]
    fn a_pause_during_an_ask_leaves_no_watcher() {
        let _turn = super::ONE_WATCHER_AT_A_TIME
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let folder = std::env::temp_dir().join(format!("atlas-pulse-pause-{}", std::process::id()));
        std::fs::create_dir_all(&folder).expect("folder");
        let folder = std::fs::canonicalize(&folder).expect("canonical");
        let listed = vec![(folder.clone(), "paused".to_string())];
        let drawn = vec!["paused".to_string()];
        set_watching(true);
        assert!(pulse_read(listed.clone(), &drawn, soft_open_file_limit(), |_| None).is_some());
        super::super::notice(&folder.join("held.rs"));
        assert_eq!(super::super::waiting_paths(), 1);
        stop_watching();
        assert!(!watcher_is_alive());
        assert_eq!(
            super::super::waiting_paths(),
            0,
            "a path was held while hidden"
        );
        // A waiting path, so the next ask stops in its Git check, before it starts the watcher.
        super::super::notice(&folder.join("a.rs"));

        let (in_check, entered) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel::<()>();
        let ask = std::thread::spawn(move || {
            pulse_read(listed, &drawn, soft_open_file_limit(), |_| {
                let _ = in_check.send(());
                let _ = released.recv();
                None
            })
        });
        entered.recv().expect("the ask reached its Git check");
        let pause = std::thread::spawn(stop_watching);
        // The pause is now waiting for the ask, or would have run inside it without the order.
        std::thread::sleep(Duration::from_millis(200));
        release.send(()).expect("release the ask");
        let _ = ask.join();
        pause.join().expect("the pause ends");
        let alive = watcher_is_alive();
        set_watching(false);
        let _ = std::fs::remove_dir_all(&folder);
        assert!(!alive, "the ask started a watcher after the pause");
    }

    #[test]
    fn a_save_in_one_of_forty_worktrees_counts_there_and_the_switches_end_the_watcher() {
        let _turn = super::ONE_WATCHER_AT_A_TIME
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let base = std::env::temp_dir().join(format!("atlas-file-pulse-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).expect("repo folder");
        let repo = std::fs::canonicalize(&repo).expect("canonical repo");
        // macOS can report the setup's own writes after the watcher starts, seconds late, so the
        // setup writes only under `.git`, where no notice counts: the ignore rules go to
        // `info/exclude`, which every linked worktree reads, and the commit is empty.
        git(&repo, &["init", "-q", "-b", "main"]);
        std::fs::write(repo.join(".git/info/exclude"), "logs/\n.worktrees/\n").expect("exclude");
        git(&repo, &["commit", "-q", "--allow-empty", "-m", "init"]);
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
        let before = ask(&repo, &drawn).expect("a read");
        let calls_before = git_calls().len();

        // A save in w7 and writes that count nowhere, as notify gave them to the watcher, go to
        // the watcher's own callback: macOS can drop a notice and flag nothing (a loaded Mac
        // reported 7 of 20 plain writes), so a real write cannot tell a lost count from a lost
        // notice. Nothing is written, so no late notice adds to these, and the pulse counts a
        // path it never opens.
        let planted = a.join(format!("{PLANTED}.txt"));
        let mut notices = file_notices(&planted);
        let made_unreadable = EventKind::Modify(ModifyKind::Metadata(MetadataKind::Ownership));
        notices.insert(1, Event::new(made_unreadable).add_path(planted));
        notices.extend(file_notices(&repo.join(".git/scratch")));
        for (folders, file) in [
            (["node_modules", "node_modules/pkg"].as_slice(), "index.js"),
            (["target", "target/debug"].as_slice(), "app"),
            (["logs"].as_slice(), "run.log"),
        ] {
            for folder in folders {
                notices.extend(folder_notices(&a.join(folder)));
            }
            let deepest = folders.last().expect("a folder");
            notices.extend(file_notices(&a.join(deepest).join(file)));
        }
        for notice in &notices {
            take_notice(state(), notice);
        }
        let after = ask(&repo, &drawn).expect("a read");
        assert_eq!(waiting_paths(), 0, "one ask judges every waiting path");
        for id in &drawn {
            let added = total(&after, id) - total(&before, id);
            assert_eq!(added, u32::from(*id == a_id), "worktree {id}");
        }
        assert!(after.worktrees.values().all(|room| room.watched));
        // One Git call, for w7: the build folders, `.git` and the folders cost none.
        assert_eq!(git_calls()[calls_before..], *std::slice::from_ref(&a_id));
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
        let _ = std::fs::remove_dir_all(PathBuf::from(&base));
    }
}
