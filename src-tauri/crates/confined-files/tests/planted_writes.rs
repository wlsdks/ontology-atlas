//! Planted write hazards, from the cases the JavaScript suites (`all-or-nothing.test.mjs`,
//! `conflict-detection.test.mjs`) planted and more: a stale or raced write, an unwritable target,
//! a reserved file, a failure in the middle of a batch. Each case names what it proves.

use std::cell::Cell;
use std::fs;
use std::path::Path;

use confined_files::{
    apply_all_or_nothing, check_current_text, check_modified_time, write_atomically, ApplyOptions,
    AtomicWrite, ConflictReport, Expectation, IoFailure, ModifiedTime, OsErrorCode, PlanEntry,
    Reservations, ReservedForPerson, VaultRoot, WritablePath, WriteError, WriteErrorClass,
};

/// How a test reads a reservation: a `review_state: human_decides` line in the text.
fn reserved_in_text(path: &Path, text: &str) -> Option<ReservedForPerson> {
    text.lines()
        .any(|line| line.trim() == "review_state: human_decides")
        .then(|| ReservedForPerson {
            slug: path.display().to_string(),
            note: None,
        })
}

fn options() -> ApplyOptions<'static> {
    ApplyOptions::new(Reservations::Refuse(&reserved_in_text))
}

fn vault() -> (tempfile::TempDir, VaultRoot) {
    let directory = tempfile::tempdir().expect("temp dir");
    let canonical = dunce::canonicalize(directory.path()).expect("real");
    let root = VaultRoot::open(&canonical).expect("vault");
    (directory, root)
}

fn target(root: &VaultRoot, slug: &str) -> WritablePath {
    root.write_path(slug).expect("a writable slug")
}

fn names_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder)
        .expect("read dir")
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn a_write_replaces_the_file_and_leaves_no_temporary_beside_it() {
    let (_directory, root) = vault();
    let path = target(&root, "note");
    fs::write(path.as_path(), "before").expect("seed");
    write_atomically(&path, "after", &AtomicWrite::default()).expect("write");
    assert_eq!(fs::read_to_string(path.as_path()).expect("read"), "after");
    assert_eq!(names_in(root.path()), ["note.md"]);
}

#[test]
fn a_write_to_a_missing_folder_fails_and_leaves_nothing() {
    let (_directory, root) = vault();
    let path = target(&root, "missing/folder/note");
    let error = write_atomically(&path, "x", &AtomicWrite::default()).expect_err("no folder");
    assert!(matches!(error, WriteError::Io(_)), "{error}");
    assert_eq!(names_in(root.path()), Vec::<String>::new());
}

#[test]
fn an_edit_made_right_before_the_rename_is_kept_and_the_write_stops_with_a_conflict() {
    let (_directory, root) = vault();
    let path = target(&root, "note");
    fs::write(path.as_path(), "as planned").expect("seed");
    let human = || fs::write(path.as_path(), "a person's edit").expect("race");
    let error = write_atomically(
        &path,
        "agent text",
        &AtomicWrite {
            expectation: Expectation::Text("as planned"),
            conflict: Some(ConflictReport {
                slug: "note",
                expected_modified: Some(ModifiedTime::from_milliseconds(1000.0)),
            }),
            before_commit: Some(&human),
            ..AtomicWrite::default()
        },
    )
    .expect_err("conflict");
    let WriteError::Conflict(conflict) = &error else {
        panic!("{error}");
    };
    assert_eq!(conflict.slug, "note");
    assert!(error.to_string().starts_with(
        "Vault conflict: \"note\" was modified externally (changed on disk) between read and write. expectedMtime=1000 currentMtime="
    ));
    assert!(
        !error.to_string().contains("get_concepts"),
        "which tool re-reads the document is the server's to say"
    );
    assert_eq!(error.class(), WriteErrorClass::VaultConflict);
    assert_eq!(
        fs::read_to_string(path.as_path()).expect("read"),
        "a person's edit"
    );
    assert_eq!(names_in(root.path()), ["note.md"], "no temporary is left");
}

#[test]
fn a_create_over_a_file_that_appeared_meanwhile_is_a_conflict_not_an_overwrite() {
    let (_directory, root) = vault();
    let path = target(&root, "fresh");
    let appears = || fs::write(path.as_path(), "someone else's").expect("race");
    let error = write_atomically(
        &path,
        "mine",
        &AtomicWrite {
            expectation: Expectation::Absent,
            before_commit: Some(&appears),
            ..AtomicWrite::default()
        },
    )
    .expect_err("changed");
    assert!(matches!(error, WriteError::ChangedOnDisk(_)), "{error}");
    assert_eq!(
        fs::read_to_string(path.as_path()).expect("read"),
        "someone else's"
    );
}

#[test]
fn the_modified_time_rule_is_a_millisecond_apart() {
    let at = |milliseconds: f64| Some(ModifiedTime::from_milliseconds(milliseconds));
    assert!(
        check_modified_time("n", None, at(5.0)).is_ok(),
        "omitted skips the check"
    );
    assert!(check_modified_time("n", None, None).is_ok());
    assert!(check_modified_time("n", at(1000.0), at(1000.5)).is_ok());
    let changed = check_modified_time("n", at(1000.0), at(1001.0)).expect_err("a millisecond");
    assert_eq!(changed.slug, "n");
    assert_eq!(changed.expected_modified, at(1000.0));
    assert_eq!(changed.current_modified, at(1001.0));
    let gone = check_modified_time("n", at(1000.0), None).expect_err("deleted");
    assert!(gone
        .to_string()
        .contains("expectedMtime=1000 currentMtime=null."));
}

#[test]
fn a_document_that_changed_while_the_bytes_stayed_the_same_age_is_still_a_conflict() {
    let (_directory, root) = vault();
    let path = root.write_path("note").expect("writable");
    fs::write(path.as_path(), "planned from this").expect("seed");
    assert!(check_current_text("note", path.as_confined(), "planned from this", None).is_ok());
    fs::write(path.as_path(), "different bytes").expect("edit");
    let conflict = check_current_text("note", path.as_confined(), "planned from this", None)
        .expect_err("edited");
    assert_eq!(conflict.slug, "note");
}

#[cfg(unix)]
#[test]
fn a_private_originals_mode_is_kept_by_the_rewrite() {
    use std::os::unix::fs::PermissionsExt;
    let (_directory, root) = vault();
    let path = target(&root, "private");
    fs::write(path.as_path(), "secret").expect("seed");
    fs::set_permissions(path.as_path(), fs::Permissions::from_mode(0o600)).expect("chmod");
    write_atomically(&path, "rewritten", &AtomicWrite::default()).expect("write");
    let mode = fs::metadata(path.as_path())
        .expect("stat")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o600);
}

#[cfg(unix)]
fn mode_of(path: &Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path).expect("stat").permissions().mode() & 0o777
}

#[cfg(unix)]
fn made_private(path: &Path, text: &str) {
    use std::os::unix::fs::PermissionsExt;
    fs::write(path, text).expect("seed");
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).expect("chmod");
}

#[cfg(unix)]
#[test]
fn a_copy_made_by_a_plan_is_no_more_open_than_the_file_it_copies() {
    let (_directory, root) = vault();
    made_private(&root.path().join("private.md"), "secret");
    let original = root.path().join("private.md");
    apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "backup"), "secret".to_string())
                .expecting_absent()
                .as_open_as(&original),
            PlanEntry::write(target(&root, "plain"), "x".to_string()).expecting_absent(),
        ],
        &options(),
    )
    .expect("applied");
    assert_eq!(mode_of(&root.path().join("backup.md")), 0o600);
    assert_ne!(
        mode_of(&root.path().join("plain.md")),
        0o600,
        "an entry that names no original gets the system's default, so the test above can tell"
    );
}

/// A rename that overwrites copies the source's text over the target: the result must be as
/// closed as the more private of the two, and a rollback gives the target back exactly its own.
#[cfg(unix)]
#[test]
fn a_copy_over_an_existing_file_is_as_closed_as_the_more_private_of_the_two() {
    use std::os::unix::fs::PermissionsExt;
    let (_directory, root) = vault();
    let open_file = |name: &str| {
        let path = root.path().join(name);
        fs::write(&path, "open").expect("seed");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).expect("chmod");
        path
    };
    let private = root.path().join("private.md");
    made_private(&private, "secret");
    let wide_target = open_file("wide.md");
    apply_all_or_nothing(
        vec![PlanEntry::write(target(&root, "wide"), "secret".to_string()).as_open_as(&private)],
        &options(),
    )
    .expect("a private file copied over an open one");
    assert_eq!(mode_of(&wide_target), 0o600, "the open target is not left open");

    let open_source = open_file("source.md");
    let private_target = root.path().join("closed.md");
    made_private(&private_target, "secret");
    apply_all_or_nothing(
        vec![PlanEntry::write(target(&root, "closed"), "open".to_string()).as_open_as(&open_source)],
        &options(),
    )
    .expect("an open file copied over a private one");
    assert_eq!(mode_of(&private_target), 0o600, "the private target is not opened");

    let trap = root.path().join("trap.md");
    fs::create_dir(&trap).expect("trap");
    let again = open_file("again.md");
    apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "again"), "secret".to_string()).as_open_as(&private),
            PlanEntry::write(target(&root, "trap"), "x".to_string()),
        ],
        &options(),
    )
    .expect_err("the trap fails the second step");
    assert_eq!(fs::read_to_string(&again).expect("read"), "open");
    assert_eq!(mode_of(&again), 0o644, "a rollback gives back the bits the file had");
}

#[cfg(unix)]
#[test]
fn a_private_file_deleted_and_put_back_by_a_rollback_is_private_again() {
    let (_directory, root) = vault();
    made_private(&root.path().join("second.md"), "ORIGINAL-2");
    fs::create_dir(root.path().join("trap.md")).expect("trap");
    let error = apply_all_or_nothing(
        vec![
            PlanEntry::delete(target(&root, "second")),
            PlanEntry::write(target(&root, "trap"), "x".to_string()),
        ],
        &options(),
    )
    .expect_err("the trap fails the second step");
    assert!(matches!(error, WriteError::RolledBack { .. }), "{error}");
    let back = root.path().join("second.md");
    assert_eq!(fs::read_to_string(&back).expect("read"), "ORIGINAL-2");
    assert_eq!(mode_of(&back), 0o600);
}

#[test]
fn an_empty_plan_does_nothing_and_a_mixed_plan_applies_everything() {
    let (_directory, root) = vault();
    assert_eq!(
        apply_all_or_nothing(vec![], &options())
            .expect("empty")
            .steps,
        0
    );
    fs::write(root.path().join("a.md"), "A").expect("a");
    fs::write(root.path().join("gone.md"), "G").expect("gone");
    let applied = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "a"), "A2".to_string()),
            PlanEntry::write(target(&root, "deep/new/b"), "B".to_string()),
            PlanEntry::delete(target(&root, "gone")),
        ],
        &options(),
    )
    .expect("applied");
    assert_eq!(applied.steps, 3);
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).expect("a"),
        "A2"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("deep/new/b.md")).expect("b"),
        "B"
    );
    assert!(!root.path().join("gone.md").exists());
}

#[test]
fn deleting_a_missing_file_is_not_an_error() {
    let (_directory, root) = vault();
    let applied = apply_all_or_nothing(
        vec![PlanEntry::delete(target(&root, "never-existed"))],
        &options(),
    )
    .expect("applied");
    assert_eq!(applied.steps, 1);
}

#[test]
fn a_failure_in_the_middle_rolls_back_earlier_writes_deletes_and_created_folders() {
    let (_directory, root) = vault();
    fs::write(root.path().join("first.md"), "ORIGINAL-1").expect("first");
    fs::write(root.path().join("second.md"), "ORIGINAL-2").expect("second");
    // A folder where a file should go: reading it fails after the pre-check passes.
    fs::create_dir(root.path().join("trap.md")).expect("trap");
    let error = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "first"), "REWRITTEN-1".to_string()),
            PlanEntry::delete(target(&root, "second")),
            PlanEntry::write(target(&root, "created"), "x".to_string()),
            PlanEntry::write(target(&root, "new/nested/node"), "x".to_string()),
            PlanEntry::write(target(&root, "trap"), "boom".to_string()),
        ],
        &options(),
    )
    .expect_err("fails");
    let WriteError::RolledBack { cause } = &error else {
        panic!("{error}");
    };
    assert!(
        matches!(**cause, WriteError::Io(ref failure) if failure.syscall == "read"),
        "the cause is the typed failure, not its text: {cause:?}"
    );
    let text = error.to_string();
    assert!(text.starts_with("Write failed ("), "{text}");
    assert!(
        text.ends_with("Every change was rolled back: the vault is unchanged."),
        "{text}"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("first.md")).expect("first"),
        "ORIGINAL-1"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("second.md")).expect("second"),
        "ORIGINAL-2"
    );
    assert!(
        !root.path().join("created.md").exists(),
        "a created file is removed"
    );
    assert!(
        !root.path().join("new").exists(),
        "a created folder is removed"
    );
    assert_eq!(names_in(root.path()), ["first.md", "second.md", "trap.md"]);
}

#[test]
fn a_plan_made_from_bytes_that_changed_writes_nothing() {
    let (_directory, root) = vault();
    fs::write(root.path().join("a.md"), "planned").expect("a");
    fs::write(root.path().join("b.md"), "planned").expect("b");
    fs::write(root.path().join("b.md"), "edited by a person").expect("edit");
    let error = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "a"), "A".to_string())
                .expecting_text("planned".to_string()),
            PlanEntry::write(target(&root, "b"), "B".to_string())
                .expecting_text("planned".to_string()),
        ],
        &options(),
    )
    .expect_err("changed");
    let WriteError::ChangedOnDisk(paths) = &error else {
        panic!("{error}");
    };
    assert_eq!(paths.len(), 1);
    assert!(paths[0].ends_with("b.md"));
    assert!(error.to_string().starts_with(
        "Refused before writing anything: 1 file(s) changed on disk or were deleted since they were read, so this operation would overwrite someone else's edit:\n  "
    ));
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).expect("a"),
        "planned"
    );
}

#[test]
fn an_expected_modified_time_that_moved_or_a_target_that_was_deleted_stops_the_plan() {
    let (_directory, root) = vault();
    fs::write(root.path().join("a.md"), "x").expect("a");
    let stamped = target(&root, "a").as_confined().modified_time();
    let stale = Some(ModifiedTime::from_milliseconds(
        stamped.expect("stamp").milliseconds() - 5000.0,
    ));
    let moved = apply_all_or_nothing(
        vec![PlanEntry::write(target(&root, "a"), "A".to_string()).expecting_modified(stale)],
        &options(),
    )
    .expect_err("moved");
    assert!(matches!(moved, WriteError::ChangedOnDisk(_)));
    // A deleted target must not be revived with stale content.
    let revived = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "deleted"), "stale".to_string())
                .expecting_modified(stale),
        ],
        &options(),
    )
    .expect_err("deleted");
    assert!(matches!(revived, WriteError::ChangedOnDisk(_)));
    assert!(!root.path().join("deleted.md").exists());
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).expect("a"),
        "x"
    );
}

#[test]
fn each_entry_is_rechecked_right_before_it_applies_and_earlier_writes_roll_back() {
    let (_directory, root) = vault();
    fs::write(root.path().join("a.md"), "A0").expect("a");
    fs::write(root.path().join("b.md"), "B0").expect("b");
    let raced = Cell::new(false);
    let edit_b = |index: usize| {
        if index == 1 && !raced.replace(true) {
            fs::write(root.path().join("b.md"), "a late edit").expect("edit");
        }
    };
    let error = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "a"), "A1".to_string()).expecting_text("A0".to_string()),
            PlanEntry::write(target(&root, "b"), "B1".to_string()).expecting_text("B0".to_string()),
        ],
        &ApplyOptions {
            before_entry: Some(&edit_b),
            ..options()
        },
    )
    .expect_err("late edit");
    let WriteError::RolledBack { cause } = &error else {
        panic!("{error}");
    };
    assert!(matches!(**cause, WriteError::ChangedOnDisk(_)), "{cause:?}");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).expect("a"),
        "A0"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("b.md")).expect("b"),
        "a late edit",
        "the person's edit is never overwritten"
    );
}

/// There is no journal: a process killed in the middle of a batch leaves the files written so far.
/// While the process lives, an I/O error at step 10 is undone, and when one of the undone files was
/// edited by someone since, the answer says the vault is inconsistent and names that file, not
/// "rolled back".
#[test]
fn an_io_error_at_step_ten_is_undone_and_a_file_that_cannot_be_put_back_is_named() {
    let (_directory, root) = vault();
    let name = |index: usize| format!("n{index}");
    for index in 0..12 {
        fs::write(root.path().join(format!("{}.md", name(index))), "ORIGINAL").expect("seed");
    }
    let sabotage = |index: usize| {
        if index == 10 {
            fs::write(root.path().join("n3.md"), "a person's edit").expect("edit");
            fs::remove_file(root.path().join("n10.md")).expect("remove");
            fs::create_dir(root.path().join("n10.md")).expect("a folder where a file was");
        }
    };
    let plan = (0..12)
        .map(|index| PlanEntry::write(target(&root, &name(index)), format!("REWRITTEN-{index}")))
        .collect();
    let error = apply_all_or_nothing(
        plan,
        &ApplyOptions {
            before_entry: Some(&sabotage),
            ..options()
        },
    )
    .expect_err("step ten fails");
    let WriteError::Inconsistent { cause, unrecovered } = &error else {
        panic!("a rollback that could not finish must not be reported as complete: {error}");
    };
    assert!(matches!(**cause, WriteError::Io(_)), "{cause:?}");
    assert_eq!(unrecovered, &vec![root.path().join("n3.md")]);
    assert!(error.to_string().contains("INCONSISTENT"), "{error}");
    for index in (0..10).filter(|index| *index != 3) {
        let held = fs::read_to_string(root.path().join(format!("n{index}.md"))).expect("read");
        assert_eq!(held, "ORIGINAL", "n{index} was put back");
    }
    assert_eq!(
        fs::read_to_string(root.path().join("n3.md")).expect("n3"),
        "a person's edit",
        "the edit is kept and reported, never overwritten"
    );
}

#[test]
fn a_plan_that_requires_revisions_refuses_an_entry_without_one_before_starting() {
    let (_directory, root) = vault();
    fs::write(root.path().join("old.md"), "x").expect("old");
    let require = options().requiring_revisions();
    let error = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "old"), "y".to_string()),
            PlanEntry::write(target(&root, "new"), "y".to_string()),
        ],
        &require,
    )
    .expect_err("missing revisions");
    let WriteError::MissingRevisions(paths) = &error else {
        panic!("{error}");
    };
    assert_eq!(paths.len(), 2);
    assert_eq!(
        fs::read_to_string(root.path().join("old.md")).expect("old"),
        "x"
    );
    assert!(!root.path().join("new.md").exists());
    let accepted = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "old"), "y".to_string()).expecting_text("x".to_string()),
            PlanEntry::write(target(&root, "new"), "y".to_string()).expecting_absent(),
        ],
        &require,
    );
    assert!(accepted.is_ok(), "{accepted:?}");
}

#[test]
fn a_plan_that_writes_a_file_and_deletes_its_other_spelling_keeps_what_it_wrote() {
    let (_directory, root) = vault();
    fs::write(root.path().join("Auth.md"), "old").expect("seed");
    let applied = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "Auth"), "new".to_string()),
            PlanEntry::delete(target(&root, "Auth")),
        ],
        &options(),
    )
    .expect("applied");
    assert_eq!(
        applied.steps, 1,
        "the delete of the written file is dropped"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("Auth.md")).expect("auth"),
        "new"
    );
}

/// Whether the disk holding `folder` opens `probe.md` as `PROBE.md`.
fn disk_ignores_letter_case(folder: &Path) -> bool {
    fs::write(folder.join("probe.md"), "x").expect("probe");
    folder.join("PROBE.md").exists()
}

/// A case-only rename writes `auth.md` and deletes `Auth.md`. On a disk that ignores case that is one
/// file and the delete is dropped; on one that does not, the two names are two files and both steps
/// run. Which disk this runs on decides which half is checked (CI is Linux, a case-sensitive disk;
/// a developer's Mac is not unless `TMPDIR` names a case-sensitive volume).
#[test]
fn a_case_only_rename_drops_the_delete_only_where_the_disk_ignores_case() {
    let (_directory, root) = vault();
    fs::write(root.path().join("Auth.md"), "old").expect("seed");
    let plan = vec![
        PlanEntry::write(target(&root, "auth"), "new".to_string()),
        PlanEntry::delete(target(&root, "Auth")),
    ];
    let applied = apply_all_or_nothing(plan, &options()).expect("applied");
    if disk_ignores_letter_case(root.path()) {
        assert_eq!(applied.steps, 1, "one file: the delete would erase what was written");
        assert_eq!(fs::read_to_string(root.path().join("Auth.md")).expect("read"), "new");
    } else {
        assert_eq!(applied.steps, 2, "two names, two files");
        assert!(!root.path().join("Auth.md").exists(), "the old spelling is gone");
        assert_eq!(fs::read_to_string(root.path().join("auth.md")).expect("read"), "new");
    }
}

/// On a case-sensitive disk `Auth.md` and `auth.md` can both exist; deleting one never drops
/// because the other is written. Skipped where the disk folds case, which cannot hold both.
#[test]
fn two_files_that_differ_only_by_case_stay_two_files() {
    let (_directory, root) = vault();
    if disk_ignores_letter_case(root.path()) {
        return;
    }
    fs::write(root.path().join("Auth.md"), "upper").expect("seed");
    fs::write(root.path().join("auth.md"), "lower").expect("seed");
    let applied = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "auth"), "lower, rewritten".to_string()),
            PlanEntry::delete(target(&root, "Auth")),
        ],
        &options(),
    )
    .expect("applied");
    assert_eq!(applied.steps, 2);
    assert!(!root.path().join("Auth.md").exists(), "the other file was deleted as asked");
    assert_eq!(
        fs::read_to_string(root.path().join("auth.md")).expect("read"),
        "lower, rewritten"
    );
}

#[cfg(unix)]
mod permissions {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn running_as_root() -> bool {
        rustix::process::geteuid().is_root()
    }

    #[test]
    fn one_unwritable_target_refuses_the_whole_plan_before_anything_is_written() {
        if running_as_root() {
            return;
        }
        let (_directory, root) = vault();
        fs::write(root.path().join("ok.md"), "before-ok").expect("ok");
        fs::write(root.path().join("locked.md"), "before-locked").expect("locked");
        fs::set_permissions(
            root.path().join("locked.md"),
            fs::Permissions::from_mode(0o444),
        )
        .expect("chmod");
        let error = apply_all_or_nothing(
            vec![
                PlanEntry::write(target(&root, "new/nested/node"), "x".to_string()),
                PlanEntry::write(target(&root, "ok"), "after-ok".to_string()),
                PlanEntry::write(target(&root, "locked"), "after-locked".to_string()),
            ],
            &options(),
        )
        .expect_err("refused");
        fs::set_permissions(
            root.path().join("locked.md"),
            fs::Permissions::from_mode(0o644),
        )
        .expect("chmod back");
        let WriteError::NotWritable(blocked) = &error else {
            panic!("{error}");
        };
        assert_eq!(blocked.len(), 1);
        assert!(blocked[0].0.ends_with("locked.md"));
        assert_eq!(blocked[0].1, OsErrorCode::PermissionDenied);
        let text = error.to_string();
        assert!(text.starts_with("Refused before writing anything: 1 file(s) are not writable, so this operation could not finish as one unit:\n  "));
        assert!(text.contains("locked.md (EACCES)"));
        assert!(text.contains("The vault is unchanged."));
        assert_eq!(
            fs::read_to_string(root.path().join("ok.md")).expect("ok"),
            "before-ok"
        );
        assert!(
            !root.path().join("new").exists(),
            "a refusal creates no folder"
        );
    }

    #[test]
    fn a_read_only_folder_blocks_a_create_and_a_delete_in_it() {
        if running_as_root() {
            return;
        }
        let (_directory, root) = vault();
        fs::create_dir(root.path().join("frozen")).expect("frozen");
        fs::write(root.path().join("frozen/keep.md"), "x").expect("keep");
        fs::set_permissions(
            root.path().join("frozen"),
            fs::Permissions::from_mode(0o555),
        )
        .expect("chmod");
        let create = apply_all_or_nothing(
            vec![PlanEntry::write(
                target(&root, "frozen/new"),
                "x".to_string(),
            )],
            &options(),
        );
        let delete = apply_all_or_nothing(
            vec![PlanEntry::delete(target(&root, "frozen/keep"))],
            &options(),
        );
        fs::set_permissions(
            root.path().join("frozen"),
            fs::Permissions::from_mode(0o755),
        )
        .expect("chmod back");
        assert!(
            matches!(create, Err(WriteError::NotWritable(_))),
            "{create:?}"
        );
        assert!(
            matches!(delete, Err(WriteError::NotWritable(_))),
            "{delete:?}"
        );
        assert!(root.path().join("frozen/keep.md").exists());
    }
}

#[test]
fn a_plan_that_would_rewrite_a_file_reserved_for_a_person_writes_nothing() {
    let (_directory, root) = vault();
    fs::write(
        root.path().join("decision.md"),
        "---\nreview_state: human_decides\n---\nbody",
    )
    .expect("reserved");
    fs::write(root.path().join("plain.md"), "plain").expect("plain");
    let plan = || {
        vec![
            PlanEntry::write(target(&root, "plain"), "rewritten".to_string()),
            PlanEntry::write(target(&root, "decision"), "rewritten".to_string()),
        ]
    };
    let error = apply_all_or_nothing(plan(), &options()).expect_err("reserved");
    assert!(matches!(error, WriteError::Reserved(_)), "{error}");
    assert!(error.to_string().contains("reserved for a person"));
    assert!(
        error
            .to_string()
            .ends_with("Report it and let the person decide; only they release the reservation."),
        "an agent that meets a reserved file is told whom to hand it to: {error}"
    );
    assert_eq!(error.class(), WriteErrorClass::ToolError);
    assert_eq!(
        fs::read_to_string(root.path().join("plain.md")).expect("plain"),
        "plain",
        "the unreserved file of the same plan is untouched too"
    );
    // A deletion rewrites it just the same.
    let deletion = apply_all_or_nothing(
        vec![PlanEntry::delete(target(&root, "decision"))],
        &options(),
    );
    assert!(matches!(deletion, Err(WriteError::Reserved(_))));
    assert!(root.path().join("decision.md").exists());
    // The one tool that releases a reservation says so, by name, in its options.
    let released = apply_all_or_nothing(plan(), &ApplyOptions::new(Reservations::AllowReserved));
    assert!(released.is_ok(), "{released:?}");
}

#[test]
fn a_taken_name_classifies_as_a_conflict_by_its_code_not_by_its_wording() {
    let taken = WriteError::Io(IoFailure::new(
        "mkdir",
        "/vault/a",
        std::io::Error::from(std::io::ErrorKind::AlreadyExists),
    ));
    assert_eq!(taken.class(), WriteErrorClass::Conflict);
    let missing = WriteError::Io(IoFailure::new(
        "open",
        "/vault/a",
        std::io::Error::from(std::io::ErrorKind::NotFound),
    ));
    assert_eq!(missing.class(), WriteErrorClass::ToolError);
    let rolled_back = WriteError::RolledBack {
        cause: Box::new(taken),
    };
    assert_eq!(rolled_back.class(), WriteErrorClass::Conflict);
    let rolled_back_conflict = WriteError::RolledBack {
        cause: Box::new(WriteError::Conflict(confined_files::VaultConflict {
            slug: "a".to_string(),
            expected_modified: None,
            current_modified: None,
        })),
    };
    assert_eq!(
        rolled_back_conflict.class(),
        WriteErrorClass::VaultConflict,
        "a stale write that was rolled back is still a vault_conflict"
    );
    let inconsistent = WriteError::Inconsistent {
        cause: Box::new(WriteError::Conflict(confined_files::VaultConflict {
            slug: "a".to_string(),
            expected_modified: None,
            current_modified: None,
        })),
        unrecovered: vec![],
    };
    assert_eq!(inconsistent.class(), WriteErrorClass::VaultConflict);
    #[cfg(unix)]
    {
        let raw = WriteError::Io(IoFailure::new(
            "mkdir",
            "/vault/a",
            std::io::Error::from_raw_os_error(17),
        ));
        assert_eq!(raw.class(), WriteErrorClass::Conflict, "EEXIST is 17");
    }
}

/// The public `errorCode` strings agents branch on are pinned: an existing code keeps its meaning.
#[test]
fn the_public_error_codes_are_pinned() {
    assert_eq!(
        WriteErrorClass::VaultConflict.public_code(),
        "vault_conflict"
    );
    assert_eq!(WriteErrorClass::Conflict.public_code(), "conflict");
    assert_eq!(WriteErrorClass::ToolError.public_code(), "tool_error");
    let stale = WriteError::Conflict(confined_files::VaultConflict {
        slug: "a".to_string(),
        expected_modified: None,
        current_modified: None,
    });
    let taken = WriteError::Io(IoFailure::new(
        "mkdir",
        "/vault/a",
        std::io::Error::from(std::io::ErrorKind::AlreadyExists),
    ));
    assert_eq!(stale.class().public_code(), "vault_conflict");
    assert_eq!(taken.class().public_code(), "conflict");
    let rolled_back = |cause| WriteError::RolledBack {
        cause: Box::new(cause),
    };
    assert_eq!(rolled_back(stale).class().public_code(), "vault_conflict");
    assert_eq!(rolled_back(taken).class().public_code(), "conflict");
}

#[test]
fn a_file_whose_name_nearly_fills_the_limit_is_still_written_atomically() {
    let (_directory, root) = vault();
    // 252 bytes + `.md` = 255, the longest name a folder entry may have. The temporary name is
    // cut to fit, so the write neither fails with a name too long nor leaves debris.
    let slug = "n".repeat(252);
    let path = target(&root, &slug);
    write_atomically(&path, "long", &AtomicWrite::default()).expect("write");
    assert_eq!(fs::read_to_string(path.as_path()).expect("read"), "long");
    assert_eq!(names_in(root.path()).len(), 1);
}

#[test]
fn a_temporary_that_is_not_ours_is_never_removed() {
    let (_directory, root) = vault();
    let path = target(&root, "note");
    fs::write(path.as_path(), "before").expect("seed");
    write_atomically(&path, "after", &AtomicWrite::default()).expect("write");
    // A stranger's file in the same folder survives every write.
    fs::write(root.path().join(".note.md.oatlas-tmp-1-0-0"), "stranger").expect("stranger");
    write_atomically(&path, "again", &AtomicWrite::default()).expect("write");
    assert_eq!(
        fs::read_to_string(root.path().join(".note.md.oatlas-tmp-1-0-0")).expect("kept"),
        "stranger"
    );
}

#[cfg(windows)]
#[test]
fn a_stream_name_in_a_slug_cannot_change_the_bytes_of_the_file_it_hangs_on() {
    let (_directory, root) = vault();
    fs::write(root.path().join("a.md"), "original").expect("seed");
    // `a.md:stream.md` would name an alternate data stream of `a.md` on NTFS.
    let outcome = root.write_path("a.md:stream");
    assert!(outcome.is_err(), "{outcome:?}");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).expect("a"),
        "original"
    );
}

#[test]
fn two_writers_of_different_files_in_one_folder_never_share_a_temporary_name() {
    let (_directory, root) = vault();
    std::thread::scope(|scope| {
        for index in 0..8 {
            let root = &root;
            scope.spawn(move || {
                for round in 0..20 {
                    let path = root.write_path(&format!("n{index}")).expect("slug");
                    write_atomically(&path, &format!("{index}-{round}"), &AtomicWrite::default())
                        .expect("write");
                }
            });
        }
    });
    let names = names_in(root.path());
    assert_eq!(names.len(), 8, "{names:?}");
    assert!(names.iter().all(|name| name.ends_with(".md")), "{names:?}");
}
