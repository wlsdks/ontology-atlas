use super::*;
use crate::vault_grants::{grant_source_root, EnforcedScope};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT: AtomicUsize = AtomicUsize::new(0);
const SECRET: &str = "sk-test-SECRET";

struct Fixture {
    base: PathBuf,
    repo: PathBuf,
    vault: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "ontology-atlas-harness-source-{}-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(base.join("repo")).unwrap();
        fs::create_dir_all(base.join("vault/.ontology-atlas")).unwrap();
        fs::create_dir_all(base.join("outside")).unwrap();
        let base = fs::canonicalize(base).unwrap();
        let fixture = Self {
            repo: base.join("repo"),
            vault: base.join("vault"),
            base,
        };
        fixture.bind(&[("project", fixture.repo.clone())]);
        fixture
    }

    fn bind(&self, bindings: &[(&str, PathBuf)]) {
        let rows: Vec<Value> = bindings
            .iter()
            .map(|(slug, root)| {
                let root_text = root.to_string_lossy();
                let id = crate::source_digest(&[b"folder", root_text.as_bytes()]);
                json!({"projectSlug":slug,"sourceId":id,"rootPath":root_text,"kind":"folder","boundAt":"2026-10-17","receipt":{"projectSlug":slug,"sourceId":id,"sourceKind":"folder"}})
            })
            .collect();
        self.write_sidecar(json!({"contractVersion":1,"bindings":rows}));
    }

    fn write_sidecar(&self, data: Value) {
        fs::write(
            self.vault.join(".ontology-atlas/project-sources.json"),
            data.to_string(),
        )
        .unwrap();
    }

    fn grant(&self) -> EnforcedScope {
        let scope = EnforcedScope::granting(&[self.vault.clone()]);
        grant_source_root(&self.repo);
        scope
    }

    fn put(&self, relative: &str, content: impl AsRef<[u8]>) {
        let path = self.repo.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn vault_arg(&self) -> String {
        self.vault.to_string_lossy().into_owned()
    }

    fn read(&self, relative: &str) -> Result<HarnessSourceText, String> {
        read_harness_source_text(self.vault_arg(), "project".into(), relative.into())
    }

    fn list(&self, relative: &str) -> Result<Vec<HarnessSourceEntry>, String> {
        list_harness_source_directory(self.vault_arg(), "project".into(), relative.into())
    }

    fn exists(&self, relative: &str) -> Result<bool, String> {
        harness_source_path_exists(self.vault_arg(), "project".into(), relative.into())
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.base).ok();
    }
}

#[cfg(unix)]
fn link(target: impl AsRef<Path>, at: &Path) {
    fs::create_dir_all(at.parent().unwrap()).unwrap();
    std::os::unix::fs::symlink(target, at).unwrap();
}

#[cfg(unix)]
#[test]
fn reads_an_allowlisted_guide_from_the_repository_holding_the_vault() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("AGENTS.md", "# Guide\n");
    f.put(".claude/skills/review/SKILL.md", "skill\n");
    let guide = f.read("AGENTS.md").unwrap();
    assert_eq!(guide.text, "# Guide\n");
    assert_eq!(guide.bytes, 8);
    assert!(guide.last_modified > 0);
    assert_eq!(
        f.read("./.claude/skills/review/SKILL.md").unwrap().text,
        "skill\n"
    );
}

#[cfg(unix)]
#[test]
fn refuses_a_file_outside_the_allowlist() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("README.md", SECRET);
    f.put("src/index.ts", SECRET);
    f.put(".githooks/lib/shared.sh", SECRET);
    for path in ["README.md", "src/index.ts", ".githooks/lib/shared.sh", ""] {
        assert_eq!(
            f.read(path).unwrap_err(),
            "harness-path-not-allowed",
            "{path:?}"
        );
    }
}

#[cfg(unix)]
#[test]
fn refuses_secret_names_even_inside_claude() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put(".claude/skills/x/.env", SECRET);
    f.put(".claude/skills/secrets/SKILL.md", SECRET);
    f.put(".claude/hooks/deploy.pem", SECRET);
    f.put(".claude/settings.local.json", SECRET);
    f.put(".claude/rules/ok.md", "ok");
    for path in [
        ".claude/skills/x/.env",
        ".claude/skills/secrets/SKILL.md",
        ".claude/hooks/deploy.pem",
        ".claude/settings.local.json",
    ] {
        assert_eq!(f.read(path).unwrap_err(), "harness-path-denied", "{path}");
        assert_eq!(f.exists(path), Ok(false), "{path}");
    }
    assert_eq!(
        f.list(".claude/skills/secrets").unwrap_err(),
        "harness-path-denied"
    );
    let names: Vec<_> = f
        .list(".claude/skills")
        .unwrap()
        .into_iter()
        .map(|e| e.name)
        .collect();
    assert_eq!(names, ["x"]);
}

#[cfg(unix)]
#[test]
fn refuses_a_symlink_that_leaves_the_repository() {
    let f = Fixture::new();
    let _scope = f.grant();
    fs::write(f.base.join("outside/leak.md"), SECRET).unwrap();
    fs::create_dir_all(f.base.join("outside/dir")).unwrap();
    fs::write(f.base.join("outside/dir/AGENTS.md"), SECRET).unwrap();
    link(
        f.base.join("outside/leak.md"),
        &f.repo.join(".claude/rules/leak.md"),
    );
    link(
        f.base.join("outside/dir"),
        &f.repo.join(".claude/skills/out"),
    );
    assert_eq!(
        f.read(".claude/rules/leak.md").unwrap_err(),
        "harness-path-missing"
    );
    assert_eq!(
        f.read(".claude/skills/out/AGENTS.md").unwrap_err(),
        "harness-path-missing"
    );
    assert_eq!(
        f.list(".claude/skills/out").unwrap_err(),
        "harness-path-missing"
    );
}

#[cfg(unix)]
#[test]
fn refuses_an_in_repository_link_to_a_file_outside_the_allowlist() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("README.md", SECRET);
    f.put(".env", SECRET);
    f.put(".git/config", SECRET);
    link("../../README.md", &f.repo.join(".claude/rules/readme.md"));
    link("../../.env", &f.repo.join(".claude/rules/env.md"));
    link("../../.git", &f.repo.join(".claude/skills/git"));
    assert_eq!(
        f.read(".claude/rules/readme.md").unwrap_err(),
        "harness-path-not-allowed"
    );
    assert_eq!(
        f.read(".claude/rules/env.md").unwrap_err(),
        "harness-path-denied"
    );
    assert_eq!(
        f.read(".claude/skills/git/config").unwrap_err(),
        "harness-path-denied"
    );
    assert_eq!(
        f.list(".claude/skills/git").unwrap_err(),
        "harness-path-denied"
    );
    assert_eq!(f.exists(".claude/rules/env.md"), Ok(false));
}

#[cfg(unix)]
#[test]
fn projects_a_link_by_its_target_class() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put(
        "package.json",
        format!(r#"{{"name":"{SECRET}","scripts":{{"test":"vitest"}}}}"#),
    );
    link("../../package.json", &f.repo.join(".claude/rules/p.md"));
    let text = f.read(".claude/rules/p.md").unwrap().text;
    assert_eq!(text, r#"{"scripts":{"test":"vitest"}}"#);
    assert!(!text.contains(SECRET));
}

#[cfg(unix)]
#[test]
fn refuses_parent_components_absolute_paths_and_backslashes() {
    let f = Fixture::new();
    let _scope = f.grant();
    fs::write(f.base.join("outside/AGENTS.md"), SECRET).unwrap();
    for path in [
        "../outside/AGENTS.md",
        ".claude/../../outside/AGENTS.md",
        "/etc/passwd",
        "a\\b.md",
        "a\0b.md",
        "a/b/c/d/e/f/g/h/i/j/k/l/AGENTS.md",
    ] {
        assert_eq!(
            f.read(path).unwrap_err(),
            "harness-path-invalid",
            "{path:?}"
        );
        assert_eq!(
            f.list(path).unwrap_err(),
            "harness-path-invalid",
            "{path:?}"
        );
        assert_eq!(
            f.exists(path).unwrap_err(),
            "harness-path-invalid",
            "{path:?}"
        );
    }
}

#[test]
fn refuses_a_vault_that_is_not_granted() {
    let f = Fixture::new();
    let _scope = EnforcedScope::granting(&[f.base.join("outside")]);
    f.put("AGENTS.md", SECRET);
    assert_eq!(f.read("AGENTS.md").unwrap_err(), "vault-root-not-granted");
    assert_eq!(f.list("").unwrap_err(), "vault-root-not-granted");
    assert_eq!(f.exists("AGENTS.md").unwrap_err(), "vault-root-not-granted");
}

#[cfg(unix)]
#[test]
fn refuses_a_bound_root_that_is_not_granted() {
    let f = Fixture::new();
    let _scope = EnforcedScope::granting(&[f.vault.clone()]);
    f.put("AGENTS.md", SECRET);
    assert_eq!(f.read("AGENTS.md").unwrap_err(), "source-root-not-granted");
    assert_eq!(f.list("").unwrap_err(), "source-root-not-granted");
    assert_eq!(
        f.exists("AGENTS.md").unwrap_err(),
        "source-root-not-granted"
    );
}

#[cfg(unix)]
#[test]
fn refuses_a_source_root_the_vault_rules_reject() {
    let f = Fixture::new();
    f.bind(&[("project", PathBuf::from("/"))]);
    let _scope = f.grant();
    assert_eq!(
        f.read("AGENTS.md").unwrap_err(),
        "source-root-rejected: filesystem-root"
    );
}

#[cfg(unix)]
#[test]
fn refuses_zero_or_two_bindings_for_the_project() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("AGENTS.md", "x");
    assert_eq!(
        read_harness_source_text(f.vault_arg(), "other".into(), "AGENTS.md".into()).unwrap_err(),
        "harness-binding-ambiguous"
    );
    f.bind(&[
        ("project", f.repo.clone()),
        ("project", f.base.join("outside")),
    ]);
    assert_eq!(
        f.read("AGENTS.md").unwrap_err(),
        "harness-binding-ambiguous"
    );
    for slug in ["", &"x".repeat(257), "a\0b"] {
        assert_eq!(
            read_harness_source_text(f.vault_arg(), slug.into(), "AGENTS.md".into()).unwrap_err(),
            "harness-binding-invalid"
        );
    }
    f.write_sidecar(json!({"contractVersion":2,"bindings":[]}));
    assert_eq!(f.read("AGENTS.md").unwrap_err(), "harness-binding-invalid");
    f.bind(&[("project", f.base.join("gone"))]);
    assert_eq!(f.read("AGENTS.md").unwrap_err(), "harness-source-missing");
}

#[cfg(unix)]
#[test]
fn refuses_a_binding_whose_identity_changed() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("AGENTS.md", "x");
    let mut data: Value = serde_json::from_slice(
        &fs::read(f.vault.join(".ontology-atlas/project-sources.json")).unwrap(),
    )
    .unwrap();
    let other = crate::source_digest(&[b"folder", b"/elsewhere"]);
    data["bindings"][0]["sourceId"] = json!(other);
    data["bindings"][0]["receipt"]["sourceId"] = json!(other);
    f.write_sidecar(data);
    assert_eq!(f.read("AGENTS.md").unwrap_err(), "harness-binding-changed");
}

#[cfg(unix)]
#[test]
fn refuses_a_fifo_without_blocking() {
    let f = Fixture::new();
    let _scope = f.grant();
    fs::create_dir_all(f.repo.join(".claude/rules")).unwrap();
    let fifo =
        std::ffi::CString::new(f.repo.join(".claude/rules/pipe.md").to_str().unwrap()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    assert_eq!(
        f.read(".claude/rules/pipe.md").unwrap_err(),
        "harness-not-a-file"
    );
    f.put("CLAUDE.md", "x");
    fs::create_dir_all(f.repo.join(".claude/rules/dir.md")).unwrap();
    assert_eq!(
        f.read(".claude/rules/dir.md").unwrap_err(),
        "harness-not-a-file"
    );
}

#[cfg(unix)]
#[test]
fn refuses_a_file_over_the_size_limit() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put(
        "AGENTS.md",
        vec![b'a'; read::HARNESS_TEXT_MAX_BYTES as usize + 1],
    );
    f.put(
        "CLAUDE.md",
        vec![b'a'; read::HARNESS_TEXT_MAX_BYTES as usize],
    );
    assert_eq!(f.read("AGENTS.md").unwrap_err(), "harness-file-too-large");
    assert_eq!(
        f.read("CLAUDE.md").unwrap().bytes,
        read::HARNESS_TEXT_MAX_BYTES
    );
}

#[cfg(unix)]
#[test]
fn refuses_binary_and_invalid_utf8() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("AGENTS.md", format!("{SECRET}\0tail"));
    f.put("CLAUDE.md", [0xff, 0xfe, b'k']);
    for path in ["AGENTS.md", "CLAUDE.md"] {
        let error = f.read(path).unwrap_err();
        assert_eq!(error, "harness-not-text");
        assert!(!error.contains(SECRET));
    }
}

#[cfg(unix)]
#[test]
fn lists_names_and_omits_links_and_secret_names() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("AGENTS.md", "x");
    f.put("src/a.ts", "x");
    f.put(".env", SECRET);
    f.put("secrets.txt", SECRET);
    f.put("deploy.pem", SECRET);
    fs::create_dir_all(f.repo.join(".git")).unwrap();
    fs::create_dir_all(f.repo.join(".claude")).unwrap();
    #[cfg(unix)]
    link(f.base.join("outside"), &f.repo.join("outside-link"));
    let listing = f.list("").unwrap();
    let rows: Vec<_> = listing.iter().map(|e| (e.name.as_str(), e.kind)).collect();
    assert_eq!(
        rows,
        [
            (".claude", "directory"),
            ("AGENTS.md", "file"),
            ("src", "directory")
        ]
    );
    assert_eq!(f.list("src").unwrap()[0].name, "a.ts");
}

#[cfg(unix)]
#[test]
fn refuses_listing_a_dot_directory_outside_the_allowlist() {
    let f = Fixture::new();
    let _scope = f.grant();
    for dir in [".vscode", ".claude", ".git", "src/.cache"] {
        fs::create_dir_all(f.repo.join(dir)).unwrap();
    }
    f.put("AGENTS.md", "x");
    f.put(".claude/rules/a.md", "x");
    assert_eq!(f.list(".vscode").unwrap_err(), "harness-path-not-allowed");
    assert_eq!(f.list(".claude").unwrap_err(), "harness-path-not-allowed");
    assert_eq!(
        f.list("src/.cache").unwrap_err(),
        "harness-path-not-allowed"
    );
    assert_eq!(f.list(".git").unwrap_err(), "harness-path-denied");
    assert_eq!(f.list("AGENTS.md").unwrap_err(), "harness-not-a-directory");
    assert_eq!(f.list("absent").unwrap_err(), "harness-path-missing");
    assert_eq!(f.list(".claude/rules").unwrap()[0].name, "a.md");
}

#[cfg(unix)]
#[test]
fn answers_existence_without_leaving_the_repository() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("AGENTS.md", "x");
    f.put("scripts/run.sh", "x");
    f.put(".env", SECRET);
    fs::write(f.base.join("outside/file.md"), SECRET).unwrap();
    #[cfg(unix)]
    link(f.base.join("outside/file.md"), &f.repo.join("escape.md"));
    assert_eq!(f.exists("AGENTS.md"), Ok(true));
    assert_eq!(f.exists("scripts/run.sh"), Ok(true));
    assert_eq!(f.exists("scripts"), Ok(true));
    assert_eq!(f.exists("absent.md"), Ok(false));
    assert_eq!(f.exists(".env"), Ok(false));
    #[cfg(unix)]
    assert_eq!(f.exists("escape.md"), Ok(false));
}

#[test]
fn the_three_harness_commands_are_registered() {
    let source = include_str!("../lib.rs");
    let handler = source
        .split(".invoke_handler(tauri::generate_handler![")
        .nth(1)
        .and_then(|rest| rest.split("])").next())
        .expect("Tauri invoke handler");
    for name in [
        "harness_source::list_harness_source_directory",
        "harness_source::read_harness_source_text",
        "harness_source::harness_source_path_exists",
    ] {
        assert!(handler.contains(name), "{name}");
    }
}

#[cfg(unix)]
#[test]
fn refuses_a_secret_name_the_volume_folds_to_the_same_file() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put(".codex/hooks/secrets.sh", SECRET);
    let folds = f.repo.join(".codex/hooks/\u{17f}ecrets.sh").exists();
    let expected = if folds {
        "harness-path-denied"
    } else {
        "harness-path-missing"
    };
    assert_eq!(
        f.read(".codex/hooks/\u{17f}ecrets.sh").unwrap_err(),
        expected
    );
}

#[cfg(not(unix))]
#[test]
fn names_the_platform_it_cannot_read_on() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("AGENTS.md", SECRET);
    let unsupported = Some("harness-unsupported-platform");
    assert_eq!(f.read("AGENTS.md").err().as_deref(), unsupported);
    assert_eq!(f.list("").err().as_deref(), unsupported);
    assert_eq!(f.exists("AGENTS.md").err().as_deref(), unsupported);
}
