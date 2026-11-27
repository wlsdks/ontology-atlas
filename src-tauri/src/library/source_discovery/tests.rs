use super::*;
use crate::library::fixture_folder::{
    discovery_cases, fixture_with_vault, plant_file, PLAN_PDF_BYTES,
};
use crate::library::import_destination::ImportDestination;
use crate::library::source_import::{import_source_files, import_sources, ImportControl};
use std::fs;
use std::path::PathBuf;

/// Plants each row as a file of its size and returns what the real walk offers.
fn offered_by_the_walk(label: &str, rows: &[serde_json::Value]) -> Vec<String> {
    let (fixture, vault) = fixture_with_vault(label);
    let project = fixture.join("project");
    for row in rows {
        let file = row["path"]
            .as_str()
            .unwrap()
            .split('/')
            .fold(project.clone(), |path, segment| path.join(segment));
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        let bytes = usize::try_from(row["bytes"].as_u64().unwrap()).unwrap();
        fs::write(&file, vec![b'x'; bytes]).unwrap();
    }
    let project = fs::canonicalize(&project).unwrap();
    let _scope =
        crate::vault::grants::EnforcedScope::granting(&[PathBuf::from(&vault), project.clone()]);
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: project.to_string_lossy().into_owned(),
        label: "project".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    fs::remove_dir_all(fixture).unwrap();
    let mut offered: Vec<String> = report
        .candidates
        .into_iter()
        .map(|candidate| candidate.relative_path)
        .collect();
    offered.sort();
    offered
}

#[test]
fn the_owners_three_junk_files_yield_no_suggestion() {
    let cases = discovery_cases();
    let offered = offered_by_the_walk("owner-report", cases["ownerReport"].as_array().unwrap());
    assert_eq!(offered, Vec::<String>::new());
}

#[test]
fn the_shared_discovery_table_holds_for_the_native_walk() {
    let cases = discovery_cases();
    let rows = cases["files"].as_array().unwrap();
    let mut expected: Vec<String> = rows
        .iter()
        .filter(|row| row["offered"].as_bool().unwrap())
        .map(|row| row["path"].as_str().unwrap().to_string())
        .collect();
    expected.sort();
    assert_eq!(offered_by_the_walk("discovery-table", rows), expected);
}

#[test]
fn a_discovered_candidate_imports_through_the_string_the_page_builds() {
    let base = std::env::temp_dir().join(format!("atlas-disc-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let vault = base.join("vault");
    let project = base.join("project");
    fs::create_dir_all(&vault).unwrap();
    fs::create_dir_all(&project).unwrap();
    fs::write(project.join("plan.pdf"), PLAN_PDF_BYTES).unwrap();
    let root_path = format!("{}/", project.to_string_lossy());
    let vault = fs::canonicalize(&vault).unwrap();
    let project = fs::canonicalize(&project).unwrap();

    let _scope = crate::vault::grants::EnforcedScope::granting(&[vault.clone(), project.clone()]);

    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: root_path.clone(),
        label: "project".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    assert_eq!(report.candidates.len(), 1);
    let candidate = &report.candidates[0];
    assert_eq!(candidate.root_path, root_path);
    let page_string = format!("{}/{}", candidate.root_path, candidate.relative_path);

    let results =
        import_source_files(vault.to_string_lossy().to_string(), vec![page_string], None).unwrap();
    assert_eq!(results[0].status, "added");
    assert!(vault.join("sources/plan.pdf").is_file());
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn discovery_refuses_a_source_root_the_vault_gate_forbids() {
    let base = std::env::temp_dir().join(format!("atlas-badroot-{}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let bundle = base.join("thing.app");
    fs::create_dir_all(&bundle).unwrap();
    fs::write(bundle.join("plan.pdf"), b"%PDF-1.7\n").unwrap();
    let bundle = fs::canonicalize(&bundle).unwrap();

    let _scope = crate::vault::grants::EnforcedScope::granting(std::slice::from_ref(&bundle));

    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: bundle.to_string_lossy().to_string(),
        label: "bundle".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    assert!(report.candidates.is_empty());
    assert_eq!(report.unreadable_roots, vec!["bundle".to_string()]);
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn found_files_keep_their_folders_and_vault_folders_are_never_walked() {
    let (fixture, vault) = fixture_with_vault("keep-folders");
    let vault_path = PathBuf::from(&vault);
    for name in [
        "meetings/weekly.md",
        "contracts/weekly.md",
        "contracts/sub/weekly.md",
        "sources/old.pdf",
        "wiki/page.md",
        "README.md",
    ] {
        plant_file(&vault_path.join(name), 200);
    }
    let _scope = crate::vault::grants::EnforcedScope::granting(std::slice::from_ref(&vault_path));
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: vault.clone(),
        label: "vault".into(),
        skip_relative: Vec::new(),
        open_folder: true,
    }])
    .unwrap();
    let mut found: Vec<String> = report
        .candidates
        .iter()
        .map(|c| c.relative_path.clone())
        .collect();
    found.sort();
    assert_eq!(
        found,
        vec![
            "contracts/sub/weekly.md",
            "contracts/weekly.md",
            "meetings/weekly.md"
        ]
    );
    let keys = report
        .candidates
        .iter()
        .map(|c| format!("{}/{}", c.root_path, c.relative_path))
        .collect();
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
    for landed in [
        "sources/meetings/weekly.md",
        "sources/contracts/weekly.md",
        "sources/contracts/sub/weekly.md",
    ] {
        assert!(vault_path.join(landed).is_file(), "{landed}");
    }
    fs::remove_dir_all(fixture).unwrap();
}

/// A bound code root's Markdown is developer documentation and its HTML a served page,
/// never a suggestion.
#[test]
fn markdown_and_html_are_offered_only_from_the_open_folder() {
    let (fixture, vault) = fixture_with_vault("markdown-roots");
    let project = fixture.join("project");
    plant_file(&project.join("docs/design.md"), 300);
    plant_file(&project.join("docs/design.pdf"), 300);
    plant_file(&project.join("scripts/preview/page.html"), 300);
    plant_file(&project.join("site/index.HTM"), 300);
    let project = fs::canonicalize(&project).unwrap();
    let _scope =
        crate::vault::grants::EnforcedScope::granting(&[PathBuf::from(&vault), project.clone()]);
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: project.to_string_lossy().into_owned(),
        label: "project".into(),
        skip_relative: Vec::new(),
        open_folder: false,
    }])
    .unwrap();
    let found: Vec<&str> = report
        .candidates
        .iter()
        .map(|c| c.relative_path.as_str())
        .collect();
    assert_eq!(found, vec!["docs/design.pdf"]);
    fs::remove_dir_all(fixture).unwrap();
}

#[test]
fn the_open_folders_own_folders_are_skipped_in_any_letter_case() {
    let (fixture, vault) = fixture_with_vault("owned-case");
    let vault_path = PathBuf::from(&vault);
    for name in ["Sources/old.pdf", "WIKI/page.pdf", "notes/plan.pdf"] {
        plant_file(&vault_path.join(name), 200);
    }
    let _scope = crate::vault::grants::EnforcedScope::granting(std::slice::from_ref(&vault_path));
    let report = discover_source_candidates(vec![SourceDiscoveryRoot {
        root_path: vault.clone(),
        label: "vault".into(),
        skip_relative: Vec::new(),
        open_folder: true,
    }])
    .unwrap();
    let found: Vec<&str> = report
        .candidates
        .iter()
        .map(|c| c.relative_path.as_str())
        .collect();
    assert_eq!(found, vec!["notes/plan.pdf"]);
    fs::remove_dir_all(fixture).unwrap();
}
