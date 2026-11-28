//! Which bodies a search opens. A body read for a search is refused once its file has changed, so
//! a search still answered after the change opened no file. Alone in its own test program: the
//! memo knows a search by the needle asked last in the process, and a test running beside it would
//! ask others.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "this test plants the file of a temporary vault and changes it under the search"
)]

use std::fs;

use confined_files::VaultRoot;
use vault_document::{search_evidence, DocumentCache, EvidenceQuery, LoadedVault};

#[test]
fn a_repeated_search_and_one_for_absent_text_open_no_file() {
    let directory = tempfile::tempdir().expect("temp dir");
    let root = VaultRoot::open(directory.path()).expect("vault");
    let file = root.path().join("a.md");
    let body = "word ".repeat(1_000);
    fs::write(
        &file,
        format!("---\nkind: capability\ntitle: A\n---\n{body}\n"),
    )
    .expect("file");
    let loaded = LoadedVault::load(&root, &DocumentCache::new()).expect("load");
    let search = |text: &str| {
        let query = EvidenceQuery::new(text).expect("a query");
        search_evidence(loaded.documents(), &query, false).map(|hits| hits.len())
    };
    assert_eq!(search("word word"), Ok(1));
    fs::write(
        &file,
        "---\nkind: capability\ntitle: A\n---\nsomething else\n",
    )
    .expect("change");
    assert_eq!(
        search("word word"),
        Ok(1),
        "the memo answers the same search"
    );
    assert_eq!(
        search("needle in a haystack"),
        Ok(0),
        "the fingerprint answers for text the body lacks"
    );
    assert!(
        search("word word word").is_err(),
        "a search only the body can answer reads it, and finds it changed"
    );
}
