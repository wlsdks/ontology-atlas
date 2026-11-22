use super::*;
use crate::library::fixture_folder::fixture_with_vault;
use std::fs;
use std::path::PathBuf;

#[test]
fn stop_reaches_only_a_running_import() {
    assert!(!stop_source_import("never-started".into()));
}

#[test]
fn a_second_copy_into_the_same_folder_waits_for_the_first() {
    let (fixture, vault) = fixture_with_vault("one-copy");
    let first = ImportingFolder::claim(PathBuf::from(&vault)).unwrap();
    assert!(ImportingFolder::claim(PathBuf::from(&vault)).is_none());
    drop(first);
    assert!(ImportingFolder::claim(PathBuf::from(&vault)).is_some());
    fs::remove_dir_all(fixture).unwrap();
}
