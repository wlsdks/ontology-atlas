//! What the vault says of a few nodes is what it says of them when every node is asked about.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "this test plants the files of a temporary vault, which the read then sees"
)]

use std::fs;

use confined_files::VaultRoot;
use vault_document::{DocumentCache, LoadedVault, ReferenceIndex, VaultIssues};

const FIRST_UID: &str = "11111111-1111-4111-8111-111111111111";
const SECOND_UID: &str = "22222222-2222-4222-8222-222222222222";

#[test]
fn the_findings_about_a_few_slugs_are_those_every_slug_gets() {
    let directory = tempfile::tempdir().expect("temp dir");
    let root = VaultRoot::open(directory.path()).expect("vault");
    let files = [
        // Two claim one `slug:`; two claim one identity, once as primary and once as merged.
        (
            "a.md",
            format!("kind: domain\nslug: shared\nuid: {FIRST_UID}\ndomains: [nowhere]"),
        ),
        (
            "b.md",
            format!("kind: domain\nslug: shared\nuid: {SECOND_UID}"),
        ),
        (
            "c.md",
            format!("kind: domain\nuid: {FIRST_UID}\nmerged_uids: [{SECOND_UID}]"),
        ),
        (
            "d.md",
            format!("kind: domain\nmerged_uids: [{SECOND_UID}, {SECOND_UID}]"),
        ),
        ("e.md", "kind: domain\ndomains: [a, missing]".to_string()),
    ];
    for (name, frontmatter) in &files {
        fs::write(
            root.path().join(name),
            format!("---\n{frontmatter}\n---\nBody.\n"),
        )
        .expect("file");
    }
    let loaded = LoadedVault::load(&root, &DocumentCache::new()).expect("load");
    let documents = loaded.documents();
    let index = ReferenceIndex::new(documents);
    let every = VaultIssues::find(documents, &index, true);
    for asked in [
        vec!["c"],
        vec!["a", "e"],
        vec!["b", "d"],
        vec!["a", "b", "c", "d", "e"],
    ] {
        let about = VaultIssues::about(documents, &index, &asked);
        for slug in ["a", "b", "c", "d", "e"] {
            let expected = if asked.contains(&slug) {
                every.for_slug(slug)
            } else {
                &[]
            };
            assert_eq!(
                about.for_slug(slug),
                expected,
                "{slug} when {asked:?} is asked"
            );
        }
    }
    assert!(
        ["a", "b", "c", "d", "e"]
            .iter()
            .all(|slug| !every.for_slug(slug).is_empty()),
        "each planted file has a finding"
    );
}
