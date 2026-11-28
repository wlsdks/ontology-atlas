//! `inspect_architecture` over a throwaway repository, driven over standard input and output: the
//! brief names the commit the source was measured at and whether the working tree had changes,
//! and judges imports the profile forbids. The script server's answer for a folder with no
//! repository is compared by the differential harness (family `imports`), where the time of the
//! measurement keeps a repository's answer from being compared whole.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::indexing_slicing,
    reason = "these tests start git and the program, plant the files a repository holds, and read answers by key"
)]

mod support;

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use support::{call, run_to_end, Program};

const PROFILE: &str = "---\n\
architecture_schema: architecture-profile/v1\n\
profile_uid: 5b2e0f4a-9d61-4c8e-a0f7-2c9d4e13a780\n\
profile_slug: layers\n\
project_uid: 1beed293-711b-4b51-b8c0-65f51bc4d606\n\
title: Layers\n\
created_by: human\n\
patterns: [dependency:layered]\n\
scope_paths: [src/**]\n\
role_ui: [src/ui/**]\n\
role_domain: [src/domain/**]\n\
role_data: [src/data/**]\n\
allow_ui: [domain]\n\
allow_domain: [data]\n\
allow_data: []\n\
evidence: [layers.md]\n\
---\n\n# Layers\n\nThe interface reaches the domain, the domain reaches the data, nothing reaches back.\n";

fn git(folder: &Path, args: &[&str]) -> String {
    let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .current_dir(folder)
        .env("GIT_CONFIG_GLOBAL", null_device)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn write(root: &Path, name: &str, text: &str) {
    let file = root.join(name);
    std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
    std::fs::write(file, text).expect("write");
}

/// The real path as the server prints it. On Windows `canonicalize` returns a verbatim `\\?\`
/// path (std::fs::canonicalize documentation), and the server prints it without the prefix.
fn real_path(path: &Path) -> PathBuf {
    let real = path.canonicalize().expect("real path");
    PathBuf::from(real.to_string_lossy().trim_start_matches(r"\\?\"))
}

fn brief(repository: &Path) -> Value {
    let vault = repository.join("docs/ontology");
    let run = run_to_end(
        Program::Rust,
        &[("OATLAS_VAULT", &vault.to_string_lossy())],
        call(1, "inspect_architecture", "{}").as_bytes(),
    );
    let answer: Value = serde_json::from_str(run.lines.first().expect("an answer")).expect("json");
    answer["result"]["structuredContent"].clone()
}

#[test]
fn the_brief_names_the_commit_and_whether_the_tree_changed_and_judges_the_imports() {
    let scene = tempfile::tempdir().expect("temp dir");
    let repository = real_path(scene.path());
    git(&repository, &["init", "-q", "-b", "main"]);
    write(&repository, "docs/ontology/architecture/layers.md", PROFILE);
    write(
        &repository,
        "src/ui/screen.ts",
        "import { rule } from '../domain/rule';\nexport const screen = rule;\n",
    );
    write(
        &repository,
        "src/domain/rule.ts",
        "import { row } from '../data/row';\nexport const rule = row;\n",
    );
    write(
        &repository,
        "src/data/row.ts",
        "import { screen } from '../ui/screen';\nexport const row = screen;\n",
    );
    git(&repository, &["add", "-A"]);
    git(&repository, &["commit", "-q", "-m", "seed"]);
    let head = git(&repository, &["rev-parse", "HEAD"]);

    let clean = brief(&repository);
    assert_eq!(clean["contract"], "architectureBrief:v1");
    assert_eq!(clean["measured"]["source"]["kind"], "git");
    assert_eq!(clean["measured"]["source"]["revision"], head[..12]);
    assert_eq!(clean["measured"]["source"]["dirty"], false);
    assert_eq!(clean["conformance"]["status"], "violated");
    assert_eq!(clean["conformance"]["violationCount"], 1);
    let violation = &clean["conformance"]["violations"][0];
    assert_eq!(violation["from"], "src/data/row.ts");
    assert_eq!(violation["to"], "src/ui/screen.ts");
    assert_eq!(violation["rule"], "allow-data");

    write(&repository, "src/ui/new.ts", "export const fresh = 1;\n");
    let changed = brief(&repository);
    assert_eq!(changed["measured"]["source"]["revision"], head[..12]);
    assert_eq!(changed["measured"]["source"]["dirty"], true);
}

#[test]
fn a_vault_without_a_profile_is_named_before_a_root_that_is_not_a_folder() {
    let scene = tempfile::tempdir().expect("temp dir");
    let repository = real_path(scene.path());
    write(&repository, "docs/ontology/README.md", "# Vault\n");
    let vault = repository.join("docs/ontology");
    let missing = repository.join("does-not-exist");
    let arguments = serde_json::json!({ "rootPath": missing.to_string_lossy() }).to_string();
    let run = run_to_end(
        Program::Rust,
        &[
            ("OATLAS_VAULT", &vault.to_string_lossy()),
            ("OATLAS_REPO_ROOT", &repository.to_string_lossy()),
        ],
        call(1, "inspect_architecture", &arguments).as_bytes(),
    );
    let answer: Value = serde_json::from_str(run.lines.first().expect("an answer")).expect("json");
    let content = &answer["result"]["structuredContent"];
    assert_eq!(content["errorCode"], "architecture_profile_missing");
    assert_eq!(content["profileDirectory"], "architecture/");
}
