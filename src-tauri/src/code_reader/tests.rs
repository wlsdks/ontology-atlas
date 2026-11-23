use super::window::{window_of, WINDOW_MAX_BYTES, WINDOW_MAX_LINES};
use super::*;
use crate::vault::grants::{grant_source_root, EnforcedScope};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::SystemTime;

static NEXT: AtomicUsize = AtomicUsize::new(0);
const PLANTED: &str = "sk-test-PLANTED";

struct Fixture {
    base: PathBuf,
    repo: PathBuf,
    vault: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "ontology-atlas-code-reader-{}-{}-{}",
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
                json!({"projectSlug":slug,"sourceId":id,"rootPath":root_text,"kind":"folder","boundAt":"2026-11-24","receipt":{"projectSlug":slug,"sourceId":id,"sourceKind":"folder"}})
            })
            .collect();
        fs::write(
            self.vault.join(BINDINGS_FILE),
            json!({"contractVersion":1,"bindings":rows}).to_string(),
        )
        .unwrap();
    }

    fn grant(&self) -> EnforcedScope {
        let scope = EnforcedScope::granting(std::slice::from_ref(&self.vault));
        grant_source_root(&self.repo);
        scope
    }

    fn put(&self, relative: &str, content: impl AsRef<[u8]>) {
        let path = self.repo.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn read(&self, relative: &str) -> Result<CodeWindow, String> {
        read_code_window(
            self.vault.to_string_lossy().into_owned(),
            relative.into(),
            1,
            WINDOW_MAX_LINES,
        )
    }

    fn stamp(&self, relative: &str) -> Result<CodeFileStamp, String> {
        code_file_stamp(self.vault.to_string_lossy().into_owned(), relative.into())
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

fn numbered(count: usize) -> String {
    (1..=count).map(|n| format!("line {n}\n")).collect()
}

#[cfg(unix)]
#[test]
fn reads_a_window_of_a_file_in_the_connected_folder() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("src/billing/invoice.ts", numbered(30));
    let window = read_code_window(
        f.vault.to_string_lossy().into_owned(),
        "./src/billing/invoice.ts".into(),
        10,
        5,
    )
    .unwrap();
    assert_eq!(
        window.lines,
        ["line 10", "line 11", "line 12", "line 13", "line 14"]
    );
    assert_eq!(window.first_line, 10);
    assert_eq!(window.total_lines, 30);
    assert!(!window.cut);
    assert!(window.last_modified > 0);
    let stamp = f.stamp("src/billing/invoice.ts").unwrap();
    assert_eq!(stamp.bytes, window.bytes);
}

#[cfg(unix)]
#[test]
fn reads_a_hangul_path_as_it_is_on_disk() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("문서/결제.ts", "const 금액 = 1;\n");
    assert_eq!(f.read("문서/결제.ts").unwrap().lines, ["const 금액 = 1;"]);
}

#[cfg(unix)]
#[test]
fn refuses_a_path_that_leaves_the_folder_and_returns_no_text() {
    let f = Fixture::new();
    let _scope = f.grant();
    fs::write(f.base.join("outside/leak.ts"), PLANTED).unwrap();
    for path in [
        "../outside/leak.ts",
        "src/../../outside/leak.ts",
        &f.base.join("outside/leak.ts").to_string_lossy(),
        "src\\..\\..\\outside\\leak.ts",
        "",
    ] {
        let error = f.read(path).unwrap_err();
        assert_eq!(error, OUTSIDE, "{path:?}");
        assert!(!error.contains(PLANTED));
    }
}

#[cfg(unix)]
#[test]
fn refuses_a_link_out_of_the_folder() {
    let f = Fixture::new();
    let _scope = f.grant();
    fs::write(f.base.join("outside/leak.ts"), PLANTED).unwrap();
    link(f.base.join("outside/leak.ts"), &f.repo.join("src/leak.ts"));
    link(f.base.join("outside"), &f.repo.join("vendor"));
    assert_eq!(f.read("src/leak.ts").unwrap_err(), OUTSIDE);
    assert_eq!(f.read("vendor/leak.ts").unwrap_err(), OUTSIDE);
    assert_eq!(f.stamp("src/leak.ts").unwrap_err(), OUTSIDE);
}

#[cfg(unix)]
#[test]
fn refuses_an_in_folder_link_to_a_secret_name() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put(".env", PLANTED);
    link(f.repo.join(".env"), &f.repo.join("src/config.ts"));
    assert_eq!(f.read("src/config.ts").unwrap_err(), SECRET);
}

#[cfg(unix)]
#[test]
fn refuses_secret_names_git_internals_and_unlisted_dot_folders() {
    let f = Fixture::new();
    let _scope = f.grant();
    for (path, refusal) in [
        (".env", SECRET),
        ("config/.env.local", SECRET),
        ("deploy/server.pem", SECRET),
        ("ops/credentials.json", SECRET),
        (".git/config", OUTSIDE),
        (".GIT/HEAD", OUTSIDE),
        (".vscode/settings.json", OUTSIDE),
        (".mcp.json", OUTSIDE),
        (".claude/settings.json", OUTSIDE),
    ] {
        f.put(path, PLANTED);
        assert_eq!(f.read(path).unwrap_err(), refusal, "{path:?}");
    }
    f.put(".claude/rules/forbidden.md", "# rules\n");
    f.put(".gitignore", "out/\n");
    assert_eq!(
        f.read(".claude/rules/forbidden.md").unwrap().lines,
        ["# rules"]
    );
    assert_eq!(f.read(".gitignore").unwrap().lines, ["out/"]);
}

#[cfg(unix)]
#[test]
fn a_file_of_the_bound_is_read_and_one_byte_more_is_refused() {
    let f = Fixture::new();
    let _scope = f.grant();
    let limit = CODE_FILE_MAX_BYTES as usize;
    f.put("big.ts", "a\n".repeat(limit / 2));
    let window = f.read("big.ts").unwrap();
    assert_eq!(window.lines.len(), WINDOW_MAX_LINES as usize);
    assert_eq!(window.total_lines as usize, limit / 2);
    f.put("over.ts", "a".repeat(limit + 1));
    assert_eq!(f.read("over.ts").unwrap_err(), TOO_LARGE);
    assert_eq!(f.stamp("over.ts").unwrap_err(), TOO_LARGE);
    f.put("three.ts", "a".repeat(3 * 1024 * 1024));
    assert_eq!(f.read("three.ts").unwrap_err(), TOO_LARGE);
}

#[cfg(unix)]
#[test]
fn refuses_binary_and_folders_as_not_text() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("logo.png", [0x89, b'P', b'N', b'G', 0, 1, 2]);
    f.put("latin1.txt", [0xE9, b'a']);
    f.put("src/inner/a.ts", "a\n");
    assert_eq!(f.read("logo.png").unwrap_err(), NOT_TEXT);
    assert_eq!(f.read("latin1.txt").unwrap_err(), NOT_TEXT);
    assert_eq!(f.read("src/inner").unwrap_err(), NOT_TEXT);
}

#[cfg(unix)]
#[test]
fn a_missing_file_is_gone() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("src/a.ts", "a\n");
    assert_eq!(f.read("src/renamed.ts").unwrap_err(), GONE);
    assert_eq!(f.read("src/a.ts/child.ts").unwrap_err(), GONE);
}

#[cfg(unix)]
#[test]
fn no_binding_and_several_bindings_are_not_connected() {
    let f = Fixture::new();
    let _scope = f.grant();
    f.put("src/a.ts", PLANTED);
    fs::remove_file(f.vault.join(BINDINGS_FILE)).unwrap();
    assert_eq!(f.read("src/a.ts").unwrap_err(), NOT_CONNECTED);
    f.bind(&[]);
    assert_eq!(f.read("src/a.ts").unwrap_err(), NOT_CONNECTED);
    f.bind(&[("one", f.repo.clone()), ("two", f.repo.clone())]);
    assert_eq!(f.read("src/a.ts").unwrap_err(), NOT_CONNECTED);
    fs::write(f.vault.join(BINDINGS_FILE), "{not json").unwrap();
    assert_eq!(f.read("src/a.ts").unwrap_err(), NOT_CONNECTED);
}

#[cfg(unix)]
#[test]
fn a_moved_or_ungranted_folder_is_access_lost() {
    let f = Fixture::new();
    let _scope = EnforcedScope::granting(std::slice::from_ref(&f.vault));
    f.put("src/a.ts", PLANTED);
    let ungranted = f.base.join("ungranted");
    fs::create_dir_all(&ungranted).unwrap();
    f.bind(&[("project", ungranted)]);
    assert_eq!(f.read("src/a.ts").unwrap_err(), ACCESS_LOST);
    f.bind(&[("project", f.base.join("moved-away"))]);
    assert_eq!(f.read("src/a.ts").unwrap_err(), ACCESS_LOST);
}

#[test]
fn a_window_stays_within_its_line_and_byte_bounds() {
    let many = numbered(1000);
    let window = window_of(&many, 1, 10_000);
    assert_eq!(window.lines.len(), WINDOW_MAX_LINES as usize);
    assert_eq!(window.total_lines, 1000);

    let wide = format!("{}\n", "x".repeat(1000)).repeat(200);
    let window = window_of(&wide, 1, WINDOW_MAX_LINES);
    assert!(window.cut);
    assert!(window.lines.iter().map(String::len).sum::<usize>() <= WINDOW_MAX_BYTES);

    let one_long_line = "가".repeat(WINDOW_MAX_BYTES);
    let window = window_of(&one_long_line, 1, 1);
    assert!(window.cut);
    assert!(window.lines[0].len() <= WINDOW_MAX_BYTES);
}

#[test]
fn a_window_past_the_end_returns_no_lines_and_the_true_total() {
    let window = window_of("a\r\nb\r\nc\n", 9, 5);
    assert!(window.lines.is_empty());
    assert_eq!(window.total_lines, 3);
    assert_eq!(window_of("a\r\nb\r\n", 0, 5).lines, ["a", "b"]);
    assert_eq!(window_of("", 1, 5).total_lines, 0);
    assert_eq!(window_of("no newline", 1, 5).lines, ["no newline"]);
}

#[test]
fn the_only_bound_project_needs_exactly_one_binding() {
    assert_eq!(
        only_bound_project(r#"{"bindings":[{"projectSlug":"p"}]}"#),
        Some("p".into())
    );
    assert_eq!(only_bound_project(r#"{"bindings":[]}"#), None);
    assert_eq!(
        only_bound_project(r#"{"bindings":[{"projectSlug":"a"},{"projectSlug":"b"}]}"#),
        None
    );
    assert_eq!(
        only_bound_project(r#"{"bindings":[{"projectSlug":3}]}"#),
        None
    );
    assert_eq!(only_bound_project("[]"), None);
}
