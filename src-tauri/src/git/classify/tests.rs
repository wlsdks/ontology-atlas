use super::*;

#[test]
fn classify_git_error_detects_non_fast_forward() {
    let info = classify_git_error("! [rejected] main -> main (non-fast-forward)", "push");
    assert_eq!(info.code, "push-non-fast-forward");
    assert!(info.guidance.as_deref() == Some("git pull"));
}

#[test]
fn classify_git_error_detects_hook_rejection() {
    let info = classify_git_error("pre-commit hook failed", "commit");
    assert_eq!(info.code, "pre-commit-hook");
}

#[test]
fn classify_git_error_commit_fallback() {
    let info = classify_git_error("something weird happened", "commit");
    assert_eq!(info.code, "commit-rejected");
}
