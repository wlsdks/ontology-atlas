//! `health` and `workspace_brief` name a project whose competency answers were never finalized, and
//! say nothing about meaning for a vault that has no project: an answer carries no check it did not
//! have a reason to make.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::indexing_slicing,
    reason = "these tests start the program, plant a vault and read answers by key"
)]

mod support;

use std::path::Path;

use serde_json::Value;
use support::{call, run_to_end, Program};

const PROJECT: &str = "---\nuid: 11111111-1111-4111-8111-111111111111\nslug: projects/shop\nkind: project\ntitle: Shop\ndomains: [domains/orders]\n---\n\nA shop.\n";
const DOMAIN: &str = "---\nuid: 22222222-2222-4222-8222-222222222222\nslug: domains/orders\nkind: domain\ntitle: Orders\n---\n\nOrders.\n";

fn plant(root: &Path, files: &[(&str, &str)]) {
    for (name, text) in files {
        let file = root.join(name);
        std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
        std::fs::write(file, text).expect("write");
    }
}

fn answers_of(files: &[(&str, &str)], operations: &[&str]) -> Vec<Value> {
    let scene = tempfile::tempdir().expect("temp dir");
    let vault = scene.path().canonicalize().expect("real");
    plant(&vault, files);
    let input: String = operations
        .iter()
        .zip(1..)
        .map(|(operation, id)| {
            call(
                id,
                "query_ontology",
                &format!("{{\"operation\":\"{operation}\"}}"),
            )
        })
        .collect();
    let run = run_to_end(
        Program::Rust,
        &[("OATLAS_VAULT", &vault.to_string_lossy())],
        input.as_bytes(),
    );
    run.lines
        .iter()
        .map(|line| {
            let answer: Value = serde_json::from_str(line).expect("json");
            answer["result"]["structuredContent"].clone()
        })
        .collect()
}

fn meaning_check(checks: &Value) -> Option<&Value> {
    checks
        .as_array()
        .expect("checks")
        .iter()
        .find(|check| check["id"] == "meaning_assessment")
}

#[test]
fn a_project_without_finalized_answers_is_named_by_health_and_leads_the_briefs_actions() {
    let answers = answers_of(
        &[("projects/shop.md", PROJECT), ("domains/orders.md", DOMAIN)],
        &["health", "workspace_brief"],
    );
    let health = &answers[0];
    let check = meaning_check(&health["checks"]).expect("a meaning check");
    assert_eq!(check["status"], "warn");
    assert_eq!(check["count"], 1);
    assert!(check["message"]
        .as_str()
        .expect("message")
        .starts_with("1 project meaning assessment(s) require review; first projects/shop: "));
    assert_eq!(health["status"], "needs_attention");

    let brief = &answers[1];
    assert_eq!(brief["health"]["status"], "needs_attention");
    assert!(meaning_check(&brief["health"]["checks"]).is_some());
    assert_eq!(brief["nextActions"][0]["id"], "meaning_assessment");
    assert_eq!(brief["nextActions"][0]["severity"], "warn");
}

#[test]
fn a_vault_without_a_project_carries_no_meaning_check() {
    let answers = answers_of(&[("domains/orders.md", DOMAIN)], &["health"]);
    assert!(meaning_check(&answers[0]["checks"]).is_none());
}
