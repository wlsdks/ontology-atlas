use super::*;
use crate::git::remote::git_set_remote;
use crate::git::status::git_status;
use crate::git::test_support::Scratch;
use std::fs;

#[test]
fn push_only_does_not_record_an_unseen_change() {
    for kind in ["untracked", "modified", "deleted", "staged"] {
        let scratch = Scratch::new(&format!("push-unseen-{kind}"));
        scratch.add_origin();
        scratch.git(&["push", "-q", "-u", "origin", "main"]);
        assert!(scratch.git(&["status", "--porcelain"]).is_empty());
        let before = scratch.git(&["rev-parse", "HEAD"]);
        match kind {
            "untracked" => fs::write(scratch.work.join("unseen.md"), "unreviewed").unwrap(),
            "modified" | "staged" => fs::write(scratch.work.join("one.md"), "unreviewed").unwrap(),
            "deleted" => fs::remove_file(scratch.work.join("one.md")).unwrap(),
            _ => unreachable!(),
        }
        if kind == "staged" {
            scratch.git(&["add", "one.md"]);
        }
        let dirty = scratch.git(&["status", "--porcelain"]);
        let error = git_push_only(
            scratch.vault(),
            "main".into(),
            before.clone(),
            Some("origin/main".into()),
            false,
        )
        .unwrap_err();
        assert_eq!(error, "push-folder-changed");
        assert_eq!(scratch.git(&["status", "--porcelain"]), dirty);
        assert_eq!(scratch.git(&["rev-parse", "HEAD"]), before);
        assert_eq!(scratch.origin_main(), Some(before));
    }
}

#[test]
fn push_only_refuses_a_changed_branch_or_head() {
    let scratch = Scratch::new("push-stale-ref");
    scratch.add_origin();
    scratch.git(&["push", "-q", "-u", "origin", "main"]);
    let shown = scratch.git(&["rev-parse", "HEAD"]);
    scratch.git(&["checkout", "-qb", "another"]);
    assert_eq!(
        git_push_only(
            scratch.vault(),
            "main".into(),
            shown.clone(),
            Some("origin/main".into()),
            false
        )
        .unwrap_err(),
        "push-state-changed"
    );
    scratch.git(&["checkout", "-q", "main"]);
    scratch.commit("next.md", "next");
    assert_eq!(
        git_push_only(
            scratch.vault(),
            "main".into(),
            shown.clone(),
            Some("origin/main".into()),
            false
        )
        .unwrap_err(),
        "push-state-changed"
    );
    assert_eq!(scratch.origin_main(), Some(shown));
}

#[test]
fn push_only_ignores_matching_refspec_and_follow_tags_configuration() {
    let scratch = Scratch::new("push-isolated-ref");
    scratch.add_origin();
    scratch.git(&["push", "-q", "-u", "origin", "main"]);
    scratch.git(&["checkout", "-qb", "other"]);
    scratch.commit("other.md", "other");
    scratch.git(&["push", "-q", "origin", "other"]);
    scratch.commit("other-next.md", "other-next");
    let other_before = scratch.git(&["rev-parse", "refs/remotes/origin/other"]);
    scratch.git(&["checkout", "-q", "main"]);
    scratch.commit("next.md", "next");
    scratch.git(&["tag", "-a", "unrelated", "-m", "tag"]);
    scratch.git(&["config", "push.default", "matching"]);
    scratch.git(&["config", "push.followTags", "true"]);
    scratch.git(&["config", "push.pushOption", "unexpected-data"]);
    scratch.git(&["config", "push.recurseSubmodules", "on-demand"]);
    scratch.git(&["config", "remote.origin.push", "+refs/heads/*:refs/heads/*"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = git_push_only(
        scratch.vault(),
        "main".into(),
        head.clone(),
        Some("origin/main".into()),
        false,
    )
    .unwrap();
    assert!(result.pushed);
    assert_eq!(scratch.origin_main(), Some(head));
    let refs = scratch.git(&["ls-remote", "origin"]);
    assert!(refs.contains(&format!("{other_before}\trefs/heads/other")));
    assert!(!refs.contains("refs/tags/unrelated"));
}

#[test]
fn push_only_first_send_sets_upstream_after_sending() {
    let scratch = Scratch::new("push-only-first");
    scratch.add_origin();
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = git_push_only(scratch.vault(), "main".into(), head.clone(), None, true).unwrap();
    assert!(result.pushed && result.upstream_set);
    assert_eq!(scratch.origin_main(), Some(head));
    assert_eq!(
        git_status(scratch.vault()).unwrap().upstream.as_deref(),
        Some("origin/main")
    );
}

#[test]
fn push_only_does_not_replace_an_unfetched_configured_upstream() {
    let scratch = Scratch::new("push-unfetched-upstream");
    scratch.add_origin();
    scratch.git(&["config", "branch.main.remote", "other"]);
    scratch.git(&["config", "branch.main.merge", "refs/heads/main"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    assert_eq!(git_status(scratch.vault()).unwrap().upstream, None);
    let result = git_push_only(scratch.vault(), "main".into(), head, None, true);
    assert_eq!(result.unwrap_err(), "push-existing-upstream");
    assert_eq!(scratch.origin_main(), None);
    assert_eq!(scratch.git(&["config", "branch.main.remote"]), "other");
}

#[test]
fn push_only_refuses_multiple_push_urls_before_any_destination_changes() {
    let scratch = Scratch::new("push-multiple-destinations");
    scratch.add_origin();
    scratch.git(&["push", "-q", "-u", "origin", "main"]);
    let before = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("next.md", "next");
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let original_url = scratch.git(&["remote", "get-url", "origin"]);
    scratch.git(&[
        "remote",
        "set-url",
        "--add",
        "--push",
        "origin",
        &original_url,
    ]);
    scratch.git(&[
        "remote",
        "set-url",
        "--add",
        "--push",
        "origin",
        "/nonexistent/atlas-second-remote.git",
    ]);
    let result = git_push_only(
        scratch.vault(),
        "main".into(),
        head.clone(),
        Some("origin/main".into()),
        false,
    );
    assert_eq!(result.unwrap_err(), "push-multiple-destinations");
    assert_eq!(scratch.origin_main(), Some(before));
    assert_eq!(scratch.git(&["rev-parse", "HEAD"]), head);
}

#[test]
fn push_only_refuses_repository_commands_before_contacting_the_remote() {
    for key in [
        "core.sshCommand",
        "core.gitProxy",
        "credential.helper",
        "remote.origin.receivepack",
    ] {
        let scratch = Scratch::new(&format!("push-local-command-{key}"));
        scratch.add_origin();
        scratch.git(&["push", "-q", "-u", "origin", "main"]);
        let before = scratch.git(&["rev-parse", "HEAD"]);
        scratch.commit("next.md", "next");
        let head = scratch.git(&["rev-parse", "HEAD"]);
        let marker = scratch.work.join("command-ran");
        let script = scratch.work.join(".git/marker.sh");
        fs::write(
            &script,
            format!("#!/bin/sh\ntouch '{}'\nexit 1\n", marker.display()),
        )
        .unwrap();
        let command = if key == "credential.helper" {
            format!("!sh {}", script.display())
        } else {
            format!("sh {}", script.display())
        };
        scratch.git(&["config", "--local", key, &command]);
        match key {
            "core.sshCommand" => {
                scratch.git(&[
                    "remote",
                    "set-url",
                    "origin",
                    "ssh://example.invalid/repo.git",
                ]);
            }
            "core.gitProxy" => {
                scratch.git(&[
                    "remote",
                    "set-url",
                    "origin",
                    "git://example.invalid/repo.git",
                ]);
            }
            "credential.helper" => {
                scratch.git(&[
                    "remote",
                    "set-url",
                    "origin",
                    "https://example.invalid/repo.git",
                ]);
            }
            _ => {}
        }
        let result = git_push_only(
            scratch.vault(),
            "main".into(),
            head,
            Some("origin/main".into()),
            false,
        );
        assert_eq!(result.unwrap_err(), "push-local-command-config");
        assert!(!marker.exists());
        assert_eq!(scratch.origin_main(), Some(before));
    }
}

#[test]
fn push_only_refuses_commands_from_repository_config_includes() {
    let scratch = Scratch::new("push-local-command-include");
    scratch.add_origin();
    scratch.git(&["push", "-q", "-u", "origin", "main"]);
    let before = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("next.md", "next");
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let marker = scratch.work.join("command-ran");
    let include = scratch.work.join(".git").join("atlas-test.conf");
    fs::write(
        &include,
        format!("[core]\n\tsshCommand = touch {}\n", marker.display()),
    )
    .unwrap();
    scratch.git(&["config", "--local", "include.path", "atlas-test.conf"]);
    scratch.git(&[
        "remote",
        "set-url",
        "origin",
        "ssh://example.invalid/repo.git",
    ]);
    let result = git_push_only(
        scratch.vault(),
        "main".into(),
        head,
        Some("origin/main".into()),
        false,
    );
    assert_eq!(result.unwrap_err(), "push-local-command-config");
    assert!(!marker.exists());
    assert_eq!(scratch.origin_main(), Some(before));
}

#[cfg(unix)]
#[test]
fn push_only_refuses_repository_remote_helper_path() {
    use std::os::unix::fs::PermissionsExt;
    let scratch = Scratch::new("push-local-remote-helper");
    scratch.add_origin();
    scratch.git(&["push", "-q", "-u", "origin", "main"]);
    let before = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("next.md", "next");
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let marker = scratch.work.join("command-ran");
    let helper_dir = scratch.work.join("git-remote-..");
    fs::create_dir(&helper_dir).unwrap();
    let helper = helper_dir.join("pwn");
    fs::write(
        &helper,
        format!("#!/bin/sh\ntouch '{}'\n", marker.display()),
    )
    .unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(scratch.work.join(".git/info/exclude"), "git-remote-..\n").unwrap();
    scratch.git(&["config", "remote.origin.vcs", "../pwn"]);
    let result = git_push_only(
        scratch.vault(),
        "main".into(),
        head,
        Some("origin/main".into()),
        false,
    );
    assert_eq!(result.unwrap_err(), "push-local-command-config");
    assert!(!marker.exists());
    assert_eq!(scratch.origin_main(), Some(before));
}

#[test]
fn push_only_refuses_detached_head_and_preserves_remote_on_failure() {
    let scratch = Scratch::new("push-only-detached-offline");
    scratch.add_origin();
    scratch.git(&["push", "-q", "-u", "origin", "main"]);
    let before = scratch.git(&["rev-parse", "HEAD"]);
    scratch.git(&["checkout", "-q", "--detach"]);
    assert_eq!(
        git_push_only(
            scratch.vault(),
            "main".into(),
            before.clone(),
            Some("origin/main".into()),
            false
        )
        .unwrap_err(),
        "push-state-changed"
    );
    scratch.git(&["checkout", "-q", "main"]);
    scratch.commit("next.md", "next");
    scratch.git(&[
        "remote",
        "set-url",
        "origin",
        "/nonexistent/atlas-test-remote.git",
    ]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let result = git_push_only(
        scratch.vault(),
        "main".into(),
        head.clone(),
        Some("origin/main".into()),
        false,
    )
    .unwrap();
    assert!(!result.pushed);
    assert!(result.message.is_some());
    assert_eq!(scratch.git(&["rev-parse", "HEAD"]), head);
    assert_eq!(scratch.origin_main(), Some(before));
}

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
