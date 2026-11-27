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

/// The folder opened with its run journal in a scratch app-data folder beside the repository.
fn journaled(scratch: &Scratch, vault: &str) -> Vault {
    open_vault_with_journal(vault, &scratch.work.join("../app-data/recheck-pending")).unwrap()
}

fn commit(vault: &Vault, pass: &str, head: &str, documents: Vec<RecheckDocument>) -> RecheckCommit {
    commit_documents(
        vault,
        "round-1",
        pass,
        head,
        "docs: recheck concepts against the code",
        documents,
        || {},
    )
    .unwrap()
}

fn journal_is_empty(vault: &Vault) -> bool {
    !vault.journal.as_ref().unwrap().exists()
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
    let opened = journaled(&scratch, &vault);
    let result = commit(
        &opened,
        "pass-1",
        &head,
        vec![
            document("capabilities/pay.md", "pay"),
            document("capabilities/refund.md", "refund"),
            document("capabilities/ship.md", "ship"),
        ],
    );
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
    assert!(journal_is_empty(&opened));
    assert!(result.rewritten.is_empty());
}

#[test]
fn a_moved_head_changes_no_document() {
    let (scratch, vault) = vault_in_repository("recheck-head-moved");
    let started = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("later.md", "later");
    let result = commit(
        &journaled(&scratch, &vault),
        "pass-2",
        &started,
        vec![document("capabilities/pay.md", "pay")],
    );
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
    let opened = journaled(&scratch, &vault);
    let refund = scratch.work.join("docs/capabilities/refund.md");
    let result = commit_documents(
        &opened,
        "round-1",
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
    let opened = journaled(&scratch, &vault);
    let status_before = scratch.git(&["status", "--porcelain"]);
    opened
        .write_pending(&PendingRun {
            round_id: "round-1".into(),
            pass_id: "pass-4".into(),
            documents: vec![document("capabilities/pay.md", "pay")],
        })
        .unwrap();
    fs::write(
        scratch.work.join("docs/capabilities/pay.md"),
        MARKED.replace("Pay", "pay"),
    )
    .unwrap();
    let recovered = recover_run(&opened).unwrap();
    assert_eq!(recovered.restored, vec!["capabilities/pay.md".to_string()]);
    assert_eq!(
        (recovered.round_id.as_str(), recovered.pass_id.as_str()),
        ("round-1", "pass-4")
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        STALE.replace("Pay", "pay")
    );
    assert!(recover_run(&opened).is_none());
    assert_eq!(scratch.git(&["status", "--porcelain"]), status_before);
}

#[test]
fn a_journal_planted_in_the_folder_is_never_read() {
    let (scratch, vault) = vault_in_repository("recheck-planted-journal");
    let on_disk = STALE.replace("Pay", "pay") + "An uncommitted line.\n";
    let planted = serde_json::to_string(&PendingRun {
        round_id: "round-1".into(),
        pass_id: "pass-x".into(),
        documents: vec![RecheckDocument {
            path: "capabilities/pay.md".into(),
            before: "text the folder chose\n".into(),
            after: on_disk.clone(),
        }],
    })
    .unwrap();
    fs::create_dir_all(scratch.work.join("docs/.ontology-atlas")).unwrap();
    fs::write(
        scratch
            .work
            .join("docs/.ontology-atlas/recheck-pending.json"),
        planted,
    )
    .unwrap();
    fs::write(scratch.work.join("docs/capabilities/pay.md"), &on_disk).unwrap();
    assert!(recover_run(&journaled(&scratch, &vault)).is_none());
    assert_eq!(read(&scratch, "docs/capabilities/pay.md"), on_disk);
}

fn committed_run(scratch: &Scratch, vault: &str) -> String {
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = commit(
        &journaled(scratch, vault),
        "pass-5",
        &head,
        vec![
            document("capabilities/pay.md", "pay"),
            document("capabilities/refund.md", "refund"),
        ],
    );
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
fn a_mark_stands_only_while_it_names_a_commit_here_and_the_document_is_unchanged_since() {
    let (scratch, vault) = vault_in_repository("recheck-marks");
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let tree = scratch.git(&["rev-parse", "HEAD^{tree}"]);
    let marked = |title: &str, mark: &str| {
        STALE
            .replace("Pay", title)
            .replace("title:", &format!("evidence_checked: {mark}\ntitle:"))
    };
    fs::write(
        scratch.work.join("docs/capabilities/pay.md"),
        marked("pay", &head),
    )
    .unwrap();
    fs::write(
        scratch.work.join("docs/capabilities/refund.md"),
        marked("refund", &"f".repeat(40)),
    )
    .unwrap();
    fs::write(
        scratch.work.join("docs/capabilities/ship.md"),
        marked("ship", &head) + "A person added this.\n",
    )
    .unwrap();
    let mark = |path: &str, mark: &str| RecheckMark {
        path: path.into(),
        mark: mark.into(),
    };
    let standing = git_recheck_marks_hold(
        vault.clone(),
        vec![
            mark("capabilities/pay.md", &head),
            mark("capabilities/refund.md", &"f".repeat(40)),
            mark("capabilities/ship.md", &head),
        ],
    )
    .unwrap();
    assert_eq!(standing, vec!["capabilities/pay.md".to_string()]);
    let tree_named =
        git_recheck_marks_hold(vault, vec![mark("capabilities/pay.md", &tree)]).unwrap();
    assert!(tree_named.is_empty(), "a tree is not a commit");
}

#[test]
fn uncommitted_documents_and_cited_files_are_named_as_asked() {
    let (scratch, vault) = vault_in_repository("recheck-uncommitted");
    fs::write(scratch.work.join("pay.ts"), "pay(1);\n").unwrap();
    scratch.git(&["add", "pay.ts"]);
    scratch.git(&["commit", "-qm", "code"]);
    fs::write(scratch.work.join("docs/capabilities/pay.md"), "edited\n").unwrap();
    fs::write(scratch.work.join("pay.ts"), "pay(2);\n").unwrap();
    scratch.git(&["add", "pay.ts"]);
    let named = git_uncommitted_paths(
        vault,
        vec![
            "capabilities/pay.md".into(),
            "capabilities/refund.md".into(),
        ],
        vec!["pay.ts".into(), "one.md".into()],
    )
    .unwrap();
    assert_eq!(
        named.changed,
        vec!["capabilities/pay.md".to_string(), "pay.ts".to_string()]
    );
    assert!(named.unchecked.is_empty());
}

#[test]
fn paths_past_the_request_cap_are_named_as_unchecked() {
    let (_scratch, vault) = vault_in_repository("recheck-uncommitted-cap");
    let many: Vec<String> = (0..super::super::evidence::MAX_EVIDENCE_PATHS + 3)
        .map(|index| format!("src/file-{index}.ts"))
        .collect();
    let named = git_uncommitted_paths(vault, Vec::new(), many).unwrap();
    assert_eq!(named.unchecked.len(), 3);
    assert!(named.changed.is_empty());
}

/// `main` checked out, recorded as the remote's default branch, with a working branch `work`
/// at the same commit.
fn default_branch_known(scratch: &Scratch) {
    scratch.add_origin();
    scratch.git(&["push", "-q", "origin", "main"]);
    scratch.git(&["fetch", "-q", "origin"]);
    scratch.git(&["remote", "set-head", "origin", "main"]);
    scratch.git(&["branch", "-q", "work"]);
}

#[test]
fn a_tag_named_like_the_default_branch_still_holds_the_run() {
    let (scratch, vault) = vault_in_repository("recheck-tag-main");
    default_branch_known(&scratch);
    scratch.git(&["tag", "main"]);
    let state = git_recheck_state(vault).unwrap();
    assert_eq!(state.branch.as_deref(), Some("main"));
    assert_eq!(state.hold.map(|hold| hold.reason), Some("branch"));
}

#[test]
fn switching_to_the_default_branch_after_the_turn_holds_the_commit() {
    let (scratch, vault) = vault_in_repository("recheck-switch-default");
    default_branch_known(&scratch);
    scratch.git(&["checkout", "-q", "work"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let opened = journaled(&scratch, &vault);

    scratch.git(&["checkout", "-q", "main"]);
    let result = commit(
        &opened,
        "pass-6",
        &head,
        vec![document("capabilities/pay.md", "pay")],
    );
    assert_eq!(result.outcome, "held");
    assert_eq!(result.hold.map(|hold| hold.reason), Some("branch"));

    scratch.git(&["checkout", "-q", "work"]);
    let work = scratch.work.clone();
    let result = commit_documents(
        &opened,
        "round-1",
        "pass-7",
        &head,
        "docs: recheck",
        vec![document("capabilities/pay.md", "pay")],
        || {
            let out = std::process::Command::new("git")
                .args(["checkout", "-q", "main"])
                .current_dir(&work)
                .output()
                .unwrap();
            assert!(out.status.success());
        },
    )
    .unwrap();
    assert_eq!(result.outcome, "held");
    assert_eq!(result.restored, vec!["capabilities/pay.md".to_string()]);
    assert_eq!(scratch.git(&["rev-parse", "HEAD"]), head);
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        STALE.replace("Pay", "pay")
    );
}

#[test]
fn an_undo_is_held_on_the_default_branch() {
    let (scratch, vault) = vault_in_repository("recheck-undo-held");
    default_branch_known(&scratch);
    scratch.git(&["checkout", "-q", "work"]);
    let run = committed_run(&scratch, &vault);
    scratch.git(&["checkout", "-q", "main"]);
    scratch.git(&["merge", "-q", "--ff-only", "work"]);
    let undo = git_recheck_undo(
        vault,
        run,
        vec!["capabilities/pay.md".into()],
        "docs: undo a recheck".into(),
    )
    .unwrap();
    assert_eq!(undo.outcome, "refused");
    assert_eq!(
        undo.detail.as_deref(),
        Some("main is the remote's default branch")
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        MARKED.replace("Pay", "pay")
    );
}

#[cfg(unix)]
#[test]
fn a_refused_undo_puts_back_what_it_changed_and_leaves_a_persons_edit() {
    let (scratch, vault) = vault_in_repository("recheck-undo-refused");
    let run = committed_run(&scratch, &vault);
    refusing_hook(&scratch);
    let opened = open_vault(&vault).unwrap();
    let refund = scratch.work.join("docs/capabilities/refund.md");
    let undo = undo_run(
        &opened,
        &run,
        vec![
            "capabilities/pay.md".into(),
            "capabilities/refund.md".into(),
        ],
        "docs: undo a recheck",
        || fs::write(&refund, "a person typed this meanwhile\n").unwrap(),
    )
    .unwrap();
    assert_eq!(undo.outcome, "refused");
    assert!(undo.detail.unwrap().contains("hook says no"));
    assert_eq!(undo.skipped, vec!["capabilities/refund.md".to_string()]);
    assert_eq!(scratch.git(&["rev-parse", "HEAD"]), run);
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        MARKED.replace("Pay", "pay")
    );
    assert_eq!(
        read(&scratch, "docs/capabilities/refund.md"),
        "a person typed this meanwhile\n"
    );
}

#[cfg(unix)]
#[test]
fn an_undo_that_cannot_write_a_document_puts_back_the_ones_it_wrote() {
    use std::os::unix::fs::PermissionsExt;
    let (scratch, vault) = vault_in_repository("recheck-undo-write-fails");
    fs::create_dir_all(scratch.work.join("docs/elements")).unwrap();
    fs::write(
        scratch.work.join("docs/elements/cart.md"),
        STALE.replace("Pay", "cart"),
    )
    .unwrap();
    scratch.git(&["add", "docs/elements"]);
    scratch.git(&["commit", "-qm", "cart"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let run = commit(
        &journaled(&scratch, &vault),
        "pass-8",
        &head,
        vec![
            document("capabilities/pay.md", "pay"),
            document("elements/cart.md", "cart"),
        ],
    )
    .commit
    .unwrap();
    let locked = scratch.work.join("docs/elements");
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o555)).unwrap();
    let undo = git_recheck_undo(
        vault,
        run.clone(),
        vec!["capabilities/pay.md".into(), "elements/cart.md".into()],
        "docs: undo a recheck".into(),
    );
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    let undo = undo.unwrap();
    assert_eq!(undo.outcome, "refused");
    assert_eq!(scratch.git(&["rev-parse", "HEAD"]), run);
    assert_eq!(
        read(&scratch, "docs/capabilities/pay.md"),
        MARKED.replace("Pay", "pay")
    );
    assert_eq!(scratch.git(&["status", "--porcelain", "--", "docs"]), "");
}

#[test]
fn documents_checked_out_with_crlf_endings_are_committed_and_undone() {
    let (scratch, vault) = vault_in_repository("recheck-crlf");
    fs::write(scratch.work.join(".gitattributes"), "*.md text eol=crlf\n").unwrap();
    scratch.git(&["add", ".gitattributes"]);
    scratch.git(&["commit", "-qm", "attributes"]);
    fs::remove_file(scratch.work.join("docs/capabilities/pay.md")).unwrap();
    scratch.git(&["checkout", "--", "docs/capabilities/pay.md"]);
    let on_disk = read(&scratch, "docs/capabilities/pay.md");
    assert!(on_disk.contains("\r\n"));
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = commit(
        &journaled(&scratch, &vault),
        "pass-9",
        &head,
        vec![RecheckDocument {
            path: "capabilities/pay.md".into(),
            before: on_disk.clone(),
            after: MARKED.replace("Pay", "pay").replace('\n', "\r\n"),
        }],
    );
    assert_eq!(result.outcome, "committed");
    assert!(result.rewritten.is_empty());
    let run = result.commit.unwrap();
    let undo = git_recheck_undo(
        vault,
        run,
        vec!["capabilities/pay.md".into()],
        "docs: undo a recheck".into(),
    )
    .unwrap();
    assert_eq!(undo.outcome, "undone");
    assert_eq!(read(&scratch, "docs/capabilities/pay.md"), on_disk);
    assert_eq!(scratch.git(&["status", "--porcelain"]), "");
}

#[cfg(unix)]
#[test]
fn a_document_keeps_its_file_mode_through_a_run() {
    use std::os::unix::fs::PermissionsExt;
    let (scratch, vault) = vault_in_repository("recheck-mode");
    let pay = scratch.work.join("docs/capabilities/pay.md");
    fs::set_permissions(&pay, fs::Permissions::from_mode(0o755)).unwrap();
    scratch.git(&["add", "docs/capabilities/pay.md"]);
    scratch.git(&["commit", "-qm", "executable"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = commit(
        &journaled(&scratch, &vault),
        "pass-10",
        &head,
        vec![document("capabilities/pay.md", "pay")],
    );
    assert_eq!(result.outcome, "committed");
    assert_eq!(
        fs::metadata(&pay).unwrap().permissions().mode() & 0o777,
        0o755
    );
    assert_eq!(
        scratch.git(&["diff-tree", "--no-commit-id", "-r", "--summary", "HEAD"]),
        ""
    );
}

#[cfg(unix)]
fn hook(scratch: &Scratch, body: &str) {
    use std::os::unix::fs::PermissionsExt;
    let hooks = scratch.work.join(".hooks");
    fs::create_dir_all(&hooks).unwrap();
    let hook = hooks.join("pre-commit");
    fs::write(&hook, format!("#!/bin/sh\n{body}\n")).unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    scratch.git(&["config", "core.hooksPath", ".hooks"]);
}

#[cfg(unix)]
#[test]
fn a_hook_that_rewrites_a_document_is_named_and_its_commit_left_to_undo() {
    let (scratch, vault) = vault_in_repository("recheck-hook-rewrites");
    hook(
        &scratch,
        "printf 'formatted\\n' >> docs/capabilities/pay.md && git add docs/capabilities/pay.md",
    );
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = commit(
        &journaled(&scratch, &vault),
        "pass-11",
        &head,
        vec![
            document("capabilities/pay.md", "pay"),
            document("capabilities/refund.md", "refund"),
        ],
    );
    assert_eq!(result.outcome, "committed");
    assert_eq!(result.rewritten, vec!["capabilities/pay.md".to_string()]);
    assert_eq!(scratch.git(&["rev-parse", "HEAD~1"]), head);
}

#[cfg(unix)]
#[test]
fn a_commit_past_its_deadline_is_stopped_and_put_back() {
    let (scratch, vault) = vault_in_repository("recheck-deadline");
    let marker = scratch.work.join("../hook-finished");
    hook(&scratch, &format!("sleep 5\ntouch '{}'", marker.display()));
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let mut opened = journaled(&scratch, &vault);
    opened.commit_deadline = Duration::from_millis(500);
    let result = commit(
        &opened,
        "pass-12",
        &head,
        vec![document("capabilities/pay.md", "pay")],
    );
    assert_eq!(result.outcome, "refused");
    assert!(result.detail.unwrap().contains("did not finish"));
    assert_eq!(result.restored, vec!["capabilities/pay.md".to_string()]);
    assert_eq!(scratch.git(&["rev-parse", "HEAD"]), head);
    std::thread::sleep(Duration::from_secs(6));
    assert!(!marker.exists(), "the hook was stopped with the commit");
}

#[test]
fn a_huge_diff_is_read_only_up_to_the_ceiling() {
    let (scratch, _vault) = vault_in_repository("recheck-diff-ceiling");
    fs::write(scratch.work.join("big.ts"), "start\n").unwrap();
    scratch.git(&["add", "big.ts"]);
    scratch.git(&["commit", "-qm", "big"]);
    let from = scratch.git(&["rev-parse", "HEAD"]);
    let long: String = (0..5000).map(|line| format!("line {line}\n")).collect();
    fs::write(scratch.work.join("big.ts"), long).unwrap();
    scratch.git(&["commit", "-qam", "bigger"]);
    let read = crate::git::runner::run_git_read_lines_bounded(
        &scratch.work,
        &["diff", "-w", "--no-color", &from, "HEAD", "--", "big.ts"],
        10,
        DIFF_MAX_BYTES,
        4096,
    )
    .unwrap();
    assert!(read.success);
    assert!(read.cut);
    assert!(!read.complete);
    assert!(read.lines < 5000);
    assert_eq!(read.kept.lines().count(), 10);
}
