use super::*;
use crate::git::test_support::Scratch;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// An empty result here would draw every step as outside the concepts, silently.
#[test]
fn history_change_entry_reads_status_code_and_path() {
    let repo = PathBuf::from("/repo");
    let vault = PathBuf::from("/repo/docs");
    let added = history_change_entry(
        "A\tdocs/elements/foo.md",
        &repo,
        &vault,
        &mut HashMap::new(),
    )
    .unwrap();
    assert_eq!(added.status, "added");
    assert_eq!(added.path, "docs/elements/foo.md");
    assert_eq!(added.slug, "elements/foo");
    assert_eq!(added.kind, None);

    assert_eq!(
        history_change_entry("D\tdocs/gone.md", &repo, &vault, &mut HashMap::new())
            .unwrap()
            .status,
        "deleted"
    );
    assert_eq!(
        history_change_entry("M\tdocs/x.md", &repo, &vault, &mut HashMap::new())
            .unwrap()
            .status,
        "modified"
    );
    assert_eq!(
        history_change_entry("R100\tdocs/y.md", &repo, &vault, &mut HashMap::new())
            .unwrap()
            .status,
        "renamed"
    );
}

#[test]
fn history_change_entry_rejects_lines_without_a_tab() {
    let repo = PathBuf::from("/repo");
    let vault = PathBuf::from("/repo/docs");
    assert!(history_change_entry("", &repo, &vault, &mut HashMap::new()).is_none());
    assert!(history_change_entry("no tab here", &repo, &vault, &mut HashMap::new()).is_none());
    assert!(history_change_entry("M\t", &repo, &vault, &mut HashMap::new()).is_none());
}

#[test]
fn history_rows_of_one_path_reuse_the_first_read() {
    let dir = std::env::temp_dir().join(format!("atlas-git-rows-{}", std::process::id()));
    let _ = fs::create_dir_all(dir.join("docs"));
    fs::write(dir.join("docs/a.md"), "---\nkind: capability\n---\n").unwrap();
    let vault = dir.join("docs");
    let mut kinds = HashMap::new();
    let first = history_change_entry("M\tdocs/a.md", &dir, &vault, &mut kinds).unwrap();
    fs::write(dir.join("docs/a.md"), "---\nkind: element\n---\n").unwrap();
    let second = history_change_entry("A\tdocs/a.md", &dir, &vault, &mut kinds).unwrap();
    assert_eq!(first.kind.as_deref(), Some("capability"));
    assert_eq!(
        second.kind, first.kind,
        "the second row must not open the file again"
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn the_file_list_alone_carries_no_patch() {
    let scratch = Scratch::new("diff-list");
    fs::write(scratch.work.join("one.md"), "changed\n").unwrap();

    let list = git_diff(scratch.vault(), Some(false)).unwrap();
    assert_eq!(list.files.len(), 1);
    assert!(list.diff.is_empty());

    let full = git_diff(scratch.vault(), None).unwrap();
    assert!(full.diff.contains("+changed"));
}

#[test]
fn a_tree_diff_past_the_cap_is_dropped_whole_and_says_so() {
    let small = diff_result(Vec::new(), "+small\n".to_string());
    assert_eq!((small.diff.as_str(), small.too_large), ("+small\n", false));
    let huge = diff_result(Vec::new(), "+line\n".repeat(MAX_TREE_DIFF_BYTES / 6 + 1));
    assert_eq!((huge.diff.as_str(), huge.too_large), ("", true));
}
