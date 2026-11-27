use super::*;
use crate::git::test_support::Scratch;
use std::fs;

const STALE: &str = "---\nkind: capability\ntitle: Pay\n---\nPays.\n";
const MARKED: &str = "---\nkind: capability\ntitle: Pay\nevidence_checked: 1111111111111111111111111111111111111111\n---\nPays.\n";

/// A repository whose vault is `docs/`, holding two committed concept documents.
fn vault_in_repository(name: &str) -> (Scratch, String) {
    let scratch = Scratch::new(name);
    fs::create_dir_all(scratch.work.join("docs/capabilities")).unwrap();
    for document in ["pay", "refund", "ship"] {
        fs::write(
            scratch
                .work
                .join(format!("docs/capabilities/{document}.md")),
            STALE.replace("Pay", document),
        )
        .unwrap();
    }
    scratch.git(&["add", "docs"]);
    scratch.git(&["commit", "-qm", "concepts"]);
    let vault = scratch.work.join("docs").to_string_lossy().into_owned();
    (scratch, vault)
}

fn document(path: &str, title: &str) -> RecheckDocument {
    RecheckDocument {
        path: path.into(),
        before: STALE.replace("Pay", title),
        after: MARKED.replace("Pay", title),
    }
}

fn read(scratch: &Scratch, path: &str) -> String {
    fs::read_to_string(scratch.work.join(path)).unwrap()
}

#[test]
fn a_repository_without_a_known_remote_default_is_not_held() {
    let (scratch, vault) = vault_in_repository("recheck-no-remote");
    let state = git_recheck_state(vault.clone()).unwrap();
    assert!(state.repository);
    assert_eq!(state.hold, None);
    scratch.add_origin();
    scratch.git(&["push", "-q", "origin", "main"]);
    let state = git_recheck_state(vault).unwrap();
    assert_eq!(
        state.remote_default, None,
        "a clone that never recorded origin/HEAD"
    );
    assert_eq!(state.hold, None);
}

#[test]
fn the_remote_default_branch_checked_out_holds_the_run_and_a_working_branch_does_not() {
    let (scratch, vault) = vault_in_repository("recheck-default-branch");
    scratch.add_origin();
    scratch.git(&["push", "-q", "origin", "main"]);
    scratch.git(&["fetch", "-q", "origin"]);
    scratch.git(&["remote", "set-head", "origin", "main"]);
    assert_eq!(
        git_recheck_state(vault.clone()).unwrap().hold,
        Some(RecheckHold {
            reason: "branch",
            detail: "main".into()
        })
    );
    scratch.git(&["checkout", "-qb", "work"]);
    assert_eq!(git_recheck_state(vault).unwrap().hold, None);
}

#[test]
fn a_detached_head_or_an_operation_in_progress_holds_the_run() {
    let (scratch, vault) = vault_in_repository("recheck-git-hold");
    scratch.git(&["checkout", "-q", "--detach"]);
    assert_eq!(
        git_recheck_state(vault.clone())
            .unwrap()
            .hold
            .map(|hold| hold.reason),
        Some("git")
    );
    scratch.git(&["checkout", "-q", "main"]);
    let git_dir = scratch.git(&["rev-parse", "--absolute-git-dir"]);
    fs::write(
        Path::new(&git_dir).join("MERGE_HEAD"),
        scratch.git(&["rev-parse", "HEAD"]),
    )
    .unwrap();
    let hold = git_recheck_state(vault).unwrap().hold.unwrap();
    assert_eq!(
        (hold.reason, hold.detail.as_str()),
        ("git", "merge in progress")
    );
}

#[test]
fn a_folder_outside_git_reads_as_no_repository() {
    let dir = std::env::temp_dir().join(format!("atlas-recheck-no-git-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let state = git_recheck_state(dir.to_string_lossy().into_owned()).unwrap();
    assert!(!state.repository);
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn a_run_commits_only_its_documents_and_leaves_every_other_change_as_it_was() {
    let (scratch, vault) = vault_in_repository("recheck-only-taken");
    fs::write(
        scratch.work.join("docs/capabilities/ship.md"),
        "a person's edit\n",
    )
    .unwrap();
    fs::write(scratch.work.join("docs/notes.md"), "untracked note\n").unwrap();
    fs::write(scratch.work.join("outside.md"), "staged outside\n").unwrap();
    scratch.git(&["add", "outside.md"]);
    let status_before = scratch.git(&["status", "--porcelain"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = git_recheck_commit(
        vault,
        "pass-1".into(),
        head.clone(),
        "docs: recheck 2 concepts against the code".into(),
        vec![
            document("capabilities/pay.md", "pay"),
            document("capabilities/refund.md", "refund"),
            document("capabilities/ship.md", "ship"),
        ],
    )
    .unwrap();
    assert_eq!(result.outcome, "committed");
    assert_eq!(
        result.changed_meanwhile,
        vec!["capabilities/ship.md".to_string()]
    );
    let files = scratch.git(&["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
    assert_eq!(
        files,
        "docs/capabilities/pay.md\ndocs/capabilities/refund.md"
    );
    assert_eq!(scratch.git(&["rev-parse", "HEAD~1"]), head);
    assert_eq!(scratch.git(&["status", "--porcelain"]), status_before);
    assert_eq!(
        read(&scratch, "docs/capabilities/ship.md"),
        "a person's edit\n"
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        MARKED.replace("Pay", "pay")
    );
    assert!(!scratch
        .work
        .join("docs/.ontology-atlas/recheck-pending.json")
        .exists());
}

#[test]
fn a_moved_head_changes_no_document() {
    let (scratch, vault) = vault_in_repository("recheck-head-moved");
    let started = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("later.md", "later");
    let result = git_recheck_commit(
        vault,
        "pass-2".into(),
        started,
        "docs: recheck 1 concepts against the code".into(),
        vec![document("capabilities/pay.md", "pay")],
    )
    .unwrap();
    assert_eq!(result.outcome, "head-moved");
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        STALE.replace("Pay", "pay")
    );
}

#[cfg(unix)]
fn refusing_hook(scratch: &Scratch) {
    use std::os::unix::fs::PermissionsExt;
    let hooks = scratch.work.join(".hooks");
    fs::create_dir_all(&hooks).unwrap();
    let hook = hooks.join("pre-commit");
    fs::write(&hook, "#!/bin/sh\necho 'hook says no' >&2\nexit 1\n").unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    scratch.git(&["config", "core.hooksPath", ".hooks"]);
}

#[cfg(unix)]
#[test]
fn a_refused_commit_puts_back_what_atlas_wrote_and_leaves_a_persons_edit() {
    let (scratch, vault) = vault_in_repository("recheck-refused");
    refusing_hook(&scratch);
    let status_before = scratch.git(&["status", "--porcelain"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let opened = open_vault(&vault).unwrap();
    let refund = scratch.work.join("docs/capabilities/refund.md");
    let result = commit_documents(
        &opened,
        "pass-3",
        &head,
        "docs: recheck 2 concepts against the code",
        vec![
            document("capabilities/pay.md", "pay"),
            document("capabilities/refund.md", "refund"),
        ],
        || fs::write(&refund, "a person typed this meanwhile\n").unwrap(),
    )
    .unwrap();
    assert_eq!(result.outcome, "refused");
    assert!(result.detail.unwrap().contains("hook says no"));
    assert_eq!(result.restored, vec!["capabilities/pay.md".to_string()]);
    assert_eq!(result.left, vec!["capabilities/refund.md".to_string()]);
    assert_eq!(scratch.git(&["rev-parse", "HEAD"]), head);
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        STALE.replace("Pay", "pay")
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/refund.md"),
        "a person typed this meanwhile\n"
    );
    assert_eq!(
        read(
            &scratch,
            "docs/.ontology-atlas/undone/pass-3/capabilities/pay.md"
        ),
        MARKED.replace("Pay", "pay")
    );
    fs::write(&refund, STALE.replace("Pay", "refund")).unwrap();
    fs::remove_dir_all(scratch.work.join("docs/.ontology-atlas")).unwrap();
    assert_eq!(scratch.git(&["status", "--porcelain"]), status_before);
}

#[test]
fn a_run_atlas_quit_before_committing_is_put_back_when_the_folder_opens() {
    let (scratch, vault) = vault_in_repository("recheck-recover");
    let opened = open_vault(&vault).unwrap();
    let status_before = scratch.git(&["status", "--porcelain"]);
    opened
        .write_pending(&PendingRun {
            pass_id: "pass-4".into(),
            documents: vec![document("capabilities/pay.md", "pay")],
        })
        .unwrap();
    fs::write(
        scratch.work.join("docs/capabilities/pay.md"),
        MARKED.replace("Pay", "pay"),
    )
    .unwrap();
    let recovered = git_recheck_recover(vault.clone()).unwrap().unwrap();
    assert_eq!(recovered.restored, vec!["capabilities/pay.md".to_string()]);
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        STALE.replace("Pay", "pay")
    );
    assert!(git_recheck_recover(vault).unwrap().is_none());
    fs::remove_dir_all(scratch.work.join("docs/.ontology-atlas")).unwrap();
    assert_eq!(scratch.git(&["status", "--porcelain"]), status_before);
}

fn committed_run(scratch: &Scratch, vault: &str) -> String {
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = git_recheck_commit(
        vault.to_string(),
        "pass-5".into(),
        head,
        "docs: recheck 2 concepts against the code".into(),
        vec![
            document("capabilities/pay.md", "pay"),
            document("capabilities/refund.md", "refund"),
        ],
    )
    .unwrap();
    result.commit.unwrap()
}

#[test]
fn undoing_a_run_commits_the_text_before_it_and_skips_a_document_changed_since() {
    let (scratch, vault) = vault_in_repository("recheck-undo");
    let run = committed_run(&scratch, &vault);
    fs::write(
        scratch.work.join("docs/capabilities/refund.md"),
        "edited after the run\n",
    )
    .unwrap();
    let undo = git_recheck_undo(
        vault,
        run.clone(),
        vec![
            "capabilities/pay.md".into(),
            "capabilities/refund.md".into(),
        ],
        "docs: undo a recheck".into(),
    )
    .unwrap();
    assert_eq!(undo.outcome, "undone");
    assert_eq!(undo.undone, vec!["capabilities/pay.md".to_string()]);
    assert_eq!(undo.skipped, vec!["capabilities/refund.md".to_string()]);
    assert_eq!(
        scratch.git(&["show", &format!("{run}^:docs/capabilities/pay.md")]),
        scratch.git(&["show", "HEAD:docs/capabilities/pay.md"])
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        STALE.replace("Pay", "pay")
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/refund.md"),
        "edited after the run\n"
    );
}

#[test]
fn undoing_one_concept_leaves_the_rest_of_the_run() {
    let (scratch, vault) = vault_in_repository("recheck-undo-one");
    let run = committed_run(&scratch, &vault);
    let undo = git_recheck_undo(
        vault,
        run,
        vec!["capabilities/refund.md".into()],
        "docs: undo a recheck".into(),
    )
    .unwrap();
    assert_eq!(undo.undone, vec!["capabilities/refund.md".to_string()]);
    assert_eq!(
        read(&scratch, "docs/capabilities/refund.md"),
        STALE.replace("Pay", "refund")
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        MARKED.replace("Pay", "pay")
    );
}

#[test]
fn a_run_rewritten_out_of_the_branch_cannot_be_undone_here() {
    let (scratch, vault) = vault_in_repository("recheck-undo-gone");
    let run = committed_run(&scratch, &vault);
    scratch.git(&["reset", "-q", "--hard", "HEAD~1"]);
    let undo = git_recheck_undo(
        vault,
        run,
        vec!["capabilities/pay.md".into()],
        "docs: undo a recheck".into(),
    )
    .unwrap();
    assert_eq!(undo.outcome, "gone");
}

#[test]
fn a_secret_named_path_is_never_read_and_a_long_diff_is_cut() {
    let (scratch, vault) = vault_in_repository("recheck-diffs");
    fs::write(scratch.work.join(".env.production"), "KEY=one\n").unwrap();
    let long: String = (0..30).map(|line| format!("line {line}\n")).collect();
    fs::write(scratch.work.join("pay.ts"), "pay(1);\n").unwrap();
    scratch.git(&["add", "-f", ".env.production", "pay.ts"]);
    scratch.git(&["commit", "-qm", "code"]);
    let from = scratch.git(&["rev-parse", "HEAD"]);
    fs::write(scratch.work.join(".env.production"), "KEY=two\n").unwrap();
    fs::write(scratch.work.join("pay.ts"), &long).unwrap();
    scratch.git(&["commit", "-qam", "more code"]);
    let diffs = git_recheck_diffs(
        vault,
        vec![
            RecheckDiffRequest {
                commit: from.clone(),
                path: ".env.production".into(),
            },
            RecheckDiffRequest {
                commit: from,
                path: "pay.ts".into(),
            },
        ],
        10,
    )
    .unwrap();
    assert!(diffs[0].refused);
    assert_eq!(diffs[0].diff, None);
    assert!(diffs[1].cut);
    assert!(diffs[1].lines > 30);
    assert_eq!(
        diffs[1].diff.as_deref().map(|diff| diff.lines().count()),
        Some(10)
    );
}

#[test]
fn only_a_commit_of_this_repository_counts_as_a_mark() {
    let (scratch, vault) = vault_in_repository("recheck-known");
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let tree = scratch.git(&["rev-parse", "HEAD^{tree}"]);
    let known = git_known_commits(
        vault,
        vec![head.clone(), tree, "0".repeat(40), "not-a-hash".into()],
    )
    .unwrap();
    assert_eq!(known, vec![head]);
}
