use super::*;
#[cfg(unix)]
use crate::library::fixture_folder::offer_as_picked;
use crate::library::fixture_folder::{fixture_with_vault, plant_file};
#[cfg(unix)]
use crate::library::source_import::import_source_files;
use crate::library::source_import::{import_sources, ImportControl};
use crate::library::source_offer::{remember_source_offer, SourceOffer};
use std::fs;
use std::path::PathBuf;

#[test]
fn source_names_cannot_escape_the_sources_folder() {
    assert_eq!(safe_source_file_name("a.pdf").as_deref(), Some("a.pdf"));
    assert_eq!(safe_source_file_name("../a.pdf"), None);
    assert_eq!(safe_source_file_name("dir/a.pdf"), None);
    assert_eq!(safe_source_file_name("..").as_deref(), None);
    assert_eq!(
        safe_source_file_name(".hidden.pdf").as_deref(),
        Some("hidden.pdf")
    );
}

#[cfg(unix)]
#[test]
fn a_linked_planning_folder_is_not_followed() {
    let (fixture, vault) = fixture_with_vault("planning-link");
    let outside = fixture.join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("known.md"), b"# Known\n").unwrap();
    std::os::unix::fs::symlink(&outside, fixture.join("vault").join("planning")).unwrap();
    fs::write(fixture.join("known.md"), b"# Known\n").unwrap();
    fs::write(fixture.join("fresh.md"), b"# Fresh\n").unwrap();

    let picked = vec![
        offer_as_picked(&fixture.join("known.md")),
        offer_as_picked(&fixture.join("fresh.md")),
    ];
    let refused = import_source_files(vault, picked, Some(ImportDestination::Planning));
    assert_eq!(
        refused.err().as_deref(),
        Some("import-destination-not-a-folder")
    );
    let mut outside_names: Vec<String> = fs::read_dir(&outside)
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    outside_names.sort();
    assert_eq!(outside_names, vec!["known.md".to_string()]);

    fs::remove_file(fixture.join("vault").join("planning")).unwrap();
    let replay = import_source_files(
        fixture.join("vault").to_string_lossy().into_owned(),
        vec![fixture.join("fresh.md").to_string_lossy().into_owned()],
        Some(ImportDestination::Planning),
    )
    .unwrap();
    assert_eq!(replay[0].reason.as_deref(), Some("source-not-offered"));
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn only_the_two_folder_names_parse_as_a_destination() {
    let parse = |value: &str| serde_json::from_value::<ImportDestination>(serde_json::json!(value));
    assert_eq!(parse("sources").unwrap(), ImportDestination::Sources);
    assert_eq!(parse("planning").unwrap(), ImportDestination::Planning);
    for refused in [
        "../outside",
        "/tmp",
        "C:\\Users",
        "Planning",
        "planning/inner",
        "",
    ] {
        assert!(parse(refused).is_err(), "{refused:?} must be refused");
    }
}

/// An offer's recorded path is checked again at import: no segment may climb out.
#[test]
fn an_offered_landing_path_cannot_climb_out_of_sources() {
    let (fixture, vault) = fixture_with_vault("traversal");
    let original = fixture.join("plan.pdf");
    plant_file(&original, 200);
    let canonical = fs::canonicalize(&original).unwrap();
    let mut keys = Vec::new();
    for (index, relative) in [
        "../escape.pdf",
        "a/../../escape.pdf",
        "/abs.pdf",
        "a//b.pdf",
        "..",
    ]
    .into_iter()
    .enumerate()
    {
        let key = format!("traversal-{index}-{}", fixture.display());
        remember_source_offer(
            key.clone(),
            SourceOffer::of_file(canonical.clone(), relative.into()).unwrap(),
        );
        keys.push(key);
    }
    let results = import_sources(
        &vault,
        keys,
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(results.len(), 5);
    for row in &results {
        assert_eq!(row.reason.as_deref(), Some("unusable-file-name"), "{row:?}");
    }
    assert!(!fixture.join("escape.pdf").exists());
    assert!(!PathBuf::from(&vault).join("escape.pdf").exists());
    fs::remove_dir_all(fixture).unwrap();
}
