//! Planted write hazards, mirroring `mcp/src/vault/writes/all-or-nothing.test.mjs` and
//! `conflict-detection.test.mjs`: a stale or raced write, an unwritable target, a failure in the
//! middle of a batch. Each case names what it proves.

use std::cell::Cell;
use std::fs;
use std::path::Path;

use confined_files::{
    apply_all_or_nothing, check_current_text, check_modified_time, write_atomically, ApplyOptions,
    AtomicWrite, ConflictReport, Expectation, ModifiedTime, PlanEntry, VaultRoot, WritablePath,
    WriteError,
};

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
            expectation: Expectation::Text("as planned".to_string()),
            conflict: Some(ConflictReport {
                slug: "note",
                expected_modified: Some(ModifiedTime::from_milliseconds(1000.0)),
            }),
            before_commit: Some(&human),
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
    assert!(error.to_string().ends_with(
        "Re-read the doc with get_concepts to get the current expected_mtime, then retry the write."
    ));
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
fn the_modified_time_rule_matches_the_javascript_check() {
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

#[test]
fn an_empty_plan_does_nothing_and_a_mixed_plan_applies_everything() {
    let (_directory, root) = vault();
    assert_eq!(
        apply_all_or_nothing(vec![], &ApplyOptions::default())
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
        &ApplyOptions::default(),
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
        &ApplyOptions::default(),
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
        &ApplyOptions::default(),
    )
    .expect_err("fails");
    assert!(matches!(error, WriteError::RolledBack { .. }), "{error}");
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
        &ApplyOptions::default(),
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
        &ApplyOptions::default(),
    )
    .expect_err("moved");
    assert!(matches!(moved, WriteError::ChangedOnDisk(_)));
    // A deleted target must not be revived with stale content.
    let revived = apply_all_or_nothing(
        vec![
            PlanEntry::write(target(&root, "deleted"), "stale".to_string())
                .expecting_modified(stale),
        ],
        &ApplyOptions::default(),
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
            ..ApplyOptions::default()
        },
    )
    .expect_err("late edit");
    assert!(matches!(error, WriteError::RolledBack { .. }), "{error}");
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

#[test]
fn a_plan_that_requires_revisions_refuses_an_entry_without_one_before_starting() {
    let (_directory, root) = vault();
    fs::write(root.path().join("old.md"), "x").expect("old");
    let require = ApplyOptions {
        require_revisions: true,
        ..ApplyOptions::default()
    };
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
        &ApplyOptions::default(),
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

#[cfg(unix)]
mod permissions {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn running_as_root() -> bool {
        // SAFETY: `geteuid` takes no arguments and cannot fail.
        unsafe { libc::geteuid() == 0 }
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
            &ApplyOptions::default(),
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
        assert_eq!(blocked[0].1, "EACCES");
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
            &ApplyOptions::default(),
        );
        let delete = apply_all_or_nothing(
            vec![PlanEntry::delete(target(&root, "frozen/keep"))],
            &ApplyOptions::default(),
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
