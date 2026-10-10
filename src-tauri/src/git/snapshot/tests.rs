use super::*;
use crate::git::remote::git_set_remote;
use crate::git::status::git_status;
use crate::git::test_support::Scratch;
use std::fs;

#[test]
fn a_branch_never_sent_goes_to_origin_only_when_asked_to_set_its_upstream() {
    let scratch = Scratch::new("first-send");
    scratch.add_origin();

    // Push alone does not invent a destination.
    let refused = git_snapshot(scratch.vault(), None, Some(true), None).unwrap();
    let outcome = refused
        .push
        .expect("a push was asked for, so it is answered");
    assert!(!outcome.pushed);
    assert_eq!(outcome.message.as_deref(), Some("push-no-upstream"));
    assert_eq!(scratch.origin_main(), None);

    // `origin/main` becomes the upstream that Push, Pull and Fetch follow.
    let sent = git_snapshot(scratch.vault(), None, Some(true), Some(true)).unwrap();
    assert!(!sent.committed);
    assert!(sent.push.expect("answered").pushed);
    assert_eq!(
        scratch.origin_main(),
        Some(scratch.git(&["rev-parse", "HEAD"]))
    );
    let status = git_status(scratch.vault()).unwrap();
    assert_eq!(status.upstream.as_deref(), Some("origin/main"));
    assert_eq!((status.ahead, status.behind), (Some(0), Some(0)));
}

#[test]
fn push_with_nothing_to_record_still_sends_the_steps_already_made() {
    let scratch = Scratch::new("push-recorded");
    scratch.add_origin();
    scratch.git(&["push", "-q", "-u", "origin", "main"]);
    scratch.commit("two.md", "two");
    assert_eq!(git_status(scratch.vault()).unwrap().ahead, Some(1));

    let result = git_snapshot(scratch.vault(), None, Some(true), None).unwrap();
    assert!(!result.committed);
    assert_eq!(result.reason.as_deref(), Some("no-changes"));
    assert!(result.push.expect("answered").pushed);
    assert_eq!(
        scratch.origin_main(),
        Some(scratch.git(&["rev-parse", "HEAD"]))
    );
}

#[test]
fn a_detached_head_sends_nothing_even_when_asked_to_set_an_upstream() {
    let scratch = Scratch::new("detached");
    scratch.add_origin();
    scratch.git(&["checkout", "-q", "--detach"]);

    let result = git_snapshot(scratch.vault(), None, Some(true), Some(true)).unwrap();
    let outcome = result.push.expect("answered");
    assert!(!outcome.pushed);
    assert_eq!(outcome.message.as_deref(), Some("push-detached-head"));
    assert_eq!(scratch.origin_main(), None);
}

#[test]
fn a_registered_remote_is_told_apart_and_the_first_send_sets_the_upstream() {
    // Registering a remote only stores an address; the screen needs a first push or
    // "Connect a remote" is a dead end.
    let base = std::env::temp_dir().join(format!("atlas-publish-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let dir = base.join("vault");
    let remote = base.join("remote.git");
    fs::create_dir_all(&dir).unwrap();
    let git = |cwd: &Path, args: &[&str]| -> String {
        let out = std::process::Command::new("git")
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
    };
    git(&base, &["init", "-q", "--bare", "remote.git"]);
    git(&dir, &["init", "-q"]);
    git(&dir, &["config", "user.email", "test@example.invalid"]);
    git(&dir, &["config", "user.name", "atlas test"]);
    git(&dir, &["config", "commit.gpgsign", "false"]);
    fs::write(dir.join("orders.md"), "---\nkind: domain\n---\n# Orders\n").unwrap();
    git(&dir, &["add", "orders.md"]);
    git(&dir, &["commit", "-qm", "seed"]);
    let vault = dir.to_string_lossy().into_owned();

    let before = git_status(vault.clone()).unwrap();
    assert!(!before.has_origin, "no remote is registered yet");
    assert!(before.upstream.is_none());

    git_set_remote(vault.clone(), remote.to_string_lossy().into_owned()).unwrap();
    let saved = git_status(vault.clone()).unwrap();
    assert!(saved.has_origin, "a registered origin reads as a remote");
    assert!(
        saved.upstream.is_none(),
        "registering an address sends nothing"
    );

    let plain = git_snapshot(vault.clone(), None, Some(true), None).unwrap();
    let refused = plain.push.expect("a push was asked for");
    assert!(!refused.pushed);
    assert!(refused.message.unwrap().starts_with("push-no-upstream"));

    let first = git_snapshot(vault.clone(), None, Some(true), Some(true)).unwrap();
    assert!(!first.committed);
    let sent = first.push.expect("a push was asked for");
    assert!(sent.pushed, "{:?}", sent.message);
    let after = git_status(vault.clone()).unwrap();
    let branch = after.branch.clone().expect("a branch is checked out");
    assert_eq!(
        after.upstream.as_deref(),
        Some(format!("origin/{branch}").as_str())
    );
    assert_eq!((after.ahead, after.behind), (Some(0), Some(0)));
    assert_eq!(
        git(&remote, &["rev-parse", &format!("refs/heads/{branch}")]),
        git(&dir, &["rev-parse", "HEAD"]),
        "the remote holds the step that was sent"
    );

    git(&dir, &["checkout", "-q", "--detach"]);
    let detached = git_snapshot(vault, None, Some(true), Some(true)).unwrap();
    let refused = detached.push.expect("a push was asked for");
    assert!(!refused.pushed);
    assert!(refused.message.unwrap().starts_with("push-detached-head"));
    let _ = fs::remove_dir_all(&base);
}
