//! A survey is kept until the repository changes, and a changed file is what changes it.

#![allow(
    clippy::disallowed_methods,
    reason = "a test plants and rewrites the files a survey reads, which the crate never writes"
)]

use std::sync::Arc;

use confined_files::{DiskSource, ScanRoots};
use repository_survey::{SurveyAsked, SurveyCache, SurveyFiles};

fn line_count_of(survey: &repository_survey::Survey, path: &str) -> Option<usize> {
    survey
        .collection
        .files
        .iter()
        .find(|file| file.path == path)
        .map(|file| file.lines)
}

#[test]
fn an_unchanged_folder_returns_the_same_survey_and_a_rewritten_file_makes_a_new_one() {
    let base = tempfile::tempdir().expect("temp dir");
    let real = std::fs::canonicalize(base.path()).expect("real");
    std::fs::create_dir_all(real.join("src")).expect("folder");
    std::fs::write(real.join("src/a.ts"), "export function a() {}\n").expect("a");
    std::fs::write(real.join("src/b.ts"), "export function b() {}\n").expect("b");
    let root = ScanRoots::new(real.clone(), real.clone())
        .expect("roots")
        .allow(&real, "rootPath")
        .expect("allowed");
    let source = DiskSource::new(&root, 1024 * 1024);
    let files = SurveyFiles::new(&source);
    let asked = SurveyAsked {
        label: "repo".to_string(),
        ignore: Vec::new(),
        vault_exclusion: None,
    };
    let cache = SurveyCache::default();

    let first = cache.survey(&root, &files, &asked);
    let second = cache.survey(&root, &files, &asked);
    assert!(Arc::ptr_eq(&first, &second), "nothing changed, nothing is read again");

    std::fs::write(
        real.join("src/a.ts"),
        "export function a() {}\nexport function more() {}\n",
    )
    .expect("rewrite a");
    let third = cache.survey(&root, &files, &asked);
    assert!(!Arc::ptr_eq(&first, &third));
    assert_eq!(line_count_of(&first, "src/a.ts"), Some(1));
    assert_eq!(line_count_of(&third, "src/a.ts"), Some(2));
    assert_eq!(line_count_of(&third, "src/b.ts"), Some(1));
}
