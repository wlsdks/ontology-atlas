//! What a call keeps of the files it read, and what makes it read them again. Each case plants a
//! vault, calls `LoadedVault::load` and changes the disk between calls.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests plant and change the files of a temporary vault, which the reads then see"
)]

use std::fs;
use std::thread::sleep;
use std::time::Duration;

use confined_files::VaultRoot;
use vault_document::{DocumentCache, FileReadError, LoadedVault};

/// Longer than the cache's racy window, so a file written before it counts as settled.
const PAST_THE_RACY_WINDOW: Duration = Duration::from_millis(2_300);

struct Vault {
    _directory: tempfile::TempDir,
    root: VaultRoot,
}

fn vault(files: &[(&str, &str)]) -> Vault {
    let directory = tempfile::tempdir().expect("temp dir");
    let root = VaultRoot::open(directory.path()).expect("vault");
    for (name, text) in files {
        fs::write(root.path().join(name), text).expect("file");
    }
    Vault {
        root,
        _directory: directory,
    }
}

fn titles(vault: &LoadedVault) -> Vec<String> {
    vault
        .documents()
        .iter()
        .map(|document| {
            document
                .frontmatter()
                .text("title")
                .unwrap_or_default()
                .to_string()
        })
        .collect()
}

fn note(title: &str) -> String {
    format!("---\nkind: domain\ntitle: {title}\n---\nbody of {title}\n")
}

#[test]
fn a_settled_file_is_kept_without_being_read_and_a_changed_one_is_read_again() {
    let vault = vault(&[("a.md", &note("A")), ("b.md", &note("B"))]);
    let cache = DocumentCache::new();
    let first = LoadedVault::load(&vault.root, &cache).expect("first load");
    assert_eq!(titles(&first), ["A", "B"]);
    assert_eq!(cache.counts().parses, 2);

    // Two calls inside the racy window read the files again and, bytes unchanged, parse nothing.
    LoadedVault::load(&vault.root, &cache).expect("second load");
    assert_eq!(cache.counts().parses, 2);

    sleep(PAST_THE_RACY_WINDOW);
    // This call reads them once more and finds them settled.
    LoadedVault::load(&vault.root, &cache).expect("settling load");
    let reads = cache.counts().reads;
    LoadedVault::load(&vault.root, &cache).expect("kept load");
    assert_eq!(cache.counts().reads, reads, "a settled file is not opened");

    fs::write(vault.root.path().join("a.md"), note("A changed")).expect("edit");
    let after = LoadedVault::load(&vault.root, &cache).expect("load after the edit");
    assert_eq!(titles(&after), ["A changed", "B"]);
    assert_eq!(
        cache.counts().reads,
        reads + 1,
        "only the changed file is read"
    );
    assert_eq!(cache.counts().parses, 3);
}

#[test]
fn a_file_changed_inside_the_racy_window_is_never_served_stale() {
    let vault = vault(&[("a.md", &note("one"))]);
    let cache = DocumentCache::new();
    for round in 0..20 {
        let title = format!("round {round}");
        fs::write(vault.root.path().join("a.md"), note(&title)).expect("edit");
        let loaded = LoadedVault::load(&vault.root, &cache).expect("load");
        assert_eq!(titles(&loaded), [title]);
    }
}

#[test]
fn a_deleted_file_leaves_the_listing_and_a_new_one_joins_it() {
    let vault = vault(&[("a.md", &note("A")), ("b.md", &note("B"))]);
    let cache = DocumentCache::new();
    LoadedVault::load(&vault.root, &cache).expect("first load");
    fs::remove_file(vault.root.path().join("a.md")).expect("delete");
    fs::write(vault.root.path().join("c.md"), note("C")).expect("new");
    let after = LoadedVault::load(&vault.root, &cache).expect("load");
    assert_eq!(titles(&after), ["B", "C"]);
}

#[test]
fn what_a_cached_document_holds_is_what_a_fresh_read_holds() {
    let text = "---\nkind: capability\ntitle: Pay\ndomain: domains/order\n---\n\nSee [[domains/order]] and [cart](../capabilities/cart.md).\n";
    let vault = vault(&[("pay.md", text)]);
    let cache = DocumentCache::new();
    let listed = LoadedVault::load(&vault.root, &cache).expect("load");
    let listed = listed.documents().first().expect("one").clone();
    let named = LoadedVault::read_named(&vault.root, "pay")
        .expect("named")
        .expect("present");
    assert_eq!(listed.slug(), named.slug());
    assert_eq!(listed.issues(), named.issues());
    assert_eq!(listed.modified_ms(), named.modified_ms());
    assert_eq!(listed.body().expect("body"), named.body().expect("body"));
    assert!(listed.links_to("domains/order").expect("asked"));
    assert!(listed.links_to("capabilities/cart").expect("asked"));
    assert!(!listed.links_to("domains").expect("asked"));
}

#[test]
fn a_body_is_not_served_after_its_file_changed() {
    let vault = vault(&[("pay.md", &note("Pay"))]);
    let cache = DocumentCache::new();
    let listed = LoadedVault::load(&vault.root, &cache).expect("load");
    let document = listed.documents().first().expect("one").clone();
    fs::write(vault.root.path().join("pay.md"), note("Pay, edited")).expect("edit");
    let refused = document
        .body()
        .expect_err("the file is another version now");
    assert!(
        matches!(refused, FileReadError::Changed { .. }),
        "{refused}"
    );
}

#[test]
fn a_document_made_for_one_call_reads_its_file_once_and_the_cached_one_reads_it_every_time() {
    let vault = vault(&[("pay.md", &note("Pay"))]);
    let cache = DocumentCache::new();
    let listed = LoadedVault::load(&vault.root, &cache).expect("load");
    let kept = listed.documents().first().expect("one").clone();
    let for_the_call = kept.remembering_its_body();

    let first = for_the_call.body().expect("first read").into_owned();
    fs::remove_file(vault.root.path().join("pay.md")).expect("remove");

    assert_eq!(for_the_call.body().expect("remembered"), first);
    assert_eq!(
        for_the_call.clone().body().expect("a clone shares it"),
        first
    );
    assert!(
        matches!(kept.body(), Err(FileReadError::Changed { .. })),
        "what the cache holds keeps no text, so the next call reads the file as it is then"
    );
}

#[cfg(unix)]
mod unix {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    fn can_read_anything() -> bool {
        // A process that may read a file with no permission bits (root) cannot plant the case.
        let directory = tempfile::tempdir().expect("temp dir");
        let path = directory.path().join("probe");
        fs::write(&path, "x").expect("probe");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).expect("chmod");
        fs::read(&path).is_ok()
    }

    #[test]
    fn a_file_that_cannot_be_read_fails_the_call_and_does_not_vanish() {
        if can_read_anything() {
            return;
        }
        let vault = vault(&[("a.md", &note("A")), ("locked.md", &note("L"))]);
        let locked = vault.root.path().join("locked.md");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).expect("chmod");
        let cache = DocumentCache::new();
        let refused = LoadedVault::load(&vault.root, &cache).expect_err("an unreadable file");
        assert_eq!(
            refused.to_string(),
            "Could not read the file of \"locked\": permission denied (EACCES)"
        );
        let named = LoadedVault::read_named(&vault.root, "locked").expect_err("named");
        assert!(named.to_string().contains("EACCES"), "{named}");
    }

    #[test]
    fn a_pipe_named_like_a_note_is_left_out_and_does_not_hang() {
        let vault = vault(&[("a.md", &note("A"))]);
        let status = std::process::Command::new("mkfifo")
            .arg(vault.root.path().join("pipe.md"))
            .status()
            .expect("run mkfifo");
        assert!(status.success());
        let cache = DocumentCache::new();
        let loaded = LoadedVault::load(&vault.root, &cache).expect("load");
        assert_eq!(titles(&loaded), ["A"]);
    }
}

/// A file another program holds open without sharing it cannot be read: the call fails by the
/// file's name instead of answering as if it were not there. (Windows only; a file cannot be
/// planted that way elsewhere.)
#[cfg(windows)]
#[test]
fn a_file_another_program_holds_locked_fails_the_call() {
    use std::os::windows::fs::OpenOptionsExt;

    let vault = vault(&[("a.md", &note("A")), ("locked.md", &note("L"))]);
    let _held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(vault.root.path().join("locked.md"))
        .expect("hold the file");
    let cache = DocumentCache::new();
    let refused = LoadedVault::load(&vault.root, &cache).expect_err("a locked file");
    assert!(
        matches!(&refused, FileReadError::Unreadable { slug, .. } if slug == "locked"),
        "{refused}"
    );
}
