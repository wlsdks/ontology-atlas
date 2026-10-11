use super::*;
use serde_json::json;
use std::process::Command;

struct Fixture {
    base: PathBuf,
    vault: PathBuf,
    source: PathBuf,
}
impl Fixture {
    fn new(label: &str, nested: bool) -> Self {
        let base =
            std::env::temp_dir().join(format!("atlas-bound-dates-{label}-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        let base = fs::canonicalize(base).unwrap();
        let source = base.join("source");
        let vault = if nested {
            source.join("ontology")
        } else {
            base.join("vault")
        };
        for root in [&source, &vault] {
            fs::create_dir_all(root).unwrap();
        }
        let fixture = Self {
            base,
            vault,
            source,
        };
        init(&fixture.source);
        if !nested {
            init(&fixture.vault);
        }
        fixture.write(&fixture.source, "capabilities/pay.md", "source");
        commit(&fixture.source, "2026-01-03T00:00:00Z");
        fixture.write(&fixture.vault, "capabilities/pay.md", "document");
        fixture.binding();
        commit(&fixture.vault, "2026-01-02T00:00:00Z");
        fixture
    }
    fn write(&self, root: &Path, file: &str, body: &str) {
        let path = root.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }
    fn binding(&self) {
        let id = crate::source_digest(&[b"git", self.source.to_string_lossy().as_bytes()]);
        self.write(&self.vault, ".ontology-atlas/project-sources.json", &json!({"contractVersion":1,"bindings":[{
            "projectSlug":"fixture", "sourceId":id, "rootPath":self.source, "kind":"git", "boundAt":"2026-01-02",
            "receipt":{"projectSlug":"fixture","sourceId":id,"sourceKind":"git"}
        }]}).to_string());
    }
    fn measure(&self) -> BoundEvidenceDates {
        measure(
            self.vault.to_str().unwrap(),
            "fixture",
            &["capabilities/pay.md".into()],
            &["capabilities/pay.md".into()],
            None,
            || {},
        )
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}
fn git(root: &Path, args: &[&str]) -> String {
    let result = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    String::from_utf8_lossy(&result.stdout).trim().into()
}
fn init(root: &Path) {
    git(root, &["init", "-q", "-b", "main"]);
    git(root, &["config", "user.email", "fixture@example.invalid"]);
    git(root, &["config", "user.name", "fixture"]);
    git(root, &["config", "commit.gpgsign", "false"]);
}
fn commit(root: &Path, date: &str) {
    git(root, &["add", "."]);
    let result = Command::new("git")
        .args(["commit", "-qm", "fixture"])
        .env("GIT_AUTHOR_DATE", date)
        .env("GIT_COMMITTER_DATE", date)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn separate_roots_keep_identical_keys_and_source_read_grants() {
    let f = Fixture::new("separate", false);
    let _scope = crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&f.vault));
    assert_eq!(f.measure().status, "ungranted");
    crate::vault_grants::grant_source_root(&f.source);
    let result = f.measure();
    assert_eq!(result.status, "measured");
    assert_eq!(
        result.vault_changes[0].last_changed_at.as_deref(),
        Some("2026-01-02T00:00:00Z")
    );
    assert_eq!(
        result.source_changes[0].last_changed_at.as_deref(),
        Some("2026-01-03T00:00:00Z")
    );
    assert_eq!(
        crate::canonical_root(f.source.to_str().unwrap()).unwrap_err(),
        "vault-root-not-granted"
    );
    let wrong = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &[],
        &[],
        Some(f.base.to_str().unwrap()),
        || {},
    );
    assert_eq!(wrong.status, "wrong-folder");
    assert!(wrong.source_changes.is_empty());
}

#[test]
fn nested_vault_keeps_coordinates_and_existing_containing_repo_authority() {
    let f = Fixture::new("nested", true);
    let _scope = crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&f.vault));
    crate::vault_grants::grant_source_root(&f.source);
    let result = f.measure();
    assert_eq!(result.status, "measured");
    assert_ne!(
        result.vault_changes[0].last_changed_at,
        result.source_changes[0].last_changed_at
    );
}

#[test]
fn receipt_and_head_changes_discard_both_maps() {
    for mutation in ["binding", "receipt", "source-head", "vault-head"] {
        let f = Fixture::new(mutation, false);
        let result = measure(
            f.vault.to_str().unwrap(),
            "fixture",
            &["capabilities/pay.md".into()],
            &["capabilities/pay.md".into()],
            None,
            || match mutation {
                "binding" | "receipt" => {
                    let path = f.vault.join(".ontology-atlas/project-sources.json");
                    let mut value: serde_json::Value =
                        serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
                    if mutation == "binding" {
                        value["bindings"][0]["boundAt"] = json!("changed");
                    } else {
                        value["bindings"][0]["receipt"]["measuredAt"] = json!("changed");
                    }
                    fs::write(path, value.to_string()).unwrap();
                }
                _ => {
                    let root = if mutation == "source-head" {
                        &f.source
                    } else {
                        &f.vault
                    };
                    f.write(root, "later.txt", "later");
                    commit(root, "2026-02-01T00:00:00Z");
                }
            },
        );
        assert_eq!(result.status, "binding-changed", "{mutation}");
        assert!(result.vault_changes.is_empty() && result.source_changes.is_empty());
        assert!(matches!(
            f.measure().status.as_str(),
            "measured" | "partial"
        ));
    }
}

#[test]
fn missing_dirty_untracked_and_unsafe_paths_remain_distinct() {
    let f = Fixture::new("unknowns", false);
    f.write(&f.source, "capabilities/pay.md", "dirty");
    f.write(&f.source, "한글 file.ts", "untracked");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&f.vault, f.source.join("escape")).unwrap();
    let result = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &["capabilities/pay.md".into()],
        &[
            "capabilities/pay.md",
            "missing.ts",
            "한글 file.ts",
            "../vault/capabilities/pay.md",
            "escape/capabilities/pay.md",
        ]
        .map(String::from),
        None,
        || {},
    );
    assert_eq!(result.status, "partial");
    assert!(result.source_changes[0].dirty && result.source_changes[0].last_changed_at.is_none());
    assert!(!result.source_changes[1].exists);
    assert!(result.source_changes[2].exists && result.source_changes[2].last_changed_at.is_none());
    assert_eq!(result.omitted_source_paths.len(), 2);
}

#[test]
fn literal_paths_and_korean_names_cannot_select_other_files() {
    let f = Fixture::new("literal", false);
    f.write(&f.source, "한글 space.ts", "a");
    f.write(&f.source, "literal[1].ts", "a");
    commit(&f.source, "2026-01-01T00:00:00Z");
    f.write(&f.source, "literal1.ts", "later");
    commit(&f.source, "2026-01-04T00:00:00Z");
    let result = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &[],
        &["한글 space.ts", "literal[1].ts", ":(glob)*"].map(String::from),
        None,
        || {},
    );
    assert_eq!(
        result.source_changes[0].last_changed_at,
        result.source_changes[1].last_changed_at
    );
    assert!(result.source_changes[0]
        .last_changed_at
        .as_ref()
        .unwrap()
        .starts_with("2026-01-01"));
    assert!(!result.source_changes[2].exists);
}

#[test]
fn shared_budget_prioritizes_documents_and_discloses_omissions() {
    let f = Fixture::new("budget", false);
    let source: Vec<String> = (0..512).map(|i| format!("missing-{i}.ts")).collect();
    let result = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &["capabilities/pay.md".into()],
        &source,
        None,
        || {},
    );
    assert_eq!(result.vault_changes.len(), 1);
    assert_eq!(result.source_changes.len(), 511);
    assert_eq!(result.omitted_source_paths, vec!["missing-511.ts"]);
    assert_eq!(result.status, "partial");
    println!(
        "bound evidence fixture: 513 requested, 512 retained, {} serialized bytes",
        serde_json::to_vec(&result).unwrap().len()
    );
}

#[test]
fn malformed_duplicate_and_missing_receipt_bindings_are_unavailable() {
    for case in ["malformed", "duplicate", "missing", "identity"] {
        let f = Fixture::new(case, false);
        let path = f.vault.join(".ontology-atlas/project-sources.json");
        let mut value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        match case {
            "malformed" => value["contractVersion"] = json!(0),
            "duplicate" => {
                let other = value["bindings"][0].clone();
                value["bindings"].as_array_mut().unwrap().push(other);
            }
            "missing" => {
                value["bindings"][0]
                    .as_object_mut()
                    .unwrap()
                    .remove("receipt");
            }
            _ => value["bindings"][0]["receipt"]["sourceId"] = json!("wrong"),
        }
        fs::write(path, value.to_string()).unwrap();
        let result = f.measure();
        assert!(result.vault_changes.is_empty() && result.source_changes.is_empty());
        assert_eq!(
            result.status,
            if case == "duplicate" {
                "ambiguous-source"
            } else {
                "unreadable"
            }
        );
    }
}

#[test]
fn a_late_uncommitted_change_cannot_reuse_the_clean_commit_date() {
    let f = Fixture::new("late-dirty", false);
    let result = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &["capabilities/pay.md".into()],
        &["capabilities/pay.md".into()],
        None,
        || {
            f.write(&f.source, "capabilities/pay.md", "late uncommitted change");
        },
    );
    assert_eq!(result.status, "partial");
    assert!(result.source_changes[0].dirty);
    assert!(result.source_changes[0].last_changed_at.is_none());
}

#[cfg(unix)]
#[test]
fn evidence_reads_never_execute_repository_controlled_programs() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new("hostile-config", false);
    let hook = f.source.join("hostile.sh");
    let sentinel = f.base.join("EXECUTED");
    fs::write(
        &hook,
        format!("#!/bin/sh\ntouch '{}'\n", sentinel.display()),
    )
    .unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    for (key, value) in [
        ("core.fsmonitor", hook.to_str().unwrap()),
        ("diff.external", hook.to_str().unwrap()),
        ("diff.planted.textconv", hook.to_str().unwrap()),
        ("gpg.program", hook.to_str().unwrap()),
        ("log.showSignature", "true"),
    ] {
        git(&f.source, &["config", key, value]);
    }
    let hooks = f.source.join("hooks");
    fs::create_dir_all(&hooks).unwrap();
    fs::copy(&hook, hooks.join("post-index-change")).unwrap();
    git(
        &f.source,
        &["config", "core.hooksPath", hooks.to_str().unwrap()],
    );
    f.write(&f.source, ".gitattributes", "*.md diff=planted\n");
    assert_eq!(f.measure().status, "measured");
    assert!(!sentinel.exists());
}

#[test]
fn folder_sources_and_sources_without_commits_have_no_dates() {
    for case in ["folder", "unborn"] {
        let f = Fixture::new(case, false);
        fs::remove_dir_all(f.source.join(".git")).unwrap();
        if case == "unborn" {
            init(&f.source);
        } else {
            let path = f.vault.join(".ontology-atlas/project-sources.json");
            let mut value: serde_json::Value =
                serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
            let id = crate::source_digest(&[b"folder", f.source.to_string_lossy().as_bytes()]);
            value["bindings"][0]["kind"] = json!("folder");
            value["bindings"][0]["sourceId"] = json!(id);
            value["bindings"][0]["receipt"]["sourceKind"] = json!("folder");
            value["bindings"][0]["receipt"]["sourceId"] = json!(id);
            fs::write(path, value.to_string()).unwrap();
        }
        assert_eq!(f.measure().status, "no-history");
    }
}

#[test]
fn dates_outside_the_history_window_stay_unknown() {
    use std::io::Write;
    use std::process::Stdio;
    let f = Fixture::new("history-window", false);
    let mut stream = String::new();
    for index in 0..3002 {
        let path = if index == 0 { "old.ts" } else { "busy.ts" };
        stream.push_str(&format!("commit refs/heads/history\ncommitter Fixture <fixture@example.invalid> {} +0000\ndata 7\nfixture\nM 100644 inline {path}\ndata {}\n{index}\n\n", 1767225600 + index, index.to_string().len()));
    }
    stream.push_str("done\n");
    let mut child = Command::new("git")
        .args(["fast-import", "--quiet"])
        .current_dir(&f.source)
        .stdin(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stream.as_bytes())
        .unwrap();
    assert!(child.wait().unwrap().success());
    git(&f.source, &["checkout", "-q", "history"]);
    let result = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &["capabilities/pay.md".into()],
        &["old.ts".into(), "busy.ts".into()],
        None,
        || {},
    );
    assert_eq!(result.status, "partial");
    assert!(result.source_changes[0].exists && result.source_changes[0].last_changed_at.is_none());
    assert!(result.source_changes[1].last_changed_at.is_some());
    println!("bound evidence history fixture: 3002 commits, 3000-commit walk, old path unknown");
}

#[test]
fn missing_documents_and_folder_only_anchors_never_supply_document_dates() {
    let f = Fixture::new("missing-document", false);
    let result = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &["missing.md".into()],
        &["capabilities".into()],
        None,
        || {},
    );
    assert_eq!(result.status, "partial");
    assert!(!result.vault_changes[0].exists);
    assert!(result.vault_changes[0].last_changed_at.is_none());
    assert!(result.source_changes[0].is_dir);
    assert!(result.source_changes[0].last_changed_at.is_none());
}

#[test]
fn the_path_budget_stops_metadata_inspection_even_after_unsafe_inputs() {
    for first_result in [Some((true, false)), None] {
        let mut remaining = 1;
        let mut omitted = vec![];
        let mut inspected = vec![];
        let root = Path::new("/fixture");
        let wanted = wanted_with(
            root,
            root,
            &["first".into(), "beyond-budget".into()],
            &mut remaining,
            &mut omitted,
            |_, path| {
                inspected.push(path.to_string());
                first_result
            },
        );
        assert_eq!(
            inspected,
            vec!["first"],
            "metadata reads must stop at the shared path budget"
        );
        assert_eq!(wanted.len(), usize::from(first_result.is_some()));
        assert!(omitted.contains(&"beyond-budget".to_string()));
    }
}

#[cfg(unix)]
#[test]
fn missing_promisor_objects_cannot_execute_a_repository_transport() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new("promisor-read", false);
    let sentinel = f.base.join("FETCH_EXECUTED");
    let helper = f.base.join("transport-helper");
    fs::write(
        &helper,
        format!("#!/bin/sh\ntouch '{}'\nexit 1\n", sentinel.display()),
    )
    .unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o755)).unwrap();
    git(&f.source, &["config", "core.repositoryformatversion", "1"]);
    git(&f.source, &["config", "extensions.partialClone", "planted"]);
    git(&f.source, &["config", "remote.planted.promisor", "true"]);
    git(
        &f.source,
        &[
            "config",
            "remote.planted.url",
            &format!("ext::{}", helper.display()),
        ],
    );
    git(&f.source, &["config", "protocol.ext.allow", "always"]);
    let tree = git(&f.source, &["rev-parse", "HEAD^{tree}"]);
    fs::remove_file(
        f.source
            .join(".git/objects")
            .join(&tree[..2])
            .join(&tree[2..]),
    )
    .unwrap();
    let _scope = crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&f.vault));
    crate::vault_grants::grant_source_root(&f.source);
    let result = git_bound_evidence_dates(
        f.vault.to_string_lossy().into_owned(),
        "fixture".into(),
        vec!["capabilities/pay.md".into()],
        vec!["capabilities/pay.md".into()],
        None,
    )
    .unwrap();
    assert_eq!(result.status, "unreadable");
    assert!(
        !sentinel.exists(),
        "a local date read must never invoke a promisor transport"
    );
}

#[cfg(unix)]
#[test]
fn a_replaced_source_root_invalidates_dates_even_at_the_same_commit() {
    let f = Fixture::new("root-replacement", false);
    let result = measure(
        f.vault.to_str().unwrap(),
        "fixture",
        &["capabilities/pay.md".into()],
        &["capabilities/pay.md".into()],
        None,
        || {
            let prior = f.base.join("prior-source");
            fs::rename(&f.source, &prior).unwrap();
            fs::create_dir(&f.source).unwrap();
            for path in [".git", "capabilities"] {
                fs::rename(prior.join(path), f.source.join(path)).unwrap();
            }
        },
    );
    assert_eq!(result.status, "binding-changed");
    assert!(result.vault_changes.is_empty() && result.source_changes.is_empty());
    assert_eq!(f.measure().status, "measured");
}
