//! The survey cache asks Git what changed: a changed file makes a new survey, an untouched
//! repository keeps the old one, and the names Git prints are matched with the names on disk.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests start git and plant the files a repository holds"
)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use confined_files::{DiskSource, ScanRoots, SourceRoot};
use repository_survey::{Survey, SurveyAsked, SurveyCache, SurveyFiles};

const NULL_DEVICE: &str = if cfg!(windows) { "NUL" } else { "/dev/null" };

fn git(folder: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "protocol.file.allow=always",
        ])
        .args(args)
        .current_dir(folder)
        .env("GIT_CONFIG_GLOBAL", NULL_DEVICE)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn commit_all(folder: &Path) {
    git(folder, &["add", "--all"]);
    git(folder, &["commit", "-q", "-m", "change"]);
}

fn plant(folder: &Path, name: &str, text: &str) {
    let path = folder.join(name);
    std::fs::create_dir_all(path.parent().expect("parent")).expect("folder");
    std::fs::write(path, text).expect("file");
}

fn repository() -> (tempfile::TempDir, PathBuf) {
    let base = tempfile::tempdir().expect("temp dir");
    let top = std::fs::canonicalize(base.path()).expect("real").join("top");
    std::fs::create_dir_all(&top).expect("top");
    git(&top, &["init", "-q", "-b", "main"]);
    (base, top)
}

fn asked() -> SurveyAsked {
    SurveyAsked {
        label: "repo".to_string(),
        ignore: Vec::new(),
        vault_exclusion: None,
    }
}

fn root_of(folder: &Path) -> SourceRoot {
    ScanRoots::new(folder.to_path_buf(), folder.to_path_buf())
        .expect("roots")
        .allow(folder, "rootPath")
        .expect("allowed")
}

fn survey_asked(cache: &SurveyCache, folder: &Path, asked: &SurveyAsked) -> Arc<Survey> {
    let root = root_of(folder);
    let source = DiskSource::new(&root, 1024 * 1024);
    cache.survey(&root, &SurveyFiles::new(&source), asked)
}

fn survey_of(cache: &SurveyCache, folder: &Path) -> Arc<Survey> {
    survey_asked(cache, folder, &asked())
}

fn lines_of(survey: &Survey, path: &str) -> Option<usize> {
    survey
        .collection
        .files
        .iter()
        .find(|file| file.path == path)
        .map(|file| file.lines)
}

const ONE_LINE: &str = "export function a() {}\n";
const TWO_LINES: &str = "export function a() {}\nexport function more() {}\n";

#[test]
fn an_untouched_repository_keeps_its_survey_and_a_rewritten_tracked_file_replaces_it() {
    let (_base, top) = repository();
    plant(&top, "src/a.ts", ONE_LINE);
    commit_all(&top);
    let cache = SurveyCache::default();

    let first = survey_of(&cache, &top);
    assert!(Arc::ptr_eq(&first, &survey_of(&cache, &top)));

    plant(&top, "src/a.ts", TWO_LINES);
    let second = survey_of(&cache, &top);
    assert!(!Arc::ptr_eq(&first, &second));
    assert_eq!(lines_of(&second, "src/a.ts"), Some(2));
}

#[test]
fn a_folder_below_the_top_ignores_changes_beside_it_and_sees_those_inside_it() {
    let (_base, top) = repository();
    plant(&top, "package/src/a.ts", ONE_LINE);
    plant(&top, "other/b.ts", ONE_LINE);
    commit_all(&top);
    let cache = SurveyCache::default();
    let package = top.join("package");

    let first = survey_of(&cache, &package);
    plant(&top, "other/b.ts", TWO_LINES);
    assert!(
        Arc::ptr_eq(&first, &survey_of(&cache, &package)),
        "a file outside the surveyed folder is not what the survey read"
    );

    plant(&top, "package/src/a.ts", TWO_LINES);
    let second = survey_of(&cache, &package);
    assert_eq!(lines_of(&second, "src/a.ts"), Some(2));
}

#[test]
fn a_new_untracked_file_and_a_staged_rename_are_seen() {
    let (_base, top) = repository();
    plant(&top, "src/a.ts", ONE_LINE);
    commit_all(&top);
    let cache = SurveyCache::default();
    let first = survey_of(&cache, &top);

    plant(&top, "src/new.ts", ONE_LINE);
    let second = survey_of(&cache, &top);
    assert_eq!(lines_of(&second, "src/new.ts"), Some(1));

    git(&top, &["mv", "src/a.ts", "src/renamed.ts"]);
    let third = survey_of(&cache, &top);
    assert!(!Arc::ptr_eq(&second, &third));
    assert_eq!(lines_of(&third, "src/a.ts"), None);
    assert_eq!(lines_of(&third, "src/renamed.ts"), Some(1));
    assert_eq!(lines_of(&first, "src/new.ts"), None);
}

/// A name Git prints precomposed while the disk keeps it decomposed (macOS keeps what was
/// written and Git precomposes it); the same text in two forms must be one file.
const DECOMPOSED_FOLDER: &str = "cafe\u{301}-package";
const DECOMPOSED_FILE: &str = "cafe\u{301}.ts";
const PRECOMPOSED_FILE: &str = "caf\u{e9}.ts";

#[test]
fn a_package_folder_stored_decomposed_still_sees_its_own_changes() {
    let (_base, top) = repository();
    plant(&top, &format!("{DECOMPOSED_FOLDER}/src/a.ts"), ONE_LINE);
    commit_all(&top);
    let cache = SurveyCache::default();
    let package = top.join(DECOMPOSED_FOLDER);

    let first = survey_of(&cache, &package);
    plant(&top, &format!("{DECOMPOSED_FOLDER}/src/a.ts"), TWO_LINES);
    let second = survey_of(&cache, &package);
    assert_eq!(lines_of(&first, "src/a.ts"), Some(1));
    assert_eq!(lines_of(&second, "src/a.ts"), Some(2));
}

#[test]
fn a_file_stored_decomposed_is_read_again_after_it_changes() {
    let (_base, top) = repository();
    plant(&top, &format!("src/{DECOMPOSED_FILE}"), ONE_LINE);
    commit_all(&top);
    let cache = SurveyCache::default();

    let first = survey_of(&cache, &top);
    plant(&top, &format!("src/{DECOMPOSED_FILE}"), TWO_LINES);
    let second = survey_of(&cache, &top);
    let precomposed = format!("src/{PRECOMPOSED_FILE}");
    assert_eq!(lines_of(&first, &precomposed), Some(1));
    assert_eq!(lines_of(&second, &precomposed), Some(2));
}

#[test]
fn a_file_inside_a_repository_nested_in_this_one_is_read_again_after_it_changes() {
    let (_base, top) = repository();
    plant(&top, "src/a.ts", ONE_LINE);
    commit_all(&top);
    let nested = top.join("vendor/lib");
    plant(&nested, "x.ts", ONE_LINE);
    std::fs::create_dir_all(&nested).expect("nested");
    git(&nested, &["init", "-q", "-b", "main"]);
    commit_all(&nested);
    let cache = SurveyCache::default();

    let first = survey_of(&cache, &top);
    assert_eq!(lines_of(&first, "vendor/lib/x.ts"), Some(1));
    plant(&nested, "x.ts", TWO_LINES);
    let second = survey_of(&cache, &top);
    assert_eq!(lines_of(&second, "vendor/lib/x.ts"), Some(2));
}

#[test]
fn a_file_inside_a_recorded_submodule_is_read_again_after_it_changes() {
    let (_base, top) = repository();
    plant(&top, "src/a.ts", ONE_LINE);
    let nested = top.join("vendor/lib");
    plant(&nested, "x.ts", ONE_LINE);
    git(&nested, &["init", "-q", "-b", "main"]);
    commit_all(&nested);
    commit_all(&top);
    let cache = SurveyCache::default();

    let first = survey_of(&cache, &top);
    assert_eq!(lines_of(&first, "vendor/lib/x.ts"), Some(1));
    plant(&nested, "x.ts", TWO_LINES);
    let second = survey_of(&cache, &top);
    assert_eq!(lines_of(&second, "vendor/lib/x.ts"), Some(2));
}

#[test]
fn a_write_inside_the_vault_folder_does_not_replace_the_survey() {
    let (_base, top) = repository();
    plant(&top, "src/a.ts", ONE_LINE);
    plant(&top, "docs/ontology/domains/billing.md", "# Billing\n");
    commit_all(&top);
    let cache = SurveyCache::default();
    let asked = SurveyAsked {
        vault_exclusion: Some("docs/ontology".to_string()),
        ..asked()
    };

    let first = survey_asked(&cache, &top, &asked);
    plant(&top, "docs/ontology/domains/billing.md", "# Billing, rewritten\n");
    plant(&top, "docs/ontology/capabilities/refund.md", "# Refund\n");
    assert!(
        Arc::ptr_eq(&first, &survey_asked(&cache, &top, &asked)),
        "the survey does not read the vault, so writing it changes nothing the survey read"
    );

    plant(&top, "src/a.ts", TWO_LINES);
    assert!(!Arc::ptr_eq(&first, &survey_asked(&cache, &top, &asked)));
}

#[test]
fn a_folder_that_becomes_a_repository_stops_counting_what_its_ignore_file_hides() {
    let base = tempfile::tempdir().expect("temp dir");
    let folder = std::fs::canonicalize(base.path()).expect("real").join("project");
    plant(&folder, "src/a.ts", ONE_LINE);
    plant(&folder, "gen/generated.ts", ONE_LINE);
    let cache = SurveyCache::default();

    let before = survey_of(&cache, &folder);
    assert_eq!(lines_of(&before, "gen/generated.ts"), Some(1));

    git(&folder, &["init", "-q", "-b", "main"]);
    plant(&folder, ".gitignore", "gen/\n");
    let after = survey_of(&cache, &folder);
    assert_eq!(lines_of(&after, "src/a.ts"), Some(1));
    assert_eq!(lines_of(&after, "gen/generated.ts"), None);
}

#[test]
fn an_ignore_file_above_the_surveyed_folder_changes_what_it_counts() {
    let (_base, top) = repository();
    plant(&top, "package/src/a.ts", ONE_LINE);
    commit_all(&top);
    plant(&top, "package/gen/g.ts", ONE_LINE);
    let cache = SurveyCache::default();
    let package = top.join("package");

    let before = survey_of(&cache, &package);
    assert_eq!(lines_of(&before, "gen/g.ts"), Some(1));
    plant(&top, ".gitignore", "gen/\n");
    let after = survey_of(&cache, &package);
    assert_eq!(lines_of(&after, "gen/g.ts"), None);
    assert_eq!(lines_of(&after, "src/a.ts"), Some(1));
}

#[test]
fn a_package_folder_named_with_pattern_characters_is_asked_about_literally() {
    let (_base, top) = repository();
    plant(&top, "pkg[1]*/src/a.ts", ONE_LINE);
    plant(&top, "pkg1x/src/a.ts", ONE_LINE);
    commit_all(&top);
    let cache = SurveyCache::default();
    let package = top.join("pkg[1]*");

    let first = survey_of(&cache, &package);
    plant(&top, "pkg[1]*/src/a.ts", TWO_LINES);
    let second = survey_of(&cache, &package);
    assert_eq!(lines_of(&first, "src/a.ts"), Some(1));
    assert_eq!(lines_of(&second, "src/a.ts"), Some(2));
}
