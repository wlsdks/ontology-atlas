//! `find_orphans` over a planted vault: the nodes nothing points at, where a short reference that
//! several nodes share counts for each of them, and what a kind, a domain or an exclusion removes.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests plant the files of a temporary vault, which the search then reads"
)]

use std::fs;

use confined_files::VaultRoot;
use vault_document::{find_orphans, DocumentCache, LoadedVault, OrphanFilter, ReferenceIndex};

fn orphans(files: &[(&str, String)], filter: &OrphanFilter<'_>) -> Vec<(String, usize)> {
    let directory = tempfile::tempdir().expect("temp dir");
    let root = VaultRoot::open(directory.path()).expect("vault");
    for (name, text) in files {
        let path = root.path().join(name);
        fs::create_dir_all(path.parent().expect("a folder")).expect("folder");
        fs::write(path, text).expect("file");
    }
    let loaded = LoadedVault::load(&root, &DocumentCache::new()).expect("load");
    let index = ReferenceIndex::new(loaded.documents());
    let mut found: Vec<(String, usize)> = find_orphans(loaded.documents(), &index, filter)
        .into_iter()
        .map(|orphan| (orphan.slug.to_string(), orphan.out_degree))
        .collect();
    found.sort();
    found
}

fn node(kind: &str, domain: &str, relations: &str) -> String {
    format!("---\nkind: {kind}\ntitle: T\ndomain: {domain}\n{relations}---\nbody\n")
}

#[test]
fn a_short_reference_two_nodes_share_counts_for_both_and_a_node_nothing_names_is_an_orphan() {
    let files = [
        ("capabilities/refund.md", node("capability", "d/one", "")),
        ("elements/refund.md", node("element", "d/two", "")),
        (
            "caller.md",
            node("capability", "d/one", "capabilities:\n  - refund\n"),
        ),
        ("lonely.md", node("capability", "d/one", "")),
    ];
    let found = orphans(&files, &OrphanFilter::default());
    assert_eq!(
        found,
        vec![("caller".to_string(), 2), ("lonely".to_string(), 0)],
        "refund is a short reference both nodes named refund answer to"
    );
}

#[test]
fn the_project_and_the_readme_are_left_out_unless_a_kind_or_an_exclusion_says_otherwise() {
    let files = [
        ("shop.md", node("project", "d/one", "")),
        (
            "README.md",
            "---\nkind: vault-readme\ntitle: R\n---\nx\n".to_string(),
        ),
        ("cap.md", node("capability", "d/one", "")),
    ];
    let slugs = |filter: &OrphanFilter<'_>| -> Vec<String> {
        orphans(&files, filter)
            .into_iter()
            .map(|(slug, _)| slug)
            .collect()
    };
    assert_eq!(slugs(&OrphanFilter::default()), ["cap"]);
    assert_eq!(
        slugs(&OrphanFilter {
            kind: Some("project"),
            ..OrphanFilter::default()
        }),
        ["shop"],
        "a kind that is asked for is not excluded"
    );
    assert_eq!(
        slugs(&OrphanFilter {
            excluded_kinds: Some(&[]),
            ..OrphanFilter::default()
        }),
        ["README", "cap", "shop"]
    );
    assert_eq!(
        slugs(&OrphanFilter {
            domain: Some("d/two"),
            ..OrphanFilter::default()
        }),
        Vec::<String>::new()
    );
}
