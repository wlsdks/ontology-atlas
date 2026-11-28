//! `search_evidence` over a planted vault: what ranks where, what a Unicode form does not change,
//! and that a query of thousands of words or a body the query is absent from costs no error.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests plant the files of a temporary vault, which the search then reads"
)]

use std::fs;

use confined_files::VaultRoot;
use vault_document::{search_evidence, DocumentCache, EvidenceQuery, LoadedVault, MatchedIn};

struct Vault {
    _directory: tempfile::TempDir,
    loaded: LoadedVault,
}

fn vault(files: &[(&str, &str)]) -> Vault {
    let directory = tempfile::tempdir().expect("temp dir");
    let root = VaultRoot::open(directory.path()).expect("vault");
    for (name, text) in files {
        fs::write(root.path().join(name), text).expect("file");
    }
    let loaded = LoadedVault::load(&root, &DocumentCache::new()).expect("load");
    Vault {
        _directory: directory,
        loaded,
    }
}

fn node(title: &str, body: &str) -> String {
    format!("---\nkind: capability\ntitle: {title}\n---\n{body}\n")
}

fn found(vault: &Vault, query: &str, nodes_only: bool) -> Vec<(String, MatchedIn, f64)> {
    let query = EvidenceQuery::new(query).expect("a query");
    search_evidence(vault.loaded.documents(), &query, nodes_only)
        .expect("search")
        .into_iter()
        .map(|hit| (hit.document.slug().to_string(), hit.matched_in, hit.score))
        .collect()
}

#[test]
fn an_exact_title_outranks_a_prefix_a_substring_a_reference_and_a_body() {
    let vault = vault(&[
        ("exact.md", &node("Cart", "x")),
        ("prefix.md", &node("Cart Totals", "x")),
        ("inner.md", &node("Shopping Cart Totals", "x")),
        (
            "reference.md",
            "---\nkind: capability\ntitle: Pay\ncapabilities:\n  - Cart\n---\nx\n",
        ),
        ("body.md", &node("Other", "mentions the cart here")),
        ("note.md", "just a note about the cart\n"),
        ("absent.md", &node("Other", "nothing")),
    ]);
    let order: Vec<String> = found(&vault, "cart", false)
        .into_iter()
        .map(|(slug, ..)| slug)
        .collect();
    assert_eq!(
        order,
        ["exact", "prefix", "inner", "reference", "body", "note"]
    );
    let nodes: Vec<String> = found(&vault, "cart", true)
        .into_iter()
        .map(|(slug, ..)| slug)
        .collect();
    assert_eq!(nodes, ["exact", "prefix", "inner", "reference", "body"]);
}

#[test]
fn composed_and_decomposed_text_find_each_other_in_a_title_and_a_body() {
    let composed = "\u{c8fc}\u{bb38} \u{cde8}\u{c18c}";
    let decomposed = "\u{110c}\u{116e}\u{1106}\u{116e}\u{11ab} \u{110e}\u{1171}\u{1109}\u{1169}";
    let vault = vault(&[
        ("title.md", &node(decomposed, "x")),
        ("body.md", &node("Other", &format!("see {decomposed} here"))),
    ]);
    let hits = found(&vault, composed, false);
    assert_eq!(hits.len(), 2, "{hits:?}");
    assert_eq!(hits[0].1, MatchedIn::Frontmatter);
    assert_eq!(hits[1].1, MatchedIn::Body);
    assert_eq!(found(&vault, decomposed, false).len(), 2);
}

/// The search of a loaded vault, as its error: a file the vault no longer holds fails here.
fn search_result(vault: &Vault, query: &str) -> Result<Vec<String>, vault_document::FileReadError> {
    let query = EvidenceQuery::new(query).expect("a query");
    search_evidence(vault.loaded.documents(), &query, false).map(|hits| {
        hits.into_iter()
            .map(|hit| hit.document.slug().to_string())
            .collect()
    })
}

#[test]
fn a_body_is_not_searched_again_for_text_a_first_search_showed_absent() {
    let vault = vault(&[("a.md", &node("A", &"word ".repeat(10_000)))]);
    assert_eq!(search_result(&vault, "needle in a haystack"), Ok(vec![]));
    // The file is gone: a search that opened it again would fail, so one that answers did not.
    fs::remove_file(vault._directory.path().join("a.md")).expect("remove");
    assert_eq!(search_result(&vault, "needle in a haystack"), Ok(vec![]));
    // Another text the fingerprint of the body rules out is answered without the file as well.
    assert_eq!(search_result(&vault, "zzzqqq xxyyzz"), Ok(vec![]));
    // A text the fingerprint cannot rule out needs the body, and the body is no longer there.
    assert!(matches!(
        search_result(&vault, "word word"),
        Err(vault_document::FileReadError::Unreadable { .. }
            | vault_document::FileReadError::Changed { .. })
    ));
}

#[test]
fn a_matching_search_repeated_after_the_file_was_replaced_answers_as_the_first_did() {
    let vault = vault(&[("a.md", &node("A", &"word ".repeat(10_000)))]);
    assert_eq!(
        search_result(&vault, "word word"),
        Ok(vec!["a".to_string()])
    );
    fs::write(
        vault._directory.path().join("a.md"),
        node("A", "nothing of the first version is left"),
    )
    .expect("replace");
    // The loaded vault is the version of its read: the remembered answer stands for it, and a
    // new call of the tool loads the vault again.
    assert_eq!(
        search_result(&vault, "word word"),
        Ok(vec!["a".to_string()])
    );
}

#[test]
fn a_query_of_thousands_of_words_matches_only_a_body_that_holds_all_of_it() {
    let long = (0..5_000)
        .map(|i| format!("term{i}"))
        .collect::<Vec<_>>()
        .join(" ");
    let vault = vault(&[
        ("holds.md", &node("Holds", &format!("start {long} end"))),
        ("lacks.md", &node("Lacks", "term1 term2")),
    ]);
    let hits = found(&vault, &long, false);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].0, "holds");
    assert!(EvidenceQuery::new("   ").is_none());
}
