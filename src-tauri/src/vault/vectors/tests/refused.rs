//! What the commands refuse: a folder the person did not choose, and arguments no screen offers.

use super::super::commands;
use super::super::search::cut_to_cap;
use super::*;
use crate::llm::embed::MAX_PASSAGE_CHARS;
use crate::vault_grants::EnforcedScope;

fn shown(root: &Path) -> String {
    root.to_string_lossy().into_owned()
}

#[test]
fn every_folder_command_refuses_a_folder_the_person_did_not_choose() {
    let harness = Harness::new();
    let granted = vault("granted", 1);
    let other = vault("not-granted", 1);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&granted));
    let vectors = &harness.vectors;
    for root in [
        shown(&other),
        shown(&granted.join("..").join(other.file_name().unwrap())),
    ] {
        let builtin = VectorSource::Builtin;
        assert!(commands::probe(vectors, &root, None).is_err(), "probe");
        assert!(commands::status(vectors, &root, true, Some(&builtin), false).is_err());
        assert!(commands::status(vectors, &root, true, None, false).is_err());
        assert!(commands::prepare(vectors, &root, true, builtin.clone()).is_err());
        assert!(commands::stop(vectors, &root).is_err(), "stop");
        assert!(commands::search(vectors, &root, &builtin, "sedges", 4).is_err());
        assert!(commands::delete(vectors, &root).is_err(), "delete");
    }
    assert!(harness.model().sent().is_empty());
    assert_eq!(vault_index::vectors::store_model(&other).unwrap(), None);

    let opened = commands::probe(vectors, &shown(&granted), None).unwrap();
    assert_eq!(opened.files, 1);
    assert!(commands::status(vectors, &shown(&granted), true, None, false).is_ok());
    cleanup(&granted);
    cleanup(&other);
}

#[test]
fn a_source_no_screen_offers_is_a_command_error_not_a_state() {
    let harness = Harness::new();
    let root = vault("refused-source", 2);
    let _scope = EnforcedScope::granting(std::slice::from_ref(&root));
    let vectors = &harness.vectors;
    let at = |base_url: &str, model: &str| VectorSource::Runner {
        base_url: base_url.into(),
        model: model.into(),
    };
    let longest = "m".repeat(200 - "runner/".len());
    for (source, code) in [
        (
            at("https://ollama.internal:11434", "bge-m3"),
            "embed-not-local",
        ),
        (at("https://192.0.2.7:11434", "bge-m3"), "embed-not-local"),
        // Plain http off this computer is refused before the host is looked at.
        (
            at("http://192.0.2.7:11434", "bge-m3"),
            "embed-endpoint-invalid",
        ),
        (
            at("ftp://localhost:11434", "bge-m3"),
            "embed-endpoint-invalid",
        ),
        (
            at("http://localhost:11434", "bge m3"),
            "embed-model-invalid",
        ),
        (at("http://localhost:11434", ""), "embed-model-invalid"),
        (
            at("http://localhost:11434", "bge-m3:cloud"),
            "embed-model-remote",
        ),
        (
            at("http://127.0.0.1:11434", &format!("{longest}m")),
            "vectors-model-name-too-long",
        ),
    ] {
        let path = shown(&root);
        let refused = [
            commands::prepare(vectors, &path, true, source.clone()).map(|_| ()),
            commands::status(vectors, &path, true, Some(&source), false).map(|_| ()),
            commands::search(vectors, &path, &source, "sedges", 4).map(|_| ()),
        ];
        for answer in refused {
            assert_eq!(answer, Err(code.to_string()), "{source:?}");
        }
    }
    let entry = entry(&harness, &root);
    assert_eq!(entry.source(), None, "a refused source is never armed");
    assert!(entry.wait_idle(Duration::ZERO));
    // A name at the store's limit, its prefix included, is a name.
    let fits = at("http://127.0.0.1:11434", &longest);
    assert!(commands::status(vectors, &shown(&root), true, Some(&fits), false).is_ok());

    // The probe asks for a runner by the person's setting, which may name another computer:
    // that is a state it answers, and nothing is asked of it.
    let probe = commands::probe(vectors, &shown(&root), Some("http://192.0.2.7:11434")).unwrap();
    assert_eq!(
        probe.runner.map(|runner| runner.state),
        Some(super::super::types::RunnerReach::NotLocal)
    );
    cleanup(&root);
}

#[test]
fn a_question_longer_than_a_passage_is_cut_on_a_character_and_searched() {
    let long = "의미 검색 ".repeat(MAX_PASSAGE_CHARS);
    let cut = cut_to_cap(&long);
    assert_eq!(cut.chars().count(), MAX_PASSAGE_CHARS);
    assert!(long.starts_with(cut));
    assert_eq!(cut_to_cap("short"), "short");

    let harness = Harness::new();
    let root = vault("long-question", 3);
    let entry = entry(&harness, &root);
    prepare_and_wait(&harness, &entry, VectorSource::Builtin);
    let found = harness
        .vectors
        .search(&entry, &VectorSource::Builtin, &long, 3);
    assert_eq!((found.state, found.failure), (FoundState::Ok, None));
    assert!(!found.hits.is_empty());
    cleanup(&root);
}
