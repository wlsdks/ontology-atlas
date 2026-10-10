use super::*;

#[test]
fn a_redirected_or_dangerous_toplevel_is_not_a_trustworthy_repo_root() {
    let base = std::env::temp_dir().join(format!("atlas-toplevel-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let repo = base.join("repo");
    fs::create_dir_all(repo.join(".git")).unwrap();
    let plain = base.join("redirect-target");
    fs::create_dir_all(&plain).unwrap();

    assert!(repo_toplevel_is_trustworthy(
        &fs::canonicalize(&repo).unwrap()
    ));
    assert!(
        !repo_toplevel_is_trustworthy(&fs::canonicalize(&plain).unwrap()),
        "a core.worktree redirect target holds no .git of its own"
    );
    assert!(
        !repo_toplevel_is_trustworthy(Path::new("/")),
        "the filesystem root is refused even if it held a .git"
    );
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn vault_pathspec_returns_dot_when_vault_is_repo_root() {
    let root = Path::new("/repo");
    assert_eq!(vault_pathspec(root, Path::new("/repo")), ".");
}

#[test]
fn vault_pathspec_returns_relative_when_vault_nested() {
    let root = Path::new("/repo");
    assert_eq!(
        vault_pathspec(root, Path::new("/repo/docs/ontology")),
        "docs/ontology"
    );
}
