use crate::library::dropped;
use crate::library::fixture_folder::{
    fixture_with_vault, import_offered, offer_as_picked, plant_file, take_drop_turn,
};
#[cfg(unix)]
use crate::library::import_destination::ImportDestination;
use crate::library::import_destination::SOURCES_DIR;
use crate::library::source_import::import_source_files;
#[cfg(unix)]
use crate::library::source_import::{import_sources, ImportControl};
#[cfg(unix)]
use crate::library::source_offer::{remember_source_offer, SourceOffer};
use std::fs;
use std::path::PathBuf;

#[test]
fn the_same_offered_file_ticked_twice_reports_one_add_and_one_duplicate() {
    let root = std::env::temp_dir().join(format!("atlas-twice-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let picked = root.join("once.pdf");
    fs::write(&picked, b"%PDF-1.7 once\n").unwrap();

    let offered = offer_as_picked(&picked);
    let results = import_source_files(root_path, vec![offered.clone(), offered], None).unwrap();
    assert_eq!(results[0].status, "added");
    assert_eq!(results[1].status, "duplicate");
    assert_eq!(
        results[1].relative_path.as_deref(),
        Some("sources/once.pdf")
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn an_offered_file_that_has_since_gone_missing_says_so() {
    let root = std::env::temp_dir().join(format!("atlas-gone-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let root_path = fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let picked = root.join("gone.pdf");
    fs::write(&picked, b"%PDF-1.7 gone\n").unwrap();

    let offered = offer_as_picked(&picked);
    fs::remove_file(&picked).unwrap();
    let results = import_source_files(root_path, vec![offered], None).unwrap();
    assert_eq!(results[0].status, "failed");
    assert_eq!(results[0].reason.as_deref(), Some("source-missing"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn exhausted_source_names_preserve_originals_and_the_last_free_slot_still_works() {
    for occupied in [999, 998] {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let fixture = std::env::temp_dir().join(format!(
            "atlas-source-name-limit-{}-{nonce}-{occupied}",
            std::process::id()
        ));
        let vault = fixture.join("vault");
        let sources = vault.join(SOURCES_DIR);
        fs::create_dir_all(&sources).unwrap();
        for index in 1..=occupied {
            let name = if index == 1 {
                "source.txt".to_string()
            } else {
                format!("source ({index}).txt")
            };
            fs::write(sources.join(name), b"preserved original").unwrap();
        }
        let picked = fixture.join("source.txt");
        fs::write(&picked, b"new selected original").unwrap();
        let offered = offer_as_picked(&picked);
        let outcome =
            import_source_files(vault.to_string_lossy().into_owned(), vec![offered], None).unwrap();
        for index in 1..=occupied {
            let name = if index == 1 {
                "source.txt".to_string()
            } else {
                format!("source ({index}).txt")
            };
            assert_eq!(fs::read(sources.join(name)).unwrap(), b"preserved original");
        }
        if occupied == 999 {
            assert_eq!(outcome[0].status, "failed");
            assert_eq!(outcome[0].relative_path, None);
            assert_eq!(fs::read_dir(&sources).unwrap().count(), 999);
        } else {
            assert_eq!(outcome[0].status, "renamed");
            assert_eq!(
                outcome[0].relative_path.as_deref(),
                Some("sources/source (999).txt")
            );
            assert_eq!(
                fs::read(sources.join("source (999).txt")).unwrap(),
                b"new selected original"
            );
        }
        fs::remove_dir_all(fixture).unwrap();
    }
}

#[cfg(unix)]
#[test]
fn a_linked_folder_inside_sources_is_refused_not_followed() {
    let (fixture, vault) = fixture_with_vault("linked-sub");
    let outside = fixture.join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(PathBuf::from(&vault).join("sources")).unwrap();
    std::os::unix::fs::symlink(&outside, PathBuf::from(&vault).join("sources/meetings")).unwrap();
    let original = fixture.join("weekly.pdf");
    plant_file(&original, 200);
    let key = format!("linked-sub-{}", fixture.display());
    remember_source_offer(
        key.clone(),
        SourceOffer::of_file(
            fs::canonicalize(&original).unwrap(),
            "meetings/weekly.pdf".into(),
        )
        .unwrap(),
    );
    let results = import_sources(
        &vault,
        vec![key],
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(
        results[0].reason.as_deref(),
        Some("import-destination-not-a-folder")
    );
    assert!(!outside.join("weekly.pdf").exists());
    fs::remove_dir_all(fixture).unwrap();
}

/// On a case-insensitive disk `Meetings/weekly.md` is `meetings/weekly.md`; it must not be replaced.
#[test]
fn a_copy_never_replaces_a_source_in_a_folder_named_in_another_case() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("case-folder");
    let vault_path = PathBuf::from(&vault);
    let existing = vault_path.join("sources/meetings/weekly.md");
    plant_file(&existing, 300);
    let before = fs::read(&existing).unwrap();
    let dropped = fixture.join("Meetings");
    fs::create_dir_all(&dropped).unwrap();
    fs::write(dropped.join("weekly.md"), [b'n'; 300]).unwrap();
    let offer = dropped::offer_dropped_paths(std::slice::from_ref(&dropped));
    let results = import_offered(&vault, vec![offer.files[0].path.clone()]);
    assert_eq!(results[0].status, "renamed", "{results:?}");
    assert_eq!(
        results[0].relative_path.as_deref(),
        Some("sources/meetings/weekly (2).md")
    );
    assert_eq!(fs::read(&existing).unwrap(), before);
    let folders: Vec<String> = fs::read_dir(vault_path.join("sources"))
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(folders, vec!["meetings"]);
    fs::remove_dir_all(fixture).unwrap();
}
