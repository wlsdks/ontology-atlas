use super::*;
use crate::git::test_support::Scratch;
use std::fs;

#[test]
fn a_status_read_leaves_the_index_to_writers() {
    let scratch = Scratch::new("optional-locks");
    let later = std::time::SystemTime::now() + std::time::Duration::from_secs(5);
    fs::File::options()
        .write(true)
        .open(scratch.work.join("one.md"))
        .unwrap()
        .set_modified(later)
        .unwrap();
    let index = scratch.work.join(".git").join("index");
    let before = fs::read(&index).unwrap();

    git_status(scratch.vault()).unwrap();

    assert_eq!(
        fs::read(&index).unwrap(),
        before,
        "a status read refreshed the index, so it held index.lock"
    );
}

#[test]
fn status_tells_no_remote_from_a_branch_never_sent_from_a_detached_head() {
    let scratch = Scratch::new("status");
    let status = git_status(scratch.vault()).unwrap();
    assert!(status.upstream.is_none());
    assert!(!status.has_origin);
    assert!(!status.detached);
    assert_eq!(status.branch.as_deref(), Some("main"));

    // `origin` exists but the branch was never pushed.
    scratch.add_origin();
    let status = git_status(scratch.vault()).unwrap();
    assert!(status.upstream.is_none());
    assert!(status.has_origin);
    assert!(!status.detached);

    let head = scratch.git(&["rev-parse", "--short", "HEAD"]);
    scratch.git(&["checkout", "-q", "--detach"]);
    let status = git_status(scratch.vault()).unwrap();
    assert!(status.detached);
    assert!(status.upstream.is_none());
    assert_eq!(status.head_short_hash.as_deref(), Some(head.as_str()));
}
