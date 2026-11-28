//! The numbers `coverage` reports for a repository and a vault: how many abilities the survey
//! lists, and how many a node, a title or a line of the project places, excludes or leaves out.

#![allow(
    clippy::disallowed_methods,
    clippy::indexing_slicing,
    reason = "a test plants the repository and the vault the measure reads"
)]

use std::path::Path;

use build_depth::measure_against_survey;
use confined_files::{DiskSource, ScanRoots, VaultRoot};
use repository_survey::{SurveyAsked, SurveyCache, SurveyFiles};
use source_reads::ReadsUnder;
use vault_document::{DocumentCache, LoadedVault};

fn write(root: &Path, name: &str, text: &str) {
    let file = root.join(name);
    std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
    std::fs::write(file, text).expect("write");
}

const PACKAGE: &str = r#"{ "name": "shop", "bin": { "shop": "src/cli.ts", "admin": "src/admin.ts", "legacy": "src/legacy.ts", "report": "src/report.ts" } }"#;

fn plant_repository(repository: &Path) {
    write(repository, "package.json", PACKAGE);
    for name in ["cli", "admin", "legacy", "report"] {
        write(
            repository,
            &format!("src/{name}.ts"),
            &format!("export function {name}() {{ return 1; }}\n"),
        );
    }
}

fn plant_vault(vault: &Path) {
    write(
        vault,
        "capabilities/place-order.md",
        "---\nkind: capability\ntitle: Place order\npath: src/cli.ts\n---\nRuns `shop`.\n",
    );
    write(
        vault,
        "capabilities/admin.md",
        "---\nkind: capability\ntitle: admin\n---\nThe operator console.\n",
    );
    write(
        vault,
        "projects/shop.md",
        "---\nkind: project\ntitle: Shop\n---\nA shop.\n\n## Uncertainty\n\n- `legacy` (src/legacy.ts:L1) is generated, left out of the product.\n",
    );
}

#[test]
fn an_ability_a_node_names_or_a_line_excludes_is_placed_and_the_rest_is_listed_as_unplaced() {
    let scene = tempfile::tempdir().expect("temp dir");
    let base = scene.path().canonicalize().expect("real");
    let (repository, vault) = (base.join("repo"), base.join("vault"));
    plant_repository(&repository);
    plant_vault(&vault);
    let roots = ScanRoots::new(repository.clone(), repository.clone()).expect("roots");
    let root = roots.allow(&repository, "rootPath").expect("allowed");
    let source = DiskSource::new(&root, 1024 * 1024);
    let files = SurveyFiles::new(&source);
    let asked = SurveyAsked {
        label: "repo".to_string(),
        ignore: Vec::new(),
        vault_exclusion: None,
    };
    let survey = SurveyCache::default().survey(&root, &files, &asked);
    let loaded = LoadedVault::load(
        &VaultRoot::open(&vault).expect("vault root"),
        &DocumentCache::new(),
    )
    .expect("vault");

    let measured =
        measure_against_survey(loaded.documents(), &survey, &ReadsUnder::default(), &source);
    let coverage = serde_json::to_value(measured.coverage.expect("abilities were found").page(0))
        .expect("serializes");
    let abilities = &coverage["abilities"];

    assert_eq!(abilities["surveyed"], 4);
    assert_eq!(
        abilities["onNode"], 1,
        "place-order is at src/cli.ts and names its one ability"
    );
    assert_eq!(
        abilities["named"], 1,
        "admin names the ability by its title"
    );
    assert_eq!(
        abilities["excluded"], 1,
        "one line of the project says why `legacy` is left out"
    );
    assert_eq!(abilities["unplaced"], 1);
    assert_eq!(coverage["unplacedOffset"]["total"], 1);
    assert_eq!(coverage["unplaced"][0]["name"], "report");
    assert_eq!(
        coverage["reads"],
        serde_json::json!({ "capabilities": 1, "read": 0, "unread": 1 }),
        "no body cites lines and nothing was served, so the capability the measure counts is unread"
    );
}
