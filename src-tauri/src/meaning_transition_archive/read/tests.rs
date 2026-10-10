use super::*;
use crate::meaning_transition_archive::tests::{fixture, identity};
use std::fs;

#[cfg(unix)]
#[test]
fn replaced_same_path_vault_and_symlink_members_are_rejected() {
    use std::os::unix::fs::symlink;
    let (root, name, _body, _artifact) = fixture();
    let id = identity(&root);
    let moved = root.with_extension("old");
    fs::rename(&root, &moved).unwrap();
    fs::create_dir(&root).unwrap();
    assert!(read_meaning_transition_record_text(
        root.to_string_lossy().into_owned(),
        id,
        name.clone()
    )
    .is_err());
    let replacement_id = identity(&root);
    fs::create_dir_all(root.join(DIRECTORY)).unwrap();
    fs::write(root.join("outside"), "x").unwrap();
    symlink(root.join("outside"), root.join(DIRECTORY).join(name)).unwrap();
    assert!(read_meaning_transition_record_text(
        root.to_string_lossy().into_owned(),
        replacement_id,
        "2026-09-14T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md".into()
    )
    .is_err());
    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(moved).unwrap();
}
