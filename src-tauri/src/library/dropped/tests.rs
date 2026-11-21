use super::*;
use crate::library::fixture_folder::{
    fixture_with_vault, import_offered, plant_file, take_drop_turn,
};
use crate::library::import_destination::ImportDestination;
use crate::library::source_import::{import_sources, ImportControl};
use std::fs;
use std::path::PathBuf;

#[test]
fn a_dropped_folder_copies_only_documents_and_counts_what_it_skipped() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("drop-folder");
    let dropped = fixture.join("contracts");
    for (name, bytes) in [
        (".env", 200),
        ("id_rsa", 400),
        ("LICENSE.txt", 900),
        ("node_modules/x.md", 300),
        (".DS_Store", 300),
        ("lease.pdf", 500),
        ("notes/renewal.md", 300),
    ] {
        plant_file(&dropped.join(name), bytes);
    }

    let offer = offer_dropped_paths(std::slice::from_ref(&dropped));
    let mut landing: Vec<&str> = offer
        .files
        .iter()
        .map(|f| f.relative_path.as_str())
        .collect();
    landing.sort();
    assert_eq!(
        landing,
        vec!["contracts/lease.pdf", "contracts/notes/renewal.md"]
    );
    let mut skipped: Vec<(&str, SkipReason)> = offer
        .skipped
        .iter()
        .map(|s| (s.relative_path.as_str(), s.reason))
        .collect();
    skipped.sort_by_key(|(path, _)| *path);
    assert_eq!(
        skipped,
        vec![
            ("contracts/.env", SkipReason::SecretName),
            ("contracts/LICENSE.txt", SkipReason::Licence),
            ("contracts/id_rsa", SkipReason::SecretName),
        ]
    );
    assert_eq!(offer.total_bytes, 800);

    let keys = offer.files.iter().map(|f| f.path.clone()).collect();
    let results = import_sources(
        &vault,
        keys,
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert!(
        results.iter().all(|row| row.status == "added"),
        "{results:?}"
    );
    let vault = PathBuf::from(&vault);
    assert!(vault.join("sources/contracts/lease.pdf").is_file());
    assert!(vault.join("sources/contracts/notes/renewal.md").is_file());
    assert!(!vault.join("sources/contracts/LICENSE.txt").exists());
    fs::remove_dir_all(fixture).unwrap();
}

/// Windows paths come back with `\`; what lands under `sources/` is `/`-joined everywhere.
#[test]
fn a_dropped_folder_records_landing_paths_with_forward_slashes() {
    let _turn = take_drop_turn();
    let (fixture, _vault) = fixture_with_vault("drop-slashes");
    let dropped = fixture.join("meetings");
    plant_file(&dropped.join("2026").join("weekly.txt"), 300);
    let offer = offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.files.len(), 1);
    assert_eq!(offer.files[0].relative_path, "meetings/2026/weekly.txt");
    fs::remove_dir_all(fixture).unwrap();
}

/// Dropping one file is the person's explicit choice, so its format is not judged.
#[test]
fn a_single_dropped_file_is_offered_whatever_its_format() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("drop-file");
    let photo = fixture.join("whiteboard.png");
    plant_file(&photo, 30);
    let offer = offer_dropped_paths(std::slice::from_ref(&photo));
    assert_eq!(offer.files.len(), 1);
    assert_eq!(offer.files[0].relative_path, "whiteboard.png");
    let results = import_sources(
        &vault,
        vec![offer.files[0].path.clone()],
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(
        results[0].relative_path.as_deref(),
        Some("sources/whiteboard.png")
    );
    fs::remove_dir_all(fixture).unwrap();
}

/// A new drop withdraws the last one, so an old drop's paths stop being importable.
#[test]
fn a_new_drop_withdraws_the_previous_drops_offers() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("drop-withdraw");
    let first = fixture.join("first.pdf");
    let second = fixture.join("second.pdf");
    plant_file(&first, 100);
    plant_file(&second, 100);
    let earlier = offer_dropped_paths(std::slice::from_ref(&first));
    offer_dropped_paths(std::slice::from_ref(&second));
    let results = import_sources(
        &vault,
        vec![earlier.files[0].path.clone()],
        ImportDestination::Sources,
        &ImportControl::default(),
    )
    .unwrap();
    assert_eq!(results[0].reason.as_deref(), Some("source-not-offered"));
    fs::remove_dir_all(fixture).unwrap();
}

#[cfg(unix)]
#[test]
fn a_dropped_folder_never_follows_a_link_out_of_it() {
    let _turn = take_drop_turn();
    let (fixture, _vault) = fixture_with_vault("drop-link");
    let outside = fixture.join("outside");
    plant_file(&outside.join("private.pdf"), 300);
    let dropped = fixture.join("shared");
    plant_file(&dropped.join("agenda.pdf"), 300);
    std::os::unix::fs::symlink(&outside, dropped.join("linked")).unwrap();
    std::os::unix::fs::symlink(outside.join("private.pdf"), dropped.join("alias.pdf")).unwrap();
    let offer = offer_dropped_paths(std::slice::from_ref(&dropped));
    let landing: Vec<&str> = offer
        .files
        .iter()
        .map(|f| f.relative_path.as_str())
        .collect();
    assert_eq!(landing, vec!["shared/agenda.pdf"]);

    let linked_root = fixture.join("linked-root");
    std::os::unix::fs::symlink(&outside, &linked_root).unwrap();
    let refused = offer_dropped_paths(std::slice::from_ref(&linked_root));
    assert!(refused.files.is_empty());
    assert_eq!(refused.skipped.len(), 1);
    fs::remove_dir_all(fixture).unwrap();
}

/// `sources/` is read by agents and may be pushed, so even a deliberate drop of a key is held back.
#[test]
fn a_single_dropped_file_named_like_a_secret_is_skipped() {
    let _turn = take_drop_turn();
    let (fixture, _vault) = fixture_with_vault("drop-secret");
    let key = fixture.join("id_rsa");
    plant_file(&key, 400);
    let offer = offer_dropped_paths(std::slice::from_ref(&key));
    assert!(offer.files.is_empty());
    assert_eq!(offer.skipped[0].reason, SkipReason::SecretName);
    assert_eq!(offer.skipped_counts.secret_name, 1);
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn a_dropped_folder_that_is_or_holds_the_open_folder_is_refused_whole() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("drop-vault");
    let vault_path = PathBuf::from(&vault);
    plant_file(&vault_path.join("notes/plan.pdf"), 400);
    plant_file(&fixture.join("elsewhere/plan.pdf"), 400);
    let _scope = crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&vault_path));
    for dropped in [fixture.clone(), vault_path.clone()] {
        let offer = offer_dropped_paths(std::slice::from_ref(&dropped));
        assert!(offer.files.is_empty(), "{dropped:?}");
        assert_eq!(offer.holds_open_folder.len(), 1, "{dropped:?}");
    }
    let inside = offer_dropped_paths(&[vault_path.join("notes")]);
    assert_eq!(inside.files.len(), 1);
    let beside = offer_dropped_paths(&[fixture.join("elsewhere")]);
    assert_eq!(beside.files.len(), 1);
    assert!(beside.holds_open_folder.is_empty());
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn a_dropped_folder_names_a_thousand_skipped_files_and_counts_every_one() {
    let _turn = take_drop_turn();
    let (fixture, _vault) = fixture_with_vault("drop-skip-cap");
    let dropped = fixture.join("keys");
    fs::create_dir_all(&dropped).unwrap();
    for index in 0..1_005 {
        fs::write(dropped.join(format!("secret-{index}.txt")), [b'x'; 80]).unwrap();
    }
    let offer = offer_dropped_paths(std::slice::from_ref(&dropped));
    assert_eq!(offer.skipped.len(), 1_000);
    assert_eq!(offer.skipped_counts.secret_name, 1_005);
    fs::remove_dir_all(fixture).unwrap();
}

/// A slow walk of an earlier drop must not replace, or reach the page after, a newer one.
#[test]
fn only_the_newest_drop_remembers_its_offers() {
    let _turn = take_drop_turn();
    let (fixture, vault) = fixture_with_vault("drop-race");
    let older = fixture.join("older.pdf");
    let newer = fixture.join("newer.pdf");
    plant_file(&older, 200);
    plant_file(&newer, 200);
    arm_source_drop(true);
    let first = begin_armed_drop().unwrap();
    let second = begin_armed_drop().unwrap();
    arm_source_drop(false);
    let published = offer_drop(second, std::slice::from_ref(&newer), |offer| offer);
    assert!(published.is_some());
    assert!(offer_drop(first, std::slice::from_ref(&older), |offer| offer).is_none());
    let results = import_offered(&vault, vec![older.to_string_lossy().into_owned()]);
    assert_eq!(results[0].reason.as_deref(), Some("source-not-offered"));
    let results = import_offered(&vault, vec![newer.to_string_lossy().into_owned()]);
    assert_eq!(results[0].status, "added");
    fs::remove_dir_all(fixture).unwrap();
}

/// A reload never runs the stage's cleanup, so loading a page disarms the drop.
#[test]
fn a_drop_after_the_page_reloads_walks_nothing() {
    let _turn = take_drop_turn();
    arm_source_drop(true);
    disarm_source_drop();
    assert_eq!(begin_armed_drop(), None);
}
