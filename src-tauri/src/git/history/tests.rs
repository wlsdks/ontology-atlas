use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

struct Repo {
    root: PathBuf,
    _scope: crate::vault_grants::EnforcedScope,
}
impl Repo {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let root = std::env::temp_dir().join(format!(
            "atlas-history-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        let root = fs::canonicalize(root).unwrap();
        let result = Self {
            _scope: crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&root)),
            root,
        };
        for args in [
            vec!["init", "-q"],
            vec!["config", "user.email", "fixture@example.invalid"],
            vec!["config", "user.name", "Atlas fixture"],
            vec!["config", "commit.gpgsign", "false"],
            vec!["config", "core.autocrlf", "false"],
        ] {
            result.git(&args);
        }
        result
    }
    fn git(&self, args: &[&str]) {
        let out = Command::new("git")
            .args(args)
            .current_dir(&self.root)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    fn commit(&self, path: &str, body: &[u8]) {
        fs::create_dir_all(self.root.join(path).parent().unwrap()).unwrap();
        fs::write(self.root.join(path), body).unwrap();
        self.git(&["add", path]);
        self.git(&["commit", "-qm", "fixture"]);
    }
    fn path(&self) -> &str {
        self.root.to_str().unwrap()
    }
}
impl Drop for Repo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn references_do_not_retain_bodies_and_reads_stay_on_the_listed_commit() {
    let repo = Repo::new();
    for n in 0..12 {
        repo.commit(
            "도메인.md",
            format!("{n}\n{}", "x".repeat(1024 * 1024)).as_bytes(),
        );
    }
    let refs = list(repo.path(), &["도메인".into()], None).unwrap();
    let metadata_bytes = serde_json::to_vec(&refs).unwrap().len();
    assert_eq!(refs.len(), 12);
    assert!(metadata_bytes < 4096);
    repo.commit("도메인.md", b"new head must not replace the listed version");
    let body = content(repo.path(), "도메인", &refs[0].revision)
        .unwrap()
        .unwrap();
    assert!(body.starts_with("11\n"));
    println!(
        "HISTORY_STREAM references={} metadata_bytes={} largest_body_bytes={}",
        refs.len(),
        metadata_bytes,
        body.len()
    );
}

#[test]
fn exact_byte_budget_survives_and_one_extra_byte_is_refused() {
    let repo = Repo::new();
    repo.commit("domain.md", &vec![b'x'; MAX_CONTENT_BYTES as usize]);
    let refs = list(repo.path(), &["domain".into()], None).unwrap();
    assert_eq!(
        content(repo.path(), "domain", &refs[0].revision)
            .unwrap()
            .unwrap()
            .len(),
        MAX_CONTENT_BYTES as usize
    );
    repo.commit("domain.md", &vec![b'x'; MAX_CONTENT_BYTES as usize + 1]);
    let refs = list(repo.path(), &["domain".into()], None).unwrap();
    assert!(
        matches!(content(repo.path(), "domain", &refs[0].revision), Err(error) if error.starts_with("git-history-too-large"))
    );
}

#[test]
fn missing_versions_and_invalid_utf8_have_distinct_outcomes() {
    let repo = Repo::new();
    repo.commit("domain.md", b"valid");
    repo.git(&["rm", "domain.md"]);
    repo.git(&["commit", "-qm", "delete"]);
    let refs = list(repo.path(), &["domain".into()], None).unwrap();
    assert_eq!(
        content(repo.path(), "domain", &refs[0].revision).unwrap(),
        None
    );
    repo.commit("domain.md", &[0xff]);
    let refs = list(repo.path(), &["domain".into()], None).unwrap();
    assert!(content(repo.path(), "domain", &refs[0].revision)
        .unwrap_err()
        .starts_with("git-history-unavailable"));
}

#[test]
fn path_grants_traversal_and_revision_syntax_are_enforced() {
    let repo = Repo::new();
    repo.commit("domain.md", b"valid");
    let refs = list(repo.path(), &["domain".into()], None).unwrap();
    assert!(content(repo.path(), "../domain", &refs[0].revision).is_err());
    assert!(content(repo.path(), "domain", "HEAD:domain.md").is_err());
    let _deny = crate::vault_grants::EnforcedScope::granting(&[]);
    assert!(list(repo.path(), &["domain".into()], None)
        .unwrap_err()
        .starts_with("vault-root-not-granted"));
    assert!(content(repo.path(), "domain", &refs[0].revision)
        .unwrap_err()
        .starts_with("vault-root-not-granted"));
}

#[test]
fn bounded_reads_keep_nested_vault_scope_and_disable_repository_execution() {
    let repo = Repo::new();
    repo.commit("vault/domain.md", b"inside");
    repo.commit("domain.md", b"outside");
    let marker = repo.root.join("executed");
    let trap = format!("touch {}", marker.display());
    repo.git(&["config", "core.fsmonitor", &trap]);
    repo.git(&["config", "diff.external", &trap]);
    repo.git(&["config", "diff.trap.textconv", &trap]);
    repo.git(&["config", "filter.trap.smudge", &trap]);
    fs::write(
        repo.root.join(".gitattributes"),
        "*.md diff=trap filter=trap\n",
    )
    .unwrap();
    let vault = repo.root.join("vault");
    let _scope = crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&vault));
    let refs = list(vault.to_str().unwrap(), &["domain".into()], None).unwrap();
    assert_eq!(
        content(vault.to_str().unwrap(), "domain", &refs[0].revision)
            .unwrap()
            .as_deref(),
        Some("inside")
    );
    assert!(!marker.exists());
}

#[test]
fn repository_discovery_rejects_an_unrelated_worktree() {
    let selected = Repo::new();
    selected.commit("domain.md", b"selected");
    let other = Repo::new();
    other.commit("domain.md", b"unrelated");
    selected.git(&["config", "core.worktree", other.path()]);
    let _scope = crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&selected.root));
    assert!(find_repo_root(&selected.root).unwrap().is_none());
    assert!(list(selected.path(), &["domain".into()], None).is_err());
}

#[test]
fn an_unavailable_blob_is_not_a_deleted_file_and_does_not_fetch_implicitly() {
    let donor = Repo::new();
    donor.commit("domain.md", b"local fixture blob");
    donor.git(&["config", "uploadpack.allowAnySHA1InWant", "true"]);
    let repo = Repo::new();
    repo.commit("domain.md", b"local fixture blob");
    let refs = list(repo.path(), &["domain".into()], None).unwrap();
    let oid = Command::new("git")
        .args(["rev-parse", "HEAD:domain.md"])
        .current_dir(&repo.root)
        .output()
        .unwrap();
    assert!(oid.status.success());
    let oid = String::from_utf8(oid.stdout).unwrap();
    let oid = oid.trim();
    repo.git(&["config", "remote.origin.url", donor.path()]);
    repo.git(&["config", "remote.origin.promisor", "true"]);
    repo.git(&["config", "extensions.partialClone", "origin"]);
    fs::remove_file(
        repo.root
            .join(".git/objects")
            .join(&oid[..2])
            .join(&oid[2..]),
    )
    .unwrap();
    assert!(
        matches!(content(repo.path(), "domain", &refs[0].revision), Err(error) if error.starts_with("git-history-unavailable"))
    );
    let control = Command::new("git")
        .args(["cat-file", "blob", oid])
        .current_dir(&repo.root)
        .env("GIT_ALLOW_PROTOCOL", "file")
        .env("GIT_NO_LAZY_FETCH", "0")
        .output()
        .unwrap();
    assert!(
        control.status.success(),
        "{}",
        String::from_utf8_lossy(&control.stderr)
    );
    assert_eq!(control.stdout, b"local fixture blob");
}
