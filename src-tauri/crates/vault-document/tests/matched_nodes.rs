//! `match_nodes` over a planted vault: one engine, so the nodes with an incoming relation and the
//! nodes without one split the unfiltered match exactly, a short reference that several nodes share
//! counts for each of them, and what a kind, a domain or an exclusion removes.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests plant the files of a temporary vault, which the search then reads"
)]

use std::fs;

use confined_files::VaultRoot;
use vault_document::{
    match_nodes_from_files, DocumentCache, LoadedVault, MatchFilter, ReferenceIndex,
};

/// Slug, in-degree and out-degree of every match, by slug.
fn matches(files: &[(&str, String)], filter: &MatchFilter<'_>) -> Vec<(String, usize, usize)> {
    let directory = tempfile::tempdir().expect("temp dir");
    let root = VaultRoot::open(directory.path()).expect("vault");
    for (name, text) in files {
        let path = root.path().join(name);
        fs::create_dir_all(path.parent().expect("a folder")).expect("folder");
        fs::write(path, text).expect("file");
    }
    let loaded = LoadedVault::load(&root, &DocumentCache::new()).expect("load");
    let index = ReferenceIndex::new(loaded.documents());
    let mut found: Vec<(String, usize, usize)> =
        match_nodes_from_files(loaded.documents(), &index, filter)
            .into_iter()
            .map(|node| (node.slug.to_string(), node.in_degree, node.out_degree))
            .collect();
    found.sort();
    found
}

fn node(kind: &str, domain: &str, relations: &str) -> String {
    format!("---\nkind: {kind}\ntitle: T\ndomain: {domain}\n{relations}---\nbody\n")
}

fn shared_reference_vault() -> [(&'static str, String); 4] {
    [
        ("capabilities/refund.md", node("capability", "d/one", "")),
        ("elements/refund.md", node("element", "d/two", "")),
        (
            "caller.md",
            node("capability", "d/one", "capabilities:\n  - refund\n"),
        ),
        ("lonely.md", node("capability", "d/one", "")),
    ]
}

#[test]
fn a_short_reference_two_nodes_share_counts_for_both_and_degrees_follow_the_written_references() {
    let found = matches(&shared_reference_vault(), &MatchFilter::default());
    assert_eq!(
        found,
        vec![
            ("caller".to_string(), 0, 2),
            ("capabilities/refund".to_string(), 1, 1),
            ("elements/refund".to_string(), 1, 1),
            ("lonely".to_string(), 0, 1),
        ],
        "refund is a reference both nodes named refund answer to; every node writes its domain, and caller one more"
    );
}

#[test]
fn nodes_with_and_without_an_incoming_relation_split_the_unfiltered_match_exactly() {
    let files = shared_reference_vault();
    let with = |wanted: Option<bool>| {
        matches(
            &files,
            &MatchFilter {
                has_incoming: wanted,
                ..MatchFilter::default()
            },
        )
    };
    let mut halves = with(Some(true));
    halves.extend(with(Some(false)));
    halves.sort();
    assert_eq!(halves, with(None));
}

#[test]
fn the_project_and_the_readme_are_left_out_only_when_the_orphans_are_asked_for_without_a_kind() {
    let files = [
        ("shop.md", node("project", "d/one", "")),
        (
            "README.md",
            "---\nkind: vault-readme\ntitle: R\n---\nx\n".to_string(),
        ),
        ("cap.md", node("capability", "d/one", "")),
    ];
    let slugs = |filter: &MatchFilter<'_>| -> Vec<String> {
        matches(&files, filter)
            .into_iter()
            .map(|(slug, _, _)| slug)
            .collect()
    };
    let orphans = MatchFilter {
        has_incoming: Some(false),
        ..MatchFilter::default()
    };
    assert_eq!(slugs(&orphans), ["cap"]);
    assert_eq!(
        slugs(&MatchFilter::default()),
        ["README", "cap", "shop"],
        "an unfiltered match lists every node"
    );
    assert_eq!(
        slugs(&MatchFilter {
            kind: Some("project"),
            ..orphans
        }),
        ["shop"],
        "a kind that is asked for is not excluded"
    );
    assert_eq!(
        slugs(&MatchFilter {
            excluded_kinds: Some(&[]),
            ..orphans
        }),
        ["README", "cap", "shop"]
    );
    assert_eq!(
        slugs(&MatchFilter {
            domain: Some("d/two"),
            ..orphans
        }),
        Vec::<String>::new()
    );
}
