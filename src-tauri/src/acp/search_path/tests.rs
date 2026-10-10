use super::*;
use crate::acp::test_support::scratch;

#[cfg(unix)]
#[test]
fn a_vault_or_repo_bin_never_reaches_the_adapter_path() {
    let base = scratch("adapter-path");
    let repo = base.join("repo");
    let vault = repo.join("atlas");
    std::fs::create_dir_all(vault.join("node_modules/.bin")).unwrap();
    std::fs::create_dir_all(repo.join("node_modules/.bin")).unwrap();
    let repo = std::fs::canonicalize(&repo).unwrap();
    let vault = std::fs::canonicalize(&vault).unwrap();

    let path_env = std::env::join_paths([
        vault.join("node_modules/.bin"),
        repo.join("node_modules/.bin"),
        PathBuf::from("node_modules/.bin"),
        PathBuf::from("relative/tool/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/opt/other/node_modules/.bin"),
    ])
    .unwrap()
    .to_string_lossy()
    .into_owned();

    let cleaned = path_without_vault_node_modules_bin(&path_env, &vault, Some(&repo));
    let entries: Vec<PathBuf> = std::env::split_paths(&OsString::from(cleaned)).collect();

    assert!(!entries.iter().any(|entry| entry.starts_with(&vault)));
    assert!(!entries.iter().any(|entry| entry.starts_with(&repo)));
    assert!(!entries.iter().any(|entry| entry.is_relative()));
    assert!(entries.contains(&PathBuf::from("/opt/homebrew/bin")));
    assert!(entries.contains(&PathBuf::from("/usr/bin")));
    assert!(entries.contains(&PathBuf::from("/opt/other/node_modules/.bin")));

    let _ = std::fs::remove_dir_all(&base);
}

#[cfg(unix)]
#[test]
fn the_process_path_sanitizer_drops_empty_and_relative_entries() {
    let cleaned = sanitized_process_path(OsStr::new(
        "/usr/bin::relative/bin:node_modules/.bin:/opt/homebrew/bin",
    ));
    let entries: Vec<PathBuf> = std::env::split_paths(&cleaned).collect();
    assert_eq!(
        entries,
        vec![
            PathBuf::from("/usr/bin"),
            PathBuf::from("/opt/homebrew/bin")
        ]
    );
}
