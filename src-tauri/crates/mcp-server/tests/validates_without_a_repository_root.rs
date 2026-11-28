//! `validate_vault` when the repository root is not on disk says so once and does not list every
//! cited path as drift; with a root that exists, a path that is gone is still a drift row.

#![allow(
    clippy::disallowed_methods,
    clippy::indexing_slicing,
    reason = "these tests plant a vault and read answers by key"
)]

mod support;

use std::path::{Path, PathBuf};

use serde_json::Value;
use support::{call, run_to_end, Program};

fn write(root: &Path, name: &str, text: &str) {
    let file = root.join(name);
    std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
    std::fs::write(file, text).expect("write");
}

fn vault_citing_three_paths() -> (tempfile::TempDir, PathBuf) {
    let scene = tempfile::tempdir().expect("temp dir");
    let root = scene.path().canonicalize().expect("real");
    let vault = root.join("ontology");
    for name in ["order", "refund", "ledger"] {
        write(
            &vault,
            &format!("capabilities/{name}.md"),
            &format!("---\nkind: capability\ntitle: {name}\npath: src/{name}.ts\n---\nBody\n"),
        );
    }
    (scene, root)
}

fn validate(vault: &Path, repo_root: &Path) -> Value {
    let run = run_to_end(
        Program::Rust,
        &[
            ("OATLAS_VAULT", &vault.to_string_lossy()),
            ("OATLAS_REPO_ROOT", &repo_root.to_string_lossy()),
        ],
        call(1, "validate_vault", "{}").as_bytes(),
    );
    let answer: Value = serde_json::from_str(run.lines.first().expect("an answer")).expect("json");
    answer["result"]["structuredContent"].clone()
}

#[test]
fn a_repository_root_that_is_gone_is_said_once_and_no_cited_path_is_called_drift() {
    let (_scene, root) = vault_citing_three_paths();
    let answer = validate(&root.join("ontology"), &root.join("gone"));

    assert_eq!(answer["repoRoot"], serde_json::json!({ "missing": true }));
    assert_eq!(answer["pathDrift"]["checked"], false);
    assert_eq!(answer["pathDrift"]["drifts"], serde_json::json!([]));
    assert_eq!(answer["evidenceDrift"]["checked"], false);
    assert_eq!(answer["evidenceDrift"]["reason"], "repo-root-missing");
    assert!(answer.get("coverage").is_none());
}

#[test]
fn a_root_that_exists_lists_a_gone_path_as_drift_and_says_nothing_of_the_root() {
    let (_scene, root) = vault_citing_three_paths();
    write(&root, "src/order.ts", "export const order = 1;\n");
    let answer = validate(&root.join("ontology"), &root);

    assert!(answer.get("repoRoot").is_none());
    assert_eq!(answer["pathDrift"]["checked"], true);
    let gone: Vec<&str> = answer["pathDrift"]["drifts"]
        .as_array()
        .expect("rows")
        .iter()
        .filter_map(|row| row["missingPath"].as_str())
        .collect();
    assert_eq!(gone, ["src/ledger.ts", "src/refund.ts"]);
}
