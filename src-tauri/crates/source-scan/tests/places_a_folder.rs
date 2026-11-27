//! Where a folder lies inside its repository, from the real paths of both.

#![allow(
    clippy::disallowed_methods,
    reason = "these tests plant the folders a vault lives in"
)]

mod support;

use std::path::Path;

use source_scan::{place_folder, FolderPlacementError};
use support::Scratch;

#[cfg(unix)]
#[test]
fn a_folder_reached_through_a_link_is_placed_by_where_it_really_is_whatever_it_is_called() {
    let scratch = Scratch::new("placement-link");
    let top = scratch.path().join("top");
    for name in [
        "docs/ontology",
        "docs/ ontology",
        " notes",
        "-drafts",
        "a b/-c",
    ] {
        std::fs::create_dir_all(top.join(name)).expect("a vault folder");
    }
    std::os::unix::fs::symlink(&top, scratch.path().join("alias")).expect("link");

    for (reached, placed) in [
        ("alias/docs/ontology", "docs/ontology"),
        ("alias/docs/ ontology", "docs/ ontology"),
        ("alias/ notes", " notes"),
        ("alias/-drafts", "-drafts"),
        ("alias/a b/-c", "a b/-c"),
        ("alias", "."),
    ] {
        let found = place_folder(&top, &scratch.path().join(reached)).expect(reached);
        assert_eq!(found.path.as_str(), placed, "{reached}");
        assert_eq!(
            found.real,
            std::fs::canonicalize(top.join(placed)).expect("real"),
            "{reached}: the real path is what an answer says"
        );
    }
}

#[cfg(unix)]
#[test]
fn a_folder_outside_the_top_or_with_a_name_git_cannot_be_asked_about_is_not_placed() {
    use std::os::unix::ffi::OsStrExt;

    let scratch = Scratch::new("placement-refused");
    let top = scratch.path().join("top");
    let inside = top.join("vault");
    std::fs::create_dir_all(&inside).expect("vault");
    let sibling = scratch.path().join("top-sibling");
    std::fs::create_dir_all(&sibling).expect("sibling");

    assert!(matches!(
        place_folder(&inside, &top),
        Err(FolderPlacementError::Outside { .. })
    ));
    assert!(
        matches!(
            place_folder(&top, &sibling),
            Err(FolderPlacementError::Outside { .. })
        ),
        "a folder whose name starts with the top's name is not below it"
    );

    // Names that are not text, or that hold a line break, cannot go in a question to git. macOS
    // refuses to create a name that is not valid UTF-8, so only Linux can plant that one.
    let mut odd_names = vec![std::ffi::OsString::from("two\nlines")];
    if cfg!(target_os = "linux") {
        odd_names.push(std::ffi::OsStr::from_bytes(b"not-\xff-text").to_os_string());
    }
    for name in odd_names {
        let folder = top.join(&name);
        std::fs::create_dir_all(&folder).expect("a folder with an odd name");
        assert!(
            matches!(
                place_folder(&top, &folder),
                Err(FolderPlacementError::NotAskable { .. })
            ),
            "{name:?}"
        );
    }
}

/// NTFS stores a name's case and finds it without regard to it (Microsoft, "Case Sensitivity" in
/// the file-name documentation), and `git rev-parse --show-toplevel` prints the drive letter as
/// the process folder spelled it, so the two paths may differ only in case.
#[cfg(windows)]
#[test]
fn a_windows_folder_is_placed_without_regard_to_case_and_with_forward_slashes() {
    let top = Path::new("C:\\Users\\me\\Repo");
    let found = place_folder(top, Path::new("c:\\users\\me\\repo\\docs\\ontology"))
        .expect("the same folder in other letters");
    assert_eq!(found.path.as_str(), "docs/ontology");
    assert!(matches!(
        place_folder(top, Path::new("C:\\Users\\me\\Repository")),
        Err(FolderPlacementError::Outside { .. })
    ));
}

#[test]
fn a_folder_that_is_the_top_is_the_root() {
    let scratch = Scratch::new("placement-root");
    let found = place_folder(scratch.path(), Path::new(scratch.path())).expect("the top itself");
    assert_eq!(found.path.as_str(), ".");
}
