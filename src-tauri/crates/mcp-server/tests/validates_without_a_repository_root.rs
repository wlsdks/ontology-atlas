//! `validate_vault` when the repository root is not on disk says so once and does not list every
//! cited path as drift; with a root that exists, a path that is gone is still a drift row.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::indexing_slicing,
    reason = "these tests start the program, plant a vault and read answers by key"
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

/// A vault outside any repository, with no root named, from a server started inside the repository
/// that holds this crate: that repository is not the vault's code, so nothing is measured against
/// it and the answer says why.
#[test]
fn a_vault_outside_any_repository_is_not_measured_against_the_one_the_server_started_in() {
    let (_scene, root) = vault_citing_three_paths();
    let input = call(1, "connection_info", "{}") + &call(2, "validate_vault", "{}");
    let run = run_to_end(
        Program::Rust,
        &[("OATLAS_VAULT", &root.join("ontology").to_string_lossy())],
        input.as_bytes(),
    );
    let answers: Vec<Value> = run
        .lines
        .iter()
        .map(|line| serde_json::from_str(line).expect("json"))
        .collect();
    let answer_to = |id: u64| {
        answers
            .iter()
            .find(|answer| answer["id"] == id)
            .map(|answer| answer["result"]["structuredContent"].clone())
            .expect("an answer")
    };
    let connection = answer_to(1);
    assert_eq!(
        connection["repoResolution"], "git.rev-parse",
        "the server is started inside a repository: {connection}"
    );
    let answer = answer_to(2);

    assert_eq!(answer["pathDrift"]["checked"], false);
    assert!(answer["pathDrift"]["hint"].as_str().is_some_and(|hint| hint
        .starts_with("Source paths were NOT checked. This vault is not inside a git repository")));
    assert_eq!(answer["evidenceDrift"]["checked"], false);
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

/// `sources/` holds raw sources, which are never nodes, so a capability filed there is not a node
/// whose `path:` is audited (the script server skips the folder the same way).
#[test]
fn a_capability_filed_under_sources_is_a_raw_source_and_its_path_is_not_audited() {
    let scene = tempfile::tempdir().expect("temp dir");
    let root = scene.path().canonicalize().expect("real");
    write(
        &root,
        "sources/capability.md",
        "---\nkind: capability\ntitle: Filed as a source\npath: src/missing.ts\n---\n",
    );
    let answer = validate(&root, &root);

    assert_eq!(answer["pathDrift"]["checked"], true);
    assert_eq!(answer["pathDrift"]["nodesScanned"], 0);
    assert_eq!(answer["pathDrift"]["pathsChecked"], 0);
    assert_eq!(answer["pathDrift"]["drifts"], serde_json::json!([]));
}
